/**
 * Stand-in for Kanvaro's sign-in server (task 3.5). TEST AND DEVELOPMENT ONLY.
 *
 * Implements exactly what the Kanvaro Developer Brief / D10 asks Kanvaro to build
 * (K-1 to K-7), so the MCP server's sign-in side (3.1–3.4) can be built and tested before
 * Kanvaro's real endpoints exist. Its wire formats are written down in
 * docs/kanvaro-oauth-contract.md for the Kanvaro developers to confirm.
 *
 * - Users are not asked to log in: /oauth/authorize approves a configured test user.
 * - Exchanged "Kanvaro API tokens" are HS256 JWTs { userId, email, role } like Kanvaro's
 *   own, signed with `kanvaroJwtSecret`.
 */
import { createHash, randomBytes } from 'node:crypto'
import type { Server } from 'node:http'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import express from 'express'
import type { Request, Response } from 'express'
import type { JWK } from 'jose'
import { SignJWT, exportJWK, generateKeyPair, jwtVerify } from 'jose'

export const TOKEN_EXCHANGE_GRANT = 'urn:ietf:params:oauth:grant-type:token-exchange'
export const ACCESS_TOKEN_TYPE = 'urn:ietf:params:oauth:token-type:access_token'
export const SCOPE = 'kanvaro'

export interface StubUser {
  id: string
  email: string
  role: string
  organizationId: string
  active: boolean
}

export interface StubOptions {
  /** The MCP server's resource URL: the only accepted `resource` and the token audience. */
  mcpResource: string
  host?: string
  port?: number
  /** Public client used by Claude Code (K-1). */
  publicClient?: { id: string; redirectUris: string[] }
  /** Confidential client used by the MCP server for token exchange only (K-1). */
  mcpServerClient?: { id: string; secret: string }
  users?: StubUser[]
  /** The user /oauth/authorize signs in without asking (defaults to the first user). */
  signInUserId?: string
  /** Signs exchanged Kanvaro API tokens (Kanvaro's JWT_SECRET in real life). */
  kanvaroJwtSecret?: string
  accessTtlSeconds?: number
  refreshTtlSeconds?: number
  codeTtlSeconds?: number
  /** Clock override for tests (milliseconds). */
  now?: () => number
}

export interface StubKanvaro {
  /** Base URL, also the issuer, e.g. http://127.0.0.1:41234 */
  url: string
  issuer: string
  options: Required<Omit<StubOptions, 'host' | 'port' | 'signInUserId' | 'now'>> & { signInUserId: string }
  /** Test controls. */
  deactivateUser(userId: string): void
  /** Revokes every refresh family of the user (sign-out / admin revoke). */
  revokeUser(userId: string): void
  setSignInUser(userId: string): void
  counts: { authorize: number; token: number; exchange: number }
  close(): Promise<void>
}

interface CodeRecord { clientId: string; redirectUri: string; challenge: string; resource: string; scope: string; userId: string; exp: number; used: boolean; family?: string }
interface RefreshRecord { family: string; clientId: string; userId: string; resource: string; scope: string; exp: number; used: boolean }
interface FamilyRecord { userId: string; revoked: boolean }

const sha256 = (v: string) => createHash('sha256').update(v).digest('base64url')
const random = () => randomBytes(32).toString('base64url')
const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]'])

/** Exact match, or a loopback http URI that differs only in its port (task 0.3 rule). */
export function redirectMatches(registered: readonly string[], requested: string): boolean {
  if (registered.includes(requested)) return true
  let b: URL
  try { b = new URL(requested) } catch { return false }
  return registered.some(r => {
    const a = new URL(r)
    return a.protocol === 'http:' && b.protocol === 'http:' && LOOPBACK.has(a.hostname) && a.hostname === b.hostname &&
      a.pathname === b.pathname && a.search === b.search && b.hash === ''
  })
}

export async function startStubKanvaro(opts: StubOptions): Promise<StubKanvaro> {
  const now = opts.now ?? Date.now
  const options = {
    mcpResource: opts.mcpResource,
    publicClient: opts.publicClient ?? { id: 'kanvaro-claude-code', redirectUris: ['http://localhost:33418/callback'] },
    mcpServerClient: opts.mcpServerClient ?? { id: 'kanvaro-mcp-server', secret: 'stub-mcp-server-secret' },
    users: opts.users ?? [{ id: 'stub-user-1', email: 'stub.user@kanvaro.test', role: 'team_member', organizationId: 'stub-org', active: true }],
    kanvaroJwtSecret: opts.kanvaroJwtSecret ?? 'stub-kanvaro-jwt-secret',
    accessTtlSeconds: opts.accessTtlSeconds ?? 900,
    refreshTtlSeconds: opts.refreshTtlSeconds ?? 7 * 24 * 3600,
    codeTtlSeconds: opts.codeTtlSeconds ?? 60,
    signInUserId: '',
  }
  options.signInUserId = opts.signInUserId ?? options.users[0]?.id ?? ''
  const users = new Map(options.users.map(u => [u.id, { ...u }]))

  const { publicKey, privateKey } = await generateKeyPair('ES256', { extractable: true })
  const kid = `stub-${random().slice(0, 8)}`
  const jwk: JWK = { ...(await exportJWK(publicKey)), kid, alg: 'ES256', use: 'sig' }
  const hmac = new TextEncoder().encode(options.kanvaroJwtSecret)

  const codes = new Map<string, CodeRecord>()
  const refreshes = new Map<string, RefreshRecord>()
  const families = new Map<string, FamilyRecord>()
  const accessFamily = new Map<string, string>() // jti → family
  const counts = { authorize: 0, token: 0, exchange: 0 }

  const app = express()
  app.disable('x-powered-by')
  app.use(express.urlencoded({ extended: false, limit: '16kb' }))
  let issuer = ''

  const oauthError = (res: Response, status: number, error: string, description: string) => {
    res.status(status).set('Cache-Control', 'no-store').json({ error, error_description: description })
  }

  app.get('/.well-known/oauth-authorization-server', (_req, res) => {
    res.json({
      issuer,
      authorization_endpoint: `${issuer}/oauth/authorize`,
      token_endpoint: `${issuer}/api/oauth/token`,
      jwks_uri: `${issuer}/api/oauth/jwks`,
      revocation_endpoint: `${issuer}/api/oauth/revoke`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token', TOKEN_EXCHANGE_GRANT],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none', 'client_secret_basic'],
      authorization_response_iss_parameter_supported: true,
      scopes_supported: [SCOPE],
    })
  })

  app.get('/api/oauth/jwks', (_req, res) => { res.json({ keys: [jwk] }) })
  app.get('/api/health', (_req, res) => { res.json({ status: 'healthy' }) })

  // K-3: authorize (no login screen: the configured test user is signed in).
  app.get('/oauth/authorize', (req: Request, res: Response) => {
    counts.authorize++
    const q = req.query as Record<string, string | undefined>
    if (q.client_id !== options.publicClient.id) return void res.status(400).type('text').send('Unknown client. No redirect.')
    if (!q.redirect_uri || !redirectMatches(options.publicClient.redirectUris, q.redirect_uri)) {
      return void res.status(400).type('text').send('Redirect address not registered for this client. No redirect.')
    }
    const back = (params: Record<string, string>) => {
      const to = new URL(q.redirect_uri!)
      for (const [k, v] of Object.entries({ ...params, ...(q.state ? { state: q.state } : {}), iss: issuer })) to.searchParams.set(k, v)
      res.redirect(302, to.toString())
    }
    if (q.response_type !== 'code') return back({ error: 'unsupported_response_type' })
    if (!q.state) return back({ error: 'invalid_request', error_description: 'state is required' })
    if (q.code_challenge_method !== 'S256' || !q.code_challenge) return back({ error: 'invalid_request', error_description: 'PKCE S256 is required' })
    if (q.resource !== options.mcpResource) return back({ error: 'invalid_target', error_description: 'resource must be the MCP server URL' })
    const scope = q.scope ?? SCOPE
    if (scope !== SCOPE) return back({ error: 'invalid_scope' })
    const user = users.get(options.signInUserId)
    if (!user?.active) return back({ error: 'access_denied' })

    const code = random()
    codes.set(sha256(code), { clientId: q.client_id, redirectUri: q.redirect_uri, challenge: q.code_challenge, resource: q.resource, scope, userId: user.id, exp: now() + options.codeTtlSeconds * 1000, used: false })
    back({ code })
  })

  async function issuePair(rec: { clientId: string; userId: string; resource: string; scope: string }, family: string) {
    const nowS = Math.floor(now() / 1000)
    const jti = random()
    const access = await new SignJWT({ client_id: rec.clientId, scope: rec.scope })
      .setProtectedHeader({ alg: 'ES256', kid, typ: 'at+jwt' })
      .setIssuer(issuer).setSubject(rec.userId).setAudience(rec.resource)
      .setIssuedAt(nowS).setExpirationTime(nowS + options.accessTtlSeconds).setJti(jti)
      .sign(privateKey)
    accessFamily.set(jti, family)
    const refresh = random()
    refreshes.set(sha256(refresh), { family, clientId: rec.clientId, userId: rec.userId, resource: rec.resource, scope: rec.scope, exp: now() + options.refreshTtlSeconds * 1000, used: false })
    return { access_token: access, token_type: 'Bearer', expires_in: options.accessTtlSeconds, refresh_token: refresh, scope: rec.scope }
  }

  function basicAuth(req: Request): { id: string; secret: string } | undefined {
    const h = req.get('authorization')
    if (!h?.startsWith('Basic ')) return undefined
    const [id, secret] = Buffer.from(h.slice(6), 'base64').toString('utf8').split(':')
    return id !== undefined && secret !== undefined ? { id: decodeURIComponent(id), secret: decodeURIComponent(secret) } : undefined
  }

  // K-4 / K-5: token endpoint.
  app.post('/api/oauth/token', async (req: Request, res: Response) => {
    counts.token++
    const f = (req.body ?? {}) as Record<string, string | undefined>
    const basic = basicAuth(req)

    if (f.grant_type === TOKEN_EXCHANGE_GRANT) {
      counts.exchange++
      if (!basic || basic.id !== options.mcpServerClient.id || basic.secret !== options.mcpServerClient.secret) {
        res.set('WWW-Authenticate', 'Basic realm="kanvaro"')
        return oauthError(res, 401, 'invalid_client', 'client authentication failed')
      }
      if (f.subject_token_type !== ACCESS_TOKEN_TYPE || !f.subject_token) return oauthError(res, 400, 'invalid_request', 'subject_token of type access_token is required')
      let claims
      try {
        ({ payload: claims } = await jwtVerify(f.subject_token, publicKey, { issuer, audience: options.mcpResource, algorithms: ['ES256'], currentDate: new Date(now()) }))
      } catch {
        return oauthError(res, 400, 'invalid_grant', 'subject token is not valid')
      }
      const user = users.get(String(claims.sub))
      const family = families.get(accessFamily.get(String(claims.jti)) ?? '')
      if (!user?.active || !family || family.revoked) return oauthError(res, 400, 'invalid_grant', 'access has been revoked')
      const nowS = Math.floor(now() / 1000)
      const exp = Math.min(nowS + options.accessTtlSeconds, Number(claims.exp))
      const apiToken = await new SignJWT({ userId: user.id, email: user.email, role: user.role })
        .setProtectedHeader({ alg: 'HS256', typ: 'JWT' }).setIssuedAt(nowS).setExpirationTime(exp).sign(hmac)
      return void res.set('Cache-Control', 'no-store').json({ access_token: apiToken, issued_token_type: ACCESS_TOKEN_TYPE, token_type: 'Bearer', expires_in: exp - nowS })
    }

    // Code and refresh grants: the public client only, no secret.
    if (basic || f.client_id !== options.publicClient.id) return oauthError(res, 401, 'invalid_client', 'unknown client or client not allowed this grant')

    if (f.grant_type === 'authorization_code') {
      const rec = codes.get(sha256(f.code ?? ''))
      if (!rec || rec.clientId !== f.client_id) return oauthError(res, 400, 'invalid_grant', 'unknown code')
      if (rec.used) {
        if (rec.family) { const fam = families.get(rec.family); if (fam) fam.revoked = true } // code replay: revoke what it issued
        return oauthError(res, 400, 'invalid_grant', 'code already used')
      }
      rec.used = true
      if (rec.exp < now()) return oauthError(res, 400, 'invalid_grant', 'code expired')
      if (f.redirect_uri !== rec.redirectUri) return oauthError(res, 400, 'invalid_grant', 'redirect_uri does not match')
      if (!f.code_verifier || sha256(f.code_verifier) !== rec.challenge) return oauthError(res, 400, 'invalid_grant', 'PKCE verification failed')
      if (f.resource !== undefined && f.resource !== rec.resource) return oauthError(res, 400, 'invalid_target', 'resource does not match')
      if (!users.get(rec.userId)?.active) return oauthError(res, 400, 'invalid_grant', 'user is not active')
      const family = random()
      families.set(family, { userId: rec.userId, revoked: false })
      rec.family = family
      return void res.set('Cache-Control', 'no-store').json(await issuePair(rec, family))
    }

    if (f.grant_type === 'refresh_token') {
      const rec = refreshes.get(sha256(f.refresh_token ?? ''))
      if (!rec || rec.clientId !== f.client_id) return oauthError(res, 400, 'invalid_grant', 'unknown refresh token')
      const fam = families.get(rec.family)
      if (rec.used) {
        if (fam) fam.revoked = true // reuse of a rotated token: revoke the whole family
        return oauthError(res, 400, 'invalid_grant', 'refresh token already used')
      }
      if (!fam || fam.revoked || rec.exp < now() || !users.get(rec.userId)?.active) return oauthError(res, 400, 'invalid_grant', 'refresh token no longer valid')
      if (f.resource !== undefined && f.resource !== rec.resource) return oauthError(res, 400, 'invalid_target', 'resource does not match')
      rec.used = true
      return void res.set('Cache-Control', 'no-store').json(await issuePair(rec, rec.family))
    }

    oauthError(res, 400, 'unsupported_grant_type', 'grant not supported')
  })

  // K-7: revoke a refresh token (RFC 7009: always 200).
  app.post('/api/oauth/revoke', (req: Request, res: Response) => {
    const f = (req.body ?? {}) as Record<string, string | undefined>
    const rec = refreshes.get(sha256(f.token ?? ''))
    if (rec && rec.clientId === f.client_id) { const fam = families.get(rec.family); if (fam) fam.revoked = true }
    res.status(200).end()
  })

  const server: Server = createServer(app)
  await new Promise<void>(r => server.listen(opts.port ?? 0, opts.host ?? '127.0.0.1', r))
  const port = (server.address() as AddressInfo).port
  issuer = `http://${opts.host ?? '127.0.0.1'}:${port}`

  return {
    url: issuer,
    issuer,
    options,
    counts,
    deactivateUser(userId) { const u = users.get(userId); if (u) u.active = false },
    revokeUser(userId) { for (const f of families.values()) if (f.userId === userId) f.revoked = true },
    setSignInUser(userId) { options.signInUserId = userId },
    close: () => new Promise<void>(r => { server.closeAllConnections(); server.close(() => r()) }),
  }
}
