import { timingSafeEqual } from 'crypto'

/**
 * Cron-route authentication, **enforce-if-set** (plan CRON-1).
 *
 * Kanvaro's three existing cron routes ship unauthenticated. Requiring a secret
 * would mean every hoster had to edit credentials before an upgrade worked, so
 * the secret is optional: set it and it is enforced, leave it and behaviour is
 * unchanged. `CRON_SECRET` is the conventional name because Vercel attaches
 * `Authorization: Bearer <CRON_SECRET>` to cron invocations automatically once
 * the variable exists.
 *
 * The unset state is not silent — it surfaces as the
 * `CRON_ROUTES_UNAUTHENTICATED` degradation on the health endpoint.
 */
const readSecret = (): string | null => {
  const secret = process.env.CRON_SECRET?.trim()
  return secret ? secret : null
}

export const cronSecretIsConfigured = (): boolean => readSecret() !== null

export function isCronRequestAuthorised(headers: {
  get(name: string): string | null
}): boolean {
  const secret = readSecret()
  if (!secret) return true

  const header = headers.get('authorization')
  if (!header?.startsWith('Bearer ')) return false

  const presented = Buffer.from(header.slice('Bearer '.length))
  const expected = Buffer.from(secret)

  // timingSafeEqual throws on a length mismatch, so compare lengths first. The
  // length of a rejected token is not a useful secret to protect.
  if (presented.length !== expected.length) return false
  return timingSafeEqual(presented, expected)
}
