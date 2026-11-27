/**
 * Decision record F2 + F3 for time tracking:
 * - timer / logs / reports / reports/budget had no sign-in and trusted
 *   userId / organizationId from the request.
 * - entries/[id] GET had no sign-in at all.
 * - hourly rates could be set by the client.
 * - auth/me and the entries/hr/bulk-upload routes read only the cookie.
 */
import { NextRequest } from 'next/server'
import { Permission, Role, ROLE_PERMISSIONS } from '@/lib/permissions/permission-definitions'

const SIGNED_OUT = { error: 'No authentication tokens', status: 401 }
const me = (role: Role, id = 'u1') => ({ user: { id, organization: 'org1', email: 'x@y.z', role } })
const perms = (role: Role, projectIds: string[] = []) => ({
  globalPermissions: [...ROLE_PERMISSIONS[role]],
  projectPermissions: new Map(projectIds.map((p) => [p, []])),
  projectRoles: new Map(),
  userRole: role
})

/** A query chain: .populate/.select/.sort/.lean all return itself; awaiting resolves to `value`. */
const chain = (value: any): any => {
  const c: any = {}
  for (const m of ['populate', 'select', 'sort', 'lean', 'skip', 'limit']) c[m] = jest.fn(() => c)
  c.then = (resolve: any, reject: any) => Promise.resolve(value).then(resolve, reject)
  return c
}

afterEach(() => jest.resetModules())

function mockAuth(auth: any, permissions?: any) {
  jest.doMock('@/lib/db-config', () => ({ __esModule: true, default: jest.fn() }))
  jest.doMock('@/lib/auth-utils', () => ({
    authenticateUser: jest.fn().mockResolvedValue(auth),
    authenticateUserWithDocument: jest.fn().mockResolvedValue(auth)
  }))
  jest.doMock('@/lib/permissions/permission-service', () => {
    const real = jest.requireActual('@/lib/permissions/permission-service')
    return {
      PermissionService: {
        getUserPermissions: jest.fn().mockResolvedValue(permissions),
        hasPermissionIn: real.PermissionService.hasPermissionIn,
        canAccessProjectIn: real.PermissionService.canAccessProjectIn,
        hasPermission: jest.fn(async (_id: string, p: string) => permissions?.globalPermissions.includes(p))
      }
    }
  })
}

const get = (url: string) => new NextRequest(url)
const send = (method: string, body: unknown) =>
  new NextRequest('http://localhost/x', { method, body: JSON.stringify(body) })

describe('/api/time-tracking/timer', () => {
  function load(auth: any, project: any = null, permissions: any = perms(Role.TEAM_MEMBER)) {
    mockAuth(auth, permissions)
    const activeTimerFindOne = jest.fn(() => chain(null))
    jest.doMock('@/models/ActiveTimer', () => ({ ActiveTimer: { findOne: activeTimerFindOne } }))
    jest.doMock('@/models/Project', () => ({ Project: { findById: jest.fn().mockResolvedValue(project) } }))
    jest.doMock('@/lib/time-tracking-server', () => ({
      getEffectiveTimeTrackingSettings: jest.fn().mockResolvedValue({}),
      getDailyHoursLogged: jest.fn().mockResolvedValue(0),
      calculateCurrentDurationMinutes: jest.fn(),
      stopTimerInternal: jest.fn(),
      enforceTimerLimitsInternal: jest.fn(),
      getIdString: (v: any) => String(v)
    }))
    return { route: require('@/app/api/time-tracking/timer/route'), activeTimerFindOne }
  }

  it('GET returns 401 when signed out', async () => {
    const { route, activeTimerFindOne } = load(SIGNED_OUT)
    const res = await route.GET(get('http://localhost/x?userId=victim&organizationId=org1'))
    expect(res.status).toBe(401)
    expect(activeTimerFindOne).not.toHaveBeenCalled()
  })

  it('GET reads the signed-in user\'s timer, ignoring ?userId= and ?organizationId=', async () => {
    const { route, activeTimerFindOne } = load(me(Role.TEAM_MEMBER))
    await route.GET(get('http://localhost/x?userId=victim&organizationId=other-org'))
    expect(activeTimerFindOne).toHaveBeenCalledWith({ user: 'u1', organization: 'org1' })
  })

  it('POST refuses a project in another organisation', async () => {
    const project = { _id: 'p1', organization: 'other-org', settings: { allowTimeTracking: true } }
    const { route } = load(me(Role.ADMIN), project, perms(Role.ADMIN))
    expect((await route.POST(send('POST', { projectId: 'p1' }))).status).toBe(403)
  })

  it('POST refuses a project the user cannot see', async () => {
    const project = { _id: 'p1', organization: 'org1', settings: { allowTimeTracking: true } }
    const { route } = load(me(Role.TEAM_MEMBER), project, perms(Role.TEAM_MEMBER, ['some-other-project']))
    expect((await route.POST(send('POST', { projectId: 'p1' }))).status).toBe(403)
  })

  it('POST checks the existing timer of the signed-in user, not body.userId', async () => {
    const { route, activeTimerFindOne } = load(me(Role.TEAM_MEMBER))
    await route.POST(send('POST', { userId: 'victim', organizationId: 'other-org', projectId: 'p1' }))
    expect(activeTimerFindOne).toHaveBeenCalledWith({ user: 'u1', organization: 'org1' })
  })
})

describe('/api/time-tracking/logs', () => {
  it('GET returns 401 when signed out', async () => {
    mockAuth(SIGNED_OUT)
    jest.doMock('@/models/ActiveTimer', () => ({ ActiveTimer: { findOne: jest.fn(() => chain(null)) } }))
    const route = require('@/app/api/time-tracking/logs/route')
    expect((await route.GET(get('http://localhost/x?userId=a&organizationId=b'))).status).toBe(401)
  })
})

describe('GET /api/time-tracking/reports', () => {
  function load(auth: any, permissions: any, assigned: string[] = []) {
    mockAuth(auth, permissions)
    const aggregate = jest.fn().mockResolvedValue([])
    const find = jest.fn(() => chain([]))
    jest.doMock('@/models/TimeEntry', () => ({ TimeEntry: { aggregate, find, countDocuments: jest.fn().mockResolvedValue(0) } }))
    jest.doMock('@/models/User', () => ({ User: { find: jest.fn(() => chain(assigned.map((id) => ({ _id: id })))) } }))
    jest.doMock('@/models/Project', () => ({ Project: { find: jest.fn(() => chain([])) } }))
    jest.doMock('@/models/Organization', () => ({ Organization: { findById: jest.fn(() => chain(null)) } }))
    return { route: require('@/app/api/time-tracking/reports/route'), aggregate, find }
  }

  const firstQuery = (aggregate: jest.Mock, find: jest.Mock) =>
    aggregate.mock.calls[0]?.[0]?.[0]?.$match ?? find.mock.calls[0]?.[0]

  it('returns 401 when signed out', async () => {
    const { route } = load(SIGNED_OUT, undefined)
    expect((await route.GET(get('http://localhost/x?organizationId=org1'))).status).toBe(401)
  })

  it('returns 403 without time_tracking:report_access', async () => {
    const { route } = load(me(Role.TEAM_MEMBER), perms(Role.TEAM_MEMBER))
    expect((await route.GET(get('http://localhost/x'))).status).toBe(403)
  })

  it('uses the signed-in organisation, ignoring ?organizationId=', async () => {
    const { route, aggregate, find } = load(me(Role.ADMIN), perms(Role.ADMIN))
    await route.GET(get('http://localhost/x?organizationId=other-org'))
    expect(firstQuery(aggregate, find).organization).toBe('org1')
  })

  it('limits a viewer without view_all to themselves', async () => {
    const limited = { ...perms(Role.TEAM_MEMBER), globalPermissions: [Permission.TIME_LOG_REPORT_ACCESS] }
    const { route, aggregate, find } = load(me(Role.TEAM_MEMBER), limited)
    await route.GET(get('http://localhost/x'))
    expect(firstQuery(aggregate, find).user).toEqual({ $in: ['u1'] })
  })

  it('refuses a specific user the viewer may not see', async () => {
    const limited = { ...perms(Role.TEAM_MEMBER), globalPermissions: [Permission.TIME_LOG_REPORT_ACCESS] }
    const { route } = load(me(Role.TEAM_MEMBER), limited)
    expect((await route.GET(get('http://localhost/x?userId=someone-else'))).status).toBe(403)
  })

  it('lets view_assigned see the people assigned to them', async () => {
    const assignedPerms = {
      ...perms(Role.TEAM_MEMBER),
      globalPermissions: [Permission.TIME_LOG_REPORT_ACCESS, Permission.TIME_TRACKING_VIEW_ASSIGNED]
    }
    const { route, aggregate, find } = load(me(Role.TEAM_MEMBER), assignedPerms, ['report1'])
    await route.GET(get('http://localhost/x?userId=report1'))
    expect(firstQuery(aggregate, find).user).toBe('report1')
  })
})

describe('GET /api/time-tracking/reports/budget', () => {
  function load(auth: any, permissions: any) {
    mockAuth(auth, permissions)
    const orgFind = jest.fn(() => chain(null))
    jest.doMock('@/models/Organization', () => ({ Organization: { findById: orgFind } }))
    jest.doMock('@/models/User', () => ({ User: { find: jest.fn(() => chain([])) } }))
    jest.doMock('@/models/TimeEntry', () => ({ TimeEntry: { find: jest.fn(() => chain([])) } }))
    jest.doMock('@/models/Project', () => ({ Project: { find: jest.fn(() => chain([])) } }))
    return { route: require('@/app/api/time-tracking/reports/budget/route'), orgFind }
  }

  it('returns 401 when signed out', async () => {
    const { route } = load(SIGNED_OUT, undefined)
    expect((await route.GET(get('http://localhost/x?organizationId=org1'))).status).toBe(401)
  })

  it('returns 403 for a viewer, even though viewers hold financial:read', async () => {
    const { route, orgFind } = load(me(Role.VIEWER), perms(Role.VIEWER))
    expect((await route.GET(get('http://localhost/x'))).status).toBe(403)
    expect(orgFind).not.toHaveBeenCalled()
  })

  it('reads the signed-in organisation for an admin', async () => {
    const { route, orgFind } = load(me(Role.ADMIN), perms(Role.ADMIN))
    await route.GET(get('http://localhost/x?organizationId=other-org'))
    expect(orgFind).toHaveBeenCalledWith('org1')
  })
})

describe('/api/time-tracking/entries/:id', () => {
  function load(auth: any, permissions: any, entry: any) {
    mockAuth(auth, permissions)
    jest.doMock('@/models/TimeEntry', () => ({
      TimeEntry: { findById: jest.fn(() => chain(entry)) }
    }))
    jest.doMock('@/models/User', () => ({ User: { findById: jest.fn(() => chain(null)) } }))
    jest.doMock('@/models/TimeTrackingSettings', () => ({ TimeTrackingSettings: { findOne: jest.fn(() => chain(null)) } }))
    return require('@/app/api/time-tracking/entries/[id]/route')
  }

  const entryOf = (owner: string, extra: any = {}) => ({
    _id: 'e1', user: owner, organization: 'org1', project: 'p1', startTime: new Date(), endTime: new Date(),
    save: jest.fn(), populate: jest.fn().mockResolvedValue(undefined), toObject: () => ({}), ...extra
  })

  it('GET returns 401 when signed out (it had no sign-in at all)', async () => {
    const route = load(SIGNED_OUT, undefined, entryOf('u1'))
    expect((await route.GET(get('http://localhost/x'), { params: { id: 'e1' } })).status).toBe(401)
  })

  it('GET returns your own entry', async () => {
    const route = load(me(Role.TEAM_MEMBER), perms(Role.TEAM_MEMBER), entryOf('u1'))
    expect((await route.GET(get('http://localhost/x'), { params: { id: 'e1' } })).status).toBe(200)
  })

  it('GET hides someone else\'s entry from a team member (404, not 403)', async () => {
    const route = load(me(Role.TEAM_MEMBER), perms(Role.TEAM_MEMBER), entryOf('someone-else'))
    expect((await route.GET(get('http://localhost/x'), { params: { id: 'e1' } })).status).toBe(404)
  })

  it('GET lets view_all see anyone\'s entry', async () => {
    const route = load(me(Role.ADMIN), perms(Role.ADMIN), entryOf('someone-else'))
    expect((await route.GET(get('http://localhost/x'), { params: { id: 'e1' } })).status).toBe(200)
  })

  it('GET hides an entry from another organisation', async () => {
    const route = load(me(Role.ADMIN), perms(Role.ADMIN), entryOf('u1', { organization: 'other-org' }))
    expect((await route.GET(get('http://localhost/x'), { params: { id: 'e1' } })).status).toBe(404)
  })

  it('PUT ignores hourlyRate from a team member editing their own entry', async () => {
    const entry = entryOf('u1', { hourlyRate: 10 })
    const route = load(me(Role.TEAM_MEMBER), perms(Role.TEAM_MEMBER), entry)
    await route.PUT(send('PUT', { hourlyRate: 9999, description: 'edited' }), { params: { id: 'e1' } })
    expect(entry.hourlyRate).toBe(10)
    expect((entry as any).description).toBe('edited')
  })

  it('PUT lets an admin change the hourly rate', async () => {
    const entry = entryOf('u1', { hourlyRate: 10 })
    const route = load(me(Role.ADMIN), perms(Role.ADMIN), entry)
    await route.PUT(send('PUT', { hourlyRate: 25 }), { params: { id: 'e1' } })
    expect(entry.hourlyRate).toBe(25)
  })
})

describe('GET /api/auth/me', () => {
  it('reuses the user document from the sign-in check (no second lookup) and returns the profile', async () => {
    const document = {
      _id: 'u1', email: 'x@y.z', firstName: 'A', lastName: 'B', role: 'admin', organization: 'org1',
      isActive: true, customRole: null, populate: jest.fn().mockResolvedValue(undefined)
    }
    mockAuth({ ...me(Role.ADMIN), document })
    const findById = jest.fn()
    jest.doMock('@/models/User', () => ({ User: { findById } }))
    const route = require('@/app/api/auth/me/route')
    const res = await route.GET()
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ email: 'x@y.z', role: 'admin' })
    expect(findById).not.toHaveBeenCalled()
  })

  it('returns 401 when signed out', async () => {
    mockAuth(SIGNED_OUT)
    const route = require('@/app/api/auth/me/route')
    expect((await route.GET()).status).toBe(401)
  })
})
