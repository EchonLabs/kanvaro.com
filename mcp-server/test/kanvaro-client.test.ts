import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { KanvaroClient } from '../src/kanvaro/index.js'
import { KanvaroAuthError, KanvaroError, KanvaroUsageError, apiPath, createKanvaroClient } from '../src/kanvaro/index.js'

const TOKEN = 'kanvaro-api-token-abc123'

interface Seen { method?: string; url?: string; headers: IncomingMessage['headers']; body: string }
let last: Seen
let baseUrl = ''
let client: KanvaroClient

function json(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json', ...headers })
  res.end(JSON.stringify(body))
}

const server = createServer((req, res) => {
  let body = ''
  req.on('data', (c: Buffer) => { body += c.toString() })
  req.on('end', () => {
    last = { method: req.method, url: req.url, headers: req.headers, body }
    const path = new URL(req.url ?? '/', 'http://x').pathname
    const status = /^\/api\/status\/(\d+)$/.exec(path)
    if (path === '/api/echo') return json(res, 200, { ok: true })
    if (path === '/api/empty') { res.writeHead(204); return res.end() }
    if (status) return json(res, Number(status[1]), { error: 'Title, project, and category are required' }, { 'Retry-After': '7' })
    if (path === '/api/internal') return json(res, 500, { error: 'MongoServerError: E11000 duplicate key on db kanvaro', details: 'secret internal detail' })
    if (path === '/api/leaky-400') return json(res, 400, { error: 'Cast to ObjectId failed for value 6afe8d4b4b155d4a3e5eb268 at path _id' })
    if (path === '/api/long-400') return json(res, 400, { error: 'x'.repeat(500) })
    if (path === '/api/forbidden-msg') return json(res, 403, { error: 'You do not have permission to edit this story' })
    if (path === '/api/notfound-msg') return json(res, 404, { error: 'Task 6b00 exists but belongs to another project' })
    if (path === '/api/redirect') { res.writeHead(302, { Location: '/login?returnTo=/api/redirect' }); return res.end() }
    if (path === '/api/html') { res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end('<html>login</html>') }
    if (path === '/api/slow') { setTimeout(() => json(res, 200, { late: true }), 1500); return }
    if (path === '/api/big') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.write('"'); res.write('a'.repeat(2048)); return res.end('"') }
    if (path === '/api/big-declared') { res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': '999999999' }); return res.end('{}') }
    return json(res, 404, {})
  })
})

beforeAll(async () => {
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r))
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  client = createKanvaroClient({ baseUrl, timeoutMs: 500, maxResponseBytes: 1024 })
})
afterAll(() => new Promise<void>(r => server.close(() => r())))

const errorOf = async (p: Promise<unknown>): Promise<unknown> => p.then(() => { throw new Error('expected a rejection') }, (e: unknown) => e)

describe('requests', () => {
  it('sends only the Kanvaro token, JSON headers, and no cookie', async () => {
    const res = await client.post('/api/echo', { token: TOKEN, body: { title: 'x' }, requestId: 'req-1' })
    expect(res).toEqual({ status: 200, data: { ok: true } })
    expect(last.method).toBe('POST')
    expect(last.headers.authorization).toBe(`Bearer ${TOKEN}`)
    expect(last.headers.accept).toBe('application/json')
    expect(last.headers['content-type']).toBe('application/json')
    expect(last.headers['x-request-id']).toBe('req-1')
    expect(last.headers.cookie).toBeUndefined()
    expect(JSON.parse(last.body)).toEqual({ title: 'x' })
  })

  it('refuses a call without a token, before contacting Kanvaro', async () => {
    await expect(client.get('/api/echo', { token: '  ' })).rejects.toBeInstanceOf(KanvaroUsageError)
  })

  it('builds the query and comma-joins arrays', async () => {
    await client.get('/api/echo', { token: TOKEN, query: { status: 'todo', priority: ['high', 'low'], archived: false, skip: undefined } })
    const q = new URL(last.url ?? '', baseUrl).searchParams
    expect(q.get('status')).toBe('todo')
    expect(q.get('priority')).toBe('high,low')
    expect(q.get('archived')).toBe('false')
    expect(q.has('skip')).toBe(false)
  })

  it('returns undefined data for an empty success response', async () => {
    expect(await client.delete('/api/empty', { token: TOKEN })).toEqual({ status: 204, data: undefined })
  })
})

describe('paging', () => {
  const pagingOf = async (paging: { page?: number; limit?: number }) => {
    await client.get('/api/echo', { token: TOKEN, paging })
    const q = new URL(last.url ?? '', baseUrl).searchParams
    return [q.get('page'), q.get('limit')]
  }
  it('defaults to page 1, limit 25', async () => expect(await pagingOf({})).toEqual(['1', '25']))
  it('caps the limit at 100', async () => expect(await pagingOf({ limit: 10000 })).toEqual(['1', '100']))
  it('raises a zero or negative page and limit to 1', async () => expect(await pagingOf({ page: -3, limit: 0 })).toEqual(['1', '1']))
})

describe('identity can only come from the server', () => {
  it.each(['organizationId', 'organization', 'orgId', 'userId'])('refuses %s in the query', async key => {
    await expect(client.get('/api/echo', { token: TOKEN, query: { [key]: 'x' } })).rejects.toBeInstanceOf(KanvaroUsageError)
  })

  it('refuses identity fields in the body', async () => {
    await expect(client.post('/api/echo', { token: TOKEN, body: { userId: 'someone-else' } })).rejects.toBeInstanceOf(KanvaroUsageError)
  })

  it('adds the identity when the server supplies it', async () => {
    await client.get('/api/echo', { token: TOKEN, serverIdentity: { userId: 'u1', organizationId: 'o1' } })
    const q = new URL(last.url ?? '', baseUrl).searchParams
    expect([q.get('userId'), q.get('organizationId')]).toEqual(['u1', 'o1'])
  })
})

describe('paths stay on Kanvaro', () => {
  it('encodes each segment with apiPath', () => {
    expect(apiPath('tasks', 'a/b?c', 'comments')).toBe('/api/tasks/a%2Fb%3Fc/comments')
  })

  it.each(['/api/../admin', 'http://evil.example/api/x', '/login', '//evil.example/api/x', '/api/x?userId=1', '/api/x#y'])('refuses the path %s', async path => {
    await expect(client.get(path, { token: TOKEN })).rejects.toBeInstanceOf(KanvaroUsageError)
  })

  it('refuses dot segments in apiPath', () => {
    expect(() => apiPath('tasks', '..')).toThrow(KanvaroUsageError)
  })
})

describe('errors', () => {
  it('maps 401 to KanvaroAuthError so the caller can exchange again', async () => {
    const err = await errorOf(client.get('/api/status/401', { token: TOKEN }))
    expect(err).toBeInstanceOf(KanvaroAuthError)
  })

  it.each([
    [400, 'invalid_input'], [422, 'invalid_input'], [403, 'forbidden'], [404, 'not_found'],
    [409, 'conflict'], [429, 'rate_limited'], [500, 'unavailable'], [503, 'unavailable'],
  ])('maps %i to %s', async (code, kind) => {
    const err = await errorOf(client.get(`/api/status/${code}`, { token: TOKEN }))
    expect(err).toBeInstanceOf(KanvaroError)
    expect((err as KanvaroError).kind).toBe(kind)
    expect((err as KanvaroError).status).toBe(code)
  })

  it('passes Kanvaro\'s short validation message on', async () => {
    const err = (await errorOf(client.post('/api/status/400', { token: TOKEN, body: {} }))) as KanvaroError
    expect(err.message).toContain('Title, project, and category are required.')
  })

  it('passes a permission message on', async () => {
    const err = (await errorOf(client.put('/api/forbidden-msg', { token: TOKEN, body: {} }))) as KanvaroError
    expect(err.message).toContain('You do not have permission to edit this story.')
  })

  it('keeps 404 generic (Kanvaro wording can reveal whether something exists)', async () => {
    const err = (await errorOf(client.get('/api/notfound-msg', { token: TOKEN }))) as KanvaroError
    expect(err.message).toBe('Not found, or you do not have access to it.')
  })

  it('never passes 5xx details on', async () => {
    const err = (await errorOf(client.get('/api/internal', { token: TOKEN }))) as KanvaroError
    expect(err.kind).toBe('unavailable')
    expect(err.message).toBe('Kanvaro is not reachable right now; try again later.')
    expect(err.message).not.toMatch(/Mongo|E11000|secret|duplicate/i)
  })

  it.each(['/api/leaky-400', '/api/long-400'])('drops an internal-looking or long 4xx message (%s)', async path => {
    const err = (await errorOf(client.get(path, { token: TOKEN }))) as KanvaroError
    expect(err.message).toBe('Kanvaro rejected the request as invalid.')
  })

  it('returns Retry-After on 429', async () => {
    expect(((await errorOf(client.get('/api/status/429', { token: TOKEN }))) as KanvaroError).retryAfterSeconds).toBe(7)
  })

  it('does not follow redirects (a login redirect is not data)', async () => {
    const err = (await errorOf(client.get('/api/redirect', { token: TOKEN }))) as KanvaroError
    expect(err.kind).toBe('unexpected')
    expect(err.status).toBe(302)
  })

  it('treats a non-JSON success as unexpected', async () => {
    expect(((await errorOf(client.get('/api/html', { token: TOKEN }))) as KanvaroError).kind).toBe('unexpected')
  })

  it('times out as unavailable', async () => {
    const started = Date.now()
    const err = (await errorOf(client.get('/api/slow', { token: TOKEN }))) as KanvaroError
    expect(err.kind).toBe('unavailable')
    expect(Date.now() - started).toBeLessThan(1400)
  })

  it('reports an unreachable Kanvaro as unavailable', async () => {
    const down = createKanvaroClient({ baseUrl: 'http://127.0.0.1:1', timeoutMs: 500 })
    expect(((await errorOf(down.get('/api/echo', { token: TOKEN }))) as KanvaroError).kind).toBe('unavailable')
  })

  it.each(['/api/big', '/api/big-declared'])('refuses a response over the size limit (%s)', async path => {
    const err = (await errorOf(client.get(path, { token: TOKEN }))) as KanvaroError
    expect(err.message).toMatch(/more data than allowed/)
  })

  it('never puts the token in an error', async () => {
    for (const path of ['/api/status/401', '/api/internal', '/api/status/400', '/api/redirect']) {
      const err = await errorOf(client.get(path, { token: TOKEN }))
      expect(`${String(err)} ${JSON.stringify(err)}`).not.toContain(TOKEN)
    }
  })
})
