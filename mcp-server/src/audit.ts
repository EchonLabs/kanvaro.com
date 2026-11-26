/**
 * Audit log writer (task 3.4; extended for tool calls in 4.1).
 *
 * One entry per event: who (user, client, IP), what (action, target), and the outcome.
 * Entries never contain tokens, secrets or Kanvaro data; they expire after the retention
 * period through the TTL index (1.3).
 *
 * Sign-in events written here:
 *   session.exchange     the first token exchange of a session (who connected, when)
 *   token.rejected       an invalid, expired or under-scoped token
 *   exchange.refused     Kanvaro says the user's access has ended
 *   exchange.failed      Kanvaro unreachable, or our client credentials rejected
 *   token.check_failed   Kanvaro's signing keys unreachable
 *
 * Rejections from one IP address are capped per minute, so a flood of bad tokens can't fill
 * the database; capped events are still logged.
 */
import type { Collection } from 'mongodb'
import type { AuditLogDoc } from './db/types.js'
import type { Logger } from './log.js'

export type AuditEntry = Omit<AuditLogDoc, '_id' | 'at'>

export interface AuditLog {
  /** Writes one entry. Never throws: a failed write is logged as an error. */
  record(entry: AuditEntry): Promise<void>
  /** Like record(), but at most `perMinute` entries per IP address (for unauthenticated noise). */
  recordLimited(entry: AuditEntry): Promise<void>
}

export interface AuditOptions {
  /** Cap for recordLimited, per IP address per minute (default 20). */
  perMinute?: number
  now?: () => number
}

export function createAuditLog(collection: Collection<AuditLogDoc>, log: Logger, opts: AuditOptions = {}): AuditLog {
  const now = opts.now ?? Date.now
  const perMinute = opts.perMinute ?? 20
  const windows = new Map<string, { start: number; count: number }>()

  async function record(entry: AuditEntry): Promise<void> {
    try {
      await collection.insertOne({ ...entry, at: new Date(now()) })
    } catch (err) {
      log.error({ err, action: entry.action, requestId: entry.requestId }, 'audit write failed')
    }
  }

  return {
    record,
    recordLimited(entry) {
      const key = entry.ip ?? 'unknown'
      const t = now()
      let w = windows.get(key)
      if (!w || t - w.start >= 60_000) {
        w = { start: t, count: 0 }
        windows.set(key, w)
        if (windows.size > 10_000) windows.clear() // bound memory under a wide flood
      }
      if (++w.count > perMinute) {
        log.warn({ action: entry.action, ip: entry.ip }, 'audit entry skipped (rate cap)')
        return Promise.resolve()
      }
      return record(entry)
    },
  }
}

/** An audit log that writes nowhere (tests that don't check auditing). */
export const noAudit: AuditLog = { record: () => Promise.resolve(), recordLimited: () => Promise.resolve() }
