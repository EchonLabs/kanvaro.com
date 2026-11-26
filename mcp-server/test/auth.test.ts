import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import type { McpHttpHandler } from '@modelcontextprotocol/server'
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from 'jose'
import type { JWK, JWTPayload, JWTVerifyGetKey } from 'jose'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { mountResourceMetadata, resourceMetadataUrl } from '../src/auth/metadata.js'
import { requireKanvaroToken } from '../src/auth/middleware.js'
import { TokenError, createTokenVerifier } from '../src/auth/verify.js'
import { createApp, finishApp } from '../src/http/app.js'
import type { RunningServer } from '../src/http/server.js'
import { startServer } from '../src/http/server.js'
import { createLogger } from '../src/log.js'
import { createMcpEndpoint, mountMcp } from '../src/mcp/server.js'
import { signIn } from './helpers/oauth.js'
import type { StubKanvaro } from './stub-kanvaro/stub.js'
import { startStubKanvaro } from './stub-kanvaro/stub.js'

// ---------------------------------------------------------------- verifier, unit level

const ISS = 'https://kanvaro.example.com'
const AUD = 'https://mcp.example.com/mcp'
let keys: JWTVerifyGetKey
let sign: (claims: JWTPayload, header?: Record<string, unknown>) => Promise<string>
let signWithOtherKey: (claims: JWTPayload) => Promise<string>

beforeAll(async () => {
  const main = await generateKeyPair('ES256')
  const other = await generateKeyPair('ES256')
  const jwk: JWK = { ...(await exportJWK(main.publicKey)), kid: 'k1', alg: 'ES256' }
  keys = createLocalJWKSet({ keys: [jwk] })
  const now = Math.floor(Date.now() / 1000)
  const base = { iss: ISS, aud: AUD, sub: 'u1', client_id: 'kanvaro-claude-code', scope: 'kanvaro', iat: now, exp: now + 900, jti: 'j1' }
  sign = (claims, header = {}) => new SignJWT({ ...base, ...claims }).setProtectedHeader({ alg: 'ES256', kid: 'k1', typ: 'at+jwt', ...header }).sign(main.privateKey)
  signWithOtherKey = claims => new SignJWT({ ...base, ...claims }).setProtectedHeader({ alg: 'ES256', kid: 'k1', typ: 'at+jwt' }).sign(other.privateKey)
})

const verifyLocal = (token: string) => createTokenVerifier({ issuer: ISS, audience: AUD, keys })(token)
const kindOf = async (p: Promise<unknown>) => p.then(() => 'ok', (e: unknown) => (e instanceof TokenError ? e.kind : 'other'))

describe('token verifier', () => {
  it('accepts a valid token and returns the user, client, scopes and expiry', async () => {
    const v = await verifyLocal(await sign({}))
    expect(v).toMatchObject({ userId: 'u1', clientId: 'kanvaro-claude-code', scopes: ['kanvaro'], jti: 'j1' })
    expect(v.expiresAt).toBeGreaterThan(Date.now() / 1000)
  })

  it.each([
    ['another audience (token for a different server)', { aud: 'https://other.example.com/mcp' }],
    ['another issuer', { iss: 'https://evil.example.com' }],
    ['expired', { exp: Math.floor(Date.now() / 1000) - 120 }],
    ['no client_id', { client_id: undefined }],
    ['no jti', { jti: undefined }],
    ['no subject', { sub: undefined }],
  ])('rejects a token with %s', async (_l, claims) => {
    expect(await kindOf(verifyLocal(await sign(claims as JWTPayload)))).toBe('invalid_token')
  })

  it('rejects a token that is not an access token (typ)', async () => {
    expect(await kindOf(verifyLocal(await sign({}, { typ: 'JWT' })))).toBe('invalid_token')
  })

  it('rejects a token signed by another key', async () => {
    expect(await kindOf(verifyLocal(await signWithOtherKey({})))).toBe('invalid_token')
  })

  it('rejects HS256 and unsigned tokens', async () => {
    const hs = await new SignJWT({ sub: 'u1' }).setProtectedHeader({ alg: 'HS256', typ: 'at+jwt' }).sign(new TextEncoder().encode('x'.repeat(32)))
    const none = `${Buffer.from('{"alg":"none","typ":"at+jwt"}').toString('base64url')}.${Buffer.from('{"sub":"u1"}').toString('base64url')}.`
    expect(await kindOf(verifyLocal(hs))).toBe('invalid_token')
    expect(await kindOf(verifyLocal(none))).toBe('invalid_token')
    expect(await kindOf(verifyLocal('not-a-jwt'))).toBe('invalid_token')
  })

  it('returns insufficient_scope without the kanvaro scope', async () => {
    expect(await kindOf(verifyLocal(await sign({ scope: 'other' })))).toBe('insufficient_scope')
  })

  it('reports unreachable keys as unavailable, not as a bad token', async () => {
    const down = createTokenVerifier({ issuer: ISS, audience: AUD, jwksUrl: 'http://127.0.0.1:1/api/oauth/jwks', fetchTimeoutMs: 500 })
    expect(await kindOf(down(await sign({})))).toBe('unavailable')
  })
})

// ---------------------------------------------------------------- /mcp with the stand-in

let running: RunningServer | undefined
let handler: McpHttpHandler | undefined
let stub: StubKanvaro | undefined
const clients: Client[] = []
let logLines: string[] = []

afterEach(async () => {
  await Promise.all(clients.splice(0).map(c => c.close().catch(() => undefined)))
  await handler?.close()
  await running?.close(100)
  await stub?.close()
  running = handler = stub = undefined
  logLines = []
})

/** MCP server with the real token check, trusting the stand-in (or a JWKS URL override). */
async function serve(opts: { jwksUrl?: string; clock?: () => number } = {}): Promise<{ url: string; stub: StubKanvaro }> {
  const log = createLogger({ level: 'debug', destination: { write: (s: string) => { logLines.push(s) } } })
  const app = createApp({ log, readiness: { database: () => Promise.resolve(), kanvaro: () => Promise.resolve() }, trustProxy: false })
  running = await startServer(app, '127.0.0.1', 0)
  const resourceUrl = `${running.url}/mcp`
  stub = await startStubKanvaro({ mcpResource: resourceUrl, ...(opts.clock ? { now: opts.clock } : {}) })
  handler = createMcpEndpoint(log)
  mountResourceMetadata(app, { resourceUrl, issuer: stub.issuer })
  mountMcp(app, handler, {
    publicBaseUrl: running.url,
    host: '127.0.0.1',
    allowedOrigins: [],
    authenticate: requireKanvaroToken({
      verify: createTokenVerifier({ issuer: stub.issuer, audience: resourceUrl, jwksUrl: opts.jwksUrl ?? `${stub.url}/api/oauth/jwks`, fetchTimeoutMs: 500 }),
      resourceMetadataUrl: resourceMetadataUrl(resourceUrl),
      resourceUrl,
    }),
    log,
  })
  finishApp(app)
  return { url: running.url, stub }
}

const post = (url: string, headers: Record<string, string> = {}) =>
  fetch(`${url}/mcp`, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', ...headers }, body: '{"jsonrpc":"2.0","id":1,"method":"ping"}' })

async function connectWithToken(url: string, token: string): Promise<Client> {
  const client = new Client({ name: 'test', version: '1' }, { versionNegotiation: { mode: { pin: '2026-07-28' } } })
  await client.connect(new StreamableHTTPClientTransport(new URL(`${url}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }))
  clients.push(client)
  return client
}

describe('/mcp requires a Kanvaro token', () => {
  it('answers 401 without a token, pointing clients to the metadata (sign in at Kanvaro)', async () => {
    const { url } = await serve()
    const res = await post(url)
    expect(res.status).toBe(401)
    const challenge = res.headers.get('www-authenticate') ?? ''
    expect(challenge).toContain(`resource_metadata="${url}/.well-known/oauth-protected-resource/mcp"`)
    expect(challenge).toContain('scope="kanvaro"')
    expect(challenge).not.toContain('error=')
  })

  it.each([
    ['a Basic header', { Authorization: 'Basic dXNlcjpwYXNz' }],
    ['a malformed Bearer header', { Authorization: 'Bearer' }],
    ['a garbage token', { Authorization: 'Bearer not.a.token' }],
  ])('answers 401 for %s', async (_l, headers) => {
    expect((await post((await serve()).url, headers)).status).toBe(401)
  })

  it('says invalid_token for a bad token', async () => {
    const res = await post((await serve()).url, { Authorization: 'Bearer abc.def.ghi' })
    expect(res.headers.get('www-authenticate')).toContain('error="invalid_token"')
  })

  it('ignores a token in the URL', async () => {
    const { url, stub: s } = await serve()
    const { accessToken } = await signIn(s)
    const res = await fetch(`${url}/mcp?access_token=${accessToken}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
    expect(res.status).toBe(401)
  })

  it('accepts a token from a real sign-in and runs tools as that user', async () => {
    const { url, stub: s } = await serve()
    const { accessToken } = await signIn(s)
    const client = await connectWithToken(url, accessToken)
    const result = await client.callTool({ name: 'ping', arguments: {} })
    expect(result.structuredContent).toMatchObject({ status: 'ok', userId: 'stub-user-1' })
  })

  it('rejects an expired token', async () => {
    let clock = Date.now() - 2 * 3600_000 // tokens issued two hours ago
    const { url, stub: s } = await serve({ clock: () => clock })
    const { accessToken } = await signIn(s)
    clock = Date.now()
    const res = await post(url, { Authorization: `Bearer ${accessToken}` })
    expect(res.status).toBe(401)
    expect(res.headers.get('www-authenticate')).toContain('error="invalid_token"')
  })

  it('rejects a token issued by another Kanvaro (different keys)', async () => {
    const { url } = await serve()
    const other = await startStubKanvaro({ mcpResource: `${url}/mcp` })
    try {
      const { accessToken } = await signIn(other)
      expect((await post(url, { Authorization: `Bearer ${accessToken}` })).status).toBe(401)
    } finally {
      await other.close()
    }
  })

  it('answers 503 (not 401) when Kanvaro\'s keys cannot be fetched', async () => {
    const { url, stub: s } = await serve({ jwksUrl: 'http://127.0.0.1:1/api/oauth/jwks' })
    const { accessToken } = await signIn(s)
    const res = await post(url, { Authorization: `Bearer ${accessToken}` })
    expect(res.status).toBe(503)
    expect(res.headers.get('retry-after')).toBe('5')
  })

  it('logs the user and client, never the token', async () => {
    const { url, stub: s } = await serve()
    const { accessToken } = await signIn(s)
    await (await connectWithToken(url, accessToken)).callTool({ name: 'ping', arguments: {} })
    const text = logLines.join('')
    expect(text).toContain('"userId":"stub-user-1"')
    expect(text).toContain('"clientId":"kanvaro-claude-code"')
    expect(text).not.toContain(accessToken)
    expect(text).not.toContain(accessToken.split('.')[2])
  })
})
