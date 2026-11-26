import { discoverOAuthServerInfo } from '@modelcontextprotocol/client'
import { afterEach, describe, expect, it } from 'vitest'
import { mountResourceMetadata, resourceMetadata, resourceMetadataUrl } from '../src/auth/metadata.js'
import { createApp, finishApp } from '../src/http/app.js'
import type { RunningServer } from '../src/http/server.js'
import { startServer } from '../src/http/server.js'
import { createLogger } from '../src/log.js'
import type { StubKanvaro } from './stub-kanvaro/stub.js'
import { startStubKanvaro } from './stub-kanvaro/stub.js'

let running: RunningServer | undefined
let stub: StubKanvaro | undefined
afterEach(async () => {
  await running?.close(100)
  await stub?.close()
  running = undefined
  stub = undefined
})

/** Starts the MCP server's app with metadata pointing at `issuer`; returns its base URL. */
async function serve(issuer: string): Promise<string> {
  const log = createLogger({ level: 'error', destination: { write: () => undefined } })
  const app = createApp({ log, readiness: { database: () => Promise.resolve(), kanvaro: () => Promise.resolve() }, trustProxy: false })
  running = await startServer(app, '127.0.0.1', 0)
  mountResourceMetadata(app, { resourceUrl: `${running.url}/mcp`, issuer })
  finishApp(app)
  return running.url
}

describe('protected-resource metadata', () => {
  it('names Kanvaro as the authorization server, at both well-known paths', async () => {
    const url = await serve('https://kanvaro.example.com')
    const expected = {
      resource: `${url}/mcp`,
      authorization_servers: ['https://kanvaro.example.com'],
      scopes_supported: ['kanvaro'],
      bearer_methods_supported: ['header'],
      resource_name: 'Kanvaro',
    }
    for (const path of ['/.well-known/oauth-protected-resource/mcp', '/.well-known/oauth-protected-resource']) {
      const res = await fetch(`${url}${path}`)
      expect(res.status, path).toBe(200)
      expect(await res.json()).toEqual(expected)
    }
  })

  it('is public: open CORS, cacheable, preflight answered', async () => {
    const url = await serve('https://kanvaro.example.com')
    const res = await fetch(`${url}/.well-known/oauth-protected-resource/mcp`, { headers: { Origin: 'https://claude.ai' } })
    expect(res.headers.get('access-control-allow-origin')).toBe('*')
    expect(res.headers.get('cache-control')).toBe('public, max-age=3600')
    const pre = await fetch(`${url}/.well-known/oauth-protected-resource/mcp`, { method: 'OPTIONS', headers: { Origin: 'https://claude.ai', 'Access-Control-Request-Method': 'GET' } })
    expect(pre.status).toBe(204)
    expect(pre.headers.get('access-control-allow-methods')).toContain('GET')
  })

  it('does not serve authorization-server metadata (that belongs to Kanvaro)', async () => {
    const url = await serve('https://kanvaro.example.com')
    expect((await fetch(`${url}/.well-known/oauth-authorization-server`)).status).toBe(404)
  })

  it('builds the metadata URL by inserting the well-known prefix before the path', () => {
    expect(resourceMetadataUrl('https://mcp.example.com/mcp')).toBe('https://mcp.example.com/.well-known/oauth-protected-resource/mcp')
    expect(resourceMetadata({ resourceUrl: 'https://mcp.example.com/mcp', issuer: 'https://k.example.com' }).authorization_servers).toEqual(['https://k.example.com'])
  })
})

describe('discovery with the official MCP client', () => {
  it('finds Kanvaro (the stand-in) through the MCP server, the way Claude Code does', async () => {
    stub = await startStubKanvaro({ mcpResource: 'http://placeholder/mcp' })
    const url = await serve(stub.issuer)
    const info = await discoverOAuthServerInfo(`${url}/mcp`)
    expect(info.authorizationServerUrl.replace(/\/$/, '')).toBe(stub.issuer)
    expect(info.authorizationServerMetadata).toMatchObject({
      issuer: stub.issuer,
      authorization_endpoint: `${stub.issuer}/oauth/authorize`,
      token_endpoint: `${stub.issuer}/api/oauth/token`,
      code_challenge_methods_supported: ['S256'],
    })
    expect(info.resourceMetadata?.resource).toBe(`${url}/mcp`)
  })
})
