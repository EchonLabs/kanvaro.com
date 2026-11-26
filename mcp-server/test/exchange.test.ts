import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import type { McpHttpHandler } from '@modelcontextprotocol/server'
import { McpServer, createMcpHandler } from '@modelcontextprotocol/server'
import { decodeJwt, jwtVerify } from 'jose'
import { afterEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { SessionEndedError, currentSignIn, withKanvaroToken } from '../src/auth/context.js'
import type { KanvaroToken } from '../src/auth/exchange.js'
import { ExchangeError, createTokenExchanger, kanvaroTokenUrl } from '../src/auth/exchange.js'
import { mountResourceMetadata, resourceMetadataUrl } from '../src/auth/metadata.js'
import { requireKanvaroExchange, requireKanvaroToken } from '../src/auth/middleware.js'
import type { VerifiedToken } from '../src/auth/verify.js'
import { createTokenVerifier } from '../src/auth/verify.js'
import { createApp, finishApp } from '../src/http/app.js'
import type { RunningServer } from '../src/http/server.js'
import { listenSafely, startServer } from '../src/http/server.js'
import { KanvaroAuthError } from '../src/kanvaro/client.js'
import { createLogger } from '../src/log.js'
import { mountMcp } from '../src/mcp/server.js'
import { signIn } from './helpers/oauth.js'
import type { StubKanvaro } from './stub-kanvaro/stub.js'
import { startStubKanvaro } from './stub-kanvaro/stub.js'

const STUB_JWT_SECRET = new TextEncoder().encode('stub-kanvaro-jwt-secret')
const cleanups: (() => Promise<unknown>)[] = []
afterEach(async () => { for (const c of cleanups.splice(0).reverse()) await c().catch(() => undefined) })

async function stubWith(opts: Partial<Parameters<typeof startStubKanvaro>[0]> = {}): Promise<StubKanvaro> {
  const s = await startStubKanvaro({ mcpResource: 'http://mcp.test/mcp', ...opts })
  cleanups.push(() => s.close())
  return s
}

/** Signs in at the stand-in and verifies the MCP token, like the token check does. */
async function verifiedToken(s: StubKanvaro): Promise<VerifiedToken> {
  const { accessToken } = await signIn(s)
  return createTokenVerifier({ issuer: s.issuer, audience: s.options.mcpResource, jwksUrl: `${s.url}/api/oauth/jwks` })(accessToken)
}

const exchangerFor = (s: StubKanvaro, extra: Partial<Parameters<typeof createTokenExchanger>[0]> = {}) =>
  createTokenExchanger({ tokenUrl: kanvaroTokenUrl(s.url), clientId: 'kanvaro-mcp-server', clientSecret: 'stub-mcp-server-secret', timeoutMs: 1000, ...extra })

const kindOf = (p: Promise<unknown>) => p.then(() => 'ok', (e: unknown) => (e instanceof ExchangeError ? e.kind : `other: ${String(e)}`))

/** A token endpoint that answers whatever the test says. */
async function fakeTokenEndpoint(status: number, body: string, delayMs = 0): Promise<string> {
  const srv = createServer((_req, res) => setTimeout(() => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(body) }, delayMs))
  await listenSafely(srv, 0, '127.0.0.1')
  cleanups.push(() => new Promise<void>(r => { srv.closeAllConnections(); srv.close(() => r()) }))
  return `http://127.0.0.1:${(srv.address() as AddressInfo).port}/api/oauth/token`
}

describe('token exchanger', () => {
  it('returns a Kanvaro API token for the same user, never outliving the MCP token', async () => {
    const s = await stubWith()
    const mcp = await verifiedToken(s)
    const k = await exchangerFor(s).exchange(mcp)
    const { payload } = await jwtVerify(k.token, STUB_JWT_SECRET)
    expect(payload).toMatchObject({ userId: 'stub-user-1', role: 'team_member' })
    expect(k.expiresAt).toBeLessThanOrEqual(mcp.expiresAt)
    expect(k.token).not.toBe(mcp.token)
  })

  it('caches: the second request for the same token does not call Kanvaro', async () => {
    const s = await stubWith()
    const mcp = await verifiedToken(s)
    const ex = exchangerFor(s)
    const a = await ex.exchange(mcp)
    const b = await ex.exchange(mcp)
    expect(b).toEqual(a)
    expect(s.counts.exchange).toBe(1)
  })

  it('runs one exchange for many parallel requests with the same token', async () => {
    const s = await stubWith()
    const mcp = await verifiedToken(s)
    const ex = exchangerFor(s)
    const results = await Promise.all(Array.from({ length: 10 }, () => ex.exchange(mcp)))
    expect(new Set(results.map(r => r.token)).size).toBe(1)
    expect(s.counts.exchange).toBe(1)
  })

  it('exchanges again shortly before the Kanvaro token expires', async () => {
    const s = await stubWith()
    const mcp = await verifiedToken(s)
    let clock = Date.now()
    const ex = exchangerFor(s, { now: () => clock })
    const first = await ex.exchange(mcp)
    clock = (first.expiresAt - 20) * 1000 // inside the 30 s margin
    await ex.exchange(mcp)
    expect(s.counts.exchange).toBe(2)
  })

  it('re-checks with Kanvaro at least every 60 s, even if the token is still valid', async () => {
    const s = await stubWith()
    const mcp = await verifiedToken(s)
    let clock = Date.now()
    const ex = exchangerFor(s, { now: () => clock })
    await ex.exchange(mcp)
    clock += 59_000
    await ex.exchange(mcp)
    expect(s.counts.exchange).toBe(1)
    clock += 2_000
    await ex.exchange(mcp)
    expect(s.counts.exchange).toBe(2)
  })

  it('marks only the first exchange of a session as first, not the re-checks', async () => {
    const s = await stubWith()
    const mcp = await verifiedToken(s)
    let clock = Date.now()
    const ex = exchangerFor(s, { now: () => clock })
    expect(await ex.exchangeWithInfo(mcp)).toMatchObject({ fresh: true, first: true })
    expect(await ex.exchangeWithInfo(mcp)).toMatchObject({ fresh: false, first: false })
    clock += 61_000
    expect(await ex.exchangeWithInfo(mcp)).toMatchObject({ fresh: true, first: false })
  })

  it('exchanges again after invalidate()', async () => {
    const s = await stubWith()
    const mcp = await verifiedToken(s)
    const ex = exchangerFor(s)
    await ex.exchange(mcp)
    ex.invalidate(mcp.token)
    await ex.exchange(mcp)
    expect(s.counts.exchange).toBe(2)
  })

  it('keeps at most maxEntries, dropping the least recently used', async () => {
    const s = await stubWith()
    const ex = exchangerFor(s, { maxEntries: 2 })
    const [a, b, c] = [await verifiedToken(s), await verifiedToken(s), await verifiedToken(s)]
    await ex.exchange(a)
    await ex.exchange(b)
    await ex.exchange(a) // a is now most recent
    await ex.exchange(c) // drops b
    expect(ex.size).toBe(2)
    expect(s.counts.exchange).toBe(3)
    await ex.exchange(a) // still cached
    expect(s.counts.exchange).toBe(3)
    await ex.exchange(b) // was dropped
    expect(s.counts.exchange).toBe(4)
  })

  it('is refused when the user was deactivated or signed out', async () => {
    const s = await stubWith()
    const mcp = await verifiedToken(s)
    s.deactivateUser('stub-user-1')
    expect(await kindOf(exchangerFor(s).exchange(mcp))).toBe('refused')
  })

  it('is misconfigured (not the user\'s fault) when Kanvaro rejects our client secret', async () => {
    const s = await stubWith()
    expect(await kindOf(exchangerFor(s, { clientSecret: 'wrong' }).exchange(await verifiedToken(s)))).toBe('misconfigured')
  })

  it('is unavailable when Kanvaro is unreachable', async () => {
    const s = await stubWith()
    const mcp = await verifiedToken(s)
    expect(await kindOf(createTokenExchanger({ tokenUrl: 'http://127.0.0.1:1/api/oauth/token', clientId: 'x', clientSecret: 'y', timeoutMs: 500 }).exchange(mcp))).toBe('unavailable')
  })

  it.each([
    ['500', 500, '{"error":"server_error"}', 0],
    ['empty success', 200, '{}', 0],
    ['wrong token type', 200, '{"access_token":"t","token_type":"mac","expires_in":900}', 0],
    ['wrong issued type', 200, '{"access_token":"t","token_type":"Bearer","expires_in":900,"issued_token_type":"urn:ietf:params:oauth:token-type:refresh_token"}', 0],
    ['no expiry', 200, '{"access_token":"t","token_type":"Bearer"}', 0],
    ['not JSON', 200, '<html>', 0],
    ['timeout', 200, '{}', 1500],
  ])('is unavailable on a bad answer: %s', async (_l, status, body, delay) => {
    const s = await stubWith()
    const mcp = await verifiedToken(s)
    const ex = createTokenExchanger({ tokenUrl: await fakeTokenEndpoint(status, body, delay), clientId: 'x', clientSecret: 'y', timeoutMs: 500 })
    expect(await kindOf(ex.exchange(mcp))).toBe('unavailable')
  })

  it('never puts tokens or the secret in its errors', async () => {
    const s = await stubWith()
    const mcp = await verifiedToken(s)
    const err = await exchangerFor(s, { clientSecret: 'super-secret-xyz' }).exchange(mcp).catch((e: unknown) => e)
    expect(`${String(err)} ${JSON.stringify(err)}`).not.toMatch(new RegExp(`super-secret-xyz|${mcp.token.slice(-20)}`))
  })
})

// ---------------------------------------------------------------- through /mcp

let running: RunningServer | undefined
let handler: McpHttpHandler | undefined
const clients: Client[] = []
afterEach(async () => {
  await Promise.all(clients.splice(0).map(c => c.close().catch(() => undefined)))
  await handler?.close()
  await running?.close(100)
  running = handler = undefined
})

/** A test MCP server whose tools read the signed-in context, behind the real token check and exchange. */
async function serve(opts: { tokenUrl?: string; secret?: string } = {}): Promise<{ url: string; stub: StubKanvaro }> {
  const log = createLogger({ level: 'error', destination: { write: () => undefined } })
  const app = createApp({ log, readiness: { database: () => Promise.resolve(), kanvaro: () => Promise.resolve() }, trustProxy: false })
  running = await startServer(app, '127.0.0.1', 0)
  const resourceUrl = `${running.url}/mcp`
  const s = await stubWith({ mcpResource: resourceUrl })
  let failuresLeft = 0
  handler = createMcpHandler(() => {
    const server = new McpServer({ name: 'test', version: '1' })
    server.registerTool('whoami', { inputSchema: z.object({}) }, async () => {
      const userId = await withKanvaroToken(t => Promise.resolve(String(decodeJwt(t).userId)))
      return { content: [{ type: 'text', text: userId }], structuredContent: { userId, mcpUser: currentSignIn()?.mcp.userId } }
    })
    server.registerTool('flaky', { inputSchema: z.object({ fail: z.number() }) }, async ({ fail }) => {
      failuresLeft = fail
      let seen: KanvaroToken['token'][] = []
      try {
        await withKanvaroToken(t => {
          seen = [...seen, t]
          if (failuresLeft-- > 0) return Promise.reject(new KanvaroAuthError())
          return Promise.resolve('ok')
        })
        return { content: [{ type: 'text', text: 'ok' }], structuredContent: { calls: seen.length, exchanges: s.counts.exchange } }
      } catch (err) {
        return { isError: true, content: [{ type: 'text', text: err instanceof SessionEndedError ? 'session ended' : 'other' }] }
      }
    })
    return server
  })
  const rmUrl = resourceMetadataUrl(resourceUrl)
  mountResourceMetadata(app, { resourceUrl, issuer: s.issuer })
  mountMcp(app, handler, {
    publicBaseUrl: running.url, host: '127.0.0.1', allowedOrigins: [], log,
    authenticate: [
      requireKanvaroToken({ verify: createTokenVerifier({ issuer: s.issuer, audience: resourceUrl, jwksUrl: `${s.url}/api/oauth/jwks` }), resourceMetadataUrl: rmUrl, resourceUrl }),
      requireKanvaroExchange({
        exchanger: createTokenExchanger({ tokenUrl: opts.tokenUrl ?? kanvaroTokenUrl(s.url), clientId: 'kanvaro-mcp-server', clientSecret: opts.secret ?? 'stub-mcp-server-secret', timeoutMs: 500 }),
        resourceMetadataUrl: rmUrl,
      }),
    ],
  })
  finishApp(app)
  return { url: running.url, stub: s }
}

async function connect(url: string, token: string): Promise<Client> {
  const client = new Client({ name: 'test', version: '1' }, { versionNegotiation: { mode: { pin: '2026-07-28' } } })
  await client.connect(new StreamableHTTPClientTransport(new URL(`${url}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }))
  clients.push(client)
  return client
}

const post = (url: string, token: string) =>
  fetch(`${url}/mcp`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' }, body: '{"jsonrpc":"2.0","id":1,"method":"ping"}' })

describe('exchange on /mcp', () => {
  it('gives tools the user\'s Kanvaro API token through the request context', async () => {
    const { url, stub: s } = await serve()
    const client = await connect(url, (await signIn(s)).accessToken)
    const result = await client.callTool({ name: 'whoami', arguments: {} })
    expect(result.structuredContent).toEqual({ userId: 'stub-user-1', mcpUser: 'stub-user-1' })
  })

  it('exchanges once for many requests of one session', async () => {
    const { url, stub: s } = await serve()
    const client = await connect(url, (await signIn(s)).accessToken)
    for (let i = 0; i < 5; i++) await client.callTool({ name: 'whoami', arguments: {} })
    expect(s.counts.exchange).toBe(1)
  })

  it('answers 401 (sign in again) when Kanvaro refuses the exchange', async () => {
    const { url, stub: s } = await serve()
    const { accessToken } = await signIn(s)
    s.deactivateUser('stub-user-1')
    const res = await post(url, accessToken)
    expect(res.status).toBe(401)
    expect(res.headers.get('www-authenticate')).toContain('error="invalid_token"')
  })

  it.each([
    ['Kanvaro unreachable', { tokenUrl: 'http://127.0.0.1:1/api/oauth/token' }],
    ['our client secret wrong', { secret: 'wrong' }],
  ])('answers 503 (not 401) when %s', async (_l, opts) => {
    const { url, stub: s } = await serve(opts)
    const res = await post(url, (await signIn(s)).accessToken)
    expect(res.status).toBe(503)
    expect(res.headers.get('retry-after')).toBe('5')
  })

  it('on a Kanvaro 401 mid-call: exchanges again once and retries', async () => {
    const { url, stub: s } = await serve()
    const client = await connect(url, (await signIn(s)).accessToken)
    const result = await client.callTool({ name: 'flaky', arguments: { fail: 1 } })
    expect(result.structuredContent).toEqual({ calls: 2, exchanges: 2 })
  })

  it('on a second Kanvaro 401: ends the session instead of retrying forever', async () => {
    const { url, stub: s } = await serve()
    const client = await connect(url, (await signIn(s)).accessToken)
    const result = await client.callTool({ name: 'flaky', arguments: { fail: 5 } })
    expect(result.isError).toBe(true)
    expect(result.content).toEqual([{ type: 'text', text: 'session ended' }])
  })
})
