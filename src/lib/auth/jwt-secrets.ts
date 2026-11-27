/**
 * The one place JWT signing secrets are read.
 *
 * Every auth route used to carry its own
 * `process.env.JWT_REFRESH_SECRET || 'your-refresh-secret-key'`. Docker and
 * env.example set `REFRESH_TOKEN_SECRET` instead, so deployments silently fell
 * back to the public default and anyone could forge a refresh token for any
 * user (decision record F0).
 *
 * Rules:
 * - Refresh secret: `JWT_REFRESH_SECRET`, else `REFRESH_TOKEN_SECRET` (the name
 *   the shipped docker-compose files and env.example use).
 * - Strict everywhere except `NODE_ENV=development` and `NODE_ENV=test`: a
 *   missing secret, or one of the placeholder values published in this repo's
 *   docs and examples, throws. Auth then fails closed with a 500 instead of
 *   accepting forgeable tokens. This covers production and anything else
 *   (staging, a typo, NODE_ENV unset), so a misconfigured server can never
 *   quietly sign tokens with the fallback.
 * - Development and test: fall back to a dev-only value and warn once.
 *
 * Secrets are read when a token is signed or verified, never at import time,
 * so `next build` works without them.
 */

const PUBLISHED_PLACEHOLDERS = new Set([
  'your-secret-key',
  'your-refresh-secret-key',
  'your-jwt-secret',
  'your-super-secret-jwt-key',
  'your-super-secret-jwt-key-change-this-in-production',
  'your-super-secure-jwt-secret',
  'your-refresh-token-secret',
  'your-refresh-token-secret-change-this-in-production',
  'your-super-secret-refresh-key',
  'your-super-secure-refresh-secret',
  'dev-jwt-secret',
  'dev-jwt-secret-key',
  'dev-refresh-secret'
])

const DEV_FALLBACK = {
  access: 'kanvaro-dev-only-access-secret-do-not-use-in-production',
  refresh: 'kanvaro-dev-only-refresh-secret-do-not-use-in-production'
}

const warned = new Set<string>()

/** The only environments allowed to use DEV_FALLBACK. Everything else is strict. */
const FALLBACK_ENVIRONMENTS = new Set(['development', 'test'])

function resolve(kind: 'access' | 'refresh', names: string[]): string {
  const value = names.map((name) => process.env[name]?.trim()).find(Boolean)
  const label = names.join(' or ')

  if (!FALLBACK_ENVIRONMENTS.has(process.env.NODE_ENV || '')) {
    if (!value) {
      throw new Error(`${label} is not set. Refusing to sign or verify tokens.`)
    }
    if (PUBLISHED_PLACEHOLDERS.has(value)) {
      throw new Error(`${label} is a published placeholder value. Set a random secret.`)
    }
    return value
  }

  if (value) return value

  if (!warned.has(kind)) {
    warned.add(kind)
    console.warn(`[auth] ${label} is not set; using a development-only fallback. Any NODE_ENV other than development/test would refuse this.`)
  }
  return DEV_FALLBACK[kind]
}

export function getJwtSecret(): string {
  return resolve('access', ['JWT_SECRET'])
}

export function getJwtRefreshSecret(): string {
  return resolve('refresh', ['JWT_REFRESH_SECRET', 'REFRESH_TOKEN_SECRET'])
}
