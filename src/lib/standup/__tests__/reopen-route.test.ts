/**
 * `POST /api/standups/:id/reopen` (Task 18 — RUN-4/5, SEC-1).
 *
 * Real handler invocation, mirroring `blocker-routes.test.ts` and
 * `complete-route.test.ts`: `withStandupIdPermission`'s auth/db layer is
 * mocked, along with `Sprint`, `ProjectStandupSettings` and
 * `PermissionService.getUserPermissions` (the three lookups this route owns
 * per its own docblock), and `reopenStandup` itself is mocked so these tests
 * assert on how the route calls it rather than re-proving the service's own
 * rules (already covered by `reopen-service.integration.test.ts` and
 * `lifecycle.test.ts`).
 */
import { NextRequest } from 'next/server'

import { Permission, Role } from '@/lib/permissions/permission-definitions'
import { StandupError } from '@/lib/standup/errors'
import { STANDUP_VERSION_HEADER } from '@/lib/standup/version-header'

import * as reopenRoute from '@/app/api/standups/[id]/reopen/route'

const reopenStandupMock = jest.fn()
const hasPermission = jest.fn()
const requireProjectAccess = jest.fn()
const getUserPermissions = jest.fn()
const standupFindById = jest.fn()
const sprintFindById = jest.fn()
const settingsFindOne = jest.fn()

jest.mock('@/lib/db-config', () => ({
  __esModule: true,
  default: jest.fn().mockResolvedValue(undefined)
}))

jest.mock('@/lib/auth-utils', () => ({
  authenticateUser: jest.fn().mockResolvedValue({
    user: { id: 'user-1', organization: 'org-1' }
  })
}))

jest.mock('@/lib/permissions/permission-service', () => ({
  PermissionService: {
    hasPermission: (...args: unknown[]) => hasPermission(...args),
    requireProjectAccess: (...args: unknown[]) => requireProjectAccess(...args),
    getUserPermissions: (...args: unknown[]) => getUserPermissions(...args)
  }
}))

jest.mock('@/models/Standup', () => ({
  Standup: {
    findById: (...args: unknown[]) => standupFindById(...args)
  }
}))

jest.mock('@/models/Sprint', () => ({
  Sprint: {
    findById: (...args: unknown[]) => sprintFindById(...args)
  }
}))

jest.mock('@/models/ProjectStandupSettings', () => ({
  ProjectStandupSettings: {
    findOne: (...args: unknown[]) => settingsFindOne(...args)
  }
}))

jest.mock('@/lib/standup/reopen-service', () => ({
  reopenStandup: (...args: unknown[]) => reopenStandupMock(...args)
}))

describe('POST /api/standups/:id/reopen', () => {
  it('exposes the handler', () => {
    expect(typeof reopenRoute.POST).toBe('function')
  })

  it('opts out of static rendering', () => {
    expect(reopenRoute.dynamic).toBe('force-dynamic')
  })

  const buildRequest = (body: unknown, version: string | null = '3') => {
    const headers: Record<string, string> = {}
    if (version !== null) headers[STANDUP_VERSION_HEADER] = version

    return new NextRequest('http://localhost/api/standups/standup-1/reopen', {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    })
  }

  const chainable = (value: unknown) => {
    const chain: any = {
      select: () => chain,
      lean: () => Promise.resolve(value)
    }
    return chain
  }

  beforeEach(() => {
    reopenStandupMock.mockReset()
    hasPermission.mockReset().mockResolvedValue(true)
    requireProjectAccess.mockReset().mockResolvedValue(undefined)
    getUserPermissions.mockReset().mockResolvedValue({ userRole: Role.PROJECT_MANAGER })
    standupFindById.mockReset().mockReturnValue({
      lean: () =>
        Promise.resolve({
          _id: 'standup-1',
          organization: 'org-1',
          project: 'project-1',
          sprint: 'sprint-1',
          version: 3
        })
    })
    sprintFindById.mockReset().mockReturnValue(chainable({ status: 'active' }))
    settingsFindOne.mockReset().mockReturnValue(chainable({ reopenWindowHours: 24 }))
  })

  it('calls reopenStandup with the request-derived fields, the resolved reopen window, and isOrgAdmin=false for a non-admin', async () => {
    const reopened = { standup: { status: 'Reopened' }, affectedDownstreamStandupIds: [] }
    reopenStandupMock.mockResolvedValue(reopened)

    const response = await reopenRoute.POST(
      buildRequest({ reason: 'Logged hours were wrong for two members yesterday' }),
      { params: { id: 'standup-1' } }
    )

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.data).toEqual(reopened)

    expect(reopenStandupMock).toHaveBeenCalledWith(
      expect.objectContaining({
        standupId: 'standup-1',
        reopenedBy: 'user-1',
        organizationId: 'org-1',
        projectId: 'project-1',
        reason: 'Logged hours were wrong for two members yesterday',
        reopenWindowHours: 24,
        expectedVersion: 3,
        isOrgAdmin: false
      })
    )
  })

  it('passes isOrgAdmin=true when the caller is an org Admin', async () => {
    getUserPermissions.mockResolvedValue({ userRole: Role.ADMIN })
    reopenStandupMock.mockResolvedValue({ standup: {}, affectedDownstreamStandupIds: [] })

    await reopenRoute.POST(
      buildRequest({ reason: 'Logged hours were wrong for two members yesterday' }),
      { params: { id: 'standup-1' } }
    )

    expect(reopenStandupMock).toHaveBeenCalledWith(
      expect.objectContaining({ isOrgAdmin: true })
    )
  })

  it('passes isOrgAdmin=true for a Super Admin', async () => {
    getUserPermissions.mockResolvedValue({ userRole: Role.SUPER_ADMIN })
    reopenStandupMock.mockResolvedValue({ standup: {}, affectedDownstreamStandupIds: [] })

    await reopenRoute.POST(
      buildRequest({ reason: 'Logged hours were wrong for two members yesterday' }),
      { params: { id: 'standup-1' } }
    )

    expect(reopenStandupMock).toHaveBeenCalledWith(
      expect.objectContaining({ isOrgAdmin: true })
    )
  })

  it('falls back to the 24h default reopen window when no ProjectStandupSettings row exists', async () => {
    settingsFindOne.mockReturnValue(chainable(null))
    reopenStandupMock.mockResolvedValue({ standup: {}, affectedDownstreamStandupIds: [] })

    await reopenRoute.POST(
      buildRequest({ reason: 'Logged hours were wrong for two members yesterday' }),
      { params: { id: 'standup-1' } }
    )

    expect(reopenStandupMock).toHaveBeenCalledWith(
      expect.objectContaining({ reopenWindowHours: 24 })
    )
  })

  it('refuses with REOPEN_WINDOW_EXPIRED when the sprint is Completed, without ever calling reopenStandup — even for an org Admin', async () => {
    sprintFindById.mockReturnValue(chainable({ status: 'completed' }))
    getUserPermissions.mockResolvedValue({ userRole: Role.ADMIN })

    const response = await reopenRoute.POST(
      buildRequest({ reason: 'Logged hours were wrong for two members yesterday' }),
      { params: { id: 'standup-1' } }
    )

    expect(response.status).toBe(403)
    const body = await response.json()
    expect(body.error.code).toBe('REOPEN_WINDOW_EXPIRED')
    expect(reopenStandupMock).not.toHaveBeenCalled()
  })

  it('requires the stand-up version header, refusing with VALIDATION_FAILED when it is missing', async () => {
    const response = await reopenRoute.POST(
      buildRequest({ reason: 'Logged hours were wrong for two members yesterday' }, null),
      { params: { id: 'standup-1' } }
    )

    expect(response.status).toBe(422)
    const body = await response.json()
    expect(body.error.code).toBe('VALIDATION_FAILED')
    expect(reopenStandupMock).not.toHaveBeenCalled()
  })

  it('gates through the shared stand-up-id wrapper, requiring standup:reopen', async () => {
    hasPermission.mockResolvedValue(false)

    const response = await reopenRoute.POST(
      buildRequest({ reason: 'Logged hours were wrong for two members yesterday' }),
      { params: { id: 'standup-1' } }
    )

    expect(response.status).toBe(403)
    expect(hasPermission).toHaveBeenCalledWith('user-1', Permission.STANDUP_REOPEN, 'project-1')
    expect(reopenStandupMock).not.toHaveBeenCalled()
  })

  it('maps a thrown REOPEN_WINDOW_EXPIRED from the service to a 403 carrying that code', async () => {
    reopenStandupMock.mockRejectedValue(
      new StandupError('REOPEN_WINDOW_EXPIRED', 'The 24-hour reopen window has passed.')
    )

    const response = await reopenRoute.POST(
      buildRequest({ reason: 'Logged hours were wrong for two members yesterday' }),
      { params: { id: 'standup-1' } }
    )

    expect(response.status).toBe(403)
    const body = await response.json()
    expect(body.error.code).toBe('REOPEN_WINDOW_EXPIRED')
  })

  it('404s a stand-up from another organization, without ever calling reopenStandup', async () => {
    standupFindById.mockReturnValue({
      lean: () =>
        Promise.resolve({
          _id: 'standup-1',
          organization: 'org-2',
          project: 'project-1',
          sprint: 'sprint-1',
          version: 3
        })
    })

    const response = await reopenRoute.POST(
      buildRequest({ reason: 'Logged hours were wrong for two members yesterday' }),
      { params: { id: 'standup-1' } }
    )

    expect(response.status).toBe(404)
    expect(reopenStandupMock).not.toHaveBeenCalled()
  })
})
