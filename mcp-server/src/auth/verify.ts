/**
 * Token check (task 3.2): verifies an MCP access token issued by Kanvaro (decision D10).
 *
 * Checks: signature against Kanvaro's published keys (ES256/RS256 only), `iss` = Kanvaro,
 * `aud` = this server's /mcp URL, expiry (30 s tolerance), `typ: at+jwt` (so no other kind
 * of JWT can pass as an access token), required claims, and the `kanvaro` scope.
 *
 * Errors are sorted so the caller answers correctly:
 * - `invalid_token`      → 401, the client should sign in again;
 * - `insufficient_scope` → 403;
 * - `unavailable`        → 503, Kanvaro's keys can't be fetched — never 401, so users are not
 *                          pushed to sign in again during an outage.
 */
import { createRemoteJWKSet, errors, jwtVerify } from 'jose'
import type { JWTVerifyGetKey } from 'jose'
import { SCOPE } from './metadata.js'

export interface VerifiedToken {
  /** The raw MCP access token — only for token exchange; never log it. */
  token: string
  userId: string
  clientId: string
  scopes: string[]
  /** Seconds since epoch. */
  expiresAt: number
  jti: string
}

export type TokenErrorKind = 'invalid_token' | 'insufficient_scope' | 'unavailable'

export class TokenError extends Error {
  constructor(readonly kind: TokenErrorKind, message: string) {
    super(message)
    this.name = 'TokenError'
  }
}

export interface VerifierConfig {
  /** Kanvaro's issuer (KANVARO_PUBLIC_URL). */
  issuer: string
  /** This server's /mcp URL: the required audience. */
  audience: string
  /** Kanvaro's JWKS URL; defaults to <KANVARO_API_BASE_URL>/api/oauth/jwks in main. */
  jwksUrl?: string
  /** Key source override (tests). */
  keys?: JWTVerifyGetKey
  fetchTimeoutMs?: number
}

export type TokenVerifier = (token: string) => Promise<VerifiedToken>

/** Kanvaro's key-set URL on the internal address, at the path fixed by the OAuth contract. */
export function kanvaroJwksUrl(apiBaseUrl: string): string {
  return new URL('/api/oauth/jwks', apiBaseUrl).toString()
}

export function createTokenVerifier(cfg: VerifierConfig): TokenVerifier {
  const keys = cfg.keys ?? createRemoteJWKSet(new URL(requireJwksUrl(cfg)), {
    timeoutDuration: cfg.fetchTimeoutMs ?? 3000,
    cooldownDuration: 30_000, // at most one refetch per 30 s for unknown key ids
    cacheMaxAge: 10 * 60_000, // refresh keys every 10 minutes
  })

  return async (token: string) => {
    let payload
    try {
      ({ payload } = await jwtVerify(token, keys, {
        issuer: cfg.issuer,
        audience: cfg.audience,
        algorithms: ['ES256', 'RS256'],
        typ: 'at+jwt',
        clockTolerance: 30,
        requiredClaims: ['sub', 'exp', 'iat', 'jti'],
      }))
    } catch (err) {
      throw classify(err)
    }

    const clientId = payload.client_id
    if (typeof clientId !== 'string' || clientId === '' || typeof payload.sub !== 'string' || typeof payload.jti !== 'string') {
      throw new TokenError('invalid_token', 'token is missing required claims')
    }
    const scopes = typeof payload.scope === 'string' ? payload.scope.split(' ').filter(Boolean) : []
    if (!scopes.includes(SCOPE)) throw new TokenError('insufficient_scope', `the "${SCOPE}" scope is required`)

    return { token, userId: payload.sub, clientId, scopes, expiresAt: Number(payload.exp), jti: payload.jti }
  }
}

function requireJwksUrl(cfg: VerifierConfig): string {
  if (!cfg.jwksUrl) throw new Error('createTokenVerifier needs jwksUrl or keys')
  return cfg.jwksUrl
}

/** Token problems → invalid_token; anything about fetching keys → unavailable. */
function classify(err: unknown): TokenError {
  if (err instanceof errors.JWKSTimeout || err instanceof errors.JWKSInvalid) return new TokenError('unavailable', 'Kanvaro signing keys unavailable')
  if (
    err instanceof errors.JWTExpired ||
    err instanceof errors.JWTClaimValidationFailed ||
    err instanceof errors.JWTInvalid ||
    err instanceof errors.JWSInvalid ||
    err instanceof errors.JWSSignatureVerificationFailed ||
    err instanceof errors.JWKSNoMatchingKey ||
    err instanceof errors.JWKSMultipleMatchingKeys ||
    err instanceof errors.JOSEAlgNotAllowed ||
    err instanceof errors.JOSENotSupported
  ) {
    return new TokenError('invalid_token', err instanceof errors.JWTExpired ? 'token expired' : 'token is not valid')
  }
  // Network failures and non-200 key responses.
  return new TokenError('unavailable', 'Kanvaro signing keys unavailable')
}
