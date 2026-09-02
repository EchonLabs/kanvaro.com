/**
 * The Phase 10 override route (Task 6 — OVR-1..7, §14.2, §17.6, SEC-1).
 *
 * Two layers of coverage, deliberately different in kind:
 *
 * 1. **Source-inspection contract checks** (the first two `describe` blocks
 *    below), mirroring `variance-routes.test.ts` and
 *    `carry-forward-routes.test.ts`: `issueOverride` already proves the write
 *    rules — O6-O10 refused with OVERRIDE_NOT_PERMITTED, a weak justification
 *    refused, the acknowledgement gate on over-allocation — against a real
 *    database in `override-service.integration.test.ts`. This layer confirms
 *    the route is wired the way SEC-1 and RUN-23 require.
 *
 * 2. **Real handler invocation** (the third `describe` block), with
 *    `withStandupIdPermission`'s own dependencies mocked the way
 *    `route-helpers.project-scope.test.ts` mocks them for
 *    `withStandupPermission`. Source-inspection alone cannot tell "the
 *    identifier appears in a comment" from "the identifier is wired into the
 *    code path" — this closes that gap by actually calling the exported
 *    `POST` and asserting on the real `Response` it returns.
 */
import fs from 'fs'
import path from 'path'

import { NextRequest } from 'next/server'

import { Permission } from '@/lib/permissions/permission-definitions'
import { StandupError } from '@/lib/standup/errors'

import * as overridesRoute from '@/app/api/standups/[id]/overrides/route'

const sourceOf = (relative: string) => fs.readFileSync(path.join(process.cwd(), relative), 'utf8')

const overrides = sourceOf('src/app/api/standups/[id]/overrides/route.ts')

// --- Mocks for the real-invocation suite below ------------------------------
// Declared at module scope (not nested) so Jest's hoisting places these
// jest.mock() calls above every import in this file, including the static
// `overridesRoute` import — so that import already resolves against the
// mocked dependencies below, not the real database or auth stack.
const issueOverrideMock = jest.fn()
const hasPermission = jest.fn()
const requireProjectAccess = jest.fn()
const findById = jest.fn()

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
    findById: (...args: unknown[]) => findById(...args)
  }
}))

jest.mock('@/lib/standup/override-service', () => ({
  issueOverride: (...args: unknown[]) => issueOverrideMock(...args)
}))

describe('POST /api/standups/:id/overrides', () => {
  it('exposes the handler Panel 5/6/7 override actions need', () => {
    expect(typeof overridesRoute.POST).toBe('function')
  })

  it('opts out of static rendering', () => {
    expect(overridesRoute.dynamic).toBe('force-dynamic')
  })

  it('gates through the shared stand-up-id wrapper, never ad hoc', () => {
    expect(overrides).toContain('withStandupIdPermission')
  })

  it('requires standup:override — a distinct power from running or completing a stand-up', () => {
    expect(overrides).toContain('Permission.STANDUP_OVERRIDE')
  })

  it('calls issueOverride, the seam that actually writes the record and audits it', () => {
    expect(overrides).toContain('issueOverride')
  })

  it('maps a thrown StandupError to the §17.1 envelope via toErrorResponse', () => {
    expect(overrides).toContain('toErrorResponse')
  })

  it('does not require RUN-23 version checking — an override is a sibling record, not a mutation of the stand-up document', () => {
    // Precedent: the carry-forward note and resolve routes (Phase 9) skip the
    // version header for the identical reason, and are not flagged for it.
    expect(overrides).not.toContain('requireStandupVersion')
  })

  it('returns 201 on success, matching a record being created', () => {
    expect(overrides).toMatch(/status:\s*201/)
  })
})

describe('the role matrix behind standup:override (SEC-1)', () => {
  const {
    PROJECT_ROLE_PERMISSIONS,
    ProjectRole
  } = require('@/lib/permissions/permission-definitions')

  it('lets a facilitator-capable project role issue an override', () => {
    expect(PROJECT_ROLE_PERMISSIONS[ProjectRole.PROJECT_MANAGER]).toContain(Permission.STANDUP_OVERRIDE)
  })

  it('does not let a project viewer issue an override', () => {
    expect(PROJECT_ROLE_PERMISSIONS[ProjectRole.PROJECT_VIEWER] ?? []).not.toContain(
      Permission.STANDUP_OVERRIDE
    )
  })
})

describe('invoking POST for real, with the wrapper wired to mocked auth/db/service', () => {
  const buildRequest = (body: unknown) =>
    new NextRequest('http://localhost/api/standups/standup-1/overrides', {
      method: 'POST',
      body: JSON.stringify(body)
    })

  const validBody = {
    type: 'under_allocation',
    affectedMemberIds: ['member-1'],
    reasonCode: 'blocked_capacity',
    justification:
      'All of this member’s remaining work is blocked on a vendor sandbox that is down until Monday.',
    gapMinutes: 180
  }

  beforeEach(() => {
    issueOverrideMock.mockReset()
    hasPermission.mockReset().mockResolvedValue(true)
    requireProjectAccess.mockReset().mockResolvedValue(undefined)
    findById.mockReset().mockReturnValue({
      lean: () =>
        Promise.resolve({
          _id: 'standup-1',
          organization: 'org-1',
          project: 'project-1',
          sprint: 'sprint-1'
        })
    })
  })

  it('returns 201 with the created override, and calls issueOverride with the request-derived fields', async () => {
    const created = { _id: 'override-1', type: 'under_allocation' }
    issueOverrideMock.mockResolvedValue(created)

    const response = await overridesRoute.POST(buildRequest(validBody), {
      params: { id: 'standup-1' }
    })

    expect(response.status).toBe(201)
    await expect(response.json()).resolves.toEqual(created)

    expect(issueOverrideMock).toHaveBeenCalledWith(
      expect.objectContaining({
        standupId: 'standup-1',
        sprintId: 'sprint-1',
        projectId: 'project-1',
        organizationId: 'org-1',
        type: 'under_allocation',
        affectedMemberIds: ['member-1'],
        reasonCode: 'blocked_capacity',
        justification: validBody.justification,
        gapMinutes: 180,
        issuedBy: 'user-1'
      })
    )
  })

  it('checks the permission against the project the stand-up carries', async () => {
    await overridesRoute.POST(buildRequest(validBody), { params: { id: 'standup-1' } })

    expect(hasPermission).toHaveBeenCalledWith('user-1', Permission.STANDUP_OVERRIDE, 'project-1')
  })

  it('refuses with a plain 403 when the caller lacks standup:override, without ever calling issueOverride', async () => {
    hasPermission.mockResolvedValue(false)

    const response = await overridesRoute.POST(buildRequest(validBody), {
      params: { id: 'standup-1' }
    })

    expect(response.status).toBe(403)
    expect(issueOverrideMock).not.toHaveBeenCalled()
  })

  it('maps a thrown OVERRIDE_NOT_PERMITTED StandupError (O6-O10) to a 403 carrying that code', async () => {
    issueOverrideMock.mockRejectedValue(
      new StandupError(
        'OVERRIDE_NOT_PERMITTED',
        'unestimated_task_allocation cannot be overridden.',
        { type: 'unestimated_task_allocation' }
      )
    )

    const response = await overridesRoute.POST(
      buildRequest({ ...validBody, type: 'unestimated_task_allocation' }),
      { params: { id: 'standup-1' } }
    )

    expect(response.status).toBe(403)
    const body = await response.json()
    expect(body.error.code).toBe('OVERRIDE_NOT_PERMITTED')
  })

  it('maps a thrown INVALID_JUSTIFICATION StandupError to a 422 carrying that code', async () => {
    issueOverrideMock.mockRejectedValue(
      new StandupError('INVALID_JUSTIFICATION', 'That justification is too short.')
    )

    const response = await overridesRoute.POST(buildRequest(validBody), {
      params: { id: 'standup-1' }
    })

    expect(response.status).toBe(422)
    const body = await response.json()
    expect(body.error.code).toBe('INVALID_JUSTIFICATION')
  })
})
