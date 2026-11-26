/**
 * Task 4.1: the shared tool wrapper — filter, size cap, rate limit, and the full call path
 * (signed-in context → Kanvaro → filter → audit), unit-level and through a real MCP client.
 */
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import type { McpHttpHandler } from '@modelcontextprotocol/server'
import type { RequestHandler } from 'express'
import { afterEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import type { AuditEntry, AuditLog } from '../src/audit.js'
import type { SignedInContext } from '../src/auth/context.js'
import { runSignedIn } from '../src/auth/context.js'
import { ExchangeError } from '../src/auth/exchange.js'
import type { KanvaroToken, TokenExchanger } from '../src/auth/exchange.js'
import { createApp, finishApp } from '../src/http/app.js'
import type { RunningServer } from '../src/http/server.js'
import { startServer } from '../src/http/server.js'
import { apiPath, createKanvaroClient } from '../src/kanvaro/client.js'
import { createLogger } from '../src/log.js'
import { createMcpEndpoint, mountMcp } from '../src/mcp/server.js'
import type { Tool, ToolRuntime } from '../src/tools/define.js'
import { ToolInputError, defineTool, kanvaroId } from '../src/tools/define.js'
import type { Shape } from '../src/tools/filter.js'
import { filterResponse } from '../src/tools/filter.js'
import { capSize, createRateLimiter } from '../src/tools/limits.js'

const log = createLogger({ level: 'error', destination: { write: () => undefined } })
const ID = '6b0000000000000000000001'

// ---------------------------------------------------------------------------------------
// Response filter
// ---------------------------------------------------------------------------------------

describe('response filter', () => {
  const member = {
    _id: 'u1', firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com', role: 'admin',
    password: 'hash', passwordResetOtp: '123456', passwordResetToken: 'tok', passwordResetExpiry: '2026-01-01', hourlyRate: 90,
  }

  it('keeps only the listed fields', () => {
    expect(filterResponse({ _id: 't1', title: 'A', secretField: 1, __v: 3 }, { _id: true, title: true })).toEqual({ _id: 't1', title: 'A' })
  })

  it('reduces users to id, name, email and role', () => {
    expect(filterResponse({ assignee: member }, { assignee: 'user' })).toEqual({ assignee: { id: 'u1', name: 'Ada Lovelace', email: 'ada@example.com', role: 'admin' } })
    expect(filterResponse({ assignee: 'u1' }, { assignee: 'user' })).toEqual({ assignee: 'u1' })
    expect(filterResponse({ assignee: null }, { assignee: 'user' })).toEqual({ assignee: null })
  })

  it('removes reset codes, passwords and rates at any depth, even inside a kept-whole value (F1)', () => {
    const out = JSON.stringify(filterResponse({ data: { members: [member], nested: { deep: [member] } } }, { data: true }))
    for (const leaked of ['123456', 'passwordResetToken', 'passwordResetExpiry', 'password', 'hourlyRate']) expect(out).not.toContain(leaked)
    expect(out).toContain('ada@example.com')
  })

  it('keeps rates only for finance tools', () => {
    expect(filterResponse({ hourlyRate: 90, billingRate: 120 }, true, { allowRates: true })).toEqual({ hourlyRate: 90, billingRate: 120 })
    expect(filterResponse({ hourlyRate: 90, billingRate: 120 }, true)).toEqual({})
  })

  it('filters lists item by item, and keeps unpopulated references', () => {
    const shape: Shape = { items: { _id: true, project: { _id: true, name: true } } }
    expect(filterResponse({ items: [{ _id: 'a', x: 1, project: { _id: 'p', name: 'P', budget: 5 } }, { _id: 'b', project: 'p2' }] }, shape))
      .toEqual({ items: [{ _id: 'a', project: { _id: 'p', name: 'P' } }, { _id: 'b', project: 'p2' }] })
  })
})

// ---------------------------------------------------------------------------------------
// Size cap and rate limit
// ---------------------------------------------------------------------------------------

describe('size cap', () => {
  const item = { text: 'x'.repeat(1000) }

  it('leaves small results alone', () => {
    expect(capSize({ a: 1 }, 1000)).toEqual({ value: { a: 1 } })
  })

  it('cuts the largest list to what fits and says how much is shown', () => {
    const capped = capSize({ total: 50, items: Array.from({ length: 50 }, () => item) }, 10_000)
    expect(capped?.truncated).toEqual({ shown: 9, total: 50 })
    expect(JSON.stringify(capped?.value).length).toBeLessThanOrEqual(10_000)
    expect((capped?.value as { total: number }).total).toBe(50)
  })

  it('cuts a result that is itself a list', () => {
    expect(capSize(Array.from({ length: 20 }, () => item), 5_000)?.truncated).toEqual({ shown: 4, total: 20 })
  })

  it('gives up on something it cannot cut', () => {
    expect(capSize({ text: 'x'.repeat(20_000) }, 10_000)).toBeUndefined()
  })
})

describe('rate limiter', () => {
  it('allows the per-minute budget per user and bucket, then says how long to wait', () => {
    let t = 0
    const limiter = createRateLimiter({ readsPerMinute: 3, writesPerMinute: 1, now: () => t })
    expect([1, 2, 3].map(() => limiter.take('u1', 'read'))).toEqual([0, 0, 0])
    expect(limiter.take('u1', 'read')).toBe(60)
    expect(limiter.take('u2', 'read')).toBe(0) // another user has their own budget
    expect(limiter.take('u1', 'write')).toBe(0) // writes are counted separately
    expect(limiter.take('u1', 'write')).toBe(60)
    t = 45_000
    expect(limiter.take('u1', 'read')).toBe(15)
    t = 60_000
    expect(limiter.take('u1', 'read')).toBe(0)
  })
})

// ---------------------------------------------------------------------------------------
// The wrapper: one call end to end (fake Kanvaro API, fake exchange)
// ---------------------------------------------------------------------------------------

interface FakeKanvaro {
  calls: { method: string; url: URL; auth: string | null; body: unknown }[]
  reply: (url: URL, method: string) => { status: number; body?: unknown }
}

function fakeKanvaro(reply: FakeKanvaro['reply']): FakeKanvaro & { fetchImpl: typeof fetch } {
  const fake: FakeKanvaro = { calls: [], reply }
  const fetchImpl: typeof fetch = (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    const headers = new Headers(init?.headers)
    const method = init?.method ?? 'GET'
    fake.calls.push({ method, url, auth: headers.get('authorization'), body: typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined })
    const r = fake.reply(url, method)
    return Promise.resolve(new Response(r.body === undefined ? null : JSON.stringify(r.body), { status: r.status, headers: { 'Content-Type': 'application/json' } }))
  }
  return Object.assign(fake, { fetchImpl })
}

function fakeExchanger(tokens: string[]): TokenExchanger & { invalidated: number } {
  let n = 0
  const ex = {
    invalidated: 0,
    size: 0,
    exchange(): Promise<KanvaroToken> {
      const token = tokens[++n]
      return token ? Promise.resolve({ token, expiresAt: 9e9 }) : Promise.reject(new ExchangeError('refused', 'access ended'))
    },
    exchangeWithInfo() { return ex.exchange().then(kanvaro => ({ kanvaro, fresh: true, first: false })) },
    invalidate() { ex.invalidated++ },
  }
  return ex
}

function memoryAudit(): AuditLog & { entries: AuditEntry[] } {
  const entries: AuditEntry[] = []
  return {
    entries,
    record: e => { entries.push(e); return Promise.resolve() },
    recordLimited: e => { entries.push(e); return Promise.resolve() },
  }
}

function signedIn(exchanger: TokenExchanger = fakeExchanger(['kanvaro-1'])): SignedInContext {
  return {
    requestId: 'req-1',
    ip: '10.0.0.7',
    mcp: { token: 'mcp-token', userId: 'user-1', clientId: 'kanvaro-claude-code', scopes: ['kanvaro'], expiresAt: 9e9, jti: 'j' },
    kanvaro: { token: 'kanvaro-1', expiresAt: 9e9 },
    exchanger,
  }
}

function setup(reply: FakeKanvaro['reply'], extra: Partial<ToolRuntime> = {}) {
  const kanvaro = fakeKanvaro(reply)
  const audit = memoryAudit()
  const runtime: ToolRuntime = {
    kanvaro: createKanvaroClient({ baseUrl: 'http://kanvaro.internal', timeoutMs: 1000, fetchImpl: kanvaro.fetchImpl }),
    audit,
    limiter: createRateLimiter(),
    log,
    ...extra,
  }
  return { kanvaro, audit, runtime }
}

const textOf = (r: { content: unknown }) => (r.content as { type: string; text: string }[]).map(c => c.text).join('\n')

const listTasks = defineTool({
  name: 'tasks_list',
  title: 'List tasks',
  description: 'Lists tasks.',
  kind: 'read',
  paged: true,
  input: { project: kanvaroId().optional(), status: z.string().max(40).optional() },
  filter: { tasks: { _id: true, title: true, assignedTo: 'user' }, total: true },
  target: i => (i.project ? `project:${i.project}` : undefined),
  run: (input, ctx) => ctx.kanvaro.get('/api/tasks', { query: { project: input.project, status: input.status }, paging: ctx.paging }),
})

const updateTask = defineTool({
  name: 'task_update',
  title: 'Update a task',
  description: 'Updates a task.',
  kind: 'write',
  input: { id: kanvaroId(), title: z.string().max(200).optional(), priority: z.enum(['low', 'high']).optional() },
  filter: { _id: true, title: true },
  target: i => `task:${i.id}`,
  run: ({ id, ...changes }, ctx) => ctx.kanvaro.put(apiPath('tasks', id), { body: changes }),
})

describe('tool wrapper', () => {
  const tasks = { tasks: [{ _id: 't1', title: 'A', internal: 1, assignedTo: { _id: 'u2', firstName: 'Bo', email: 'bo@x', passwordResetOtp: '999999' } }], total: 1 }

  it('runs as the signed-in user, pages, filters and audits', async () => {
    const { kanvaro, audit, runtime } = setup(() => ({ status: 200, body: tasks }))
    const result = await runSignedIn(signedIn(), () => listTasks.call({ project: ID, limit: 100, page: 2 }, runtime))

    expect(result.isError).toBeFalsy()
    expect(JSON.parse(textOf(result))).toEqual({ tasks: [{ _id: 't1', title: 'A', assignedTo: { id: 'u2', name: 'Bo', email: 'bo@x' } }], total: 1 })
    const [call] = kanvaro.calls
    expect(call?.auth).toBe('Bearer kanvaro-1') // the exchanged Kanvaro token, never the MCP token
    expect(call?.url.searchParams.get('project')).toBe(ID)
    expect(call?.url.searchParams.get('page')).toBe('2')
    expect(call?.url.searchParams.get('limit')).toBe('100')
    expect(audit.entries).toEqual([{ requestId: 'req-1', userId: 'user-1', clientId: 'kanvaro-claude-code', ip: '10.0.0.7', action: 'tasks_list', target: `project:${ID}`, outcome: 'ok' }])
  })

  it('uses page 1 and 25 items by default', async () => {
    const { kanvaro, runtime } = setup(() => ({ status: 200, body: tasks }))
    await runSignedIn(signedIn(), () => listTasks.call({}, runtime))
    expect(kanvaro.calls[0]?.url.search).toBe('?page=1&limit=25')
  })

  it('refuses fields that are not on the allow-list, and limits over 100', async () => {
    const { kanvaro, runtime, audit } = setup(() => ({ status: 200, body: tasks }))
    const extra = await runSignedIn(signedIn(), () => listTasks.call({ organizationId: ID }, runtime))
    expect(extra.isError).toBe(true)
    expect(textOf(extra)).toMatch(/^Invalid input — .*organizationId/)
    const big = await runSignedIn(signedIn(), () => listTasks.call({ limit: 101 }, runtime))
    expect(big.isError).toBe(true)
    expect(kanvaro.calls).toHaveLength(0)
    expect(audit.entries.map(e => [e.outcome, e.detail])).toEqual([['refused', 'invalid_input'], ['refused', 'invalid_input']])
  })

  it('audits the names of changed fields, never their values', async () => {
    const { kanvaro, audit, runtime } = setup(() => ({ status: 200, body: { _id: ID, title: 'Secret plan', priority: 'high' } }))
    const result = await runSignedIn(signedIn(), () => updateTask.call({ id: ID, title: 'Secret plan', priority: 'high' }, runtime))
    expect(result.isError).toBeFalsy()
    expect(kanvaro.calls[0]).toMatchObject({ method: 'PUT', body: { title: 'Secret plan', priority: 'high' } })
    expect(audit.entries[0]).toMatchObject({ action: 'task_update', target: `task:${ID}`, outcome: 'ok', detail: 'fields: priority,title' })
    expect(JSON.stringify(audit.entries)).not.toContain('Secret plan')
  })

  it('rate-limits per user and says when to try again', async () => {
    const { kanvaro, audit, runtime } = setup(() => ({ status: 200, body: {} }), { limiter: createRateLimiter({ writesPerMinute: 1 }) })
    await runSignedIn(signedIn(), () => updateTask.call({ id: ID, title: 'a' }, runtime))
    const second = await runSignedIn(signedIn(), () => updateTask.call({ id: ID, title: 'b' }, runtime))
    expect(second.isError).toBe(true)
    expect(textOf(second)).toMatch(/^Too many changes in a minute\. Try again in \d+ seconds\.$/)
    expect(kanvaro.calls).toHaveLength(1)
    expect(audit.entries[1]).toMatchObject({ outcome: 'refused', detail: 'rate_limited' })
  })

  it('passes on Kanvaro\'s refusal as a plain tool error', async () => {
    const { audit, runtime } = setup(() => ({ status: 403, body: { error: 'Insufficient permissions' } }))
    const result = await runSignedIn(signedIn(), () => updateTask.call({ id: ID, title: 'a' }, runtime))
    expect(result.isError).toBe(true)
    expect(textOf(result)).toBe('You do not have permission to do this in Kanvaro. Insufficient permissions.')
    expect(audit.entries[0]).toMatchObject({ outcome: 'refused', detail: 'forbidden 403; fields: title' })
  })

  it('hides Kanvaro\'s internal errors', async () => {
    const { audit, runtime } = setup(() => ({ status: 500, body: { error: 'MongoServerError: E11000 at db.tasks' } }))
    const result = await runSignedIn(signedIn(), () => listTasks.call({}, runtime))
    expect(textOf(result)).toBe('Kanvaro is not reachable right now; try again later.')
    expect(audit.entries[0]).toMatchObject({ outcome: 'error', detail: 'unavailable 500' })
  })

  it('hides bugs in a tool behind a reference id', async () => {
    const broken = defineTool({ name: 'broken', title: 'B', description: 'B', kind: 'read', input: {}, filter: true, run: () => Promise.reject(new Error('secret stack detail')) })
    const { audit, runtime } = setup(() => ({ status: 200 }))
    const result = await runSignedIn(signedIn(), () => broken.call({}, runtime))
    expect(textOf(result)).toBe('Something went wrong in the Kanvaro MCP server (reference req-1).')
    expect(audit.entries[0]).toMatchObject({ outcome: 'error', detail: 'internal' })
  })

  it('shows a tool\'s own input message', async () => {
    const picky = defineTool({ name: 'picky', title: 'P', description: 'P', kind: 'read', input: {}, filter: true, run: () => Promise.reject(new ToolInputError('Give a project or a sprint.')) })
    const { runtime } = setup(() => ({ status: 200 }))
    expect(textOf(await runSignedIn(signedIn(), () => picky.call({}, runtime)))).toBe('Give a project or a sprint.')
  })

  it('on a Kanvaro 401, exchanges again once and retries', async () => {
    let n = 0
    const { kanvaro, runtime } = setup(() => (++n === 1 ? { status: 401 } : { status: 200, body: tasks }))
    const exchanger = fakeExchanger(['kanvaro-1', 'kanvaro-2'])
    const result = await runSignedIn(signedIn(exchanger), () => listTasks.call({}, runtime))
    expect(result.isError).toBeFalsy()
    expect(kanvaro.calls.map(c => c.auth)).toEqual(['Bearer kanvaro-1', 'Bearer kanvaro-2'])
    expect(exchanger.invalidated).toBe(1)
  })

  it('tells the user to reconnect when their access has ended', async () => {
    const { audit, runtime } = setup(() => ({ status: 401 }))
    const result = await runSignedIn(signedIn(fakeExchanger(['kanvaro-1'])), () => listTasks.call({}, runtime))
    expect(textOf(result)).toBe('Your Kanvaro sign-in has ended. Reconnect to sign in again.')
    expect(audit.entries[0]).toMatchObject({ outcome: 'refused', detail: 'session_ended' })
  })

  it('cuts a result that is too large, with a note', async () => {
    const many = { tasks: Array.from({ length: 100 }, (_, i) => ({ _id: `t${i}`, title: 'x'.repeat(2000) })), total: 100 }
    const { runtime } = setup(() => ({ status: 200, body: many }))
    const result = await runSignedIn(signedIn(), () => listTasks.call({ limit: 100 }, runtime))
    const [data, note] = (result.content as { text: string }[]).map(c => c.text)
    expect((JSON.parse(data ?? '') as { tasks: unknown[] }).tasks.length).toBeLessThan(100)
    expect(note).toMatch(/^Only the first \d+ of 100 items fit in one result/)
  })

  it('refuses to run outside a signed-in request', async () => {
    const { kanvaro, runtime } = setup(() => ({ status: 200 }))
    const result = await listTasks.call({}, runtime)
    expect(result.isError).toBe(true)
    expect(kanvaro.calls).toHaveLength(0)
  })

  it('checks tool definitions', () => {
    const base = { title: 'T', description: 'D', kind: 'read' as const, filter: true as const, run: () => Promise.resolve({}) }
    expect(() => defineTool({ ...base, name: 'Bad-Name', input: {} })).toThrow(/snake_case/)
    expect(() => defineTool({ ...base, name: 'x', paged: true, input: { limit: z.number() } })).toThrow(/added by the wrapper/)
  })
})

// ---------------------------------------------------------------------------------------
// Through a real MCP client: registration, schema and the request context
// ---------------------------------------------------------------------------------------

describe('tools over MCP', () => {
  let running: RunningServer | undefined
  let handler: McpHttpHandler | undefined
  let client: Client | undefined

  afterEach(async () => {
    await client?.close().catch(() => undefined)
    await handler?.close()
    await running?.close(100)
    running = handler = client = undefined
  })

  async function connect(tools: Tool[], runtime: ToolRuntime): Promise<Client> {
    const app = createApp({ log, readiness: { database: () => Promise.resolve(), kanvaro: () => Promise.resolve() }, trustProxy: false })
    running = await startServer(app, '127.0.0.1', 0)
    handler = createMcpEndpoint(log, { tools, runtime })
    // Stands in for the sign-in steps (tested in auth.test.ts): sets the signed-in context.
    const signIn: RequestHandler = (_req, _res, next) => runSignedIn(signedIn(), () => next())
    mountMcp(app, handler, { publicBaseUrl: running.url, host: '127.0.0.1', allowedOrigins: [], authenticate: signIn, log })
    finishApp(app)
    client = new Client({ name: 't', version: '1' })
    await client.connect(new StreamableHTTPClientTransport(new URL(`${running.url}/mcp`)))
    return client
  }

  it('lists tools with strict schemas, paging fields and the right hints', async () => {
    const { runtime } = setup(() => ({ status: 200 }))
    const c = await connect([listTasks, updateTask], runtime)
    const { tools } = await c.listTools()
    expect(tools.map(t => t.name)).toEqual(['ping', 'tasks_list', 'task_update'])
    const list = tools.find(t => t.name === 'tasks_list')
    expect(Object.keys(list?.inputSchema.properties ?? {})).toEqual(['project', 'status', 'page', 'limit'])
    expect(list?.inputSchema.additionalProperties).toBe(false)
    expect(list?.annotations).toMatchObject({ readOnlyHint: true })
    expect(tools.find(t => t.name === 'task_update')?.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: false })
  })

  it('runs a tool as the signed-in user', async () => {
    const { kanvaro, audit, runtime } = setup(() => ({ status: 200, body: { tasks: [{ _id: 't1', title: 'A' }], total: 1 } }))
    const c = await connect([listTasks], runtime)
    const result = await c.callTool({ name: 'tasks_list', arguments: { status: 'todo' } })
    expect(result.isError).toBeFalsy()
    expect(JSON.parse(textOf(result))).toEqual({ tasks: [{ _id: 't1', title: 'A' }], total: 1 })
    expect(kanvaro.calls[0]?.auth).toBe('Bearer kanvaro-1')
    expect(audit.entries[0]).toMatchObject({ action: 'tasks_list', userId: 'user-1', outcome: 'ok' })
  })

  it('rejects unknown arguments before the tool runs', async () => {
    const { kanvaro, runtime } = setup(() => ({ status: 200 }))
    const c = await connect([listTasks], runtime)
    const result = await c.callTool({ name: 'tasks_list', arguments: { userId: 'someone-else' } }).catch((e: unknown) => ({ isError: true, content: [{ type: 'text', text: String(e) }] }))
    expect(result.isError).toBe(true)
    expect(kanvaro.calls).toHaveLength(0)
  })
})
