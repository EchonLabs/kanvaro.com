import mongoose from 'mongoose'
import type { Connection, Model, Schema } from 'mongoose'
import { getOrgConfigById, getPrimaryOrgConfig, getOrgConfigs } from './config'
import { getCurrentOrgDb } from './request-context'

const connectionPool = new Map<string, Connection>()

function extractServerUri(fullUri: string): string {
  return fullUri.replace(/\/[^/?]+(\?.*)?$/, '')
}

function sameServer(uri1: string, uri2: string): boolean {
  return extractServerUri(uri1) === extractServerUri(uri2)
}
export async function getOrgConnection(orgId: string): Promise<Connection> {
  const existing = connectionPool.get(orgId)
  if (existing && existing.readyState === 1) return existing

  const org = getOrgConfigById(orgId)
  if (!org) throw new Error(`No config found for orgId: ${orgId}`)

  const { uri, database } = org.database
  const opts: mongoose.ConnectOptions = {
    bufferCommands: false,
    serverSelectionTimeoutMS: 10_000,
    connectTimeoutMS: 10_000,
    socketTimeoutMS: 10_000,
  }

  // ── Try to re-use an existing connection on the same MongoDB server ──
  let conn: Connection | null = null
  for (const [, existingConn] of connectionPool) {
    if (existingConn.readyState === 1 && existingConn.host) {
      // Check if it points to the same server
      const existingOrgId = [...connectionPool.entries()].find(([, c]) => c === existingConn)?.[0]
      const existingOrg = existingOrgId ? getOrgConfigById(existingOrgId) : null
      if (existingOrg && sameServer(existingOrg.database.uri, uri)) {
        // Share the underlying MongoClient, switch database
        conn = existingConn.useDb(database, { useCache: true })
        break
      }
    }
  }

  if (!conn) {
    // Fresh connection to a new MongoDB server
    conn = await mongoose.createConnection(uri, opts).asPromise()
    conn.on('disconnected', () => {
      console.warn(`Connection for org [${orgId}] disconnected`)
      connectionPool.delete(orgId)
    })
    conn.on('error', (err) => {
      console.error(`Connection error for org [${orgId}]:`, err)
      connectionPool.delete(orgId)
    })
  }

  connectionPool.set(orgId, conn)

  // Eagerly register all model schemas so that .populate() refs work
  // immediately on queries against this connection.
  ensureAllModelsOnConnection(conn)

  return conn
}
export async function getPrimaryOrgConnection(): Promise<Connection> {
  const primary = getPrimaryOrgConfig()
  if (!primary) throw new Error('No organisations configured. Run the setup wizard first.')
  return getOrgConnection(primary.id)
}
export async function findOrgForEmail(
  email: string,
): Promise<{ orgId: string; connection: Connection } | null> {
  const orgs = getOrgConfigs()
  for (const org of orgs) {
    try {
      const conn = await getOrgConnection(org.id)
      // Reuse User schema from global mongoose model cache
      const UserModel = getModelOnConnection<any>('User', conn)
      const user = await UserModel.findOne({ email: email.toLowerCase() }).lean()
      if (user) return { orgId: org.id, connection: conn }
    } catch {
      // Skip orgs that are unreachable
    }
  }
  return null
}
// ── Lazy model-schema cache ──────────────────────────────────────────────────
// Map<modelName, Schema> populated once from the model files.
let _schemaCache: Map<string, Schema> | null = null

function ensureSchemaCache(): Map<string, Schema> {
  if (_schemaCache) return _schemaCache
  // Side-effect import: registers every model on the global mongoose instance.
  require('@/models/registry')
  _schemaCache = new Map<string, Schema>()
  for (const [name, model] of Object.entries(mongoose.models)) {
    _schemaCache.set(name, model.schema)
  }
  return _schemaCache
}

// Track which connections have had all schemas bulk-registered.
const _bulkRegistered = new WeakSet<Connection>()

/**
 * Ensure **every** known schema is registered on `conn`.
 *
 * Mongoose's internal `.populate()` calls `conn.model(refName)` directly – it
 * does NOT go through our `getModelOnConnection` helper.  If the referenced
 * model hasn't been registered on that connection yet, Mongoose throws
 * `MissingSchemaError`.  By eagerly registering all schemas up-front we
 * guarantee populate always finds what it needs.
 */
function ensureAllModelsOnConnection(conn: Connection): void {
  if (_bulkRegistered.has(conn)) return
  const schemas = ensureSchemaCache()
  for (const [name, schema] of schemas) {
    if (!conn.models[name]) {
      conn.model(name, schema)
    }
  }
  _bulkRegistered.add(conn)
}

export function getModelOnConnection<T>(modelName: string, conn: Connection): Model<T> {
  // Bulk-register all schemas so that populate() refs are always available.
  ensureAllModelsOnConnection(conn)

  if (conn.models[modelName]) return conn.models[modelName] as Model<T>

  // Fallback: in case a model was added after bulk-registration
  const globalModel = mongoose.models[modelName]
  const schema = globalModel?.schema ?? ensureSchemaCache().get(modelName)

  if (!schema) {
    throw new Error(
      `Model "${modelName}" is not registered. ` +
        'Make sure the model file is exported from @/models/registry.',
    )
  }
  console.log(`[db] Registering model "${modelName}" on connection "${conn.name}"`)
  return conn.model<T>(modelName, schema) as Model<T>
}
export function getModelForCurrentOrg<T>(modelName: string): Model<T> {

  const dbName = getCurrentOrgDb()
  console.log(`[db] getModelForCurrentOrg("${modelName}") → currentOrgDb: ${dbName ?? 'undefined'}`)

  if (dbName) {
    // Find the org whose database.database matches dbName
    const orgs = getOrgConfigs()
    const org = orgs.find((o) => o.database.database === dbName)
    if (org) {
      const conn = connectionPool.get(org.id)
      if (conn && conn.readyState === 1) {
        return getModelOnConnection<T>(modelName, conn)
      }
    }
  }

  // Fallback: use primary org connection from pool
  const primary = getPrimaryOrgConfig()
  if (primary) {
    const conn = connectionPool.get(primary.id)
    if (conn && conn.readyState === 1) {
      return getModelOnConnection<T>(modelName, conn)
    }
  }

  // Last resort: global mongoose model (single-org backward compat)
  const globalModel = mongoose.models[modelName]
  if (globalModel) return globalModel as Model<T>

  throw new Error(
    `No active org connection found for model "${modelName}". ` +
      'Ensure connectDB() is called before using any model.',
  )
}
export function makeOrgModel<T>(modelName: string, schema: Schema): Model<T> {
  void schema 
  return new Proxy(function OrgModelProxy() {} as any, {
    // Handle: new User({ ... })
    construct(_target, args) {
      const Model = getModelForCurrentOrg<T>(modelName)
      return new (Model as any)(...args)
    },

    // Handle: User.findOne(), User.create(), User.schema, etc.
    get(_target, prop: string | symbol) {
      const Model = getModelForCurrentOrg<T>(modelName)
      const val = (Model as any)[prop]
      if (typeof val === 'function') return (val as Function).bind(Model)
      return val
    },

    // Handle: User instanceof mongoose.Model (symbol checks etc.)
    has(_target, prop) {
      const Model = getModelForCurrentOrg<T>(modelName)
      return prop in Model
    },
  }) as unknown as Model<T>
}
export function getConnectionPoolStatus(): Record<string, string> {
  const status: Record<string, string> = {}
  const stateMap: Record<number, string> = { 0: 'disconnected', 1: 'connected', 2: 'connecting', 3: 'disconnecting' }
  for (const [orgId, conn] of connectionPool) {
    status[orgId] = stateMap[conn.readyState] ?? 'unknown'
  }
  return status
}
