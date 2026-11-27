import { request as httpRequest } from 'node:http'
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { afterEach, describe, expect, it } from 'vitest'
import type { McpHttpHandler } from '@modelcontextprotocol/server'
import type { RequestHandler } from 'express'
import { createApp, finishApp } from '../src/http/app.js'
import type { RunningServer } from '../src/http/server.js'
import { startServer } from '../src/http/server.js'
import { createLogger } from '../src/log.js'
import { allowedHostnames, createMcpEndpoint, mountMcp } from '../src/mcp/server.js'

const ok = () => Promise.resolve()
let running: RunningServer | undefined
let handler: McpHttpHandler | undefined
const clients: Client[] = []

afterEach(async () => {
  await Promise.all(clients.splice(0).map(c => c.close().catch(() => undefined)))
  await handler?.close()
  await running?.close(100)
  running = undefined
  handler = undefined
})

async function serve(allowedOrigins: string[] = []): Promise<string> {
  const log = createLogger({ level: 'error', destination: { write: () => undefined } })
  const app = createApp({ log, readiness: { database: ok, kanvaro: ok }, trustProxy: false })
  handler = createMcpEndpoint(log)
  running = await startServer(app, '127.0.0.1', 0)
  // These tests cover the endpoint itself; sign-in is tested in auth.test.ts.
  const noAuth: RequestHandler = (_req, _res, next) => next()
  mountMcp(app, handler, { publicBaseUrl: running.url, host: '127.0.0.1', allowedOrigins, authenticate: noAuth, log })
  finishApp(app)
  return running.url
}

async function connect(url: string, era: 'modern' | 'legacy'): Promise<Client> {
  const client = new Client(
    { name: 'test-client', version: '1.0.0' },
    era === 'modern' ? { versionNegotiation: { mode: { pin: '2026-07-28' } } } : {},
  )
  await client.connect(new StreamableHTTPClientTransport(new URL(`${url}/mcp`)))
  clients.push(client)
  return client
}

/** A raw request where the Host header can be set (fetch does not allow it). */
function rawPost(url: string, headers: Record<string, string>, body: unknown): Promise<number> {
  const u = new URL(`${url}/mcp`)
  return new Promise((resolve, reject) => {
    const req = httpRequest({ hostname: u.hostname, port: u.port, path: u.pathname, method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', ...headers } }, res => {
      res.resume()
      resolve(res.statusCode ?? 0)
    })
    req.on('error', reject)
    req.end(JSON.stringify(body))
  })
}

const initialize = { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 't', version: '1' } } }

describe.each(['modern', 'legacy'] as const)('MCP endpoint, %s protocol', era => {
  it('connects and identifies the server', async () => {
    const client = await connect(await serve(), era)
    expect(client.getServerVersion()).toMatchObject({ name: 'kanvaro-mcp-server', version: '0.1.0' })
    if (era === 'modern') expect(client.getNegotiatedProtocolVersion()).toBe('2026-07-28')
  })

  it('lists the ping tool as read-only', async () => {
    const client = await connect(await serve(), era)
    const { tools } = await client.listTools()
    const ping = tools.find(t => t.name === 'ping')
    expect(ping?.annotations).toMatchObject({ readOnlyHint: true })
  })

  it('runs ping', async () => {
    const client = await connect(await serve(), era)
    const result = await client.callTool({ name: 'ping', arguments: {} })
    expect(result.isError).toBeFalsy()
    expect(result.structuredContent).toEqual({ status: 'ok', server: 'kanvaro-mcp-server', version: '0.1.0' })
  })

  it('rejects unknown input fields', async () => {
    const client = await connect(await serve(), era)
    const result = await client.callTool({ name: 'ping', arguments: { userId: 'someone-else' } })
    expect(result.isError).toBe(true)
  })
})

describe('MCP endpoint security', () => {
  it('answers GET and DELETE with 405 (no sessions)', async () => {
    const url = await serve()
    expect((await fetch(`${url}/mcp`)).status).toBe(405)
    expect((await fetch(`${url}/mcp`, { method: 'DELETE' })).status).toBe(405)
  })

  it('accepts requests without an Origin header (Claude Code sends none)', async () => {
    expect(await rawPost(await serve(), {}, initialize)).toBe(200)
  })

  it('rejects a browser Origin that is not allowed', async () => {
    expect(await rawPost(await serve(), { Origin: 'https://evil.example' }, initialize)).toBe(403)
  })

  it('rejects an Origin with the right host but another scheme or port', async () => {
    const url = await serve(['https://app.example.com'])
    expect(await rawPost(url, { Origin: 'http://app.example.com' }, initialize)).toBe(403)
    expect(await rawPost(url, { Origin: 'https://app.example.com:8443' }, initialize)).toBe(403)
  })

  it('accepts an allowed browser Origin', async () => {
    expect(await rawPost(await serve(['https://app.example.com']), { Origin: 'https://app.example.com' }, initialize)).toBe(200)
  })

  it('rejects a foreign Host header (DNS rebinding)', async () => {
    expect(await rawPost(await serve(), { Host: 'evil.example' }, initialize)).toBe(403)
  })
})

describe('allow-lists', () => {
  it('allows only the public host name when listening on all interfaces', () => {
    expect(allowedHostnames('https://mcp.example.com', '0.0.0.0')).toEqual(['mcp.example.com'])
  })
  it('adds the localhost names when listening on loopback', () => {
    expect(allowedHostnames('https://mcp.example.com', '127.0.0.1')).toEqual(['mcp.example.com', 'localhost', '127.0.0.1', '[::1]'])
  })
})
