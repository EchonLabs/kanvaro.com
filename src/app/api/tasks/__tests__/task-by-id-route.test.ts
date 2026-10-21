/**
 * /api/tasks/:id — a path segment that is not an ObjectId (the app's own
 * /tasks/create page falls through to the [id] route and fetches
 * /api/tasks/create) must answer 404, not a Mongoose CastError surfaced as 500.
 * Guarded on every method that reads the id: GET, PUT and DELETE.
 */
import { NextRequest } from 'next/server'

const mockUserId = '5f00000000000000000000bb'
const mockOrgId = '5f00000000000000000000aa'

jest.mock('@/lib/db-config', () => ({
  __esModule: true,
  default: jest.fn().mockResolvedValue(undefined)
}))

jest.mock('@/lib/auth-utils', () => ({
  authenticateUser: jest.fn().mockResolvedValue({
    user: { id: mockUserId, organization: mockOrgId }
  })
}))

jest.mock('@/lib/permissions/permission-service', () => ({
  PermissionService: {
    hasPermission: jest.fn().mockResolvedValue(true),
    getAccessibleProjects: jest.fn().mockResolvedValue([])
  }
}))

const mockFindOne = jest.fn()
jest.mock('@/models/Task', () => ({
  Task: {
    findOne: (...args: unknown[]) => mockFindOne(...args),
    findOneAndUpdate: jest.fn(),
    findById: jest.fn()
  },
  TASK_STATUS_VALUES: ['backlog', 'todo', 'in_progress', 'review', 'testing', 'done', 'cancelled'],
  TaskStatus: {}
}))

// eslint-disable-next-line @typescript-eslint/no-var-requires
const route = require('@/app/api/tasks/[id]/route')

const req = (method: string) =>
  new NextRequest('http://localhost/api/tasks/create', {
    method,
    body: method === 'GET' || method === 'DELETE' ? undefined : JSON.stringify({ title: 'x' })
  })

describe('/api/tasks/:id with a malformed id', () => {
  beforeEach(() => mockFindOne.mockReset())

  it.each(['GET', 'PUT', 'DELETE'])('%s returns 404 for "create"', async method => {
    const response = await route[method](req(method), { params: { id: 'create' } })

    expect(response.status).toBe(404)
    expect(mockFindOne).not.toHaveBeenCalled()
  })
})
