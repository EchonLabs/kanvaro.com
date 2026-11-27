/**
 * Settings pages show stored secrets (SMTP password, Azure client secret,
 * database password) as this placeholder instead of the real value. When the
 * placeholder comes back unchanged on save or on a connection test, the server
 * uses the stored secret, but only for the same server and account it was
 * saved for (see resolveSecret). A real secret never leaves the server.
 */
export const SECRET_MASK = '••••••••'

/** The mask when a secret is stored, '' when none is, so "required" checks still work. */
export function maskSecret(value: unknown): string {
  return typeof value === 'string' && value.length > 0 ? SECRET_MASK : ''
}

/** Shown when a stored secret would be sent to a different server. */
export const SECRET_REENTRY_ERROR =
  'Enter the password again: the server or username changed since it was saved.'

/** Same server and account? Compares trimmed values; hosts case-insensitively. */
export function sameDestination(
  submitted: Record<string, unknown>,
  stored: Record<string, unknown> | undefined,
  fields: { host?: string[]; exact?: string[] }
): boolean {
  if (!stored) return false
  const norm = (v: unknown) => (v === undefined || v === null ? '' : String(v).trim())
  return (
    (fields.host || []).every((f) => norm(submitted[f]).toLowerCase() === norm(stored[f]).toLowerCase()) &&
    (fields.exact || []).every((f) => norm(submitted[f]) === norm(stored[f]))
  )
}

/**
 * The value to use for a secret field. The mask (or a left-out field) means
 * "unchanged", but the stored secret is only reused for the place it was
 * saved for. Sending the mask back together with a different host (or
 * username, tenant…) would otherwise hand the stored secret to that host:
 * SMTP AUTH sends it in plain text, and a MongoDB handshake gives enough to
 * brute-force it offline.
 *
 * - a new value typed by the user → that value
 * - mask / omitted, nothing stored → ''
 * - mask / omitted, same destination → the stored secret
 * - mask / omitted, different destination → `{ reenter: true }` (the caller
 *   rejects the request, or clears the secret)
 */
export function resolveSecret(
  submitted: unknown,
  stored: unknown,
  isSameDestination: boolean
): { value: string } | { reenter: true } {
  const keepsStored = submitted === SECRET_MASK || submitted === undefined
  if (!keepsStored) return { value: typeof submitted === 'string' ? submitted : '' }
  const storedValue = typeof stored === 'string' ? stored : ''
  if (!storedValue) return { value: '' }
  return isSameDestination ? { value: storedValue } : { reenter: true }
}

export const SMTP_DESTINATION = { host: ['host'], exact: ['username'] }
export const AZURE_DESTINATION = { exact: ['tenantId', 'clientId'] }

/** A copy of an email config with its secrets replaced by the mask. */
export function maskEmailConfig<T extends { smtp?: any; azure?: any }>(config: T): T {
  return {
    ...config,
    smtp: config.smtp ? { ...config.smtp, password: maskSecret(config.smtp.password) } : config.smtp,
    azure: config.azure
      ? {
          ...config.azure,
          clientSecret: maskSecret(config.azure.clientSecret),
          connectionString: maskSecret(config.azure.connectionString)
        }
      : config.azure
  }
}
