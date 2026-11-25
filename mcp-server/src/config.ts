/**
 * Configuration (task 1.2, revised for decision D10).
 *
 * - Settings come from environment variables and are validated here.
 * - Secrets come from the secret store: `<NAME>_FILE` points to a file holding the
 *   value (Docker / Kubernetes secrets, Vault Agent). A plain `<NAME>` variable is
 *   accepted only outside production, for local development.
 * - Every problem is collected and reported together; startup fails if any exist.
 * - Error messages and `describeConfig()` never contain secret values.
 *
 * D10: Kanvaro is the only authorization server. This server verifies Kanvaro-issued
 * tokens and exchanges them for Kanvaro API tokens, so it holds no token-signing or
 * encryption keys and no token lifetimes of its own.
 */
import { readFileSync } from 'node:fs'
import { z } from 'zod'

export type Env = Readonly<Record<string, string | undefined>>

export interface Config {
  readonly env: 'development' | 'test' | 'production'
  readonly server: {
    readonly host: string
    readonly port: number
    /** Public origin of this server, e.g. https://mcp.example.com. */
    readonly publicBaseUrl: string
    /** Path of the MCP endpoint. */
    readonly mcpPath: '/mcp'
    /** Canonical MCP resource URI = the audience Kanvaro puts in tokens for this server. */
    readonly resourceUrl: string
    /** Browser origins allowed to call the MCP endpoint (Origin header check). */
    readonly allowedOrigins: readonly string[]
  }
  readonly kanvaro: {
    /** Address this server uses for API calls, token exchange and JWKS (may be internal http). */
    readonly apiBaseUrl: string
    /** Kanvaro's public address. Also its OAuth issuer: named in our metadata, checked in every token. */
    readonly issuer: string
    /** This server's client id at Kanvaro (used only for token exchange). */
    readonly clientId: string
    readonly clientSecret: string
    readonly requestTimeoutMs: number
  }
  readonly database: {
    readonly uri: string
    readonly name: string
  }
  readonly audit: { readonly retentionDays: number }
  readonly log: { readonly level: 'debug' | 'info' | 'warn' | 'error' }
}

export class ConfigError extends Error {
  constructor(readonly problems: readonly string[]) {
    super(`Invalid configuration:\n${problems.map(p => `  - ${p}`).join('\n')}`)
    this.name = 'ConfigError'
  }
}

/** Secret names. Each is read from `<NAME>_FILE` (or `<NAME>` outside production). */
export const SECRET_NAMES = ['MONGODB_URI', 'KANVARO_CLIENT_SECRET'] as const
export type SecretName = (typeof SECRET_NAMES)[number]

const required = z
  .string({ error: 'is required' })
  .trim()
  .min(1, 'is required')
const int = (min: number, max: number, fallback: number) =>
  z.coerce
    .number({ error: 'must be a whole number' })
    .int('must be a whole number')
    .min(min, `must be at least ${min}`)
    .max(max, `must be at most ${max}`)
    .default(fallback)

const settingsSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production'], { error: 'must be development, test or production' }).default('development'),
  HOST: z.string().trim().min(1).default('127.0.0.1'),
  PORT: int(1, 65535, 3100),
  PUBLIC_BASE_URL: required,
  ALLOWED_ORIGINS: z.string().default(''),
  KANVARO_API_BASE_URL: required,
  KANVARO_PUBLIC_URL: required,
  KANVARO_CLIENT_ID: required,
  KANVARO_REQUEST_TIMEOUT_MS: int(1000, 60000, 10000),
  MONGODB_DB: z.string().trim().regex(/^[A-Za-z0-9_-]{1,63}$/, 'must be a valid database name').default('kanvaro_mcp'),
  AUDIT_RETENTION_DAYS: int(1, 3650, 90),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error'], { error: 'must be debug, info, warn or error' }).default('info'),
})

/**
 * Reads and validates the configuration. Throws ConfigError listing every problem.
 * `env` defaults to process.env; tests pass their own object.
 */
export function loadConfig(env: Env = process.env): Config {
  // Treat empty values as unset, so "PORT=" falls back to the default.
  const clean = Object.fromEntries(Object.entries(env).filter(([, v]) => v !== undefined && v.trim() !== ''))
  const problems: string[] = []

  const parsed = settingsSchema.safeParse(clean)
  if (!parsed.success) {
    for (const issue of parsed.error.issues) problems.push(`${issue.path.join('.')}: ${issue.message}`)
  }
  const production = (parsed.success ? parsed.data.NODE_ENV : clean.NODE_ENV) === 'production'

  const secrets = Object.fromEntries(SECRET_NAMES.map(n => [n, readSecret(n, clean, production, problems)])) as Record<SecretName, string | undefined>

  if (!parsed.success) throw new ConfigError(problems)
  const s = parsed.data

  const publicBaseUrl = origin('PUBLIC_BASE_URL', s.PUBLIC_BASE_URL, production, problems)
  const issuer = origin('KANVARO_PUBLIC_URL', s.KANVARO_PUBLIC_URL, production, problems)
  const kanvaroApi = origin('KANVARO_API_BASE_URL', s.KANVARO_API_BASE_URL, false, problems)
  const allowedOrigins = s.ALLOWED_ORIGINS.split(',')
    .map(o => o.trim())
    .filter(Boolean)
    .map((o, i) => origin(`ALLOWED_ORIGINS[${i}]`, o, false, problems))
    .filter((o): o is string => o !== undefined)

  if (secrets.MONGODB_URI !== undefined && !/^mongodb(\+srv)?:\/\//.test(secrets.MONGODB_URI)) {
    problems.push('MONGODB_URI: must start with mongodb:// or mongodb+srv://')
  }

  if (problems.length > 0) throw new ConfigError(problems)

  // All values below were checked above; the non-null assertions only satisfy the compiler.
  return deepFreeze({
    env: s.NODE_ENV,
    server: {
      host: s.HOST,
      port: s.PORT,
      publicBaseUrl: publicBaseUrl!,
      mcpPath: '/mcp',
      resourceUrl: `${publicBaseUrl!}/mcp`,
      allowedOrigins,
    },
    kanvaro: {
      apiBaseUrl: kanvaroApi!,
      issuer: issuer!,
      clientId: s.KANVARO_CLIENT_ID,
      clientSecret: secrets.KANVARO_CLIENT_SECRET!,
      requestTimeoutMs: s.KANVARO_REQUEST_TIMEOUT_MS,
    },
    database: { uri: secrets.MONGODB_URI!, name: s.MONGODB_DB },
    audit: { retentionDays: s.AUDIT_RETENTION_DAYS },
    log: { level: s.LOG_LEVEL },
  })
}

/** A summary that is safe to log: secrets are shown only as "[set]". */
export function describeConfig(c: Config): Record<string, unknown> {
  return {
    env: c.env,
    server: { ...c.server },
    kanvaro: { ...c.kanvaro, clientSecret: '[set]' },
    database: { uri: '[set]', name: c.database.name },
    audit: { ...c.audit },
    log: { ...c.log },
  }
}

function readSecret(name: SecretName, env: Env, production: boolean, problems: string[]): string | undefined {
  const file = env[`${name}_FILE`]
  const direct = env[name]
  if (file !== undefined && direct !== undefined) {
    problems.push(`${name}: set either ${name}_FILE or ${name}, not both`)
    return undefined
  }
  if (file !== undefined) {
    let value: string
    try {
      value = readFileSync(file, 'utf8').trim()
    } catch {
      problems.push(`${name}_FILE: the secret file cannot be read`)
      return undefined
    }
    if (value === '') {
      problems.push(`${name}_FILE: the secret file is empty`)
      return undefined
    }
    return value
  }
  if (direct !== undefined) {
    if (production) {
      problems.push(`${name}: in production, secrets must come from the secret store (set ${name}_FILE), not a plain environment variable`)
      return undefined
    }
    return direct.trim()
  }
  problems.push(`${name}: is required (set ${name}_FILE to the secret file)`)
  return undefined
}

/** Validates an origin (scheme + host + optional port, nothing else) and returns it normalised. */
function origin(name: string, value: string, requireHttps: boolean, problems: string[]): string | undefined {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    problems.push(`${name}: must be a full URL such as https://example.com`)
    return undefined
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    problems.push(`${name}: must use http or https`)
    return undefined
  }
  if (requireHttps && url.protocol !== 'https:') {
    problems.push(`${name}: must use https in production`)
    return undefined
  }
  if (url.username || url.password) {
    problems.push(`${name}: must not contain a user name or password`)
    return undefined
  }
  if (url.pathname !== '/' || url.search || url.hash) {
    problems.push(`${name}: must be an origin only (no path, query or fragment), e.g. ${url.origin}`)
    return undefined
  }
  return url.origin
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const v of Object.values(value)) deepFreeze(v)
    Object.freeze(value)
  }
  return value
}
