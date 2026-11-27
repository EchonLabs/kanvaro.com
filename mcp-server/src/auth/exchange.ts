/**
 * Token exchange (task 3.3, decision D10, RFC 8693).
 *
 * Swaps the user's MCP access token at Kanvaro for a short-lived Kanvaro API token. The
 * Kanvaro token is kept in memory only, keyed by a hash of the MCP token, and is never sent
 * to the client, stored or logged.
 *
 * - One exchange at a time per MCP token: concurrent calls share the same request.
 * - Reused for at most `maxCacheSeconds` (default 60) and never closer than 30 s to its
 *   expiry, so Kanvaro re-checks the session at least once a minute: a sign-out or admin
 *   revoke takes effect within about a minute, not after the token's full 15 minutes.
 * - Never outlives the MCP token it came from.
 * - At most `maxEntries` cached (least recently used dropped).
 * - Error kinds decide the HTTP answer:
 *     refused       → 401: Kanvaro says the user's access ended; sign in again
 *     misconfigured → 503: Kanvaro rejected OUR client credentials, or the grant is unknown
 *     unavailable   → 503: network, timeout, 5xx, or a malformed answer
 */
import { createHash } from 'node:crypto'
import type { VerifiedToken } from './verify.js'

export const TOKEN_EXCHANGE_GRANT = 'urn:ietf:params:oauth:grant-type:token-exchange'
export const ACCESS_TOKEN_TYPE = 'urn:ietf:params:oauth:token-type:access_token'

export interface KanvaroToken {
  /** The Kanvaro API token — send only to Kanvaro's API; never log it. */
  token: string
  /** Seconds since epoch. */
  expiresAt: number
}

export type ExchangeErrorKind = 'refused' | 'misconfigured' | 'unavailable'

export class ExchangeError extends Error {
  constructor(readonly kind: ExchangeErrorKind, message: string, readonly status?: number) {
    super(message)
    this.name = 'ExchangeError'
  }
}

export interface ExchangerConfig {
  /** Kanvaro's token endpoint on the internal address. */
  tokenUrl: string
  clientId: string
  clientSecret: string
  timeoutMs: number
  maxEntries?: number
  /** Re-exchange this many seconds before the Kanvaro token expires. */
  refreshMarginSeconds?: number
  /** Re-check with Kanvaro at least this often per session (seconds, default 60). */
  maxCacheSeconds?: number
  /** Clock override for tests (milliseconds). */
  now?: () => number
  fetchImpl?: typeof fetch
}

export interface TokenExchanger {
  /** Returns a Kanvaro API token for the verified MCP token, from cache or a new exchange. */
  exchange(mcp: VerifiedToken): Promise<KanvaroToken>
  /**
   * Same as exchange(), plus: `fresh` — THIS call started a new exchange with Kanvaro (not
   * served from cache, not joining one already running); `first` — it is also the first
   * successful exchange seen for this MCP access token — at sign-in, and again after each
   * token refresh, since the token is the cache key. Used for auditing.
   */
  exchangeWithInfo(mcp: VerifiedToken): Promise<{ kanvaro: KanvaroToken; fresh: boolean; first: boolean }>
  /** Drops the cached Kanvaro token (e.g. after Kanvaro answered 401). */
  invalidate(mcpToken: string): void
  readonly size: number
}

/** Kanvaro's token endpoint on the internal address, at the path fixed by the OAuth contract. */
export function kanvaroTokenUrl(apiBaseUrl: string): string {
  return new URL('/api/oauth/token', apiBaseUrl).toString()
}

const keyOf = (mcpToken: string) => createHash('sha256').update(mcpToken).digest('base64url')

export function createTokenExchanger(cfg: ExchangerConfig): TokenExchanger {
  const now = cfg.now ?? Date.now
  const doFetch = cfg.fetchImpl ?? fetch
  const maxEntries = cfg.maxEntries ?? 10_000
  const margin = cfg.refreshMarginSeconds ?? 30
  const maxAgeMs = (cfg.maxCacheSeconds ?? 60) * 1000
  const cache = new Map<string, { kanvaro: KanvaroToken; fetchedAt: number }>
  const inflight = new Map<string, Promise<KanvaroToken>>()
  // RFC 6749 §2.3.1: client id and secret are form-encoded before Basic encoding.
  const basic = `Basic ${Buffer.from(`${encodeURIComponent(cfg.clientId)}:${encodeURIComponent(cfg.clientSecret)}`).toString('base64')}`

  /** Servable: not too old (session re-check) and not too close to expiry. */
  const usable = (e: { kanvaro: KanvaroToken; fetchedAt: number }) =>
    now() - e.fetchedAt < maxAgeMs && e.kanvaro.expiresAt - margin > now() / 1000

  async function request(mcp: VerifiedToken): Promise<KanvaroToken> {
    let res: Response
    try {
      res = await doFetch(cfg.tokenUrl, {
        method: 'POST',
        headers: { Authorization: basic, 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: new URLSearchParams({ grant_type: TOKEN_EXCHANGE_GRANT, subject_token: mcp.token, subject_token_type: ACCESS_TOKEN_TYPE }),
        redirect: 'manual',
        signal: AbortSignal.timeout(cfg.timeoutMs),
      })
    } catch {
      throw new ExchangeError('unavailable', 'Kanvaro token endpoint unreachable')
    }

    let body: Record<string, unknown> = {}
    try {
      body = (await res.json()) as Record<string, unknown>
    } catch {
      // Not JSON: handled below by status.
    }
    const oauthError = typeof body.error === 'string' ? body.error : undefined

    if (res.status === 200) {
      const token = body.access_token
      const type = body.token_type
      const expiresIn = body.expires_in
      const issued = body.issued_token_type
      if (
        typeof token !== 'string' || token === '' ||
        typeof type !== 'string' || type.toLowerCase() !== 'bearer' ||
        typeof expiresIn !== 'number' || !(expiresIn > 0) ||
        (issued !== undefined && issued !== ACCESS_TOKEN_TYPE)
      ) {
        throw new ExchangeError('unavailable', 'Kanvaro returned a malformed exchange response', 200)
      }
      // Never longer than Kanvaro said, never past the MCP token.
      return { token, expiresAt: Math.min(Math.floor(now() / 1000) + Math.floor(expiresIn), mcp.expiresAt) }
    }
    if (res.status === 400 && (oauthError === 'invalid_grant' || oauthError === 'invalid_target')) {
      throw new ExchangeError('refused', 'Kanvaro refused the exchange: access has ended', 400)
    }
    if (res.status === 401 || oauthError === 'invalid_client' || oauthError === 'unauthorized_client' || oauthError === 'unsupported_grant_type') {
      throw new ExchangeError('misconfigured', `Kanvaro rejected the MCP server's exchange request (${oauthError ?? `status ${res.status}`})`, res.status)
    }
    throw new ExchangeError('unavailable', `Kanvaro token endpoint answered ${res.status}`, res.status)
  }

  function remember(key: string, entry: { kanvaro: KanvaroToken; fetchedAt: number }) {
    cache.delete(key) // re-insert: most recently used last
    cache.set(key, entry)
    while (cache.size > maxEntries) {
      const oldest = cache.keys().next().value
      if (oldest === undefined) break
      cache.delete(oldest)
    }
  }

  function exchangeWithInfo(mcp: VerifiedToken): Promise<{ kanvaro: KanvaroToken; fresh: boolean; first: boolean }> {
    const key = keyOf(mcp.token)
    const cached = cache.get(key)
    if (cached && usable(cached)) {
      remember(key, cached)
      return Promise.resolve({ kanvaro: cached.kanvaro, fresh: false, first: false })
    }
    // A stale entry stays as a marker that this session was seen before (for `first`).
    const first = cached === undefined
    const running = inflight.get(key)
    if (running) return running.then(kanvaro => ({ kanvaro, fresh: false, first: false }))
    const p = request(mcp)
      .then(kanvaro => { remember(key, { kanvaro, fetchedAt: now() }); return kanvaro })
      .catch((err: unknown) => {
        if (err instanceof ExchangeError && err.kind === 'refused') cache.delete(key)
        throw err
      })
      .finally(() => inflight.delete(key))
    inflight.set(key, p)
    return p.then(kanvaro => ({ kanvaro, fresh: true, first }))
  }

  return {
    exchangeWithInfo,
    exchange: mcp => exchangeWithInfo(mcp).then(r => r.kanvaro),
    invalidate(mcpToken) {
      // Keep the entry as a "seen" marker, but never serve it again.
      const key = keyOf(mcpToken)
      const entry = cache.get(key)
      if (entry) cache.set(key, { ...entry, fetchedAt: 0 })
    },
    get size() {
      return cache.size
    },
  }
}
