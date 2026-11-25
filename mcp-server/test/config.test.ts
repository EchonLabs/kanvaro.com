import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import type { Env } from '../src/config.js'
import { ConfigError, SECRET_NAMES, describeConfig, loadConfig } from '../src/config.js'

const dir = mkdtempSync(join(tmpdir(), 'mcp-config-test-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

const CLIENT_SECRET = 'client-secret-value-123'
const DB_URI = 'mongodb://mcp:db-password-456@localhost:27017/kanvaro_mcp'

function secretFile(name: string, value: string): string {
  const p = join(dir, name)
  writeFileSync(p, `${value}\n`)
  return p
}

/** Minimal valid development settings; secrets as plain variables (allowed outside production). */
function devEnv(overrides: Env = {}): Env {
  return {
    NODE_ENV: 'development',
    PUBLIC_BASE_URL: 'http://localhost:3100',
    KANVARO_API_BASE_URL: 'http://localhost:3000',
    KANVARO_PUBLIC_URL: 'http://localhost:3000',
    KANVARO_CLIENT_ID: 'kanvaro-mcp-server',
    KANVARO_CLIENT_SECRET: CLIENT_SECRET,
    MONGODB_URI: DB_URI,
    ...overrides,
  }
}

/** Valid production settings; secrets from files. */
function prodEnv(overrides: Env = {}): Env {
  return {
    NODE_ENV: 'production',
    PUBLIC_BASE_URL: 'https://mcp.example.com',
    KANVARO_API_BASE_URL: 'http://kanvaro:3000',
    KANVARO_PUBLIC_URL: 'https://kanvaro.example.com',
    KANVARO_CLIENT_ID: 'kanvaro-mcp-server',
    KANVARO_CLIENT_SECRET_FILE: secretFile('client_secret', CLIENT_SECRET),
    MONGODB_URI_FILE: secretFile('mongodb_uri', DB_URI),
    ...overrides,
  }
}

function problemsOf(env: Env): string[] {
  try {
    loadConfig(env)
  } catch (e) {
    if (e instanceof ConfigError) return [...e.problems]
    throw e
  }
  throw new Error('expected loadConfig to fail')
}

describe('loadConfig — valid input', () => {
  it('loads a development config with defaults', () => {
    const c = loadConfig(devEnv())
    expect(c.env).toBe('development')
    expect(c.server).toMatchObject({ host: '127.0.0.1', port: 3100, publicBaseUrl: 'http://localhost:3100', resourceUrl: 'http://localhost:3100/mcp' })
    expect(c.kanvaro).toMatchObject({ apiBaseUrl: 'http://localhost:3000', issuer: 'http://localhost:3000', clientId: 'kanvaro-mcp-server' })
    expect(c.audit.retentionDays).toBe(90)
    expect(c.database.name).toBe('kanvaro_mcp')
  })

  it('loads a production config with secrets from files', () => {
    const c = loadConfig(prodEnv())
    expect(c.kanvaro.clientSecret).toBe(CLIENT_SECRET)
    expect(c.kanvaro.issuer).toBe('https://kanvaro.example.com')
    expect(c.database.uri).toBe(DB_URI)
  })

  it('needs only two secrets: the database URI and the Kanvaro client secret (D10)', () => {
    expect([...SECRET_NAMES]).toEqual(['MONGODB_URI', 'KANVARO_CLIENT_SECRET'])
  })

  it('normalises origins (lower-case host, no trailing slash)', () => {
    const c = loadConfig(devEnv({ PUBLIC_BASE_URL: 'http://LOCALHOST:3100/', KANVARO_PUBLIC_URL: 'http://LOCALHOST:3000/' }))
    expect(c.server.publicBaseUrl).toBe('http://localhost:3100')
    expect(c.kanvaro.issuer).toBe('http://localhost:3000')
  })

  it('treats empty values as unset', () => {
    expect(loadConfig(devEnv({ PORT: '', LOG_LEVEL: '' })).server.port).toBe(3100)
  })

  it('parses ALLOWED_ORIGINS', () => {
    const c = loadConfig(devEnv({ ALLOWED_ORIGINS: 'https://a.example.com, https://b.example.com/' }))
    expect(c.server.allowedOrigins).toEqual(['https://a.example.com', 'https://b.example.com'])
  })

  it('returns a frozen object', () => {
    const c = loadConfig(devEnv())
    expect(Object.isFrozen(c)).toBe(true)
    expect(Object.isFrozen(c.kanvaro)).toBe(true)
  })
})

describe('loadConfig — startup fails on missing or invalid values', () => {
  it('fails when a required secret is missing', () => {
    const { KANVARO_CLIENT_SECRET: _omit, ...env } = devEnv()
    expect(problemsOf(env)).toContain('KANVARO_CLIENT_SECRET: is required (set KANVARO_CLIENT_SECRET_FILE to the secret file)')
  })

  it('fails when required settings are missing', () => {
    const p = problemsOf({ KANVARO_CLIENT_SECRET: 'x', MONGODB_URI: DB_URI })
    expect(p).toEqual(expect.arrayContaining([
      'PUBLIC_BASE_URL: is required',
      'KANVARO_API_BASE_URL: is required',
      'KANVARO_PUBLIC_URL: is required',
      'KANVARO_CLIENT_ID: is required',
    ]))
  })

  it('reports every problem at once', () => {
    expect(problemsOf(devEnv({ PORT: 'abc', LOG_LEVEL: 'loud', MONGODB_URI: undefined })).length).toBeGreaterThanOrEqual(3)
  })

  it('refuses plain-variable secrets in production', () => {
    const { KANVARO_CLIENT_SECRET_FILE: _f, ...env } = prodEnv()
    expect(problemsOf({ ...env, KANVARO_CLIENT_SECRET: CLIENT_SECRET }).join('\n')).toMatch(/KANVARO_CLIENT_SECRET: in production, secrets must come from the secret store/)
  })

  it('fails when a secret file is missing or empty', () => {
    expect(problemsOf(prodEnv({ MONGODB_URI_FILE: join(dir, 'does-not-exist') }))).toContain('MONGODB_URI_FILE: the secret file cannot be read')
    expect(problemsOf(prodEnv({ MONGODB_URI_FILE: secretFile('empty', '  ') }))).toContain('MONGODB_URI_FILE: the secret file is empty')
  })

  it('fails when a secret is given both ways', () => {
    expect(problemsOf(devEnv({ MONGODB_URI_FILE: secretFile('dup', DB_URI) }))).toContain('MONGODB_URI: set either MONGODB_URI_FILE or MONGODB_URI, not both')
  })

  it('requires https public addresses in production', () => {
    const p = problemsOf(prodEnv({ PUBLIC_BASE_URL: 'http://mcp.example.com', KANVARO_PUBLIC_URL: 'http://kanvaro.example.com' }))
    expect(p).toContain('PUBLIC_BASE_URL: must use https in production')
    expect(p).toContain('KANVARO_PUBLIC_URL: must use https in production')
  })

  it('allows an internal http address for Kanvaro API calls in production', () => {
    expect(loadConfig(prodEnv({ KANVARO_API_BASE_URL: 'http://kanvaro:3000' })).kanvaro.apiBaseUrl).toBe('http://kanvaro:3000')
  })

  it('rejects a public URL with a path', () => {
    expect(problemsOf(devEnv({ PUBLIC_BASE_URL: 'http://localhost:3100/mcp' })).join('\n')).toMatch(/PUBLIC_BASE_URL: must be an origin only/)
  })

  it('rejects a database URI that is not MongoDB', () => {
    expect(problemsOf(devEnv({ MONGODB_URI: 'postgres://x' }))).toContain('MONGODB_URI: must start with mongodb:// or mongodb+srv://')
  })
})

describe('secrets never leak', () => {
  it('describeConfig contains no secret values', () => {
    const text = JSON.stringify(describeConfig(loadConfig(prodEnv())))
    for (const secret of [CLIENT_SECRET, 'db-password-456']) expect(text).not.toContain(secret)
    expect(text).toContain('"clientSecret":"[set]"')
  })

  it('error messages contain no secret values', () => {
    let msg = ''
    try { loadConfig(devEnv({ MONGODB_URI: 'postgres://user:db-password-456@x' })) } catch (e) { msg = String(e) }
    expect(msg).not.toBe('')
    expect(msg).not.toContain('db-password-456')
  })
})
