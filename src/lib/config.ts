import 'server-only'
import fs from 'fs'
import path from 'path'

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

export interface OrgConfig {
  id: string
  name: string
  slug: string
  setupCompleted: boolean
  database: DatabaseConfig
}

export interface AppConfig {
  maxOrganizations: number
  organizations: OrgConfig[]
}

export const MAX_ORGANIZATIONS = 3

const CONFIG_FILE = path.join(process.cwd(), 'config.json')

// ─────────────────────────────────────────────
// Core load / save
// ─────────────────────────────────────────────

export function loadConfig(): AppConfig {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const raw = fs.readFileSync(CONFIG_FILE, 'utf8')
      const parsed = JSON.parse(raw)

      // Migrate old single-org format on-the-fly (safety net)
      if (!Array.isArray(parsed.organizations)) {
        const legacy: AppConfig = {
          maxOrganizations: MAX_ORGANIZATIONS,
          organizations: parsed.database
            ? [
                {
                  id: parsed.organizationId || 'default',
                  name: 'Primary Organization',
                  slug: 'primary',
                  setupCompleted: !!parsed.setupCompleted,
                  database: parsed.database,
                },
              ]
            : [],
        }
        saveConfig(legacy)
        return legacy
      }

      if (!parsed.maxOrganizations) {
        parsed.maxOrganizations = MAX_ORGANIZATIONS
      }

      return parsed as AppConfig
    }
  } catch (error) {
    console.error('Failed to load config file:', error)
  }

  return { maxOrganizations: MAX_ORGANIZATIONS, organizations: [] }
}

export function saveConfig(config: AppConfig): void {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2))
    console.log('Configuration saved to file')
  } catch (error) {
    console.error('Failed to save config file:', error)
    throw error
  }
}

// ─────────────────────────────────────────────
// Org helpers
// ─────────────────────────────────────────────

export function getOrgConfigs(): OrgConfig[] {
  return loadConfig().organizations
}

export function getOrgConfigById(orgId: string): OrgConfig | null {
  return loadConfig().organizations.find((o) => o.id === orgId) ?? null
}

export function getOrgConfigBySlug(slug: string): OrgConfig | null {
  return loadConfig().organizations.find((o) => o.slug === slug) ?? null
}

export function getOrgConfigByDbName(dbName: string): OrgConfig | null {
  return loadConfig().organizations.find((o) => o.database.database === dbName) ?? null
}

/** First (primary) org – fallback when no orgId context is active. */
export function getPrimaryOrgConfig(): OrgConfig | null {
  return loadConfig().organizations[0] ?? null
}

export function getOrganizationCount(): number {
  return loadConfig().organizations.length
}

export function isAtOrgLimit(): boolean {
  const cfg = loadConfig()
  return cfg.organizations.length >= (cfg.maxOrganizations ?? MAX_ORGANIZATIONS)
}

/** Append a new org entry. Throws if at the configured limit. */
export function addOrgConfig(org: OrgConfig): void {
  const config = loadConfig()
  const limit = config.maxOrganizations ?? MAX_ORGANIZATIONS
  if (config.organizations.length >= limit) {
    throw new Error(`Organization limit reached (max ${limit})`)
  }
  const existing = config.organizations.findIndex((o) => o.id === org.id)
  if (existing >= 0) {
    config.organizations[existing] = org
  } else {
    config.organizations.push(org)
  }
  saveConfig(config)
}

export function markOrgSetupCompleted(orgId: string): void {
  const config = loadConfig()
  const org = config.organizations.find((o) => o.id === orgId)
  if (org) {
    org.setupCompleted = true
    saveConfig(config)
  }
}

// ─────────────────────────────────────────────
// Backward-compat shims (used by existing routes)
// ─────────────────────────────────────────────

/** @deprecated Use getPrimaryOrgConfig() or getOrgConfigById() */
export function getDatabaseConfig(): DatabaseConfig | null {
  return getPrimaryOrgConfig()?.database ?? null
}

/** @deprecated Use markOrgSetupCompleted() */
export function markSetupCompleted(organizationId: string): void {
  markOrgSetupCompleted(organizationId)
}

/** @deprecated Saves to first org only; use addOrgConfig() for new orgs. */
export function saveDatabaseConfig(dbConfig: DatabaseConfig): void {
  const config = loadConfig()
  if (config.organizations.length > 0) {
    config.organizations[0].database = dbConfig
    saveConfig(config)
  }
}

export function isSetupCompleted(): boolean {
  return loadConfig().organizations.some((o) => o.setupCompleted)
}

export function getMongoUri(): string | null {
  return getPrimaryOrgConfig()?.database?.uri ?? null
}
