/**
 * Decision record F9/F10: settings/email, settings/database and
 * test-connection had no sign-in and returned SMTP/Azure/database secrets and
 * connection details. They now need the matching settings permission, never
 * return a stored secret, and keep the stored secret when the placeholder
 * comes back on save or on a connection test.
 */
import { NextRequest } from 'next/server'
import { SECRET_MASK, maskSecret, unmaskSecret, maskEmailConfig } from '@/lib/settings/secret-mask'

const STORED = {
  provider: 'smtp',
  smtp: { host: 'smtp.example.com', port: 587, secure: false, username: 'mailer', password: 'real-smtp-pass', fromEmail: 'a@b.c', fromName: 'K' },
  azure: { connectionString: 'real-azure-conn', fromEmail: '', fromName: '' }
}

const ADMIN = { user: { id: 'u1', organization: 'org1' } }
const SIGNED_OUT = { error: 'No authentication tokens', status: 401 }

afterEach(() => {
  jest.resetModules()
  delete process.env.MONGODB_PASSWORD
})

function mockCommon(auth: any, permitted: boolean) {
  const hasPermission = jest.fn().mockResolvedValue(permitted)
  jest.doMock('@/lib/db-config', () => ({
    __esModule: true,
    default: jest.fn(),
    hasDatabaseConfig: jest.fn().mockResolvedValue(true)
  }))
  jest.doMock('@/lib/auth-utils', () => ({ authenticateUser: jest.fn().mockResolvedValue(auth) }))
  jest.doMock('@/lib/permissions/permission-service', () => ({ PermissionService: { hasPermission } }))
  return { hasPermission }
}

const leanResult = (value: any) => ({ select: () => ({ lean: () => Promise.resolve(value) }) })

describe('secret-mask helpers', () => {
  it('masks only when a secret is stored', () => {
    expect(maskSecret('x')).toBe(SECRET_MASK)
    expect(maskSecret('')).toBe('')
    expect(maskSecret(undefined)).toBe('')
  })

  it('unmasks the placeholder to the stored value and passes anything else through', () => {
    expect(unmaskSecret(SECRET_MASK, 'stored')).toBe('stored')
    expect(unmaskSecret('new-pass', 'stored')).toBe('new-pass')
    expect(unmaskSecret('', 'stored')).toBe('')
    expect(unmaskSecret(undefined, 'stored')).toBe('stored')
  })

  it('masks every secret in an email config', () => {
    const masked = maskEmailConfig(STORED as any)
    expect(JSON.stringify(masked)).not.toMatch(/real-/)
    expect(masked.smtp.host).toBe('smtp.example.com')
  })
})

describe('/api/settings/email', () => {
  function load(auth: any, permitted: boolean) {
    const { hasPermission } = mockCommon(auth, permitted)
    const findByIdAndUpdate = jest.fn((_id: string, update: any) =>
      leanResult({ emailConfig: update.emailConfig })
    )
    jest.doMock('@/models/Organization', () => ({
      Organization: { findById: jest.fn(() => leanResult({ emailConfig: STORED })), findByIdAndUpdate }
    }))
    return { route: require('@/app/api/settings/email/route'), findByIdAndUpdate, hasPermission }
  }

  const put = (body: any) => new NextRequest('http://localhost/x', { method: 'PUT', body: JSON.stringify(body) })

  it('GET returns 401 when signed out', async () => {
    const { route } = load(SIGNED_OUT, false)
    expect((await route.GET()).status).toBe(401)
  })

  it('GET returns 403 without settings:manage_email', async () => {
    const { route, hasPermission } = load(ADMIN, false)
    expect((await route.GET()).status).toBe(403)
    expect(hasPermission).toHaveBeenCalledWith('u1', 'settings:manage_email')
  })

  it('GET never returns a stored secret', async () => {
    const { route } = load(ADMIN, true)
    const body = await (await route.GET()).json()
    expect(JSON.stringify(body)).not.toMatch(/real-/)
    expect(body.smtp.password).toBe(SECRET_MASK)
  })

  it('PUT returns 403 without the permission and saves nothing', async () => {
    const { route, findByIdAndUpdate } = load(ADMIN, false)
    expect((await route.PUT(put(STORED))).status).toBe(403)
    expect(findByIdAndUpdate).not.toHaveBeenCalled()
  })

  it('PUT with the placeholder keeps the stored password', async () => {
    const { route, findByIdAndUpdate } = load(ADMIN, true)
    await route.PUT(put({ ...STORED, smtp: { ...STORED.smtp, password: SECRET_MASK, host: 'new.example.com' } }))
    const saved = findByIdAndUpdate.mock.calls[0][1].emailConfig
    expect(saved.smtp.password).toBe('real-smtp-pass')
    expect(saved.smtp.host).toBe('new.example.com')
  })

  it('PUT keeps a stored secret the form does not send at all (Azure connection string)', async () => {
    const { route, findByIdAndUpdate } = load(ADMIN, true)
    await route.PUT(put({ provider: 'smtp', smtp: STORED.smtp, azure: { fromEmail: '' } }))
    expect(findByIdAndUpdate.mock.calls[0][1].emailConfig.azure.connectionString).toBe('real-azure-conn')
  })

  it('PUT with an explicit empty password clears it', async () => {
    const { route, findByIdAndUpdate } = load(ADMIN, true)
    await route.PUT(put({ ...STORED, smtp: { ...STORED.smtp, password: '' } }))
    expect(findByIdAndUpdate.mock.calls[0][1].emailConfig.smtp.password).toBe('')
  })

  it('PUT with a new password saves it, and the response is masked', async () => {
    const { route, findByIdAndUpdate } = load(ADMIN, true)
    const res = await route.PUT(put({ ...STORED, smtp: { ...STORED.smtp, password: 'brand-new' } }))
    expect(findByIdAndUpdate.mock.calls[0][1].emailConfig.smtp.password).toBe('brand-new')
    expect(JSON.stringify(await res.json())).not.toMatch(/brand-new/)
  })

  it('PUT saves only known fields and writes to the caller\'s organisation', async () => {
    const { route, findByIdAndUpdate } = load(ADMIN, true)
    await route.PUT(put({ ...STORED, organization: 'other-org', smtp: { ...STORED.smtp, evil: 1 } }))
    const [orgId, update] = findByIdAndUpdate.mock.calls[0]
    expect(orgId).toBe('org1')
    expect(Object.keys(update)).toEqual(['emailConfig'])
    expect(update.emailConfig.smtp).not.toHaveProperty('evil')
  })
})

describe('/api/settings/database', () => {
  function load(auth: any, permitted: boolean) {
    const { hasPermission } = mockCommon(auth, permitted)
    return { route: require('@/app/api/settings/database/route'), hasPermission }
  }

  it('GET returns 401 when signed out', async () => {
    const { route } = load(SIGNED_OUT, false)
    expect((await route.GET()).status).toBe(401)
  })

  it('GET returns 403 without settings:manage_database', async () => {
    const { route, hasPermission } = load(ADMIN, false)
    expect((await route.GET()).status).toBe(403)
    expect(hasPermission).toHaveBeenCalledWith('u1', 'settings:manage_database')
  })

  it('GET masks the database password', async () => {
    process.env.MONGODB_PASSWORD = 'real-db-pass'
    const { route } = load(ADMIN, true)
    const body = await (await route.GET()).json()
    expect(body.password).toBe(SECRET_MASK)
  })

  it('PUT returns 401 when signed out', async () => {
    const { route } = load(SIGNED_OUT, false)
    const res = await route.PUT(new NextRequest('http://localhost/x', { method: 'PUT', body: '{}' }))
    expect(res.status).toBe(401)
  })
})

describe('GET /api/test-connection', () => {
  function load(denied: any) {
    jest.doMock('@/lib/setup-guard', () => ({ rejectUnlessSetupOrPermission: jest.fn().mockResolvedValue(denied) }))
    jest.doMock('@/lib/db-config', () => ({
      __esModule: true,
      default: jest.fn().mockResolvedValue({
        connection: { readyState: 1, name: 'kanvaro_prod', host: 'mongo2', port: 27017, db: { admin: () => ({ ping: jest.fn() }) } }
      }),
      hasDatabaseConfig: jest.fn().mockResolvedValue(true)
    }))
    return require('@/app/api/test-connection/route')
  }

  it('passes the guard\'s refusal straight through', async () => {
    const route = load({ status: 401, json: async () => ({}) })
    expect((await route.GET()).status).toBe(401)
  })

  it('returns no host, port, database or collection names', async () => {
    const route = load(null)
    const body = await (await route.GET()).json()
    expect(body.success).toBe(true)
    expect(JSON.stringify(body)).not.toMatch(/mongo2|27017|kanvaro_prod|collections/)
  })
})

describe('POST /api/setup/email/test with the placeholder', () => {
  it('tests with the stored SMTP password, not the placeholder', async () => {
    const createTransport = jest.fn(() => ({ verify: jest.fn().mockResolvedValue(true) }))
    jest.doMock('nodemailer', () => ({ __esModule: true, default: { createTransport }, createTransport }))
    jest.doMock('@/lib/setup-guard', () => ({ rejectUnlessSetupOrPermission: jest.fn().mockResolvedValue(null) }))
    jest.doMock('@/lib/db-config', () => ({ __esModule: true, default: jest.fn() }))
    jest.doMock('@/models/Organization', () => ({
      Organization: { findOne: jest.fn(() => leanResult({ emailConfig: STORED })) }
    }))
    const route = require('@/app/api/setup/email/test/route')

    await route.POST(new NextRequest('http://localhost/x', {
      method: 'POST',
      body: JSON.stringify({ provider: 'smtp', smtp: { ...STORED.smtp, password: SECRET_MASK } })
    }))

    expect(createTransport).toHaveBeenCalled()
    expect(JSON.stringify((createTransport.mock.calls[0] as any[])[0])).toContain('real-smtp-pass')
  })
})
