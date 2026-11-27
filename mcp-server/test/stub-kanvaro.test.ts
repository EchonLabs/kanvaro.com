import { createHash, randomBytes } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createRemoteJWKSet, jwtVerify } from 'jose'
import type { StubKanvaro } from './stub-kanvaro/stub.js'
import { ACCESS_TOKEN_TYPE, TOKEN_EXCHANGE_GRANT, redirectMatches, startStubKanvaro } from './stub-kanvaro/stub.js'

const MCP = 'http://localhost:3100/mcp'
const REDIRECT = 'http://localhost:33418/callback'
let stub: StubKanvaro
let clock = Date.now()

beforeEach(async () => {
  clock = Date.now()
  stub = await startStubKanvaro({
    mcpResource: MCP,
    now: () => clock,
    users: [
      { id: 'u-member', email: 'member@kanvaro.test', role: 'team_member', organizationId: 'org-1', active: true },
      { id: 'u-admin', email: 'admin@kanvaro.test', role: 'admin', organizationId: 'org-1', active: true },
    ],
  })
})
afterEach(() => stub.close())

const pkce = () => {
  const verifier = randomBytes(32).toString('base64url')
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') }
}

function authorizeUrl(params: Record<string, string | undefined>): string {
  const u = new URL(`${stub.url}/oauth/authorize`)
  for (const [k, v] of Object.entries(params)) if (v !== undefined) u.searchParams.set(k, v)
  return u.toString()
}

const goodAuthorize = (challenge: string, extra: Record<string, string | undefined> = {}) => authorizeUrl({
  response_type: 'code', client_id: 'kanvaro-claude-code', redirect_uri: REDIRECT, code_challenge: challenge,
  code_challenge_method: 'S256', state: 'st-1', resource: MCP, scope: 'kanvaro', ...extra,
})

async function authorize(url: string): Promise<{ status: number; location?: URL }> {
  const res = await fetch(url, { redirect: 'manual' })
  const loc = res.headers.get('location')
  return { status: res.status, location: loc ? new URL(loc) : undefined }
}

const form = (body: Record<string, string | undefined>) =>
  new URLSearchParams(Object.entries(body).filter((e): e is [string, string] => e[1] !== undefined))

async function token(body: Record<string, string | undefined>, basic?: string): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await fetch(`${stub.url}/api/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...(basic ? { Authorization: `Basic ${Buffer.from(basic).toString('base64')}` } : {}) },
    body: form(body),
  })
  return { status: res.status, json: (await res.json()) as Record<string, unknown> }
}

async function signIn(redirectUri = REDIRECT) {
  const { verifier, challenge } = pkce()
  const { location } = await authorize(goodAuthorize(challenge, { redirect_uri: redirectUri }))
  const code = location?.searchParams.get('code') ?? ''
  const res = await token({ grant_type: 'authorization_code', client_id: 'kanvaro-claude-code', code, redirect_uri: redirectUri, code_verifier: verifier, resource: MCP })
  return { code, verifier, ...res }
}

/** `basic: null` sends no client credentials at all. */
const exchange = (subject: string, basic: string | null = 'kanvaro-mcp-server:stub-mcp-server-secret') =>
  token({ grant_type: TOKEN_EXCHANGE_GRANT, subject_token: subject, subject_token_type: ACCESS_TOKEN_TYPE }, basic ?? undefined)

describe('metadata and keys (K-2, K-6)', () => {
  it('publishes the authorization server metadata', async () => {
    const meta = (await (await fetch(`${stub.url}/.well-known/oauth-authorization-server`)).json()) as Record<string, unknown>
    expect(meta).toMatchObject({
      issuer: stub.issuer,
      authorization_endpoint: `${stub.issuer}/oauth/authorize`,
      token_endpoint: `${stub.issuer}/api/oauth/token`,
      jwks_uri: `${stub.issuer}/api/oauth/jwks`,
      code_challenge_methods_supported: ['S256'],
      grant_types_supported: ['authorization_code', 'refresh_token', TOKEN_EXCHANGE_GRANT],
      authorization_response_iss_parameter_supported: true,
      scopes_supported: ['kanvaro'],
    })
  })
})

describe('authorize (K-3)', () => {
  it('redirects back with code, state and iss', async () => {
    const { status, location } = await authorize(goodAuthorize(pkce().challenge))
    expect(status).toBe(302)
    expect(`${location?.origin}${location?.pathname}`).toBe(REDIRECT)
    expect(location?.searchParams.get('state')).toBe('st-1')
    expect(location?.searchParams.get('iss')).toBe(stub.issuer)
    expect(location?.searchParams.get('code')).toMatch(/^[\w-]{40,}$/)
  })

  it.each([
    ['unknown client', { client_id: 'nope' }],
    ['the MCP server client', { client_id: 'kanvaro-mcp-server' }],
    ['unregistered redirect', { redirect_uri: 'https://evil.example/callback' }],
    ['other path on localhost', { redirect_uri: 'http://localhost:33418/other' }],
    ['127.0.0.1 instead of localhost', { redirect_uri: 'http://127.0.0.1:33418/callback' }],
  ])('shows an error page and never redirects: %s', async (_l, extra) => {
    const { status, location } = await authorize(goodAuthorize(pkce().challenge, extra))
    expect(status).toBe(400)
    expect(location).toBeUndefined()
  })

  it('accepts another port on the registered loopback address', async () => {
    const { status, location } = await authorize(goodAuthorize(pkce().challenge, { redirect_uri: 'http://localhost:51234/callback' }))
    expect(status).toBe(302)
    expect(location?.port).toBe('51234')
  })

  it.each([
    ['no PKCE', { code_challenge: undefined }, 'invalid_request'],
    ['plain PKCE', { code_challenge_method: 'plain' }, 'invalid_request'],
    ['no state', { state: undefined }, 'invalid_request'],
    ['wrong resource', { resource: 'https://other.example/mcp' }, 'invalid_target'],
    ['wrong response type', { response_type: 'token' }, 'unsupported_response_type'],
    ['unknown scope', { scope: 'admin' }, 'invalid_scope'],
  ])('redirects with an error: %s', async (_l, extra, error) => {
    const { status, location } = await authorize(goodAuthorize(pkce().challenge, extra))
    expect(status).toBe(302)
    expect(location?.searchParams.get('error')).toBe(error)
    expect(location?.searchParams.get('code')).toBeNull()
  })

  it('refuses a deactivated user', async () => {
    stub.deactivateUser('u-member')
    const { location } = await authorize(goodAuthorize(pkce().challenge))
    expect(location?.searchParams.get('error')).toBe('access_denied')
  })
})

describe('token endpoint (K-4)', () => {
  it('issues an MCP access token (JWT for the MCP audience) and a refresh token', async () => {
    const { status, json } = await signIn()
    expect(status).toBe(200)
    expect(json).toMatchObject({ token_type: 'Bearer', expires_in: 900, scope: 'kanvaro' })
    const jwks = createRemoteJWKSet(new URL(`${stub.url}/api/oauth/jwks`))
    const { payload, protectedHeader } = await jwtVerify(String(json.access_token), jwks, { issuer: stub.issuer, audience: MCP })
    expect(protectedHeader.alg).toBe('ES256')
    expect(payload).toMatchObject({ sub: 'u-member', client_id: 'kanvaro-claude-code', scope: 'kanvaro' })
    expect(payload.exp! - payload.iat!).toBe(900)
    expect(payload.jti).toBeTruthy()
  })

  it('accepts a code issued to a loopback address with another port', async () => {
    expect((await signIn('http://localhost:51234/callback')).status).toBe(200)
  })

  it('refuses a reused code and revokes what the first use issued', async () => {
    const first = await signIn()
    const again = await token({ grant_type: 'authorization_code', client_id: 'kanvaro-claude-code', code: first.code, redirect_uri: REDIRECT, code_verifier: first.verifier })
    expect(again).toMatchObject({ status: 400, json: { error: 'invalid_grant' } })
    expect((await exchange(String(first.json.access_token))).json.error).toBe('invalid_grant')
  })

  it('refuses an expired code', async () => {
    const { verifier, challenge } = pkce()
    const code = (await authorize(goodAuthorize(challenge))).location?.searchParams.get('code') ?? ''
    clock += 61_000
    expect((await token({ grant_type: 'authorization_code', client_id: 'kanvaro-claude-code', code, redirect_uri: REDIRECT, code_verifier: verifier })).json.error).toBe('invalid_grant')
  })

  it.each([
    ['wrong PKCE verifier', { code_verifier: 'x'.repeat(43) }],
    ['different redirect', { redirect_uri: 'http://localhost:33418/other' }],
  ])('refuses %s', async (_l, extra) => {
    const { verifier, challenge } = pkce()
    const code = (await authorize(goodAuthorize(challenge))).location?.searchParams.get('code') ?? ''
    const res = await token({ grant_type: 'authorization_code', client_id: 'kanvaro-claude-code', code, redirect_uri: REDIRECT, code_verifier: verifier, ...extra })
    expect(res.json.error).toBe('invalid_grant')
  })

  it('refuses code exchange by the MCP server client', async () => {
    expect((await token({ grant_type: 'authorization_code', code: 'x' }, 'kanvaro-mcp-server:stub-mcp-server-secret')).status).toBe(401)
  })

  it('rotates refresh tokens; reusing an old one revokes the whole family', async () => {
    const first = await signIn()
    const r1 = await token({ grant_type: 'refresh_token', client_id: 'kanvaro-claude-code', refresh_token: String(first.json.refresh_token) })
    expect(r1.status).toBe(200)
    expect(r1.json.refresh_token).not.toBe(first.json.refresh_token)
    const replay = await token({ grant_type: 'refresh_token', client_id: 'kanvaro-claude-code', refresh_token: String(first.json.refresh_token) })
    expect(replay.json.error).toBe('invalid_grant')
    const r2 = await token({ grant_type: 'refresh_token', client_id: 'kanvaro-claude-code', refresh_token: String(r1.json.refresh_token) })
    expect(r2.json.error).toBe('invalid_grant')
  })
})

describe('token exchange (K-5)', () => {
  it('returns a Kanvaro API token for the same user, in Kanvaro\'s own JWT format', async () => {
    const { json } = await signIn()
    const res = await exchange(String(json.access_token))
    expect(res.status).toBe(200)
    expect(res.json).toMatchObject({ issued_token_type: ACCESS_TOKEN_TYPE, token_type: 'Bearer' })
    expect(Number(res.json.expires_in)).toBeLessThanOrEqual(900)
    const { payload, protectedHeader } = await jwtVerify(String(res.json.access_token), new TextEncoder().encode('stub-kanvaro-jwt-secret'))
    expect(protectedHeader.alg).toBe('HS256')
    expect(payload).toMatchObject({ userId: 'u-member', email: 'member@kanvaro.test', role: 'team_member' })
    expect(stub.counts.exchange).toBe(1)
  })

  it('never outlives the MCP token it was exchanged for', async () => {
    const { json } = await signIn()
    clock += 600_000
    expect(Number((await exchange(String(json.access_token))).json.expires_in)).toBeLessThanOrEqual(300)
  })

  it.each([
    ['no client credentials', null],
    ['wrong secret', 'kanvaro-mcp-server:wrong'],
    ['the public client', 'kanvaro-claude-code:'],
  ])('refuses %s with 401', async (_l, basic) => {
    const { json } = await signIn()
    expect((await exchange(String(json.access_token), basic)).status).toBe(401)
  })

  it('refuses an expired MCP token', async () => {
    const { json } = await signIn()
    clock += 901_000
    expect((await exchange(String(json.access_token))).json.error).toBe('invalid_grant')
  })

  it('refuses a token for another audience or not signed by Kanvaro', async () => {
    const { json } = await signIn()
    const [h, p] = String(json.access_token).split('.')
    expect((await exchange(`${h}.${p}.forged-signature`)).json.error).toBe('invalid_grant')
  })

  it('refuses after the user is deactivated or signed out', async () => {
    const a = await signIn()
    stub.deactivateUser('u-member')
    expect((await exchange(String(a.json.access_token))).json.error).toBe('invalid_grant')
  })

  it('refuses after the refresh family is revoked', async () => {
    const a = await signIn()
    await fetch(`${stub.url}/api/oauth/revoke`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form({ token: String(a.json.refresh_token), client_id: 'kanvaro-claude-code' }) })
    expect((await exchange(String(a.json.access_token))).json.error).toBe('invalid_grant')
  })
})

describe('redirectMatches', () => {
  const reg = ['http://localhost:33418/callback']
  it.each([
    ['http://localhost:33418/callback', true],
    ['http://localhost:1/callback', true],
    ['https://localhost:33418/callback', false],
    ['http://127.0.0.1:33418/callback', false],
    ['http://localhost:33418/callback?x=1', false],
    ['http://evil.example:33418/callback', false],
  ])('%s → %s', (uri, ok) => expect(redirectMatches(reg, uri)).toBe(ok))
})
