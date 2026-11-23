/**
 * `POST /api/sprints/:id/start` — the planned-only gate.
 *
 * This route had no test at all, which is how it kept accepting a sprint in
 * `planning`. Starting one from there produced an Active sprint with no
 * completion checklist run, no frozen estimates (DAT-6) and no stand-ups —
 * generation happens inside `completePlanning` — so the sprint could never
 * remind anybody of anything and the planning gate was decorative.
 *
 * The models and the permission service are mocked: what is under test is the
 * handler's own ordering and refusals, not Mongoose.
 */
import { NextRequest } from 'next/server'

interface Harness {
  sprintStatus?: string
  taskCount?: number
  canStart?: boolean
  organization?: string
  /** The project's "Legacy sprint flow" switch; `null` models no settings document. */
  legacySprintFlow?: boolean | null
}

function loadRoute({
  sprintStatus = 'planned',
  taskCount = 3,
  canStart = true,
  organization = 'org-1',
  legacySprintFlow = false
}: Harness = {}) {
  jest.resetModules()

  const sprint: any = {
    _id: 'sprint-1',
    name: 'Sprint 13',
    status: sprintStatus,
    organization: { toString: () => organization },
    project: { toString: () => 'project-1' },
    save: jest.fn(async () => undefined)
  }

  jest.doMock('@/lib/db-config', () => ({ __esModule: true, default: async () => undefined }))

  jest.doMock('@/lib/auth-utils', () => ({
    authenticateUser: async () => ({
      user: { id: 'user-1', organization: 'org-1' }
    })
  }))

  const findById = jest.fn(() => {
    const chain: any = {
      populate: () => chain,
      then: (resolve: any) => resolve(sprint)
    }
    return chain
  })
  // The first call is awaited directly, later ones are chained through
  // `.populate()`; a thenable covers both without two different mocks.
  jest.doMock('@/models/Sprint', () => ({ Sprint: { findById } }))

  const updateMany = jest.fn(async () => undefined)
  jest.doMock('@/models/Task', () => ({
    Task: { countDocuments: async () => taskCount, updateMany }
  }))

  jest.doMock('@/lib/permissions/permission-service', () => ({
    PermissionService: { hasPermission: async () => canStart }
  }))

  jest.doMock('@/lib/activity-logger', () => ({ logActivity: () => Promise.resolve() }))

  // `findOne().select().lean()` — the route reads only the legacy-flow switch.
  jest.doMock('@/models/ProjectStandupSettings', () => ({
    ProjectStandupSettings: {
      findOne: () => ({
        select: () => ({
          lean: async () => (legacySprintFlow === null ? null : { legacySprintFlow })
        })
      })
    }
  }))

  const route = require('@/app/api/sprints/[id]/start/route')
  return { route, sprint, updateMany }
}

const post = (route: any) =>
  route.POST(new NextRequest('http://localhost/api/sprints/sprint-1/start', { method: 'POST' }), {
    params: { id: 'sprint-1' }
  })

describe('POST /api/sprints/:id/start', () => {
  afterEach(() => {
    jest.resetModules()
  })

  it('starts a planned sprint and stamps its actual start date', async () => {
    const { route, sprint, updateMany } = loadRoute({ sprintStatus: 'planned' })

    const response = await post(route)

    expect(response.status).toBe(200)
    expect(sprint.status).toBe('active')
    expect(sprint.actualStartDate).toBeInstanceOf(Date)
    expect(updateMany).toHaveBeenCalled()
  })

  it('refuses a sprint that is still being planned, and says what to do', async () => {
    const { route, sprint } = loadRoute({ sprintStatus: 'planning' })

    const response = await post(route)
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.error).toMatch(/cannot start until planning is complete/i)
    expect(sprint.status).toBe('planning')
  })

  it('refuses a draft sprint for the same reason', async () => {
    const { route } = loadRoute({ sprintStatus: 'draft' })

    expect((await post(route)).status).toBe(400)
  })

  it('refuses a sprint that has already started', async () => {
    const { route } = loadRoute({ sprintStatus: 'active' })

    expect((await post(route)).status).toBe(400)
  })

  it('still refuses a planned sprint with no tasks', async () => {
    // The older guard, kept: a sprint can pass planning and then have its
    // scope emptied before anybody presses Start.
    const { route, sprint } = loadRoute({ sprintStatus: 'planned', taskCount: 0 })

    const response = await post(route)

    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({
      error: expect.stringMatching(/add tasks/i)
    })
    expect(sprint.status).toBe('planned')
  })

  it('refuses a caller without SPRINT_START', async () => {
    const { route, sprint } = loadRoute({ sprintStatus: 'planned', canStart: false })

    expect((await post(route)).status).toBe(403)
    expect(sprint.status).toBe('planned')
  })

  it('refuses a sprint belonging to another organisation', async () => {
    const { route } = loadRoute({ sprintStatus: 'planned', organization: 'org-2' })

    expect((await post(route)).status).toBe(403)
  })

  describe('with the legacy sprint flow on', () => {
    it.each(['planning', 'draft', 'planned'])('starts a %s sprint', async (sprintStatus) => {
      const { route, sprint } = loadRoute({ sprintStatus, legacySprintFlow: true })

      const response = await post(route)

      expect(response.status).toBe(200)
      expect(sprint.status).toBe('active')
      expect(sprint.actualStartDate).toBeInstanceOf(Date)
    })

    it.each(['completed', 'cancelled'])('still refuses a %s sprint', async (sprintStatus) => {
      const { route, sprint } = loadRoute({ sprintStatus, legacySprintFlow: true })

      expect((await post(route)).status).toBe(400)
      expect(sprint.status).toBe(sprintStatus)
    })

    it('still refuses a sprint that has already started', async () => {
      const { route } = loadRoute({ sprintStatus: 'active', legacySprintFlow: true })

      expect((await post(route)).status).toBe(400)
    })

    it('still refuses a sprint with no tasks', async () => {
      const { route, sprint } = loadRoute({
        sprintStatus: 'planning',
        taskCount: 0,
        legacySprintFlow: true
      })

      const response = await post(route)

      expect(response.status).toBe(400)
      expect(await response.json()).toMatchObject({ error: expect.stringMatching(/add tasks/i) })
      expect(sprint.status).toBe('planning')
    })

    it('still refuses a caller without SPRINT_START', async () => {
      const { route, sprint } = loadRoute({
        sprintStatus: 'planning',
        canStart: false,
        legacySprintFlow: true
      })

      expect((await post(route)).status).toBe(403)
      expect(sprint.status).toBe('planning')
    })
  })

  it('keeps the planning gate when the project has no settings document', async () => {
    const { route, sprint } = loadRoute({ sprintStatus: 'planning', legacySprintFlow: null })

    expect((await post(route)).status).toBe(400)
    expect(sprint.status).toBe('planning')
  })
})
