/**
 * Debug routes (user list, config, config reset) had no sign-in. They must not
 * exist in production and must need an admin in development.
 */
const authenticateUser = jest.fn()

jest.mock('server-only', () => ({}))
jest.mock('next/server', () => ({
  NextResponse: { json: (body: any, init?: { status?: number }) => ({ body, status: init?.status ?? 200 }) }
}))
jest.mock('@/lib/auth-utils', () => ({ authenticateUser: () => authenticateUser() }))
jest.mock('@/lib/permissions/permission-definitions', () => ({
  Role: { SUPER_ADMIN: 'super_admin', ADMIN: 'admin' }
}))

import { rejectUnlessDevAdmin } from '../debug-guard'

const env = process.env as Record<string, string | undefined>
const originalEnv = env.NODE_ENV

afterEach(() => {
  env.NODE_ENV = originalEnv
  jest.clearAllMocks()
})

describe('rejectUnlessDevAdmin', () => {
  it('returns 404 in production without even checking sign-in', async () => {
    env.NODE_ENV = 'production'
    expect(await rejectUnlessDevAdmin()).toMatchObject({ status: 404 })
    expect(authenticateUser).not.toHaveBeenCalled()
  })

  it('returns 404 in production even for an admin', async () => {
    env.NODE_ENV = 'production'
    authenticateUser.mockResolvedValue({ user: { id: 'a', role: 'admin' } })
    expect(await rejectUnlessDevAdmin()).toMatchObject({ status: 404 })
  })

  describe('in development', () => {
    beforeEach(() => { env.NODE_ENV = 'development' })

    it('returns 401 when signed out', async () => {
      authenticateUser.mockResolvedValue({ error: 'No authentication tokens', status: 401 })
      expect(await rejectUnlessDevAdmin()).toMatchObject({ status: 401 })
    })

    it.each(['team_member', 'project_manager', 'viewer', 'client', 'human_resource'])(
      'returns 403 for %s',
      async (role) => {
        authenticateUser.mockResolvedValue({ user: { id: 'u', role } })
        expect(await rejectUnlessDevAdmin()).toMatchObject({ status: 403 })
      }
    )

    it.each(['admin', 'super_admin'])('allows %s', async (role) => {
      authenticateUser.mockResolvedValue({ user: { id: 'u', role } })
      expect(await rejectUnlessDevAdmin()).toBeNull()
    })
  })
})
