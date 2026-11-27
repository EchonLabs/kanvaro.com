/**
 * Task 3.4: the sign-in-again path and its audit entries, against the Kanvaro stand-in and
 * a real (throw-away) MongoDB audit collection.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import type { McpHttpHandler } from '@modelcontextprotocol/server'
import type { AuditLog } from '../src/audit.js'
import { createAuditLog } from '../src/audit.js'
import { createTokenExchanger, kanvaroTokenUrl } from '../src/auth/exchange.js'
import { mountResourceMetadata, resourceMetadataUrl } from '../src/auth/metadata.js'
import { requireKanvaroExchange, requireKanvaroToken } from '../src/auth/middleware.js'
import { createTokenVerifier } from '../src/auth/verify.js'
import type { Database } from '../src/db/index.js'
import { connectDatabase, ensureIndexes } from '../src/db/index.js'
import type { AuditLogDoc } from '../src/db/types.js'
import { createApp, finishApp } from '../src/http/app.js'
import type { RunningServer } from '../src/http/server.js'
import { startServer } from '../src/http/server.js'
import { createLogger } from '../src/log.js'
import { createMcpEndpoint, mountMcp } from '../src/mcp/server.js'
import { CLAUDE_CLIENT, signIn, tokenRequest } from './helpers/oauth.js'
import { TEST_URI, mongoAvailable, testDbName } from './helpers/mongo.js'
import type { StubKanvaro } from './stub-kanvaro/stub.js'
import { startStubKanvaro } from './stub-kanvaro/stub.js'

const available = await mongoAvailable()

describe.skipIf(!available)('sign in again (3.4)', () => {
  let database: Database
  let running: RunningServer | undefined
  let handler: McpHttpHandler | undefined
  let stub: StubKanvaro | undefined

  beforeAll(async () => {
    database = await connectDatabase({ uri: TEST_URI, name: testDbName('signin') })
    await ensureIndexes(database.db, 90)
  })
  afterAll(async () => {
    await database.db.dropDatabase()
    await database.close()
  })
  afterEach(async () => {
    await handler?.close()
    await running?.close(100)
    await stub?.close()
    running = handler = stub = undefined
    await database.collections.auditLog.deleteMany({})
  })

  async function serve(opts: { exchangeUrl?: string; audit?: AuditLog; clock?: () => number } = {}): Promise<{ url: string; stub: StubKanvaro }> {
    const log = createLogger({ level: 'error', destination: { write: () => undefined } })
    const audit = opts.audit ?? createAuditLog(database.collections.auditLog, log)
    const app = createApp({ log, readiness: { database: () => Promise.resolve(), kanvaro: () => Promise.resolve() }, trustProxy: false })
    running = await startServer(app, '127.0.0.1', 0)
    const resourceUrl = `${running.url}/mcp`
    stub = await startStubKanvaro({ mcpResource: resourceUrl })
    const rm = resourceMetadataUrl(resourceUrl)
    handler = createMcpEndpoint(log)
    mountResourceMetadata(app, { resourceUrl, issuer: stub.issuer })
    mountMcp(app, handler, {
      publicBaseUrl: running.url, host: '127.0.0.1', allowedOrigins: [], log,
      authenticate: [
        requireKanvaroToken({ verify: createTokenVerifier({ issuer: stub.issuer, audience: resourceUrl, jwksUrl: `${stub.url}/api/oauth/jwks` }), resourceMetadataUrl: rm, resourceUrl, audit }),
        requireKanvaroExchange({
          exchanger: createTokenExchanger({ tokenUrl: opts.exchangeUrl ?? kanvaroTokenUrl(stub.url), clientId: 'kanvaro-mcp-server', clientSecret: 'stub-mcp-server-secret', timeoutMs: 500, ...(opts.clock ? { now: opts.clock } : {}) }),
          resourceMetadataUrl: rm, audit,
        }),
      ],
    })
    finishApp(app)
    return { url: running.url, stub }
  }

  const call = (url: string, token?: string) =>
    fetch(`${url}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"t","version":"1"}}}',
    })

  /** Audit entries, oldest first (writes are fire-and-forget, so wait briefly for them). */
  async function audit(count: number): Promise<AuditLogDoc[]> {
    for (let i = 0; i < 50; i++) {
      const docs = await database.collections.auditLog.find({}, { sort: { at: 1, _id: 1 } }).toArray()
      if (docs.length >= count) return docs
      await new Promise(r => setTimeout(r, 20))
    }
    return database.collections.auditLog.find({}, { sort: { at: 1, _id: 1 } }).toArray()
  }

  it('full cycle: signed in → access revoked → refused within a minute → refresh refused → new sign-in works', async () => {
    let clock = Date.now()
    const { url, stub: s } = await serve({ clock: () => clock })
    const first = await signIn(s)
    expect((await call(url, first.accessToken)).status).toBe(200)

    // Kanvaro ends the user's sessions (sign-out everywhere / admin revoke).
    s.revokeUser('stub-user-1')
    // Straight away the cached Kanvaro token still serves (by design, at most 60 s)...
    expect((await call(url, first.accessToken)).status).toBe(200)
    // ...and at the next re-check with Kanvaro, access ends.
    clock += 61_000
    const after = await call(url, first.accessToken)
    expect(after.status).toBe(401)
    expect(after.headers.get('www-authenticate')).toContain('error="invalid_token"')

    // What Claude Code does next: try its refresh token — refused, so it signs in again.
    const refreshed = await tokenRequest(s, { grant_type: 'refresh_token', client_id: CLAUDE_CLIENT, refresh_token: first.refreshToken })
    expect(refreshed.json.error).toBe('invalid_grant')

    const second = await signIn(s)
    expect((await call(url, second.accessToken)).status).toBe(200)

    const entries = (await audit(3)).map(e => [e.action, e.outcome])
    expect(entries).toEqual([
      ['session.exchange', 'ok'],
      ['exchange.refused', 'refused'],
      ['session.exchange', 'ok'],
    ])
  })

  it('a deactivated user cannot sign in again at all', async () => {
    const { url, stub: s } = await serve()
    const first = await signIn(s)
    s.deactivateUser('stub-user-1')
    expect((await call(url, first.accessToken)).status).toBe(401)
    expect((await signIn(s)).accessToken).toBe('')
  })

  it('records who and from where on each exchange, never a token', async () => {
    const { url, stub: s } = await serve()
    const { accessToken } = await signIn(s)
    await call(url, accessToken)
    await call(url, accessToken) // cached: no second entry
    const [entry, ...rest] = await audit(1)
    expect(rest).toHaveLength(0)
    expect(entry).toMatchObject({ action: 'session.exchange', outcome: 'ok', userId: 'stub-user-1', clientId: 'kanvaro-claude-code', ip: '127.0.0.1' })
    expect(entry?.requestId).toBeTruthy()
    expect(JSON.stringify(entry)).not.toContain(accessToken.slice(-20))
  })

  it('audits a rejected token with its reason, but not the normal first 401', async () => {
    const { url } = await serve()
    await call(url) // no token: discovery, not audited
    await call(url, 'abc.def.ghi')
    const entries = await audit(1)
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({ action: 'token.rejected', outcome: 'refused', detail: 'token is not valid', ip: '127.0.0.1' })
    expect(entries[0]?.userId).toBeUndefined()
  })

  it('caps rejected-token entries per IP address', async () => {
    const log = createLogger({ level: 'error', destination: { write: () => undefined } })
    const { url } = await serve({ audit: createAuditLog(database.collections.auditLog, log, { perMinute: 3 }) })
    for (let i = 0; i < 8; i++) await call(url, 'abc.def.ghi')
    await new Promise(r => setTimeout(r, 200))
    expect(await database.collections.auditLog.countDocuments({ action: 'token.rejected' })).toBe(3)
  })

  it('an outage is a 503 and is audited as a failure, not a refusal', async () => {
    const { url, stub: s } = await serve({ exchangeUrl: 'http://127.0.0.1:1/api/oauth/token' })
    const { accessToken } = await signIn(s)
    expect((await call(url, accessToken)).status).toBe(503)
    const [entry] = await audit(1)
    expect(entry).toMatchObject({ action: 'exchange.failed', outcome: 'error', userId: 'stub-user-1' })
    expect(entry?.detail).toMatch(/^unavailable: /)
  })
})
