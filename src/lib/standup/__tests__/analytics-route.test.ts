/**
 * `GET /api/sprints/:id/analytics` (§15.15).
 *
 * The route's only decisions are who may read the report and which of its
 * two shapes they get, so that is all this proves: refused without
 * `standup:view_analytics`, the aggregate view by default, and the full view
 * only for a `standup:view_debt` holder (NFR-13). The shapes themselves are
 * `analytics-payload.test.ts`'s job.
 */
import fs from 'fs'
import path from 'path'

import { NextRequest } from 'next/server'

import { Permission } from '@/lib/permissions/permission-definitions'

import * as analyticsRoute from '@/app/api/sprints/[id]/analytics/route'

const SPRINT_ID = '0123456789abcdef01234567'
const PROJECT_ID = 'abcdef0123456789abcdef01'

const hasPermission = jest.fn()
const sprintFindById = jest.fn()
const getSprintAnalytics = jest.fn()

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
    hasPermission: (...args: unknown[]) => hasPermission(...args)
  }
}))

jest.mock('@/models/Sprint', () => ({
  Sprint: {
    findById: (...args: unknown[]) => sprintFindById(...args)
  }
}))

jest.mock('@/lib/standup/analytics-service', () => ({
  getSprintAnalytics: (...args: unknown[]) => getSprintAnalytics(...args)
}))

const sprint = { _id: SPRINT_ID, organization: 'org-1', project: PROJECT_ID, name: 'Sprint 14' }

function call() {
  return analyticsRoute.GET(new NextRequest(`http://localhost/api/sprints/${SPRINT_ID}/analytics`), {
    params: { id: SPRINT_ID }
  })
}

function grant(...permissions: Permission[]) {
  hasPermission.mockImplementation(async (_userId: string, permission: Permission) =>
    permissions.includes(permission)
  )
}

describe('GET /api/sprints/:id/analytics', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    sprintFindById.mockReturnValue({ lean: () => Promise.resolve(sprint) })
    getSprintAnalytics.mockImplementation(async (_sprint: unknown, view: string) => ({ view }))
  })

  it('refuses a caller without standup:view_analytics', async () => {
    grant(Permission.STANDUP_VIEW_DEBT)

    const response = await call()

    expect(response.status).toBe(403)
    expect(getSprintAnalytics).not.toHaveBeenCalled()
  })

  it('gives the aggregate view to a caller who cannot see individual debt', async () => {
    grant(Permission.STANDUP_VIEW_ANALYTICS)

    const response = await call()

    expect(response.status).toBe(200)
    expect(getSprintAnalytics).toHaveBeenCalledWith(sprint, 'aggregate')
    expect(await response.json()).toEqual({ success: true, data: { view: 'aggregate' } })
  })

  it('gives the full view to a standup:view_debt holder, checked on the sprint\'s own project', async () => {
    grant(Permission.STANDUP_VIEW_ANALYTICS, Permission.STANDUP_VIEW_DEBT)

    const response = await call()

    expect(response.status).toBe(200)
    expect(getSprintAnalytics).toHaveBeenCalledWith(sprint, 'full')
    expect(hasPermission).toHaveBeenCalledWith('user-1', Permission.STANDUP_VIEW_DEBT, PROJECT_ID)
  })

  it('is never cached', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'src/app/api/sprints/[id]/analytics/route.ts'),
      'utf8'
    )

    expect(source).toContain("export const dynamic = 'force-dynamic'")
  })
})
