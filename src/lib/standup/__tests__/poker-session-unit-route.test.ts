/**
 * `POST /api/sprints/:id/poker-sessions` â€” the project's estimation unit
 * (PLN-10/13).
 *
 * The planning screen sends no deck and no unit, so the project setting is the
 * only thing standing between a team voting in hours and a session that
 * multiplies every card by `pointsToHours`.
 *
 * `withSprintPermission` is mocked for the same reason as in
 * `reveal-state-route.test.ts`: the handler's branching is under test, not the
 * permission wrapper. The mock keeps the wrapper's error-to-response mapping so
 * a refused request still arrives as a 422.
 */
import { NextRequest } from 'next/server'

type LoadOptions = {
  settings?: Record<string, unknown> | null
}

function loadRoute({ settings = null }: LoadOptions = {}) {
  jest.resetModules()

  const create = jest.fn(async (doc: any) => ({ ...doc, _id: 'session-1' }))

  jest.doMock('@/lib/standup/route-helpers', () => {
    const actual = jest.requireActual('@/lib/standup/route-helpers')
    const { toErrorResponse } = jest.requireActual('@/lib/standup/errors')
    const { NextResponse } = jest.requireActual('next/server')
    return {
      ...actual,
      withSprintPermission: (_config: any, handler: any) => async (request: NextRequest) => {
        try {
          return await handler(request, {
            sprintId: 'sprint-1',
            sprint: { teamMembers: ['dev-1'] },
            organizationId: 'org-1',
            projectId: 'project-1',
            userId: 'pm-1'
          })
        } catch (error) {
          const { status, body } = toErrorResponse(error)
          return NextResponse.json(body, { status })
        }
      }
    }
  })

  jest.doMock('@/models/PokerSession', () => ({
    PokerSession: { create, find: jest.fn() }
  }))

  jest.doMock('@/models/ProjectStandupSettings', () => ({
    ProjectStandupSettings: {
      findOne: jest.fn(() => ({ select: () => ({ lean: async () => settings }) }))
    }
  }))

  jest.doMock('@/models/SprintPlanningSession', () => ({
    SprintPlanningSession: {
      findOne: jest.fn(() => ({ select: () => ({ lean: async () => null }) }))
    }
  }))

  jest.doMock('@/models/Task', () => ({
    Task: {
      find: jest.fn(() => ({ select: () => ({ lean: async () => [{ _id: 'task-1' }] }) }))
    }
  }))

  const route = require('@/app/api/sprints/[id]/poker-sessions/route')
  return { POST: route.POST, create }
}

const post = (POST: any, body: Record<string, unknown>) =>
  POST(
    new NextRequest('http://localhost/api/sprints/sprint-1/poker-sessions', {
      method: 'POST',
      body: JSON.stringify(body)
    }),
    { params: { id: 'sprint-1' } }
  )

describe('POST /api/sprints/:id/poker-sessions â€” estimation unit', () => {
  afterEach(() => {
    jest.resetModules()
  })

  it('opens an hours session on the hours deck when the project estimates in hours', async () => {
    const { POST, create } = loadRoute({ settings: { estimationUnit: 'hours', pointsToHours: 4 } })

    const response = await post(POST, { taskIds: ['task-1'] })
    const body = await response.json()

    expect(response.status).toBe(201)
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ estimationUnit: 'hours', deckType: 'hours' })
    )
    expect(body.data.cards).toEqual([0.5, 1, 2, 3, 4, 6, 8, 12, 16, 24, 40, '?', 'coffee'])
  })

  it('opens a story-points session when the project estimates in points', async () => {
    const { POST, create } = loadRoute({
      settings: { estimationUnit: 'story_points', pointsToHours: 6 }
    })

    const response = await post(POST, { taskIds: ['task-1'] })

    expect(response.status).toBe(201)
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        estimationUnit: 'story_points',
        deckType: 'fibonacci',
        pointsToHours: 6
      })
    )
  })

  it('keeps story points for a project saved before the unit existed', async () => {
    const { POST, create } = loadRoute({ settings: { pointsToHours: 4 } })

    await post(POST, { taskIds: ['task-1'] })

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ estimationUnit: 'story_points', deckType: 'fibonacci' })
    )
  })

  it('keeps story points for a project with no settings at all', async () => {
    const { POST, create } = loadRoute({ settings: null })

    await post(POST, { taskIds: ['task-1'] })

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ estimationUnit: 'story_points', pointsToHours: 4 })
    )
  })

  it('runs the hours deck in hours even on a story-points project', async () => {
    const { POST, create } = loadRoute({ settings: { estimationUnit: 'story_points' } })

    await post(POST, { taskIds: ['task-1'], deckType: 'hours' })

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ estimationUnit: 'hours', deckType: 'hours' })
    )
  })

  it('refuses the hours deck with an explicit story-points unit', async () => {
    const { POST, create } = loadRoute({ settings: { estimationUnit: 'hours' } })

    const response = await post(POST, {
      taskIds: ['task-1'],
      deckType: 'hours',
      estimationUnit: 'story_points'
    })
    const body = await response.json()

    expect(response.status).toBe(422)
    expect(body.error.code).toBe('VALIDATION_FAILED')
    expect(create).not.toHaveBeenCalled()
  })

  it('refuses an unknown unit', async () => {
    const { POST, create } = loadRoute()

    const response = await post(POST, { taskIds: ['task-1'], estimationUnit: 'days' })

    expect(response.status).toBe(422)
    expect(create).not.toHaveBeenCalled()
  })
})
