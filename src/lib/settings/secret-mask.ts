/**
 * Settings pages show stored secrets (SMTP password, Azure client secret,
 * database password) as this placeholder instead of the real value. When the
 * placeholder comes back unchanged on save or on a connection test, the server
 * uses the stored secret. A real secret never leaves the server.
 */
export const SECRET_MASK = '••••••••'

/** The mask when a secret is stored, '' when none is, so "required" checks still work. */
export function maskSecret(value: unknown): string {
  return typeof value === 'string' && value.length > 0 ? SECRET_MASK : ''
}

/**
 * The submitted value, or the stored one when the client sent the mask back or
 * left the field out (an omitted field means "unchanged"; '' still clears it).
 */
export function unmaskSecret(submitted: unknown, stored: unknown): string {
  if (submitted === SECRET_MASK || submitted === undefined) return typeof stored === 'string' ? stored : ''
  return typeof submitted === 'string' ? submitted : ''
}

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
