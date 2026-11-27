/**
 * Decision record F0: auth routes fell back to the public default
 * 'your-refresh-secret-key' because deployments set REFRESH_TOKEN_SECRET while
 * the code read JWT_REFRESH_SECRET. Anyone could forge a refresh token.
 */
import jwt from 'jsonwebtoken'

const env = process.env as Record<string, string | undefined>
const KEYS = ['NODE_ENV', 'JWT_SECRET', 'JWT_REFRESH_SECRET', 'REFRESH_TOKEN_SECRET'] as const
const saved = Object.fromEntries(KEYS.map((k) => [k, env[k]]))

function load(vars: Partial<Record<(typeof KEYS)[number], string>>) {
  jest.resetModules()
  for (const k of KEYS) delete env[k]
  Object.assign(env, vars)
  return require('../auth/jwt-secrets') as typeof import('../auth/jwt-secrets')
}

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete env[k]
    else env[k] = saved[k]
  }
  jest.restoreAllMocks()
})

describe('jwt secrets in production', () => {
  it('throws when the access secret is missing', () => {
    const s = load({ NODE_ENV: 'production', JWT_REFRESH_SECRET: 'r'.repeat(32) })
    expect(() => s.getJwtSecret()).toThrow(/JWT_SECRET is not set/)
  })

  it('throws when the refresh secret is missing under both names', () => {
    const s = load({ NODE_ENV: 'production', JWT_SECRET: 'a'.repeat(32) })
    expect(() => s.getJwtRefreshSecret()).toThrow(/JWT_REFRESH_SECRET or REFRESH_TOKEN_SECRET is not set/)
  })

  it('treats a blank value as missing', () => {
    const s = load({ NODE_ENV: 'production', JWT_SECRET: '   ' })
    expect(() => s.getJwtSecret()).toThrow(/not set/)
  })

  it.each([
    ['JWT_SECRET', 'your-secret-key'],
    ['JWT_SECRET', 'your-super-secret-jwt-key-change-this-in-production'],
    ['JWT_REFRESH_SECRET', 'your-refresh-secret-key'],
    ['REFRESH_TOKEN_SECRET', 'your-refresh-token-secret-change-this-in-production']
  ])('rejects the published placeholder %s=%s', (name, value) => {
    const s = load({ NODE_ENV: 'production', [name]: value })
    const get = name === 'JWT_SECRET' ? s.getJwtSecret : s.getJwtRefreshSecret
    expect(get).toThrow(/published placeholder/)
  })

  it('reads REFRESH_TOKEN_SECRET when JWT_REFRESH_SECRET is absent (docker-compose name)', () => {
    const s = load({ NODE_ENV: 'production', REFRESH_TOKEN_SECRET: 'from-compose-' + 'x'.repeat(20) })
    expect(s.getJwtRefreshSecret()).toBe('from-compose-' + 'x'.repeat(20))
  })

  it('prefers JWT_REFRESH_SECRET over REFRESH_TOKEN_SECRET', () => {
    const s = load({ NODE_ENV: 'production', JWT_REFRESH_SECRET: 'primary', REFRESH_TOKEN_SECRET: 'legacy' })
    expect(s.getJwtRefreshSecret()).toBe('primary')
  })
})

describe('jwt secrets outside development and test (review point 4)', () => {
  it.each(['staging', 'prod', 'qa', 'Production'])('refuses a missing secret when NODE_ENV=%s', (env) => {
    const s = load({ NODE_ENV: env })
    expect(() => s.getJwtSecret()).toThrow(/not set/)
    expect(() => s.getJwtRefreshSecret()).toThrow(/not set/)
  })

  it('refuses a missing secret when NODE_ENV is unset', () => {
    const s = load({})
    expect(() => s.getJwtSecret()).toThrow(/not set/)
  })

  it('refuses a published placeholder when NODE_ENV=staging', () => {
    const s = load({ NODE_ENV: 'staging', JWT_SECRET: 'your-secret-key' })
    expect(s.getJwtSecret).toThrow(/published placeholder/)
  })

  it('uses a configured secret when NODE_ENV=staging', () => {
    const s = load({ NODE_ENV: 'staging', JWT_SECRET: 'real-' + 'x'.repeat(30) })
    expect(s.getJwtSecret()).toBe('real-' + 'x'.repeat(30))
  })

  it('still falls back under NODE_ENV=test', () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {})
    const s = load({ NODE_ENV: 'test' })
    expect(s.getJwtSecret()).toMatch(/dev-only/)
  })
})

describe('jwt secrets in development', () => {
  it('falls back to a dev-only value, never the old public default, and warns once', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    const s = load({ NODE_ENV: 'development' })
    const first = s.getJwtRefreshSecret()
    s.getJwtRefreshSecret()
    expect(first).toMatch(/dev-only/)
    expect(first).not.toBe('your-refresh-secret-key')
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('uses the configured value when set', () => {
    const s = load({ NODE_ENV: 'development', JWT_SECRET: 'configured' })
    expect(s.getJwtSecret()).toBe('configured')
  })
})

describe('forged refresh token replay (decision record F0)', () => {
  it('a token signed with the old public default does not verify against the configured secret', () => {
    const s = load({ NODE_ENV: 'production', REFRESH_TOKEN_SECRET: 'real-random-secret-' + 'z'.repeat(20) })
    const forged = jwt.sign({ userId: 'any-user' }, 'your-refresh-secret-key', { expiresIn: '7d' })
    expect(() => jwt.verify(forged, s.getJwtRefreshSecret())).toThrow(/invalid signature/)
  })
})
