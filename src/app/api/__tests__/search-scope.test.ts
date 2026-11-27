/**
 * Decision record F4: /api/search returned projects, tasks and users to
 * signed-out callers, was not limited to the caller's projects or
 * organisation, and put the raw search text into $regex.
 */
import { NextRequest } from 'next/server'
import { Role, ROLE_PERMISSIONS } from '@/lib/permissions/permission-definitions'

const perms = (role: Role, projectIds: string[] = []) => ({
  globalPermissions: [...ROLE_PERMISSIONS[role]],
  projectPermissions: new Map(projectIds.map((p) => [p, []])),
  projectRoles: new Map(),
  userRole: role
})

const limits: number[] = []
const chain = (value: any): any => {
  const c: any = {}
  for (const m of ['select', 'skip', 'lean', 'sort', 'populate']) c[m] = jest.fn(() => c)
  c.limit = jest.fn((n: number) => { limits.push(n); return c })
  c.then = (resolve: any, reject: any) => Promise.resolve(value).then(resolve, reject)
  return c
}

const now = new Date()
const doc = (extra: any) => ({ createdAt: now, updatedAt: now, ...extra })

afterEach(() => jest.resetModules())

function load(auth: any, permissions?: any, data: { projects?: any[]; tasks?: any[]; users?: any[] } = {}) {
  jest.doMock('@/lib/db-config', () => ({ __esModule: true, default: jest.fn() }))
  jest.doMock('@/lib/auth-utils', () => ({ authenticateUser: jest.fn().mockResolvedValue(auth) }))
  jest.doMock('@/lib/permissions/permission-service', () => {
    const real = jest.requireActual('@/lib/permissions/permission-service')
    return {
      PermissionService: {
        getUserPermissions: jest.fn().mockResolvedValue(permissions),
        hasPermissionIn: real.PermissionService.hasPermissionIn
      }
    }
  })
  jest.doMock('@/lib/docs/loader', () => ({ DocsLoader: { searchDocs: jest.fn().mockResolvedValue([]) } }))

  const calls: Record<string, any[]> = { Project: [], Task: [], Story: [], Epic: [], Sprint: [], User: [] }
  const model = (name: string, rows: any[] = []) => ({
    find: jest.fn((filter: any) => {
      calls[name].push(filter)
      // The scope lookup (first Project.find) returns the visible projects.
      return chain(name === 'Project' && calls.Project.length === 1 ? data.projects ?? [] : rows)
    })
  })
  jest.doMock('@/models', () => ({
    Project: model('Project', data.projects),
    Task: model('Task', data.tasks),
    Story: model('Story'),
    Epic: model('Epic'),
    Sprint: model('Sprint'),
    User: model('User', data.users)
  }))
  return { route: require('@/app/api/search/route'), calls }
}

const search = (q: string) => new NextRequest('http://localhost/api/search?q=' + encodeURIComponent(q))
const ME = (role: Role) => ({ user: { id: 'u1', organization: 'org1', role } })

it('returns 401 for a signed-out caller and runs no queries', async () => {
  const { route, calls } = load({ error: 'No authentication tokens', status: 401 })
  const res = await route.GET(search('website'))
  expect(res.status).toBe(401)
  expect(calls.Project).toHaveLength(0)
})

it('limits a team member to their own projects in their organisation', async () => {
  const { route, calls } = load(ME(Role.TEAM_MEMBER), perms(Role.TEAM_MEMBER, ['p1']), {
    projects: [doc({ _id: 'p1', name: 'Mine' })]
  })
  await route.GET(search('website'))
  expect(calls.Project[0]).toEqual({ _id: { $in: ['p1'] }, organization: 'org1' })
  expect(calls.Task[0].project).toEqual({ $in: ['p1'] })
  expect(calls.Story[0].project).toEqual({ $in: ['p1'] })
  expect(calls.Epic[0].project).toEqual({ $in: ['p1'] })
  expect(calls.Sprint[0].project).toEqual({ $in: ['p1'] })
})

it('gives an admin every project in their organisation, not the whole database', async () => {
  const { route, calls } = load(ME(Role.ADMIN), perms(Role.ADMIN), {
    projects: [doc({ _id: 'p1', name: 'A' }), doc({ _id: 'p2', name: 'B' })]
  })
  await route.GET(search('website'))
  expect(calls.Project[0]).toEqual({ organization: 'org1' })
  expect(calls.Task[0].project).toEqual({ $in: ['p1', 'p2'] })
})

it('scopes the task display-id fast path too', async () => {
  const { route, calls } = load(ME(Role.TEAM_MEMBER), perms(Role.TEAM_MEMBER, ['p1']), {
    projects: [doc({ _id: 'p1', name: 'Mine' })]
  })
  await route.GET(search('12.3'))
  expect(calls.Task[0]).toEqual({ displayId: '12.3', project: { $in: ['p1'] } })
})

it('searches people only for callers who may list them, and only in their organisation', async () => {
  // A custom role without team:read / user:read (every built-in role has them).
  const noTeamRead = load(ME(Role.TEAM_MEMBER), { ...perms(Role.TEAM_MEMBER), globalPermissions: [] })
  await noTeamRead.route.GET(search('alice'))
  expect(noTeamRead.calls.User.filter((f: any) => f.$or)).toHaveLength(0)

  jest.resetModules()
  const admin = load(ME(Role.ADMIN), perms(Role.ADMIN))
  await admin.route.GET(search('alice'))
  const userSearch = admin.calls.User.find((f: any) => f.$or)
  expect(userSearch.organization).toBe('org1')
})

it('escapes regex characters in the query but still matches the literal text', async () => {
  const { route, calls } = load(ME(Role.ADMIN), perms(Role.ADMIN), {
    projects: [doc({ _id: 'p1', name: 'a.*b' })],
    tasks: [doc({ _id: 't1', title: 'fix a.*b now', project: 'p1', assignedTo: [] })]
  })
  const res = await route.GET(search('a.*b'))
  expect(calls.Task[0].$or[0].title.$regex).toBe('a\\.\\*b')
  const body = await res.json()
  expect(body.results.map((r: any) => r.id)).toContain('t1')
})

it('caps the page size at 50', async () => {
  const { route, calls } = load(ME(Role.ADMIN), perms(Role.ADMIN), { projects: [doc({ _id: 'p1', name: 'A' })] })
  limits.length = 0
  await route.GET(new NextRequest('http://localhost/api/search?q=website&limit=100000'))
  expect(calls.Task.length).toBeGreaterThan(0)
  expect(limits.length).toBeGreaterThan(0)
  expect(Math.max(...limits)).toBe(50)
})
