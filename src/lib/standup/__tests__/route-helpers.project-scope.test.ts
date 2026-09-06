/**
 * Project scoping in `withStandupPermission` (SEC-1).
 *
 * Stand-up permissions are PROJECT-scoped, and most non-admin roles hold them
 * through project membership rather than organisation-wide. `hasPermission`
 * returns false for a project-scoped permission when it is given no project, so
 * a route that never resolves one silently degrades into "org-wide grant only":
 * admins pass, the team members the screen is built for get a 403.
 *
 * `/api/standup/health` is the case — one endpoint for the whole module, with
 * no dynamic segment to read a project from. It narrows with `?projectId=`, and
 * these tests pin that the query value actually reaches the permission check
 * and the project-access check, rather than only the database query underneath.
 */
import { NextRequest } from 'next/server'

const hasPermission = jest.fn()
const requireProjectAccess = jest.fn()

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

const { withStandupPermission } = require('../route-helpers')
const { Permission } = require('@/lib/permissions/permission-definitions')

const request = (url: string) => new NextRequest(new URL(url, 'http://localhost'))

describe('withStandupPermission resolves the project from the query', () => {
  beforeEach(() => {
    hasPermission.mockReset().mockResolvedValue(true)
    requireProjectAccess.mockReset().mockResolvedValue(undefined)
  })

  const handler = jest.fn(async () => new Response('ok') as any)

  const route = () =>
    withStandupPermission(
      { permission: Permission.STANDUP_VIEW, projectIdQuery: 'projectId' },
      handler
    )

  it('checks the permission against the project in ?projectId=', async () => {
    await route()(request('/api/standup/health?projectId=project-1'), {})

    expect(hasPermission).toHaveBeenCalledWith('user-1', Permission.STANDUP_VIEW, 'project-1')
  })

  it('verifies project access as well as the permission', async () => {
    await route()(request('/api/standup/health?projectId=project-1'), {})

    expect(requireProjectAccess).toHaveBeenCalledWith('user-1', 'project-1')
  })

  it('passes the project on to the handler', async () => {
    const captured: any[] = []
    const capturing = withStandupPermission(
      { permission: Permission.STANDUP_VIEW, projectIdQuery: 'projectId' },
      async (_request: NextRequest, context: any) => {
        captured.push(context)
        return new Response('ok') as any
      }
    )

    await capturing(request('/api/standup/health?projectId=project-1'), {})

    expect(captured[0].projectId).toBe('project-1')
  })

  it('refuses when the caller holds the permission on some other project', async () => {
    // What a team member looks like: the grant exists, but not here.
    hasPermission.mockResolvedValue(false)

    const response = await route()(request('/api/standup/health?projectId=project-2'), {})

    expect(response.status).toBe(403)
    expect(requireProjectAccess).not.toHaveBeenCalled()
  })

  it('falls back to an org-scoped check when no project is named', async () => {
    await route()(request('/api/standup/health'), {})

    expect(hasPermission).toHaveBeenCalledWith('user-1', Permission.STANDUP_VIEW, undefined)
    expect(requireProjectAccess).not.toHaveBeenCalled()
  })

  it('ignores the query when the route has a project param of its own', async () => {
    const paramRoute = withStandupPermission(
      { permission: Permission.STANDUP_VIEW, projectIdParam: 'id' },
      handler
    )

    // A caller must not be able to widen their own check by appending a
    // ?projectId= they do happen to have access to.
    await paramRoute(request('/api/projects/project-1/x?projectId=project-9'), {
      params: { id: 'project-1' }
    })

    expect(hasPermission).toHaveBeenCalledWith('user-1', Permission.STANDUP_VIEW, 'project-1')
  })
})

describe('the health route narrows to the requested project', () => {
  const fs = require('fs')
  const path = require('path')

  const source = fs.readFileSync(
    path.join(process.cwd(), 'src/app/api/standup/health/route.ts'),
    'utf8'
  )

  it('declares projectIdQuery so the check is not org-scoped', () => {
    expect(source).toContain("projectIdQuery: 'projectId'")
  })

  it('takes the project from the helper rather than re-reading the query', () => {
    // Two readings of the same parameter is how the check and the data drift
    // apart: the helper would verify one project and the query answer another.
    expect(source).not.toContain("searchParams.get('projectId')")
  })
})
