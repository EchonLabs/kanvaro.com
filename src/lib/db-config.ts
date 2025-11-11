import mongoose from 'mongoose'
import { getDatabaseConfig as getConfigFromFile, getMongoUri } from './config'

/**
 * Global is used here to maintain a cached connection across hot reloads
 * in development. This prevents connections growing exponentially
 * during API Route usage.
 */
let cached = (global as any).mongoose

if (!cached) {
  cached = (global as any).mongoose = { conn: null, promise: null }
}

/**
 * Get database configuration from the config file
 */
export async function getDatabaseConfig() {
  try {
    const config = getConfigFromFile()
    
    if (!config) {
      throw new Error('Database configuration not found. Please complete the setup process.')
    }

    return config
  } catch (error) {
    console.error('Failed to get database configuration:', error)
    throw error
  }
}

/**
 * Connect to the database using the stored configuration
 * This is the main database connection function that replaces the old connectDB
 */
export async function connectDB() {
  try {
    // If we already have a connection, return it
    if (cached.conn) {
      return cached.conn
    }

    const mongoUri = getMongoUri()
    if (!mongoUri) {
      // During build time or when config doesn't exist, return null instead of throwing
      if (process.env.NODE_ENV === 'production' && process.env.NEXT_PHASE === 'phase-production-build') {
        console.log('Build time: Skipping database connection')
        return null
      }
      throw new Error('No database URI found in configuration. Please complete the setup process.')
    }

    if (!cached.promise) {
      const opts = {
        bufferCommands: false,
        serverSelectionTimeoutMS: 10000, // 10 second timeout
        connectTimeoutMS: 10000,
        socketTimeoutMS: 10000
      }

      cached.promise = mongoose.connect(mongoUri, opts).then((mongoose) => {
        return mongoose
      })
    }

    try {
      cached.conn = await cached.promise
    } catch (e) {
      cached.promise = null
      // During build time, don't throw errors for database connection failures
      if (process.env.NODE_ENV === 'production' && process.env.NEXT_PHASE === 'phase-production-build') {
        console.log('Build time: Database connection failed, continuing without connection')
        return null
      }
      throw e
    }

    return cached.conn
  } catch (error) {
    // During build time, don't throw errors for database connection failures
    if (process.env.NODE_ENV === 'production' && process.env.NEXT_PHASE === 'phase-production-build') {
      console.log('Build time: Database connection error, continuing without connection:', error instanceof Error ? error.message : 'Unknown error')
      return null
    }
    console.error('Failed to connect to database:', error)
    throw error
  }
}

/**
 * Connect to the database using the stored configuration (alias for connectDB)
 * @deprecated Use connectDB instead
 */
export async function connectWithStoredConfig() {
  return connectDB()
}

/**
 * Check if database configuration exists
 */
export async function hasDatabaseConfig(): Promise<boolean> {
  try {
    const config = getConfigFromFile()
    return !!(config)
  } catch (error) {
    console.error('Failed to check database configuration:', error)
    return false
  }
}

// Export connectDB as default for backward compatibility
export default connectDB