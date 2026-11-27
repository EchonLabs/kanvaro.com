/**
 * Response filter for tool results (task 4.1, rules from the tool catalogue 0.6 §5).
 *
 * Each tool lists the fields it returns as a shape; everything else is dropped. On top of
 * that, some fields are removed everywhere, whatever the shape says:
 *   - passwords and password-reset codes (Kanvaro finding F1);
 *   - rates (hourly, billing), unless the tool is a finance tool;
 *   - API keys and Mongo internals (__v, counters);
 *   - any key the log redaction treats as secret: `token`, `*Token`, `*Secret`, `*Password`,
 *     `*Credential(s)`, OTPs and the like (e.g. an invitation's `token`).
 * User objects are reduced to id, name, email and role.
 */
import { isSensitiveKey } from '../log.js'

/**
 * Which fields to keep.
 * - `true`: keep the value as it is (minus the fields removed everywhere).
 * - `'user'`: a Kanvaro user, reduced to { id, name, email, role }.
 * - an object: keep only these keys, each with its own shape.
 * Arrays are filtered item by item with the same shape.
 */
export type Shape = true | 'user' | { readonly [key: string]: Shape }

export interface FilterOptions {
  /** Keep hourly and billing rates (finance and financial-report tools only). */
  allowRates?: boolean
}

/** Removed at any depth, always. */
const ALWAYS_REMOVED = new Set([
  'password',
  'passwordHash',
  'passwordResetOtp',
  'passwordResetToken',
  'passwordResetExpiry',
  'apiKey',
  '__v',
  '_counterRollbackProject',
])

/** Removed at any depth unless the tool allows rates. */
const RATES = new Set(['hourlyRate', 'billingRate', 'memberRates'])

export const USER_FIELDS = ['id', 'name', 'email', 'role'] as const

export function filterResponse(value: unknown, shape: Shape, opts: FilterOptions = {}): unknown {
  return pick(value, shape, opts.allowRates === true, 0)
}

const MAX_DEPTH = 32

function pick(value: unknown, shape: Shape, rates: boolean, depth: number): unknown {
  if (depth > MAX_DEPTH) return undefined
  if (Array.isArray(value)) return value.map(v => pick(v, shape, rates, depth + 1)).filter(v => v !== undefined)
  if (shape === true) return scrub(value, rates, depth)
  if (shape === 'user') return reduceUser(value)
  if (!isPlainObject(value)) return isScalar(value) ? value : undefined
  const out: Record<string, unknown> = {}
  for (const [key, sub] of Object.entries(shape)) {
    if (!Object.prototype.hasOwnProperty.call(value, key) || isRemoved(key, rates)) continue
    const v = pick(value[key], sub, rates, depth + 1)
    if (v !== undefined) out[key] = v
  }
  return out
}

/** A value kept whole: drops the always-removed fields at any depth. */
function scrub(value: unknown, rates: boolean, depth: number): unknown {
  if (depth > MAX_DEPTH) return undefined
  if (Array.isArray(value)) return value.map(v => scrub(v, rates, depth + 1))
  if (!isPlainObject(value)) return value
  const out: Record<string, unknown> = {}
  for (const [key, v] of Object.entries(value)) {
    if (!isRemoved(key, rates)) out[key] = scrub(v, rates, depth + 1)
  }
  return out
}

/** A populated user → { id, name, email, role }. An unpopulated reference (an id) stays as it is. */
function reduceUser(value: unknown): unknown {
  if (typeof value === 'string') return value
  if (!isPlainObject(value)) return value === null ? null : undefined
  const id = stringOf(value._id) ?? stringOf(value.id)
  const name =
    stringOf(value.name) ??
    ([stringOf(value.firstName), stringOf(value.lastName)].filter(Boolean).join(' ') || undefined)
  const out: Record<string, string> = {}
  if (id) out.id = id
  if (name) out.name = name
  const email = stringOf(value.email)
  if (email) out.email = email
  const role = stringOf(value.role)
  if (role) out.role = role
  return out
}

function isRemoved(key: string, rates: boolean): boolean {
  return ALWAYS_REMOVED.has(key) || isSensitiveKey(key) || (!rates && RATES.has(key))
}

function stringOf(v: unknown): string | undefined {
  return typeof v === 'string' && v !== '' ? v : undefined
}

function isScalar(v: unknown): boolean {
  return v === null || ['string', 'number', 'boolean'].includes(typeof v)
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}
