/**
 * `PUT /api/sprints/:id` — the state-machine guard.
 *
 * This route used to write whatever `status` the client sent straight into the
 * document, which made a generic edit form a way around every gate the sprint
 * lifecycle has: the start endpoint's planned-only rule, its "add tasks first"
 * check, and `actualStartDate` being stamped at all. Two guards close it, and
 * both are easy to delete by accident later, which is why they are pinned
 * here.
 *
 * Everything below the guard is mocked; what is under test is the refusal and
 * its ordering, not Mongoose or the schedule reconciler.
 */
import { NextRequest } from 'next/server'

function loadRoute({ currentStatus = 'planning' }: { currentStatus?: string } = {}) {
  jest.resetModules()

  const existing: any = {
    _id: 'sprint-1',
    name: 'Sprint 13',
    status: currentStatus,
    organization: { toString: () => 'org-1' },
    project: { toString: () => 'project-1' },
    startDate: new Date('2026-08-24'),
    endDate: new Date('2026-09-04')
  }

  const findByIdAndUpdate = jest.fn(() => {
    const chain: any = {
      populate: () => chain,
      then: (resolve: any) => resolve({ ...existing, name: 'Sprint 13' })
    }
    return chain
  })

  jest.doMock('@/lib/db-config', () => ({ __esModule: true, default: async () => undefined }))

  jest.doMock('@/lib/auth-utils', () => ({
    authenticateUser: async () => ({ user: { id: 'user-1', organization: 'org-1' } })
  }))

  jest.doMock('@/models/Sprint', () => ({
    Sprint: { findById: async () => existing, findByIdAndUpdate }
  }))

  jest.doMock('@/models/Task', () => ({
    Task: { find: () => ({ select: () => ({ lean: async () => [] }) }), updateMany: async () => undefined }
  }))

  jest.doMock('@/models/Project', () => ({
    Project: { findById: () => ({ select: () => ({ lean: async () => ({ name: 'Kanvaro' }) }) }) }
  }))

  jest.doMock('@/lib/permissions/permission-service', () => ({
    PermissionService: { hasPermission: async () => true, hasAnyPermission: async () => true }
  }))

  jest.doMock('@/lib/standup/reconcile', () => ({
    assertScheduleChangeAllowed: async () => undefined,
    reconcileSprintSchedule: async () => ({ created: 0, cancelled: 0 })
  }))

  jest.doMock('@/lib/activity-logger', () => ({ logActivity: () => Promise.resolve() }))

  const route = require('@/app/api/sprints/[id]/route')
  return { route, findByIdAndUpdate }
}

const put = (route: any, body: Record<string, unknown>) =>
  route.PUT(
    new NextRequest('http://localhost/api/sprints/sprint-1', {
      method: 'PUT',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' }
    }),
    { params: { id: 'sprint-1' } }
  )

describe('PUT /api/sprints/:id — status transitions', () => {
  afterEach(() => {
    jest.resetModules()
  })

  it('refuses to start a sprint, pointing at Start Sprint instead', async () => {
    // `planned -> active` is a legal transition, so the state machine alone
    // would wave this through — and it would skip the task-count check and
    // leave `actualStartDate` unset.
    const { route, findByIdAndUpdate } = loadRoute({ currentStatus: 'planned' })

    const response = await put(route, { status: 'active' })

    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({
      error: expect.stringMatching(/use start sprint/i)
    })
    expect(findByIdAndUpdate).not.toHaveBeenCalled()
  })

  it('refuses an illegal transition', async () => {
    // 422, the module's validation status — `assertTransition` throws a
    // StandupError and this route renders it through the same
    // `toErrorResponse` the schedule guard above it already used.
    const { route, findByIdAndUpdate } = loadRoute({ currentStatus: 'planning' })

    const response = await put(route, { status: 'completed' })

    expect(response.status).toBe(422)
    expect(await response.json()).toMatchObject({
      error: { code: 'VALIDATION_FAILED' }
    })
    expect(findByIdAndUpdate).not.toHaveBeenCalled()
  })

  it('refuses to move a sprint out of a terminal state', async () => {
    const { route } = loadRoute({ currentStatus: 'completed' })

    expect((await put(route, { status: 'planning' })).status).toBe(422)
  })

  it('allows a legal transition', async () => {
    const { route, findByIdAndUpdate } = loadRoute({ currentStatus: 'planning' })

    const response = await put(route, { status: 'cancelled' })

    expect(response.status).toBe(200)
    expect(findByIdAndUpdate).toHaveBeenCalled()
  })

  it('leaves an edit that does not touch status alone', async () => {
    const { route, findByIdAndUpdate } = loadRoute({ currentStatus: 'planning' })

    const response = await put(route, { name: 'Sprint 14' })

    expect(response.status).toBe(200)
    expect(findByIdAndUpdate).toHaveBeenCalled()
  })

  it('ignores a status that is simply unchanged', async () => {
    // Edit forms resubmit every field, so the current status arrives on almost
    // every request. Treating that as a transition would make the form
    // unusable.
    const { route, findByIdAndUpdate } = loadRoute({ currentStatus: 'active' })

    const response = await put(route, { status: 'active', name: 'Sprint 14' })

    expect(response.status).toBe(200)
    expect(findByIdAndUpdate).toHaveBeenCalled()
  })
})
