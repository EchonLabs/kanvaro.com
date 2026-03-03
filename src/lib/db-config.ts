import mongoose from 'mongoose'
import { getPrimaryOrgConfig, getOrgConfigById } from './config'
import { getOrgConnection, getPrimaryOrgConnection } from './db-connection-manager'
import { setCurrentOrgDb, getCurrentOrgDb } from './request-context'


export async function connectDB(orgId?: string): Promise<mongoose.Connection> {
  try {
    let conn: mongoose.Connection

    if (orgId) {
      // Explicit org – set the ambient context so proxy models resolve correctly.
      conn = await getOrgConnection(orgId)
      const orgCfg = getOrgConfigById(orgId)
      if (orgCfg) {
        setCurrentOrgDb(orgCfg.database.database)
        console.log(`[db] connectDB(${orgId}) → db: ${orgCfg.database.database}`)
      }
    } else {
      // Bare connectDB() – connect to the primary DB but do NOT overwrite the
      // ambient org context.  authenticateUser() will later call connectDB(orgId)
      // which sets the correct context.  If we overwrote here, concurrent requests
      // would clobber each other's org context (race condition).
      conn = await getPrimaryOrgConnection()
      const primaryCfg = getPrimaryOrgConfig()

      // Only set the ambient context if nothing has been set yet.
      // This prevents a bare connectDB() from clobbering a previously set orgId.
      const currentDb = getCurrentOrgDb()
      if (!currentDb && primaryCfg) {
        setCurrentOrgDb(primaryCfg.database.database)
      }
      console.log(`[db] connectDB() → primary conn (ambient unchanged)`)
    }

    return conn
  } catch (error) {
    if (
      process.env.NODE_ENV === 'production' &&
      process.env.NEXT_PHASE === 'phase-production-build'
    ) {
      console.log('Build time: Skipping database connection')
      return mongoose.connection // harmless during build
    }
    console.error('Failed to connect to database:', error)
    throw error
  }
}

/** Connect using an explicit MongoDB URI (used during setup wizard). */
export async function connectWithUri(uri: string, dbName: string): Promise<mongoose.Connection> {
  const opts: mongoose.ConnectOptions = {
    bufferCommands: false,
    serverSelectionTimeoutMS: 10_000,
    connectTimeoutMS: 10_000,
    socketTimeoutMS: 10_000,
  }
  const conn = await mongoose.createConnection(uri, opts).asPromise()
  setCurrentOrgDb(dbName)
  return conn
}

/** @deprecated Use connectDB(orgId) directly. */
export async function connectWithStoredConfig(): Promise<mongoose.Connection> {
  return connectDB()
}

/** Check if at least one org has been configured. */
export async function hasDatabaseConfig(): Promise<boolean> {
  return !!getPrimaryOrgConfig()?.database?.uri
}

/** @deprecated Access getDatabaseConfig() via config.ts. */
export async function getDatabaseConfig() {
  return getPrimaryOrgConfig()?.database ?? null
}

// Default export for backward compat with `import connectDB from '@/lib/db-config'`
export default connectDB
