import 'server-only'
import fs from 'fs'
import path from 'path'
import mongoose, { Connection, Model } from 'mongoose'
import { Validation, ValidationSchema, IValidation } from '@/models/Validation'

export interface DatabaseConfig {
  host: string
  port: number
  database: string
  username: string
  password: string
  authSource: string
  ssl: boolean
  uri: string
}

export interface AppConfig {
  database?: DatabaseConfig | null
  setupCompleted: boolean
  organizationId?: string
}

interface LoadConfigOptions {
  skipDb?: boolean
  directUri?: string
}

interface SaveConfigOptions {
  directUri?: string
}

const CONFIG_FILE = path.join(process.cwd(), 'config.json')
const CONFIG_VALIDATION_KEY = 'app-config'

const CONNECTION_OPTIONS = {
  bufferCommands: false,
  serverSelectionTimeoutMS: 10000,
  connectTimeoutMS: 10000,
  socketTimeoutMS: 10000
}

function loadConfigFromFile(): AppConfig {
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

async function withValidationModel<T>(
  uri: string | undefined,
  handler: (model: Model<IValidation>) => Promise<T>
): Promise<T | null> {
  if (!uri) {
    return null
  }

  let connection: Connection | null = null

  try {
    if (mongoose.connection.readyState === 1 || mongoose.connection.readyState === 2) {
      return await handler(Validation)
    }

    connection = await mongoose.createConnection(uri, CONNECTION_OPTIONS).asPromise()
    const model = connection.model<IValidation>('Validation', ValidationSchema)
    const result = await handler(model)
    return result
  } catch (error) {
    console.error('Failed to interact with validations collection:', error)
    return null
  } finally {
    if (connection) {
      await connection.close()
    }
  }
}

function mergeConfig(base: AppConfig, override?: Partial<AppConfig> | null): AppConfig {
  if (!override) {
    return base
  }

  return {
    ...base,
    ...override,
    setupCompleted: override.setupCompleted ?? base.setupCompleted ?? false,
    organizationId: override.organizationId ?? base.organizationId,
    database: override.database ?? base.database
  }
}

export async function loadConfig(options: LoadConfigOptions = {}): Promise<AppConfig> {
  const fileConfig = loadConfigFromFile()

  if (options.skipDb) {
    return fileConfig
  }

  const uri = options.directUri || fileConfig.database?.uri

  const validationDoc = await withValidationModel(uri, async (model) => {
    return model.findOne({ key: CONFIG_VALIDATION_KEY }).lean()
  })

  if (validationDoc && validationDoc.value) {
    const value = validationDoc.value as AppConfig
    return mergeConfig(fileConfig, {
      ...value,
      setupCompleted: validationDoc.setupCompleted ?? value.setupCompleted,
      organizationId: validationDoc.organizationId ?? value.organizationId,
      database: validationDoc.database ?? value.database
    })
  }

  return fileConfig
}

async function writeConfigFile(config: AppConfig) {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2))
    console.log('Configuration saved to file')
  } catch (error) {
    console.error('Failed to save config file:', error)
    throw error
  }
}

async function syncConfigToValidation(config: AppConfig, options: SaveConfigOptions = {}) {
  const uri = options.directUri || config.database?.uri
  if (!uri) {
    return
  }

  await withValidationModel(uri, async (model) => {
    await model.findOneAndUpdate(
      { key: CONFIG_VALIDATION_KEY },
      {
        $set: {
          key: CONFIG_VALIDATION_KEY,
          value: config,
          setupCompleted: config.setupCompleted ?? false,
          organizationId: config.organizationId ?? '',
          database: config.database ?? null
        }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    )
  })
}

export async function saveConfig(config: AppConfig, options: SaveConfigOptions = {}): Promise<void> {
  await writeConfigFile(config)
  await syncConfigToValidation(config, options)
}

export async function getDatabaseConfig(): Promise<DatabaseConfig | null> {
  const config = await loadConfig()
  return config.database || null
}

export async function isSetupCompleted(): Promise<boolean> {
  const config = await loadConfig()
  return Boolean(config.setupCompleted)
}

export async function saveDatabaseConfig(dbConfig: DatabaseConfig): Promise<void> {
  const config = await loadConfig({ skipDb: true })
  const updatedConfig: AppConfig = {
    ...config,
    database: dbConfig,
    setupCompleted: config.setupCompleted ?? false,
    organizationId: config.organizationId
  }

  await saveConfig(updatedConfig, { directUri: dbConfig.uri })
}

export async function markSetupCompleted(organizationId: string): Promise<void> {
  const config = await loadConfig()
  const updatedConfig: AppConfig = {
    ...config,
    setupCompleted: true,
    organizationId
  }

  await saveConfig(updatedConfig)
}

export async function getMongoUri(): Promise<string | null> {
  const dbConfig = await getDatabaseConfig()
  return dbConfig?.uri || null
}

export async function clearConfig(): Promise<void> {
  const fileConfig = loadConfigFromFile()

  try {
    if (fs.existsSync(CONFIG_FILE)) {
      fs.unlinkSync(CONFIG_FILE)
      console.log('Configuration file deleted')
    }
  } catch (error) {
    console.error('Failed to delete config file:', error)
  }

  const uri = fileConfig.database?.uri
  if (!uri) {
    return
  }

  await withValidationModel(uri, async (model) => {
    await model.deleteOne({ key: CONFIG_VALIDATION_KEY })
  })
}
