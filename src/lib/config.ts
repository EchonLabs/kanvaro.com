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

const CONFIG_DIR = path.join(process.cwd(), 'config')
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json')
const LEGACY_CONFIG_FILE = path.join(process.cwd(), 'config.json')

function ensureConfigDirectory() {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true })
  }
}

function readConfigFromFile(filePath: string): AppConfig | null {
  try {
    if (fs.existsSync(filePath)) {
      const configData = fs.readFileSync(filePath, 'utf8')
      return JSON.parse(configData)
    }
  } catch (error) {
    console.error(`Failed to read config file at ${filePath}:`, error)
  }
  return null
}

/**
 * Load application configuration from file
 */
export function loadConfig(): AppConfig {
  const currentConfig = readConfigFromFile(CONFIG_FILE)
  if (currentConfig) {
    return currentConfig
  }

  const legacyConfig = readConfigFromFile(LEGACY_CONFIG_FILE)
  if (legacyConfig) {
    console.warn('Legacy config.json detected at project root. Migrating to config/config.json.')
    try {
      ensureConfigDirectory()
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(legacyConfig, null, 2))
      fs.unlinkSync(LEGACY_CONFIG_FILE)
    } catch (error) {
      console.error('Failed to migrate legacy config.json:', error)
    }
    return legacyConfig
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
    ensureConfigDirectory()
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2))
    if (fs.existsSync(LEGACY_CONFIG_FILE)) {
      try {
        fs.unlinkSync(LEGACY_CONFIG_FILE)
      } catch (removeError) {
        console.warn('Failed to remove legacy config.json:', removeError)
      }
    }
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
