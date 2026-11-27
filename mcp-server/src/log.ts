/**
 * Logging (task 1.6).
 *
 * Structured JSON lines (pino). Secrets never reach the output:
 * 1. Values under sensitive key names are replaced at ANY depth (pino's own `redact`
 *    only covers fixed paths, so a nested object could slip through).
 * 2. Every string — messages, values, error messages and stacks — is scrubbed of
 *    Bearer/Basic credentials, JWTs, passwords inside URLs and token query parameters.
 * 3. Every request gets its own id. A caller's X-Request-Id is logged separately, and only
 *    if short and plain, so nobody can inject text or reuse another request's id.
 */
import { randomUUID } from 'node:crypto'
import { pino } from 'pino'
import type { DestinationStream, Logger, LoggerOptions } from 'pino'
import { serverInfo } from './index.js'

export type { Logger } from 'pino'
export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export const REDACTED = '[redacted]'
const MAX_DEPTH = 8

/**
 * Exact key names (compared lower-case, without "-" and "_"). Not plain `code` or `session`:
 * those are error codes and outcome codes, and OAuth codes in URLs are caught by the string rules.
 */
const SENSITIVE_KEYS = new Set([
  'authorization', 'proxyauthorization', 'cookie', 'setcookie',
  'password', 'passwd', 'pwd', 'secret', 'authorizationcode', 'authcode', 'codeverifier', 'codechallenge',
  'otp', 'passwordresetotp', 'apikey', 'xapikey', 'confirm', 'confirmation', 'confirmationcode',
  'privatekey', 'clientassertion', 'assertion', 'jwt', 'sessionid',
])
/** Keys ending like this are sensitive too: accessToken, refresh_token, clientSecret, … */
const SENSITIVE_SUFFIXES = ['token', 'secret', 'password', 'credential', 'credentials']

export function isSensitiveKey(key: string): boolean {
  const k = key.toLowerCase().replace(/[-_]/g, '')
  return SENSITIVE_KEYS.has(k) || SENSITIVE_SUFFIXES.some(s => k.endsWith(s))
}

const STRING_RULES: [RegExp, string][] = [
  // Authorization header values: "Bearer abc…", "Basic abc…"
  [/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi, `$1 ${REDACTED}`],
  // JSON Web Tokens anywhere in text
  [/\beyJ[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]+/g, REDACTED],
  // user:password@ inside URLs (e.g. mongodb://user:pass@host)
  [/\b([a-z][a-z0-9+.-]*:\/\/)[^\s:/@]+:[^\s@/]+@/gi, `$1${REDACTED}@`],
  // token-like query parameters
  [/([?&](?:access_token|refresh_token|id_token|token|code|code_verifier|client_secret|subject_token|password)=)[^&\s"']+/gi, `$1${REDACTED}`],
]

export function scrubString(value: string): string {
  let out = value
  for (const [pattern, replacement] of STRING_RULES) out = out.replace(pattern, replacement)
  return out
}

/** Returns a copy with sensitive keys replaced and every string scrubbed. Never mutates its input. */
export function sanitize(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (typeof value === 'string') return scrubString(value)
  if (value === null || typeof value !== 'object') return value
  if (depth >= MAX_DEPTH) return '[too deep]'
  if (seen.has(value)) return '[circular]'
  seen.add(value)
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) return '[binary]'
  if (value instanceof Date) return value
  if (value instanceof Error) return sanitizeError(value, depth, seen)
  if (value instanceof URL) return scrubString(value.toString())
  if (Array.isArray(value)) return value.map(v => sanitize(v, depth + 1, seen))
  if (value instanceof Map) return sanitize(Object.fromEntries(value), depth + 1, seen)
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(value)) out[k] = isSensitiveKey(k) ? REDACTED : sanitize(v, depth + 1, seen)
  return out
}

function sanitizeError(err: Error, depth = 0, seen = new WeakSet<object>()): Record<string, unknown> {
  const out: Record<string, unknown> = { type: err.name, message: scrubString(err.message) }
  if (err.stack) out.stack = scrubString(err.stack)
  for (const [k, v] of Object.entries(err)) {
    if (k === 'message' || k === 'stack') continue
    out[k] = isSensitiveKey(k) ? REDACTED : sanitize(v, depth + 1, seen)
  }
  if (err.cause !== undefined) out.cause = sanitize(err.cause, depth + 1, seen)
  return out
}

export interface LoggerConfig {
  level?: LogLevel
  /** Where lines go; defaults to stdout, written synchronously so nothing is lost on exit. */
  destination?: DestinationStream
}

export function createLogger(config: LoggerConfig = {}): Logger {
  const options: LoggerOptions = {
    level: config.level ?? 'info',
    base: { service: serverInfo.name, version: serverInfo.version },
    timestamp: pino.stdTimeFunctions.isoTime,
    messageKey: 'msg',
    serializers: { err: (e: unknown) => (e instanceof Error ? sanitizeError(e) : sanitize(e)) },
    formatters: {
      level: label => ({ level: label }),
      log: obj => sanitize(obj) as Record<string, unknown>,
    },
    hooks: {
      logMethod(args, method) {
        const clean = args.map(a => (typeof a === 'string' ? scrubString(a) : a)) as typeof args
        method.apply(this, clean)
      },
    },
  }
  return pino(options, config.destination ?? pino.destination({ dest: 1, sync: true }))
}

const REQUEST_ID = /^[A-Za-z0-9._:-]{1,64}$/

/** A new id for one request. Used in logs, audit entries and calls to Kanvaro. */
export function newRequestId(): string {
  return randomUUID()
}

/** A caller's X-Request-Id, for logs only: kept if short and plain, otherwise dropped. */
export function clientRequestIdFrom(header: unknown): string | undefined {
  return typeof header === 'string' && REQUEST_ID.test(header) ? header : undefined
}
