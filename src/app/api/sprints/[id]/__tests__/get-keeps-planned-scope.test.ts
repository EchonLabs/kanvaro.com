/**
 * `GET /api/sprints/:id` must be a pure read for a sprint that has not started.
 *
 * Planning adds tasks to a sprint without touching their status, so they are
 * still `backlog` until the sprint starts. The read used to treat any
 * backlog-status task as "moved back to the backlog" and detach it, so merely
 * viewing the sprint (a refresh, or navigating away and back) emptied the scope.
 */
import { NextRequest } from 'next/server'

function load(sprintStatus: string) {
  jest.resetModules()
  const sprintUpdateOne = jest.fn().mockResolvedValue({})
  const taskUpdateMany = jest.fn().mockResolvedValue({})
  const taskFind = jest.fn((query: any) => {
    // The cleanup probe is the only query with an `$or`. t1 is a backlog-status
    // task that still points at the sprint, so only a status clause matches it.
    if (query.$or) {
      const matches = query.$or.some((clause: any) => clause.status === 'backlog')
      return { select: jest.fn().mockResolvedValue(matches ? [{ _id: 't1' }] : []) }
    }
    const chain: any = { sort: () => chain, select: () => chain, populate: () => Promise.resolve([]) }
    return chain
  })

  const sprint: any = {
    _id: 's1',
    status: sprintStatus,
    project: { _id: 'p1', toString: () => 'p1' },
    tasks: ['t1'],
    toObject() {
      return { ...this }
    }
  }
  const sprintFindOne = () => {
    const chain: any = { populate: () => chain, then: (resolve: any) => resolve(sprint) }
    return chain
  }

  jest.doMock('@/lib/db-config', () => ({ __esModule: true, default: jest.fn() }))
  jest.doMock('@/lib/auth-utils', () => ({
    authenticateUser: jest.fn().mockResolvedValue({ user: { id: 'u1', organization: 'o1' } })
  }))
  jest.doMock('@/lib/permissions/permission-service', () => ({
    PermissionService: {
      hasAnyPermission: jest.fn().mockResolvedValue(true),
      hasPermission: jest.fn().mockResolvedValue(true)
    }
  }))
  jest.doMock('@/models/Sprint', () => ({
    Sprint: { findOne: sprintFindOne, updateOne: sprintUpdateOne }
  }))
  jest.doMock('@/models/Task', () => ({ Task: { find: taskFind, updateMany: taskUpdateMany } }))
  jest.doMock('@/models/Project', () => ({ Project: { exists: jest.fn() } }))
  jest.doMock('@/models/Story', () => ({}))
  jest.doMock('@/models/Epic', () => ({}))

  return { route: require('@/app/api/sprints/[id]/route'), sprintUpdateOne, taskUpdateMany }
}

describe('GET /api/sprints/:id', () => {
  afterEach(() => jest.resetModules())

  it.each(['draft', 'planning', 'planned'])(
    'does not detach backlog-status tasks from a %s sprint',
    async (status) => {
      const { route, sprintUpdateOne, taskUpdateMany } = load(status)

      await route.GET(new NextRequest('http://localhost/x'), { params: { id: 's1' } })

      expect(sprintUpdateOne).not.toHaveBeenCalled()
      expect(taskUpdateMany).not.toHaveBeenCalled()
    }
  )
})
