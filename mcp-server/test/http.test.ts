import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import type { Express } from 'express'
import { createApp, finishApp } from '../src/http/app.js'
import type { ReadinessChecks } from '../src/http/health.js'
import { kanvaroCheck, runChecks } from '../src/http/health.js'
import type { RunningServer } from '../src/http/server.js'
import { startServer } from '../src/http/server.js'
import { createLogger } from '../src/log.js'

const ok = () => Promise.resolve()
const fail = () => Promise.reject(new Error('mongodb://mcp:db-pass-555@db refused'))

let running: RunningServer | undefined
afterEach(async () => { await running?.close(100); running = undefined })

function setup(readiness: ReadinessChecks = { database: ok, kanvaro: ok }, extend?: (app: Express) => void) {
  const lines: string[] = []
  const log = createLogger({ level: 'debug', destination: { write: (s: string) => { lines.push(s) } } })
  const app = createApp({ log, readiness, trustProxy: false })
  extend?.(app)
  finishApp(app)
  return { app, logs: () => lines.map(l => JSON.parse(l) as Record<string, unknown>), text: () => lines.join('') }
}

async function serve(app: Express): Promise<string> {
  running = await startServer(app, '127.0.0.1', 0)
  return running.url
}

describe('health and readiness', () => {
  it('GET /health answers 200 without touching dependencies', async () => {
    const url = await serve(setup({ database: fail, kanvaro: fail }).app)
    const res = await fetch(`${url}/health`)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'ok' })
  })

  it('GET /ready is 200 when the database and Kanvaro answer', async () => {
    const url = await serve(setup().app)
    const res = await fetch(`${url}/ready`)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'ready', checks: { database: 'ok', kanvaro: 'ok' } })
  })

  it('GET /ready is 503 and names the failing check, without details', async () => {
    const url = await serve(setup({ database: fail, kanvaro: ok }).app)
    const res = await fetch(`${url}/ready`)
    expect(res.status).toBe(503)
    const body = await res.text()
    expect(JSON.parse(body)).toEqual({ status: 'not_ready', checks: { database: 'fail', kanvaro: 'ok' } })
    expect(body).not.toContain('db-pass-555')
  })

  it('treats a hanging check as failed', async () => {
    const result = await runChecks({ database: () => new Promise(() => undefined), kanvaro: ok }, 100)
    expect(result).toEqual({ ready: false, checks: { database: 'fail', kanvaro: 'ok' } })
  })
})

describe('kanvaroCheck', () => {
  const fakes: ReturnType<typeof createServer>[] = []
  afterEach(async () => {
    await Promise.all(fakes.splice(0).map(s => new Promise<void>(r => s.close(() => r()))))
  })
  async function fakeKanvaro(status: number, location?: string): Promise<string> {
    const srv = createServer((_req, res) => { res.writeHead(status, location ? { Location: location } : {}); res.end('{}') })
    await new Promise<void>(r => srv.listen(0, '127.0.0.1', r))
    fakes.push(srv)
    return `http://127.0.0.1:${(srv.address() as AddressInfo).port}`
  }
  it('passes on 200 from /api/health', async () => {
    await expect(kanvaroCheck(await fakeKanvaro(200))()).resolves.toBeUndefined()
  })
  it('fails on 500, on a redirect, and when unreachable', async () => {
    await expect(kanvaroCheck(await fakeKanvaro(500))()).rejects.toThrow()
    await expect(kanvaroCheck(await fakeKanvaro(302, '/login'))()).rejects.toThrow()
    await expect(kanvaroCheck('http://127.0.0.1:1')()).rejects.toThrow()
  })
})

describe('every response', () => {
  it('carries security headers and no X-Powered-By', async () => {
    const res = await fetch(`${await serve(setup().app)}/health`)
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(res.headers.get('referrer-policy')).toBe('no-referrer')
    expect(res.headers.get('x-powered-by')).toBeNull()
  })

  it('keeps a plain X-Request-Id and replaces an unsafe one', async () => {
    const url = await serve(setup().app)
    expect((await fetch(`${url}/health`, { headers: { 'X-Request-Id': 'abc-123' } })).headers.get('x-request-id')).toBe('abc-123')
    expect((await fetch(`${url}/health`, { headers: { 'X-Request-Id': '{"x":1}' } })).headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('answers unknown routes with a JSON 404', async () => {
    const res = await fetch(`${await serve(setup().app)}/nope`)
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'not_found' })
  })

  it('answers errors with a 500 that holds only the request id', async () => {
    const { app, text } = setup(undefined, a => a.get('/boom', () => { throw new Error('crash with Bearer tok-access-111') }))
    const res = await fetch(`${await serve(app)}/boom`, { headers: { 'X-Request-Id': 'r-500' } })
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'internal_error', requestId: 'r-500' })
    expect(text()).toContain('request failed')
    expect(text()).not.toContain('tok-access-111')
  })
})

describe('access log', () => {
  it('logs method, path, status and request id — never the query string', async () => {
    const { app, logs } = setup()
    await fetch(`${await serve(app)}/nope?code=secret-code-1`, { headers: { 'X-Request-Id': 'r-log' } })
    const line = logs().find(l => l.msg === 'request')
    expect(line).toMatchObject({ method: 'GET', path: '/nope', status: 404, requestId: 'r-log', level: 'info' })
    expect(JSON.stringify(logs())).not.toContain('secret-code-1')
  })

  it('logs health checks only at debug level', async () => {
    const { app, logs } = setup()
    await fetch(`${await serve(app)}/health`)
    expect(logs().find(l => l.msg === 'request')?.level).toBe('debug')
  })
})

describe('graceful shutdown', () => {
  it('lets a running request finish, then refuses new connections', async () => {
    const slow = { database: () => new Promise<void>(r => setTimeout(r, 300)), kanvaro: ok }
    const url = await serve(setup(slow).app)
    const inFlight = fetch(`${url}/ready`)
    await new Promise(r => setTimeout(r, 50))
    const closed = running!.close(2000)
    expect((await inFlight).status).toBe(200)
    await closed
    running = undefined
    await expect(fetch(`${url}/health`)).rejects.toThrow()
  })

  it('force-closes connections that outlive the grace period', async () => {
    const hang = { database: () => new Promise<void>(() => undefined), kanvaro: ok }
    const { app } = setup(hang, a => a.get('/hang', () => undefined))
    const url = await serve(app)
    const pending = fetch(`${url}/hang`).catch(() => 'closed')
    await new Promise(r => setTimeout(r, 50))
    const started = Date.now()
    await running!.close(200)
    running = undefined
    expect(Date.now() - started).toBeLessThan(1500)
    expect(await pending).toBe('closed')
  })
})
