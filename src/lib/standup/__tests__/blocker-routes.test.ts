/**
 * The Phase 10 blocker routes (Task 9 — RUN-14..18, SEC-1).
 *
 * Two layers of coverage, mirroring `override-routes.test.ts` (Task 6):
 *
 * 1. **Source-inspection contract checks**: `raiseBlocker`/`updateBlocker`
 *    already prove the write rules (a short description refused, a missing
 *    resolution note refused when closing) against the service directly.
 *    This layer confirms the routes are wired the way SEC-1 and RUN-23
 *    require.
 *
 * 2. **Real handler invocation**, with `withStandupIdPermission`'s and
 *    `withBlockerPermission`'s own dependencies mocked. Source-inspection
 *    alone cannot tell "the identifier appears in a comment" from "the
 *    identifier is wired into the code path" — this closes that gap by
 *    actually calling the exported `POST`/`PATCH` and asserting on the real
 *    `Response` each returns.
 */
import fs from 'fs'
import path from 'path'

import { NextRequest } from 'next/server'

import { Permission } from '@/lib/permissions/permission-definitions'
import { StandupError } from '@/lib/standup/errors'

import * as blockersRoute from '@/app/api/standups/[id]/blockers/route'
import * as blockerRoute from '@/app/api/blockers/[id]/route'

const sourceOf = (relative: string) => fs.readFileSync(path.join(process.cwd(), relative), 'utf8')

const raiseSource = sourceOf('src/app/api/standups/[id]/blockers/route.ts')
const updateSource = sourceOf('src/app/api/blockers/[id]/route.ts')
const helpersSource = sourceOf('src/lib/standup/route-helpers.ts')

// --- Mocks for the real-invocation suites below -----------------------------
// Declared at module scope (not nested) so Jest's hoisting places these
// jest.mock() calls above every import in this file, including the static
// `blockersRoute`/`blockerRoute` imports — so those imports already resolve
// against the mocked dependencies below, not the real database or auth stack.
const raiseBlockerMock = jest.fn()
const updateBlockerMock = jest.fn()
const hasPermission = jest.fn()
const requireProjectAccess = jest.fn()
const standupFindById = jest.fn()
const blockerFindById = jest.fn()

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
    requireProjectAccess: (...args: unknown[]) => requireProjectAccess(...args)
  }
}))

jest.mock('@/models/Standup', () => ({
  Standup: {
    findById: (...args: unknown[]) => standupFindById(...args)
  }
}))

jest.mock('@/models/StandupBlocker', () => ({
  StandupBlocker: {
    findById: (...args: unknown[]) => blockerFindById(...args)
  }
}))

jest.mock('@/lib/standup/blocker-service', () => ({
  raiseBlocker: (...args: unknown[]) => raiseBlockerMock(...args),
  updateBlocker: (...args: unknown[]) => updateBlockerMock(...args)
}))

describe('POST /api/standups/:id/blockers', () => {
  it('exposes the handler', () => {
    expect(typeof blockersRoute.POST).toBe('function')
  })

  it('opts out of static rendering', () => {
    expect(blockersRoute.dynamic).toBe('force-dynamic')
  })

  it('gates through the shared stand-up-id wrapper, never ad hoc', () => {
    expect(raiseSource).toContain('withStandupIdPermission')
  })

  it('requires standup:blocker_raise', () => {
    expect(raiseSource).toContain('Permission.STANDUP_BLOCKER_RAISE')
  })

  it('calls raiseBlocker, the seam that actually writes the record and audits it', () => {
    expect(raiseSource).toContain('raiseBlocker')
  })

  it('maps a thrown StandupError to the §17.1 envelope via toErrorResponse', () => {
    expect(raiseSource).toContain('toErrorResponse')
  })

  it('does not require RUN-23 version checking — a blocker is a sibling record, not a mutation of the stand-up document', () => {
    expect(raiseSource).not.toContain('requireStandupVersion')
  })

  it('returns 201 on success, matching a record being created', () => {
    expect(raiseSource).toMatch(/status:\s*201/)
  })
})

describe('PATCH /api/blockers/:id', () => {
  it('exposes the handler', () => {
    expect(typeof blockerRoute.PATCH).toBe('function')
  })

  it('opts out of static rendering', () => {
    expect(blockerRoute.dynamic).toBe('force-dynamic')
  })

  it('gates through the new withBlockerPermission wrapper, never ad hoc', () => {
    expect(updateSource).toContain('withBlockerPermission')
  })

  it('requires standup:blocker_raise', () => {
    expect(updateSource).toContain('Permission.STANDUP_BLOCKER_RAISE')
  })

  it('calls updateBlocker, the seam that actually writes the record and audits it', () => {
    expect(updateSource).toContain('updateBlocker')
  })

  it('maps a thrown StandupError to the §17.1 envelope via toErrorResponse', () => {
    expect(updateSource).toContain('toErrorResponse')
  })

  it('does not require RUN-23 version checking — a blocker is a sibling record, not a mutation of the stand-up document', () => {
    expect(updateSource).not.toContain('requireStandupVersion')
  })
})

describe('withBlockerPermission (route-helpers.ts)', () => {
  it('mirrors withCarryForwardItemPermission structurally: loads StandupBlocker by id, 404 on missing or cross-org, hasPermission check, then hands blockerId/blocker to the handler', () => {
    expect(helpersSource).toContain('export function withBlockerPermission')
    expect(helpersSource).toContain("import('@/models/StandupBlocker')")
    expect(helpersSource).toContain('StandupBlocker.findById')
  })
})

describe('invoking POST for real, with the wrapper wired to mocked auth/db/service', () => {
  const buildRequest = (body: unknown) =>
    new NextRequest('http://localhost/api/standups/standup-1/blockers', {
      method: 'POST',
      body: JSON.stringify(body)
    })

  const validBody = {
    description: 'Waiting on the vendor sandbox credentials before this task can proceed.',
    blockerType: 'external_party',
    severity: 'high'
  }

  beforeEach(() => {
    raiseBlockerMock.mockReset()
    hasPermission.mockReset().mockResolvedValue(true)
    requireProjectAccess.mockReset().mockResolvedValue(undefined)
    standupFindById.mockReset().mockReturnValue({
      lean: () =>
        Promise.resolve({
          _id: 'standup-1',
          organization: 'org-1',
          project: 'project-1',
          sprint: 'sprint-1'
        })
    })
  })

  it('returns 201 with the created blocker, and calls raiseBlocker with the request-derived fields', async () => {
    const created = { _id: 'blocker-1', status: 'open' }
    raiseBlockerMock.mockResolvedValue(created)

    const response = await blockersRoute.POST(buildRequest(validBody), {
      params: { id: 'standup-1' }
    })

    expect(response.status).toBe(201)
    await expect(response.json()).resolves.toEqual(created)

    expect(raiseBlockerMock).toHaveBeenCalledWith(
      expect.objectContaining({
        standupId: 'standup-1',
        sprintId: 'sprint-1',
        projectId: 'project-1',
        organizationId: 'org-1',
        raisedBy: 'user-1',
        description: validBody.description,
        blockerType: 'external_party',
        severity: 'high'
      })
    )
  })

  it('checks the permission against the project the stand-up carries', async () => {
    await blockersRoute.POST(buildRequest(validBody), { params: { id: 'standup-1' } })

    expect(hasPermission).toHaveBeenCalledWith('user-1', Permission.STANDUP_BLOCKER_RAISE, 'project-1')
  })

  it('refuses with a plain 403 when the caller lacks standup:blocker_raise, without ever calling raiseBlocker', async () => {
    hasPermission.mockResolvedValue(false)

    const response = await blockersRoute.POST(buildRequest(validBody), {
      params: { id: 'standup-1' }
    })

    expect(response.status).toBe(403)
    expect(raiseBlockerMock).not.toHaveBeenCalled()
  })

  it('maps a thrown VALIDATION_FAILED StandupError (a short description) to a 422 carrying that code', async () => {
    raiseBlockerMock.mockRejectedValue(
      new StandupError('VALIDATION_FAILED', 'A blocker description needs at least 10 characters.')
    )

    const response = await blockersRoute.POST(
      buildRequest({ ...validBody, description: 'too short' }),
      { params: { id: 'standup-1' } }
    )

    expect(response.status).toBe(422)
    const body = await response.json()
    expect(body.error.code).toBe('VALIDATION_FAILED')
  })
})

describe('invoking PATCH for real, with withBlockerPermission wired to mocked auth/db/service', () => {
  const buildRequest = (body: unknown) =>
    new NextRequest('http://localhost/api/blockers/blocker-1', {
      method: 'PATCH',
      body: JSON.stringify(body)
    })

  beforeEach(() => {
    updateBlockerMock.mockReset()
    hasPermission.mockReset().mockResolvedValue(true)
    requireProjectAccess.mockReset().mockResolvedValue(undefined)
    blockerFindById.mockReset().mockReturnValue({
      lean: () =>
        Promise.resolve({
          _id: 'blocker-1',
          organization: 'org-1',
          project: 'project-1'
        })
    })
  })

  it('resolves a blocker: returns 200 with the updated blocker, and calls updateBlocker with the request-derived fields', async () => {
    const updated = { _id: 'blocker-1', status: 'resolved' }
    updateBlockerMock.mockResolvedValue(updated)

    const response = await blockerRoute.PATCH(buildRequest({
      status: 'resolved',
      resolutionNote: 'Vendor sandbox came back online this morning.'
    }), { params: { id: 'blocker-1' } })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual(updated)

    expect(updateBlockerMock).toHaveBeenCalledWith(
      expect.objectContaining({
        blockerId: 'blocker-1',
        updatedBy: 'user-1',
        organizationId: 'org-1',
        projectId: 'project-1',
        status: 'resolved',
        resolutionNote: 'Vendor sandbox came back online this morning.'
      })
    )
  })

  it('checks the permission against the project the blocker carries', async () => {
    await blockerRoute.PATCH(buildRequest({ status: 'in_progress' }), {
      params: { id: 'blocker-1' }
    })

    expect(hasPermission).toHaveBeenCalledWith('user-1', Permission.STANDUP_BLOCKER_RAISE, 'project-1')
  })

  it('refuses with a plain 403 when the caller lacks standup:blocker_raise, without ever calling updateBlocker', async () => {
    hasPermission.mockResolvedValue(false)

    const response = await blockerRoute.PATCH(buildRequest({ status: 'in_progress' }), {
      params: { id: 'blocker-1' }
    })

    expect(response.status).toBe(403)
    expect(updateBlockerMock).not.toHaveBeenCalled()
  })

  it('maps a thrown VALIDATION_FAILED StandupError (a missing resolution note) to a 422 carrying that code', async () => {
    updateBlockerMock.mockRejectedValue(
      new StandupError(
        'VALIDATION_FAILED',
        'A resolution note needs at least 10 characters when resolving a blocker.'
      )
    )

    const response = await blockerRoute.PATCH(buildRequest({ status: 'resolved' }), {
      params: { id: 'blocker-1' }
    })

    expect(response.status).toBe(422)
    const body = await response.json()
    expect(body.error.code).toBe('VALIDATION_FAILED')
  })

  it('404s on a blocker from another organization, without ever calling updateBlocker', async () => {
    blockerFindById.mockReturnValue({
      lean: () =>
        Promise.resolve({
          _id: 'blocker-1',
          organization: 'org-2',
          project: 'project-1'
        })
    })

    const response = await blockerRoute.PATCH(buildRequest({ status: 'in_progress' }), {
      params: { id: 'blocker-1' }
    })

    expect(response.status).toBe(404)
    expect(updateBlockerMock).not.toHaveBeenCalled()
  })

  it('404s on a blocker that does not exist at all', async () => {
    blockerFindById.mockReturnValue({ lean: () => Promise.resolve(null) })

    const response = await blockerRoute.PATCH(buildRequest({ status: 'in_progress' }), {
      params: { id: 'missing-blocker' }
    })

    expect(response.status).toBe(404)
    expect(updateBlockerMock).not.toHaveBeenCalled()
  })
})
