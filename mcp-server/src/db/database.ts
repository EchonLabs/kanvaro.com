/**
 * Database layer (task 1.3, revised for decision D10): connection, the audit log
 * collection and its indexes.
 *
 * - Separate database from Kanvaro's. In production its login must have access to this
 *   database only (see README, "Database user").
 * - `ensureIndexes` is idempotent and runs at startup. It also applies a changed audit
 *   retention period to the existing TTL index (collMod), so no manual migration is needed.
 * - Only features available since MongoDB 6.0 are used (Kanvaro's compose files pin 6.0).
 */
import type { Collection, Db, IndexDescription } from 'mongodb'
import { MongoClient, MongoServerError } from 'mongodb'
import type { AuditLogDoc } from './types.js'
import { COLLECTIONS } from './types.js'

export interface Collections {
  auditLog: Collection<AuditLogDoc>
}

export interface Database {
  client: MongoClient
  db: Db
  collections: Collections
  close(): Promise<void>
}

export interface DatabaseOptions {
  uri: string
  name: string
  /** Fail fast when the server can't be reached (default 5 s). */
  serverSelectionTimeoutMS?: number
}

export class DatabaseError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'DatabaseError'
  }
}

/** Connects and checks the server answers. Never includes the URI (it holds the password) in errors. */
export async function connectDatabase(opts: DatabaseOptions): Promise<Database> {
  const client = new MongoClient(opts.uri, {
    appName: 'kanvaro-mcp-server',
    serverSelectionTimeoutMS: opts.serverSelectionTimeoutMS ?? 5000,
    retryWrites: true,
  })
  try {
    await client.connect()
    const db = client.db(opts.name)
    await db.command({ ping: 1 })
    return { client, db, collections: collectionsOf(db), close: () => client.close() }
  } catch (err) {
    await client.close().catch(() => undefined)
    throw new DatabaseError(`Cannot connect to the MCP server database "${opts.name}"`, { cause: err })
  }
}

export function collectionsOf(db: Db): Collections {
  return { auditLog: db.collection<AuditLogDoc>(COLLECTIONS.auditLog) }
}

/** Index name of the audit log TTL index (its expiry changes with the retention setting). */
export const AUDIT_TTL_INDEX = 'audit_at_ttl'

type NamedIndex = IndexDescription & { name: string }

/** All indexes, by collection. */
export function indexPlan(auditRetentionDays: number): Record<keyof Collections, NamedIndex[]> {
  return {
    auditLog: [
      { key: { at: 1 }, name: AUDIT_TTL_INDEX, expireAfterSeconds: auditRetentionDays * 24 * 60 * 60 },
      { key: { userId: 1, at: -1 }, name: 'user_at' },
      { key: { clientId: 1, at: -1 }, name: 'client_at' },
      { key: { action: 1, at: -1 }, name: 'action_at' },
    ],
  }
}

/**
 * Creates every collection and index. Safe to run on every start.
 * If a TTL index exists with a different expiry, the expiry is updated in place.
 */
export async function ensureIndexes(db: Db, auditRetentionDays: number): Promise<void> {
  const collections = collectionsOf(db)
  const plan = indexPlan(auditRetentionDays)
  for (const [key, indexes] of Object.entries(plan) as [keyof Collections, NamedIndex[]][]) {
    const coll = collections[key] as unknown as Collection
    const existing = await listIndexes(coll)
    for (const index of indexes) {
      const current = existing.find(i => i.name === index.name)
      if (current && index.expireAfterSeconds !== undefined && current.expireAfterSeconds !== index.expireAfterSeconds) {
        await db.command({ collMod: coll.collectionName, index: { name: index.name, expireAfterSeconds: index.expireAfterSeconds } })
        continue
      }
      if (!current) await coll.createIndexes([index])
    }
  }
}

async function listIndexes(coll: Collection): Promise<{ name?: string; expireAfterSeconds?: number }[]> {
  try {
    return (await coll.listIndexes().toArray()) as { name?: string; expireAfterSeconds?: number }[]
  } catch (err) {
    // The collection doesn't exist yet: createIndexes will create it.
    if (err instanceof MongoServerError && err.codeName === 'NamespaceNotFound') return []
    throw err
  }
}
