/**
 * Decision record §2.4 "never exposed" routes that are still reachable over
 * HTTP must at least require the right caller:
 * - test-email sends mail through the org's server to any address → needs
 *   settings:manage_email, not just a sign-in.
 * - email/config → needs a sign-in.
 * - cron/task-deadlines builds reminder-email links; a spoofed Host header must
 *   not be able to point them at another site.
 */
import { NextRequest } from 'next/server'

afterEach(() => {
  jest.resetModules()
  delete process.env.NEXT_PUBLIC_APP_URL
  delete process.env.CRON_SECRET
})

function mockAuth(result: any, permitted = false) {
  const hasPermission = jest.fn().mockResolvedValue(permitted)
  jest.doMock('@/lib/db-config', () => ({ __esModule: true, default: jest.fn() }))
  jest.doMock('@/lib/auth-utils', () => ({ authenticateUser: jest.fn().mockResolvedValue(result) }))
  jest.doMock('@/lib/permissions/permission-service', () => ({ PermissionService: { hasPermission } }))
  return { hasPermission }
}

const post = (body: unknown) =>
  new NextRequest('http://localhost/x', { method: 'POST', body: JSON.stringify(body) })

describe('POST /api/test-email', () => {
  function load(auth: any, permitted: boolean) {
    const sendEmail = jest.fn().mockResolvedValue(true)
    const { hasPermission } = mockAuth(auth, permitted)
    jest.doMock('@/lib/email/EmailService', () => ({ emailService: { sendEmail } }))
    return { route: require('@/app/api/test-email/route'), sendEmail, hasPermission }
  }

  it('returns 401 when signed out', async () => {
    const { route, sendEmail } = load({ error: 'No authentication tokens', status: 401 }, false)
    const res = await route.POST(post({ email: 'x@example.com' }))
    expect(res.status).toBe(401)
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('returns 403 and sends nothing without settings:manage_email', async () => {
    const { route, sendEmail, hasPermission } = load({ user: { id: 'u1' } }, false)
    const res = await route.POST(post({ email: 'x@example.com' }))
    expect(res.status).toBe(403)
    expect(hasPermission).toHaveBeenCalledWith('u1', 'settings:manage_email')
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('sends with the permission', async () => {
    const { route, sendEmail } = load({ user: { id: 'u1' } }, true)
    const res = await route.POST(post({ email: 'x@example.com' }))
    expect(res.status).toBe(200)
    expect(sendEmail).toHaveBeenCalled()
  })
})

describe('GET /api/email/config', () => {
  function load(auth: any) {
    const findOne = jest.fn().mockResolvedValue({ emailConfig: { provider: 'smtp', smtp: { fromEmail: 'a@b.c' } } })
    mockAuth(auth)
    jest.doMock('@/models/Organization', () => ({ Organization: { findOne } }))
    return { route: require('@/app/api/email/config/route'), findOne }
  }

  it('returns 401 when signed out and does not read the organisation', async () => {
    const { route, findOne } = load({ error: 'No authentication tokens', status: 401 })
    const res = await route.GET()
    expect(res.status).toBe(401)
    expect(findOne).not.toHaveBeenCalled()
  })

  it('returns the summary when signed in', async () => {
    const { route } = load({ user: { id: 'u1' } })
    const res = await route.GET()
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ configured: true, provider: 'smtp' })
  })
})

describe('GET /api/cron/task-deadlines', () => {
  function load() {
    const processTaskDeadlines = jest.fn().mockResolvedValue({})
    jest.doMock('@/lib/cron/task-deadlines', () => ({ processTaskDeadlines }))
    return { route: require('@/app/api/cron/task-deadlines/route'), processTaskDeadlines }
  }

  const request = (headers: Record<string, string>) =>
    new NextRequest('http://localhost/api/cron/task-deadlines', { headers })

  it('uses NEXT_PUBLIC_APP_URL for links, ignoring a spoofed Host header', async () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://kanvaro.example.com/'
    const { route, processTaskDeadlines } = load()
    await route.GET(request({ host: 'evil.example.net' }))
    expect(processTaskDeadlines).toHaveBeenCalledWith('https://kanvaro.example.com')
  })

  it('enforces CRON_SECRET when set', async () => {
    process.env.CRON_SECRET = 's3cret'
    const { route, processTaskDeadlines } = load()
    expect((await route.GET(request({ authorization: 'Bearer wrong' }))).status).toBe(401)
    expect(processTaskDeadlines).not.toHaveBeenCalled()
    expect((await route.GET(request({ authorization: 'Bearer s3cret' }))).status).toBe(200)
  })

  it('stays open when CRON_SECRET is unset (CRON-1, unchanged)', async () => {
    const { route } = load()
    expect((await route.GET(request({}))).status).toBe(200)
  })
})
