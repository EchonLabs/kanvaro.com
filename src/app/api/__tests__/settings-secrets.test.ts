/**
 * Decision record F9/F10: settings/email, settings/database and
 * test-connection had no sign-in and returned SMTP/Azure/database secrets and
 * connection details. They now need the matching settings permission, never
 * return a stored secret, and keep the stored secret when the placeholder
 * comes back on save or on a connection test, but only for the same server
 * and account (PR #927 review: the mask plus a new host must not send the
 * stored secret to that host).
 */
import { NextRequest } from 'next/server'
import {
  SECRET_MASK,
  SECRET_REENTRY_ERROR,
  SMTP_DESTINATION,
  maskSecret,
  maskEmailConfig,
  resolveSecret,
  sameDestination
} from '@/lib/settings/secret-mask'

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

  it('resolveSecret: new values pass through; the mask reuses the stored value only for the same destination', () => {
    expect(resolveSecret('new-pass', 'stored', false)).toEqual({ value: 'new-pass' })
    expect(resolveSecret('', 'stored', true)).toEqual({ value: '' })
    expect(resolveSecret(SECRET_MASK, 'stored', true)).toEqual({ value: 'stored' })
    expect(resolveSecret(undefined, 'stored', true)).toEqual({ value: 'stored' })
    expect(resolveSecret(SECRET_MASK, 'stored', false)).toEqual({ reenter: true })
    expect(resolveSecret(undefined, 'stored', false)).toEqual({ reenter: true })
    expect(resolveSecret(SECRET_MASK, '', false)).toEqual({ value: '' })
  })

  it('sameDestination: host ignores case and spaces, username must match exactly', () => {
    const stored = { host: 'smtp.example.com', username: 'mailer' }
    expect(sameDestination({ host: ' SMTP.Example.com ', username: 'mailer' }, stored, SMTP_DESTINATION)).toBe(true)
    expect(sameDestination({ host: 'evil.example.net', username: 'mailer' }, stored, SMTP_DESTINATION)).toBe(false)
    expect(sameDestination({ host: 'smtp.example.com', username: 'other' }, stored, SMTP_DESTINATION)).toBe(false)
    expect(sameDestination({ host: 'smtp.example.com', username: 'mailer' }, undefined, SMTP_DESTINATION)).toBe(false)
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

  it('PUT with the placeholder and the same server keeps the stored password', async () => {
    const { route, findByIdAndUpdate } = load(ADMIN, true)
    const res = await route.PUT(put({ ...STORED, smtp: { ...STORED.smtp, password: SECRET_MASK, fromName: 'Renamed' } }))
    expect(res.status).toBe(200)
    const saved = findByIdAndUpdate.mock.calls[0][1].emailConfig
    expect(saved.smtp.password).toBe('real-smtp-pass')
    expect(saved.smtp.fromName).toBe('Renamed')
  })

  it('PUT with the placeholder and a new host is refused and saves nothing', async () => {
    const { route, findByIdAndUpdate } = load(ADMIN, true)
    const res = await route.PUT(put({ ...STORED, smtp: { ...STORED.smtp, password: SECRET_MASK, host: 'evil.example.net' } }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe(SECRET_REENTRY_ERROR)
    expect(findByIdAndUpdate).not.toHaveBeenCalled()
  })

  it('PUT with the placeholder and a new username is refused', async () => {
    const { route, findByIdAndUpdate } = load(ADMIN, true)
    const res = await route.PUT(put({ ...STORED, smtp: { ...STORED.smtp, password: SECRET_MASK, username: 'someone-else' } }))
    expect(res.status).toBe(400)
    expect(findByIdAndUpdate).not.toHaveBeenCalled()
  })

  it('PUT with the password left out and a new host is refused too', async () => {
    const { route, findByIdAndUpdate } = load(ADMIN, true)
    const { password: _omit, ...smtpWithoutPassword } = STORED.smtp
    const res = await route.PUT(put({ ...STORED, smtp: { ...smtpWithoutPassword, host: 'evil.example.net' } }))
    expect(res.status).toBe(400)
    expect(findByIdAndUpdate).not.toHaveBeenCalled()
  })

  it('PUT with a new host and a newly typed password saves it', async () => {
    const { route, findByIdAndUpdate } = load(ADMIN, true)
    const res = await route.PUT(put({ ...STORED, smtp: { ...STORED.smtp, host: 'new.example.com', password: 'typed-again' } }))
    expect(res.status).toBe(200)
    const saved = findByIdAndUpdate.mock.calls[0][1].emailConfig
    expect(saved.smtp).toMatchObject({ host: 'new.example.com', password: 'typed-again' })
  })

  it('PUT for Azure clears (does not reuse) the SMTP password when the SMTP host changed', async () => {
    const { route, findByIdAndUpdate } = load(ADMIN, true)
    const res = await route.PUT(put({
      provider: 'azure',
      smtp: { ...STORED.smtp, password: SECRET_MASK, host: 'evil.example.net' },
      azure: { fromEmail: '' }
    }))
    expect(res.status).toBe(200)
    expect(findByIdAndUpdate.mock.calls[0][1].emailConfig.smtp.password).toBe('')
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
  function load() {
    const createTransport = jest.fn(() => ({ verify: jest.fn().mockResolvedValue(true), sendMail: jest.fn() }))
    jest.doMock('nodemailer', () => ({ __esModule: true, default: { createTransport }, createTransport }))
    jest.doMock('@/lib/setup-guard', () => ({ rejectUnlessSetupOrPermission: jest.fn().mockResolvedValue(null) }))
    jest.doMock('@/lib/db-config', () => ({ __esModule: true, default: jest.fn() }))
    jest.doMock('@/models/Organization', () => ({
      Organization: { findOne: jest.fn(() => leanResult({ emailConfig: STORED })) }
    }))
    return { route: require('@/app/api/setup/email/test/route'), createTransport }
  }
  const post = (smtp: any) =>
    new NextRequest('http://localhost/x', { method: 'POST', body: JSON.stringify({ provider: 'smtp', smtp }) })

  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {})
    jest.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => jest.restoreAllMocks())

  it('tests with the stored SMTP password, not the placeholder, for the same server', async () => {
    const { route, createTransport } = load()
    await route.POST(post({ ...STORED.smtp, password: SECRET_MASK }))
    expect(createTransport).toHaveBeenCalled()
    expect(JSON.stringify((createTransport.mock.calls[0] as any[])[0])).toContain('real-smtp-pass')
  })

  it('refuses the placeholder with a different host and never connects', async () => {
    const { route, createTransport } = load()
    const res = await route.POST(post({ ...STORED.smtp, password: SECRET_MASK, host: 'evil.example.net' }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe(SECRET_REENTRY_ERROR)
    expect(createTransport).not.toHaveBeenCalled()
  })

  it('refuses the placeholder with a different username', async () => {
    const { route, createTransport } = load()
    const res = await route.POST(post({ ...STORED.smtp, password: SECRET_MASK, username: 'attacker' }))
    expect(res.status).toBe(400)
    expect(createTransport).not.toHaveBeenCalled()
  })
})

describe('POST /api/setup/database/test with the placeholder', () => {
  const ENV: Record<string, string> = {
    MONGODB_HOST: 'db.internal',
    MONGODB_PORT: '27017',
    MONGODB_USERNAME: 'kanvaro',
    MONGODB_PASSWORD: 'real-db-pass'
  }
  const SAME = { host: 'db.internal', port: 27017, database: 'kanvaro', username: 'kanvaro', authSource: 'admin', ssl: false }

  function load(setupCompleted: boolean) {
    Object.assign(process.env, ENV)
    const connect = jest.fn().mockRejectedValue(new Error('stop here'))
    jest.doMock('mongoose', () => ({ __esModule: true, default: { connect, disconnect: jest.fn(), connection: {} } }))
    jest.doMock('@/lib/setup-guard', () => ({
      checkSetupOrPermission: jest.fn().mockResolvedValue({ denied: null, setupCompleted })
    }))
    return { route: require('@/app/api/setup/database/test/route'), connect }
  }
  const post = (body: any) => new NextRequest('http://localhost/x', { method: 'POST', body: JSON.stringify(body) })

  beforeEach(() => jest.spyOn(console, 'error').mockImplementation(() => {}))
  afterEach(() => {
    jest.restoreAllMocks()
    for (const key of Object.keys(ENV)) delete process.env[key]
  })

  it('after setup, uses the real password for the same server', async () => {
    const { route, connect } = load(true)
    await route.POST(post({ ...SAME, password: SECRET_MASK }))
    expect(connect.mock.calls[0][0]).toContain('real-db-pass')
  })

  it('after setup, refuses the placeholder with a different host and never connects', async () => {
    const { route, connect } = load(true)
    const res = await route.POST(post({ ...SAME, host: 'evil.example.net', password: SECRET_MASK }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe(SECRET_REENTRY_ERROR)
    expect(connect).not.toHaveBeenCalled()
  })

  it('after setup, refuses a left-out password with a different host', async () => {
    const { route, connect } = load(true)
    const res = await route.POST(post({ ...SAME, host: 'evil.example.net' }))
    expect(res.status).toBe(400)
    expect(connect).not.toHaveBeenCalled()
  })

  it('before setup (open route), never uses the stored password, even for the same server', async () => {
    const { route, connect } = load(false)
    const res = await route.POST(post({ ...SAME, password: SECRET_MASK }))
    expect(res.status).toBe(400)
    expect(connect).not.toHaveBeenCalled()

    await route.POST(post({ ...SAME }))
    expect(connect).toHaveBeenCalled()
    expect(connect.mock.calls[0][0]).not.toContain('real-db-pass')
  })

  it('a newly typed password is used as typed', async () => {
    const { route, connect } = load(false)
    await route.POST(post({ ...SAME, host: 'my.host', password: 'typed' }))
    expect(connect.mock.calls[0][0]).toContain('typed@my.host')
  })
})
