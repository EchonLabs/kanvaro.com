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

interface EnvConfig {
  GROQ_API_KEY?: string
  REDIS_URL?: string
  GROQ_MODEL?: string
  STANDUP_ANALYSIS_HOUR?: string
  STANDUP_WORKING_CIRCLE_START_HOUR?: string
}

interface AppConfig {
  database?: DatabaseConfig
  setupCompleted: boolean
  organizationId?: string
  env?: EnvConfig
}

const CONFIG_FILE = path.join(process.cwd(), 'config.json')

/**
 * Load application configuration from file
 */
export function loadConfig(): AppConfig {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const configData = fs.readFileSync(CONFIG_FILE, 'utf8')
      console.log('configData', configData)
      return JSON.parse(configData)
    }
  } catch (error) {
    console.log('error', error)
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

/**
 * Read an environment value. config.json is the source of truth (it is
 * gitignored and machine-local, replacing .env.local), but a real OS/Docker
 * environment variable still takes precedence so deployments can override.
 */
export function getEnv(key: keyof EnvConfig): string | undefined {
  return process.env[key] ?? loadConfig().env?.[key]
}

/**
 * Populate process.env from the config.json `env` block so any code that reads
 * `process.env.X` keeps working without changes. Existing env vars are left
 * untouched, so OS/Docker values win over config.json.
 */
let envHydrated = false
export function hydrateEnvFromConfig(): void {
  if (envHydrated) return
  envHydrated = true

  const { env } = loadConfig()
  if (!env) return

  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined && value !== null && value !== '' && process.env[key] === undefined) {
      process.env[key] = String(value)
    }
  }
}

// Hydrate as soon as this server-only module is first imported.
hydrateEnvFromConfig()
