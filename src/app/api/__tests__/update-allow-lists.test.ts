/**
 * Decision record F7 (and §2.3): story, epic, sprint and task updates saved the
 * request body as-is, and moving an item to another project never checked the
 * target project. Each route now keeps only the fields a client may edit, and
 * a project move needs a target project the caller can access.
 */
import { NextRequest } from 'next/server'
import { pickFields } from '@/lib/api/update-fields'

afterEach(() => jest.resetModules())

const put = (route: any, id: string, body: Record<string, unknown>) =>
  route.PUT(new NextRequest('http://localhost/x', { method: 'PUT', body: JSON.stringify(body) }), { params: { id } })

/** Mongo-ish chain resolving to `value`; records nothing. */
const chain = (value: any): any => {
  const c: any = {}
  for (const m of ['populate', 'select', 'lean', 'sort']) c[m] = () => c
  c.then = (resolve: any, reject: any) => Promise.resolve(value).then(resolve, reject)
  return c
}

/** Permissions: the caller can access only `projects`. */
function mockPermissions(projects: string[]) {
  jest.doMock('@/lib/permissions/permission-service', () => {
    const real = jest.requireActual('@/lib/permissions/permission-service')
    const perms = { globalPermissions: [], projectPermissions: new Map(projects.map((p) => [p, []])), projectRoles: new Map(), userRole: 'team_member' }
    return {
      PermissionService: {
        hasPermission: async () => true,
        hasAnyPermission: async () => true,
        getUserPermissions: async () => perms,
        hasPermissionIn: () => true,
        canAccessProjectIn: real.PermissionService.canAccessProjectIn,
        getAccessibleProjects: async () => projects
      }
    }
  })
}

/** Project.findOne for the move check: only projects in org-1 exist. */
function mockProjects(extra: Record<string, any> = {}) {
  jest.doMock('@/models/Project', () => ({
    Project: {
      findOne: (q: any) => chain(q?.organization === 'org-1' && ['p-1', 'p-2', 'p-hidden'].includes(String(q._id)) ? { _id: q._id } : null),
      findById: () => chain({ name: 'P' }),
      ...extra
    }
  }))
}

function mockAuth() {
  jest.doMock('@/lib/db-config', () => ({ __esModule: true, default: async () => undefined }))
  jest.doMock('@/lib/auth-utils', () => ({
    authenticateUser: async () => ({ user: { id: 'user-1', organization: 'org-1' } })
  }))
}

describe('pickFields', () => {
  it('keeps only listed fields that are present', () => {
    expect(pickFields({ a: 1, b: 2, organization: 'x' }, ['a', 'c'] as const)).toEqual({ a: 1 })
  })
  it('handles a non-object body', () => {
    expect(pickFields(null, ['a'] as const)).toEqual({})
    expect(pickFields('nope', ['a'] as const)).toEqual({})
  })
})

describe('PUT /api/stories/:id', () => {
  function load(canAccess: string[] = ['p-1']) {
    mockAuth()
    mockPermissions(canAccess)
    mockProjects()
    const findByIdAndUpdate = jest.fn(() => chain({ _id: 's-1' }))
    const existing = { _id: 's-1', project: { _id: 'p-1', organization: 'org-1' }, createdBy: { _id: 'user-1' } }
    jest.doMock('@/models/Story', () => ({ Story: { findById: () => chain(existing), findByIdAndUpdate } }))
    jest.doMock('@/models/Epic', () => ({ Epic: {} }))
    return { route: require('@/app/api/stories/[id]/route'), findByIdAndUpdate }
  }

  it('saves only editable fields', async () => {
    const { route, findByIdAndUpdate } = load()
    await put(route, 's-1', { title: 'New', createdBy: 'attacker', completedAt: '2020-01-01', organization: 'x' })
    expect((findByIdAndUpdate.mock.calls[0] as any[])[1]).toEqual({ title: 'New' })
  })

  it('keeps the same project (the edit form always resends it)', async () => {
    const { route, findByIdAndUpdate } = load()
    expect((await put(route, 's-1', { title: 'T', project: 'p-1' })).status).toBe(200)
    expect(findByIdAndUpdate).toHaveBeenCalled()
  })

  it('refuses moving the story into a project the caller cannot access', async () => {
    const { route, findByIdAndUpdate } = load(['p-1'])
    expect((await put(route, 's-1', { project: 'p-hidden' })).status).toBe(403)
    expect(findByIdAndUpdate).not.toHaveBeenCalled()
  })

  it('allows moving into another accessible project', async () => {
    const { route } = load(['p-1', 'p-2'])
    expect((await put(route, 's-1', { project: 'p-2' })).status).toBe(200)
  })

  it('refuses moving into a project outside the organisation', async () => {
    const { route } = load(['p-1', 'p-other-org'])
    expect((await put(route, 's-1', { project: 'p-other-org' })).status).toBe(403)
  })
})

describe('PUT /api/epics/:id', () => {
  function load(canAccess: string[] = ['p-1']) {
    mockAuth()
    mockPermissions(canAccess)
    mockProjects()
    const findByIdAndUpdate = jest.fn(() => chain({ _id: 'e-1' }))
    const existing = { _id: 'e-1', project: { _id: 'p-1', organization: 'org-1' }, createdBy: { _id: 'user-1' } }
    jest.doMock('@/models/Epic', () => ({ Epic: { findById: () => chain(existing), findByIdAndUpdate } }))
    jest.doMock('@/models/Story', () => ({ Story: {} }))
    return { route: require('@/app/api/epics/[id]/route'), findByIdAndUpdate }
  }

  it('saves only editable fields', async () => {
    const { route, findByIdAndUpdate } = load()
    await put(route, 'e-1', { title: 'New', goal: 'x', createdBy: 'attacker', completedAt: 'now' })
    expect((findByIdAndUpdate.mock.calls[0] as any[])[1]).toEqual({ title: 'New' })
  })

  it('refuses moving the epic into a project the caller cannot access', async () => {
    const { route, findByIdAndUpdate } = load(['p-1'])
    expect((await put(route, 'e-1', { project: 'p-hidden' })).status).toBe(403)
    expect(findByIdAndUpdate).not.toHaveBeenCalled()
  })
})

describe('PUT /api/sprints/:id', () => {
  function load(canAccess: string[] = ['p-1']) {
    mockAuth()
    mockPermissions(canAccess)
    mockProjects()
    const existing: any = {
      _id: 'sprint-1', name: 'S', status: 'planning',
      organization: { toString: () => 'org-1' }, project: { toString: () => 'p-1' },
      startDate: new Date('2026-08-24'), endDate: new Date('2026-09-04')
    }
    const findByIdAndUpdate = jest.fn(() => chain({ ...existing }))
    jest.doMock('@/models/Sprint', () => ({ Sprint: { findById: async () => existing, findByIdAndUpdate } }))
    jest.doMock('@/models/Task', () => ({ Task: { find: () => ({ select: () => ({ lean: async () => [] }) }), updateMany: async () => undefined } }))
    jest.doMock('@/lib/standup/reconcile', () => ({
      assertScheduleChangeAllowed: async () => undefined,
      reconcileSprintSchedule: async () => ({ created: 0, cancelled: 0 })
    }))
    jest.doMock('@/lib/activity-logger', () => ({ logActivity: () => Promise.resolve() }))
    return { route: require('@/app/api/sprints/[id]/route'), findByIdAndUpdate }
  }

  it('drops lifecycle and planning fields a client must not set', async () => {
    const { route, findByIdAndUpdate } = load()
    await put(route, 'sprint-1', {
      name: 'Renamed',
      actualStartDate: '2020-01-01', planningWaiver: { reason: 'x' }, activePlanningSession: 'ps-1',
      organization: 'other-org', createdBy: 'attacker'
    })
    const payload = (findByIdAndUpdate.mock.calls[0] as any[])[1]
    expect(payload.name).toBe('Renamed')
    for (const field of ['actualStartDate', 'planningWaiver', 'activePlanningSession', 'organization', 'createdBy']) {
      expect(payload).not.toHaveProperty(field)
    }
  })

  it('refuses moving the sprint into a project the caller cannot access', async () => {
    const { route, findByIdAndUpdate } = load(['p-1'])
    expect((await put(route, 'sprint-1', { project: 'p-hidden' })).status).toBe(403)
    expect(findByIdAndUpdate).not.toHaveBeenCalled()
  })
})
