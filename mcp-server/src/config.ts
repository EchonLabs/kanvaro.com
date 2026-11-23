/**
 * Configuration (task 1.2).
 *
 * - Settings come from environment variables and are validated here.
 * - Secrets come from the secret store: `<NAME>_FILE` points to a file holding the
 *   value (Docker / Kubernetes secrets, Vault Agent). A plain `<NAME>` variable is
 *   accepted only outside production, for local development.
 * - Every problem is collected and reported together; startup fails if any exist.
 * - Error messages and `describeConfig()` never contain secret values.
 */
import { readFileSync } from 'node:fs'
import { z } from 'zod'

export type Env = Readonly<Record<string, string | undefined>>

export interface Config {
  readonly env: 'development' | 'test' | 'production'
  readonly server: {
    readonly host: string
    readonly port: number
    /** Public origin of this server, e.g. https://mcp.example.com. Also the OAuth issuer. */
    readonly publicBaseUrl: string
    /** Path of the MCP endpoint. */
    readonly mcpPath: '/mcp'
    /** Canonical MCP resource URI = token audience (publicBaseUrl + mcpPath). */
    readonly resourceUrl: string
    /** Browser origins allowed to call the MCP endpoint (Origin header check). */
    readonly allowedOrigins: readonly string[]
  }
  readonly kanvaro: {
    /** Address the server uses for Kanvaro API calls (may be internal http). */
    readonly apiBaseUrl: string
    /** Address users' browsers use for Kanvaro's sign-in pages. */
    readonly publicUrl: string
    readonly clientId: string
    readonly clientSecret: string
    readonly requestTimeoutMs: number
  }
  readonly database: {
    readonly uri: string
    readonly name: string
  }
  readonly tokens: {
    readonly accessTtlSeconds: number
    readonly refreshTtlSeconds: number
    readonly authCodeTtlSeconds: number
  }
  readonly encryption: {
    readonly activeKeyId: string
    /** Key id → 32-byte key. Older keys stay listed so stored values can still be read. */
    readonly keys: ReadonlyMap<string, Buffer>
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
export const SECRET_NAMES = ['MONGODB_URI', 'KANVARO_CLIENT_SECRET', 'TOKEN_ENCRYPTION_KEYS'] as const
export type SecretName = (typeof SECRET_NAMES)[number]

const MAX_REFRESH_TTL_SECONDS = 7 * 24 * 60 * 60 // never longer than Kanvaro's refresh token
const KEY_ID = /^[A-Za-z0-9_-]{1,32}$/

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
  ACCESS_TOKEN_TTL_SECONDS: int(300, 3600, 900),
  REFRESH_TOKEN_TTL_SECONDS: int(3600, MAX_REFRESH_TTL_SECONDS, MAX_REFRESH_TTL_SECONDS),
  AUTH_CODE_TTL_SECONDS: int(10, 600, 60),
  TOKEN_ENCRYPTION_ACTIVE_KEY_ID: z.string().trim().optional(),
  AUDIT_RETENTION_DAYS: int(1, 3650, 180),
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
  const nodeEnv = parsed.success ? parsed.data.NODE_ENV : (clean.NODE_ENV === 'production' ? 'production' : 'development')
  const production = nodeEnv === 'production'

  const secrets = Object.fromEntries(SECRET_NAMES.map(n => [n, readSecret(n, clean, production, problems)])) as Record<SecretName, string | undefined>

  if (!parsed.success) throw new ConfigError(problems)
  const s = parsed.data

  const publicBaseUrl = origin('PUBLIC_BASE_URL', s.PUBLIC_BASE_URL, production, problems)
  const kanvaroPublic = origin('KANVARO_PUBLIC_URL', s.KANVARO_PUBLIC_URL, production, problems)
  const kanvaroApi = origin('KANVARO_API_BASE_URL', s.KANVARO_API_BASE_URL, false, problems)
  const allowedOrigins = s.ALLOWED_ORIGINS.split(',')
    .map(o => o.trim())
    .filter(Boolean)
    .map((o, i) => origin(`ALLOWED_ORIGINS[${i}]`, o, false, problems))
    .filter((o): o is string => o !== undefined)

  if (secrets.MONGODB_URI !== undefined && !/^mongodb(\+srv)?:\/\//.test(secrets.MONGODB_URI)) {
    problems.push('MONGODB_URI: must start with mongodb:// or mongodb+srv://')
  }
  const keyRing = secrets.TOKEN_ENCRYPTION_KEYS === undefined ? undefined : parseKeyRing(secrets.TOKEN_ENCRYPTION_KEYS, problems)
  let activeKeyId: string | undefined
  if (keyRing && keyRing.size > 0) {
    activeKeyId = s.TOKEN_ENCRYPTION_ACTIVE_KEY_ID ?? [...keyRing.keys()][0]
    if (activeKeyId !== undefined && !keyRing.has(activeKeyId)) {
      problems.push('TOKEN_ENCRYPTION_ACTIVE_KEY_ID: no key with this id in TOKEN_ENCRYPTION_KEYS')
    }
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
      publicUrl: kanvaroPublic!,
      clientId: s.KANVARO_CLIENT_ID,
      clientSecret: secrets.KANVARO_CLIENT_SECRET!,
      requestTimeoutMs: s.KANVARO_REQUEST_TIMEOUT_MS,
    },
    database: { uri: secrets.MONGODB_URI!, name: s.MONGODB_DB },
    tokens: {
      accessTtlSeconds: s.ACCESS_TOKEN_TTL_SECONDS,
      refreshTtlSeconds: s.REFRESH_TOKEN_TTL_SECONDS,
      authCodeTtlSeconds: s.AUTH_CODE_TTL_SECONDS,
    },
    encryption: { activeKeyId: activeKeyId!, keys: keyRing! },
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
    tokens: { ...c.tokens },
    encryption: { activeKeyId: c.encryption.activeKeyId, keyIds: [...c.encryption.keys.keys()] },
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

/** Parses "id1:base64key,id2:base64key". Each key must decode to exactly 32 bytes. */
function parseKeyRing(raw: string, problems: string[]): Map<string, Buffer> | undefined {
  const ring = new Map<string, Buffer>()
  const entries = raw.split(',').map(e => e.trim()).filter(Boolean)
  if (entries.length === 0) {
    problems.push('TOKEN_ENCRYPTION_KEYS: no keys found (format: id:base64key,id2:base64key)')
    return undefined
  }
  entries.forEach((entry, i) => {
    const sep = entry.indexOf(':')
    const id = sep > 0 ? entry.slice(0, sep) : ''
    const b64 = sep > 0 ? entry.slice(sep + 1) : ''
    if (!KEY_ID.test(id)) {
      problems.push(`TOKEN_ENCRYPTION_KEYS: entry ${i + 1} needs an id of letters, digits, "-" or "_" before ":"`)
      return
    }
    if (ring.has(id)) {
      problems.push(`TOKEN_ENCRYPTION_KEYS: key id "${id}" is listed twice`)
      return
    }
    const key = /^[A-Za-z0-9+/]+={0,2}$/.test(b64) ? Buffer.from(b64, 'base64') : Buffer.alloc(0)
    if (key.length !== 32) {
      problems.push(`TOKEN_ENCRYPTION_KEYS: key "${id}" must be 32 bytes, base64-encoded`)
      return
    }
    ring.set(id, key)
  })
  return ring
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !(value instanceof Map) && !Buffer.isBuffer(value)) {
    for (const v of Object.values(value)) deepFreeze(v)
    Object.freeze(value)
  }
  return value
}
