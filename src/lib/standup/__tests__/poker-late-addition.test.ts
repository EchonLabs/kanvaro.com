/**
 * Planning poker on a sprint that has left planning (E14, PLN-15, DAT-6).
 *
 * Three layers: the shared rule, the route that opens a round, and finalize
 * freezing the result. Planning-time behaviour is covered by the existing poker
 * tests and must stay as it was; the cases here only pin what changes once the
 * sprint is past planning.
 */
import { NextRequest } from 'next/server'

import {
  assertLateAdditionReason,
  isPastPlanning,
  isUnestimated
} from '@/lib/standup/late-addition'

describe('late-addition rule', () => {
  it('treats planned, active and completed sprints as past planning', () => {
    expect(['draft', 'planning'].map(isPastPlanning)).toEqual([false, false])
    expect(['planned', 'active', 'completed'].map(isPastPlanning)).toEqual([true, true, true])
    expect(isPastPlanning(undefined)).toBe(false)
  })

  it('treats only a task with no estimate and no lock as unestimated', () => {
    expect(isUnestimated({})).toBe(true)
    expect(isUnestimated({ originalEstimateMinutes: 0 })).toBe(true)
    expect(isUnestimated({ originalEstimateMinutes: 120 })).toBe(false)
    // Estimated at creation: only the legacy hours field is set.
    expect(isUnestimated({ estimatedHours: 3 })).toBe(false)
    expect(isUnestimated({ estimatedHours: 0 })).toBe(true)
    expect(isUnestimated({ estimateLockedAt: new Date() })).toBe(false)
  })

  it('requires a reason of at least ten characters', () => {
    expect(() => assertLateAdditionReason(undefined)).toThrow(/at least 10 characters/)
    expect(() => assertLateAdditionReason('too short')).toThrow()
    expect(() => assertLateAdditionReason('   padded   ')).toThrow()
    expect(assertLateAdditionReason('  Customer escalation  ')).toBe('Customer escalation')
  })
})

describe('POST /api/sprints/:id/poker-sessions — late addition', () => {
  const loadRoute = ({ status, tasks }: { status: string; tasks: any[] }) => {
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
              sprint: { name: 'S1', status, teamMembers: ['dev-1'] },
              organizationId: 'org-1',
              projectId: 'project-1',
              userId: 'pm-1'
            })
          } catch (error) {
            const { status: code, body } = toErrorResponse(error)
            return NextResponse.json(body, { status: code })
          }
        }
      }
    })
    jest.doMock('@/models/PokerSession', () => ({ PokerSession: { create, find: jest.fn() } }))
    jest.doMock('@/models/ProjectStandupSettings', () => ({
      ProjectStandupSettings: {
        findOne: jest.fn(() => ({ select: () => ({ lean: async () => null }) }))
      }
    }))
    jest.doMock('@/models/SprintPlanningSession', () => ({
      SprintPlanningSession: {
        findOne: jest.fn(() => ({ select: () => ({ lean: async () => null }) }))
      }
    }))
    jest.doMock('@/models/Task', () => ({
      Task: { find: jest.fn(() => ({ select: () => ({ lean: async () => tasks }) })) }
    }))
    jest.doMock('@/lib/notification-broadcaster', () => ({ broadcastUserEvent: jest.fn() }))

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

  afterEach(() => jest.resetModules())

  const bare = { _id: 'task-1', displayId: 'T-1', title: 'New work' }
  const reason = 'Customer escalation pulled this in'

  it('refuses a round on an active sprint with no reason', async () => {
    const { POST, create } = loadRoute({ status: 'active', tasks: [bare] })
    const response = await post(POST, { taskIds: ['task-1'] })

    expect(response.status).toBe(422)
    expect(create).not.toHaveBeenCalled()
  })

  it('opens a round over unestimated tasks and stores the reason', async () => {
    const { POST, create } = loadRoute({ status: 'active', tasks: [bare] })
    const response = await post(POST, { taskIds: ['task-1'], reason })

    expect(response.status).toBe(201)
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ lateAdditionReason: reason }))
  })

  it('refuses a task that already has an estimate and names it', async () => {
    const estimated = { _id: 'task-2', displayId: 'T-2', originalEstimateMinutes: 240 }
    const { POST, create } = loadRoute({ status: 'active', tasks: [bare, estimated] })
    const response = await post(POST, { taskIds: ['task-1', 'task-2'], reason })
    const body = await response.json()

    expect(response.status).toBe(422)
    expect(JSON.stringify(body)).toContain('T-2')
    expect(create).not.toHaveBeenCalled()
  })

  it('refuses a task estimated at creation, where only estimatedHours is set', async () => {
    const createdWithHours = { _id: 'task-3', displayId: 'T-3', estimatedHours: 3 }
    const { POST, create } = loadRoute({ status: 'active', tasks: [createdWithHours] })
    const response = await post(POST, { taskIds: ['task-3'], reason })
    const body = await response.json()

    expect(response.status).toBe(422)
    expect(JSON.stringify(body)).toContain('T-3')
    expect(create).not.toHaveBeenCalled()
  })

  it.each(['completed', 'cancelled'])('refuses a round on a %s sprint', async (status) => {
    const { POST, create } = loadRoute({ status, tasks: [bare] })
    const response = await post(POST, { taskIds: ['task-1'], reason })

    expect(response.status).toBe(422)
    expect(create).not.toHaveBeenCalled()
  })

  it('leaves a planning-time round exactly as it was: no reason, estimated tasks allowed', async () => {
    const estimated = { _id: 'task-2', originalEstimateMinutes: 240 }
    const { POST, create } = loadRoute({ status: 'planning', tasks: [estimated] })
    const response = await post(POST, { taskIds: ['task-2'] })

    expect(response.status).toBe(201)
    expect(create.mock.calls[0][0]).not.toHaveProperty('lateAdditionReason')
  })
})

describe('finalize — late addition', () => {
  const loadRoute = ({ lateAdditionReason, task }: { lateAdditionReason?: string; task: any }) => {
    jest.resetModules()

    const recordAudit = jest.fn()
    const session: any = {
      _id: 'session-1',
      facilitator: '64b7f0f2a1b2c3d4e5f60718',
      deckType: 'fibonacci',
      estimationUnit: 'hours',
      pointsToHours: 4,
      consensusRule: 'facilitator_decides',
      allowRevote: true,
      status: 'open',
      participants: [],
      lateAdditionReason,
      queue: [{ task: { toString: () => 'task-1' }, roundCount: 1, status: 'revealed' }],
      save: jest.fn(async () => undefined)
    }

    jest.doMock('@/lib/standup/route-helpers', () => {
      const actual = jest.requireActual('@/lib/standup/route-helpers')
      const { toErrorResponse } = jest.requireActual('@/lib/standup/errors')
      const { NextResponse } = jest.requireActual('next/server')
      return {
        ...actual,
        withPokerPermission: (_config: any, handler: any) => async (request: NextRequest) => {
          try {
            return await handler(request, {
              pokerSession: session,
              params: { id: 'session-1', taskId: 'task-1' },
              organizationId: 'org-1',
              projectId: 'project-1',
              userId: '64b7f0f2a1b2c3d4e5f60718'
            })
          } catch (error) {
            const { status, body } = toErrorResponse(error)
            return NextResponse.json(body, { status })
          }
        }
      }
    })
    jest.doMock('@/models/PokerSession', () => ({
      PokerSession: {},
      PokerVote: {
        find: jest.fn(() => ({
          select: () => ({ lean: async () => [{ voter: 'dev-1', card: 5 }] })
        }))
      }
    }))
    jest.doMock('@/models/Task', () => ({ Task: { findById: jest.fn(async () => task) } }))
    jest.doMock('@/lib/standup/audit', () => ({ recordAudit }))
    jest.doMock('@/lib/poker-broadcaster', () => ({
      broadcastPokerChange: jest.fn(),
      closePokerSession: jest.fn()
    }))
    jest.doMock('@/lib/notification-broadcaster', () => ({ broadcastUserEvent: jest.fn() }))

    const route = require('@/app/api/poker-sessions/[id]/tasks/[taskId]/finalize/route')
    return { POST: route.POST, recordAudit }
  }

  const finalize = (POST: any) =>
    POST(
      new NextRequest('http://localhost/api/poker-sessions/session-1/tasks/task-1/finalize', {
        method: 'POST',
        body: JSON.stringify({ finalValue: 5 })
      }),
      { params: { id: 'session-1', taskId: 'task-1' } }
    )

  const makeTask = (overrides: Record<string, unknown> = {}) => ({
    displayId: 'T-1',
    save: jest.fn(async () => undefined),
    ...overrides
  })

  afterEach(() => jest.resetModules())

  it('freezes the estimate in the same save and audits it as a late addition', async () => {
    const task: any = makeTask()
    const { POST, recordAudit } = loadRoute({ lateAdditionReason: 'Pulled in mid-sprint', task })
    const response = await finalize(POST)

    expect(response.status).toBe(200)
    expect(task.estimateLockedAt).toBeInstanceOf(Date)
    expect(task.estimateMethod).toBe('poker')
    expect(task.save).toHaveBeenCalledTimes(1)
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.objectContaining({ lateAddition: true, reason: 'Pulled in mid-sprint' })
      })
    )
  })

  it('refuses to overwrite an estimate set by hand after the round opened', async () => {
    const task: any = makeTask({ originalEstimateMinutes: 180 })
    const { POST } = loadRoute({ lateAdditionReason: 'Pulled in mid-sprint', task })
    const response = await finalize(POST)

    expect(response.status).toBeGreaterThanOrEqual(400)
    expect(task.save).not.toHaveBeenCalled()
    expect(task.originalEstimateMinutes).toBe(180)
  })

  it('does not freeze a planning-time round', async () => {
    const task: any = makeTask()
    const { POST } = loadRoute({ task })
    const response = await finalize(POST)

    expect(response.status).toBe(200)
    expect(task.estimateLockedAt).toBeUndefined()
  })
})
