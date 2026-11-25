/**
 * Setup routes create the admin account with no sign-in. They must refuse once
 * the installation is set up, otherwise anyone can POST /api/setup/complete and
 * overwrite the real admin's password.
 */
const loadConfig = jest.fn()
const estimatedDocumentCount = jest.fn()
const authenticateUser = jest.fn()
const hasPermission = jest.fn()

jest.mock('server-only', () => ({}))
jest.mock('next/server', () => ({
  NextResponse: { json: (body: any, init?: { status?: number }) => ({ body, status: init?.status ?? 200 }) }
}))
jest.mock('@/lib/config', () => ({ loadConfig: () => loadConfig() }))
jest.mock('@/lib/db-config', () => ({ __esModule: true, default: jest.fn() }))
jest.mock('@/models/User', () => ({ User: { estimatedDocumentCount: () => estimatedDocumentCount() } }))
jest.mock('@/lib/auth-utils', () => ({ authenticateUser: () => authenticateUser() }))
jest.mock('@/lib/permissions/permission-service', () => ({
  PermissionService: { hasPermission: (...args: any[]) => hasPermission(...args) }
}))
jest.mock('@/lib/permissions/permission-definitions', () => ({
  Permission: { SETTINGS_MANAGE_DATABASE: 'settings:manage_database' }
}))

import { getSetupState, rejectIfSetupCompleted, rejectUnlessSetupOrPermission } from '../setup-guard'

const PERM = 'settings:manage_database' as any

beforeEach(() => jest.clearAllMocks())

describe('getSetupState', () => {
  it('is not completed when config says not completed (and skips the DB)', async () => {
    loadConfig.mockReturnValue({ setupCompleted: false })
    expect((await getSetupState()).setupCompleted).toBe(false)
    expect(estimatedDocumentCount).not.toHaveBeenCalled()
  })

  it('is not completed when config says completed but the DB has no users', async () => {
    loadConfig.mockReturnValue({ setupCompleted: true })
    estimatedDocumentCount.mockResolvedValue(0)
    expect((await getSetupState()).setupCompleted).toBe(false)
  })

  it('is completed when config says so and users exist', async () => {
    loadConfig.mockReturnValue({ setupCompleted: true })
    estimatedDocumentCount.mockResolvedValue(3)
    expect((await getSetupState()).setupCompleted).toBe(true)
  })
})

describe('rejectIfSetupCompleted', () => {
  it('allows the wizard before setup', async () => {
    loadConfig.mockReturnValue({ setupCompleted: false })
    expect(await rejectIfSetupCompleted()).toBeNull()
  })

  it('returns 403 after setup', async () => {
    loadConfig.mockReturnValue({ setupCompleted: true })
    estimatedDocumentCount.mockResolvedValue(1)
    expect(await rejectIfSetupCompleted()).toMatchObject({ status: 403 })
  })
})

describe('rejectUnlessSetupOrPermission', () => {
  beforeEach(() => {
    loadConfig.mockReturnValue({ setupCompleted: true })
    estimatedDocumentCount.mockResolvedValue(1)
  })

  it('is open during setup without sign-in', async () => {
    loadConfig.mockReturnValue({ setupCompleted: false })
    expect(await rejectUnlessSetupOrPermission(PERM)).toBeNull()
    expect(authenticateUser).not.toHaveBeenCalled()
  })

  it('returns 401 after setup when signed out', async () => {
    authenticateUser.mockResolvedValue({ error: 'No authentication tokens', status: 401 })
    expect(await rejectUnlessSetupOrPermission(PERM)).toMatchObject({ status: 401 })
  })

  it('returns 403 after setup without the permission', async () => {
    authenticateUser.mockResolvedValue({ user: { id: 'u1' } })
    hasPermission.mockResolvedValue(false)
    expect(await rejectUnlessSetupOrPermission(PERM)).toMatchObject({ status: 403 })
  })

  it('allows after setup with the permission', async () => {
    authenticateUser.mockResolvedValue({ user: { id: 'u1' } })
    hasPermission.mockResolvedValue(true)
    expect(await rejectUnlessSetupOrPermission(PERM)).toBeNull()
    expect(hasPermission).toHaveBeenCalledWith('u1', PERM)
  })
})
