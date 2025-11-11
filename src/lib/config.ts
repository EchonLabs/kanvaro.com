import 'server-only'
import fs from 'fs'
import path from 'path'

interface DatabaseConfig {
  host: string
  port: number
  database: string
  username: string
  password: string
  authSource: string
  ssl: boolean
  uri: string
}

interface AppConfig {
  database?: DatabaseConfig
  setupCompleted: boolean
  organizationId?: string
}

const CONFIG_FILE = path.join(process.cwd(), 'config.json')

/**
 * Load application configuration from file
 */
export function loadConfig(): AppConfig {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const configData = fs.readFileSync(CONFIG_FILE, 'utf8')
      return JSON.parse(configData)
    }
  } catch (error) {
    console.error('Failed to load config file:', error)
  }
  
  return {
    setupCompleted: false
  }
}

/**
 * Save application configuration to file
 */
export function saveConfig(config: AppConfig): void {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2))
    console.log('Configuration saved to file')
  } catch (error) {
    console.error('Failed to save config file:', error)
    throw error
  }
}

/**
 * Get database configuration
 */
export function getDatabaseConfig(): DatabaseConfig | null {
  const config = loadConfig()
  return config.database || null
}

/**
 * Check if setup is completed
 */
export function isSetupCompleted(): boolean {
  const config = loadConfig()
  return config.setupCompleted
}

/**
 * Save database configuration
 */
export function saveDatabaseConfig(dbConfig: DatabaseConfig): void {
  const config = loadConfig()
  config.database = dbConfig
  saveConfig(config)
}

/**
 * Mark setup as completed
 */
export function markSetupCompleted(organizationId: string): void {
  const config = loadConfig()
  config.setupCompleted = true
  config.organizationId = organizationId
  saveConfig(config)
}

/**
 * Get MongoDB URI from stored configuration
 */
export function getMongoUri(): string | null {
  const dbConfig = getDatabaseConfig()
  return dbConfig?.uri || null
}
