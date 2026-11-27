/**
 * Documents stored in the MCP server's own database (task 1.3, revised for decision D10).
 *
 * With sign-in at Kanvaro and token exchange (D10), this server stores no user tokens,
 * codes or client records: the only collection is the audit log. It holds no Kanvaro
 * business data. Entries older than the retention period are removed by a TTL index.
 */
import type { ObjectId } from 'mongodb'

/** One entry per tool call or sign-in-related event (reads and writes, including refusals). */
export interface AuditLogDoc {
  _id?: ObjectId
  at: Date
  requestId: string
  /** OAuth client that made the call (from the verified token), e.g. "kanvaro-claude-code". */
  clientId?: string
  /** Kanvaro user id (the token's subject). */
  userId?: string
  /** Caller's IP address (behind a proxy: as resolved with TRUST_PROXY). */
  ip?: string
  /** Tool name, or an event such as "token.rejected" / "exchange.refused". */
  action: string
  /** What was acted on, e.g. "task:6b00…". Never contains secrets. */
  target?: string
  outcome: 'ok' | 'refused' | 'error'
  /** Short, safe detail: changed field names, error code. Never values of secrets. */
  detail?: string
}

export const COLLECTIONS = {
  auditLog: 'audit_log',
} as const
