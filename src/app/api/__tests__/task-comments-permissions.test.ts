/**
 * Decision record F6: the comment permission checks received the task id where
 * the project id belongs, so project members could only comment on tasks they
 * were assigned to or created. PATCH/DELETE also let anyone in the
 * organisation edit or delete anyone's comment.
 */
import { NextRequest } from 'next/server'
import { Role, ROLE_PERMISSIONS, ProjectRole, PROJECT_ROLE_PERMISSIONS } from '@/lib/permissions/permission-definitions'

const TASK_ID = '64b000000000000000000001'
const PROJECT_ID = '64b0000000000000000000a1'
const COMMENT_ID = '64b0000000000000000000c1'

const permsFor = (role: Role, projectRole?: ProjectRole) => ({
  globalPermissions: [...ROLE_PERMISSIONS[role]],
  projectPermissions: new Map(projectRole ? [[PROJECT_ID, [...PROJECT_ROLE_PERMISSIONS[projectRole]]]] : []),
  projectRoles: new Map(),
  userRole: role
})

const leanExec = (value: any) => {
  const c: any = {}
  c.select = jest.fn(() => c)
  c.lean = jest.fn(() => c)
  c.exec = jest.fn().mockResolvedValue(value)
  return c
}

afterEach(() => jest.resetModules())

function load(userId: string, permissions: any, task: any) {
  const updateOne = jest.fn().mockResolvedValue({ modifiedCount: 1 })
  jest.doMock('@/lib/db-config', () => ({ __esModule: true, default: jest.fn() }))
  jest.doMock('@/lib/auth-utils', () => ({
    authenticateUser: jest.fn().mockResolvedValue({ user: { id: userId, organization: 'org1' } })
  }))
  jest.doMock('@/lib/permissions/permission-service', () => {
    const real = jest.requireActual('@/lib/permissions/permission-service')
    return {
      PermissionService: {
        getUserPermissions: jest.fn().mockResolvedValue(permissions),
        hasPermissionIn: real.PermissionService.hasPermissionIn,
        canAccessProjectIn: real.PermissionService.canAccessProjectIn
      }
    }
  })
  jest.doMock('@/models/Task', () => ({ Task: { findById: jest.fn(() => leanExec(task)), updateOne } }))
  jest.doMock('@/lib/notification-service', () => ({ notificationService: { createNotification: jest.fn() } }))
  jest.doMock('@/lib/task-activity-logger', () => ({ logTaskActivity: jest.fn().mockResolvedValue(undefined) }))
  return { route: require('@/app/api/tasks/[id]/comments/route'), updateOne }
}

const params = { params: { id: TASK_ID } }
const body = (method: string, data: any) => new NextRequest('http://localhost/x', { method, body: JSON.stringify(data) })

const baseTask = (extra: any = {}) => ({
  _id: TASK_ID,
  organization: 'org1',
  project: PROJECT_ID,
  assignedTo: [],
  createdBy: '64b0000000000000000000e8',
  comments: [{ _id: COMMENT_ID, author: '64b0000000000000000000e6' }],
  ...extra
})

describe('POST /api/tasks/:id/comments', () => {
  it('lets a project member comment on a task they are not assigned to (the F6 bug)', async () => {
    const { route, updateOne } = load('64b0000000000000000000e1', permsFor(Role.TEAM_MEMBER, ProjectRole.PROJECT_MEMBER), baseTask())
    const res = await route.POST(body('POST', { content: 'hello' }), params)
    expect(res.status).not.toBe(403)
    expect(updateOne).toHaveBeenCalled()
  })

  it('still refuses a team member who is not on the project', async () => {
    const { route, updateOne } = load('64b0000000000000000000e3', permsFor(Role.TEAM_MEMBER), baseTask())
    expect((await route.POST(body('POST', { content: 'hello' }), params)).status).toBe(403)
    expect(updateOne).not.toHaveBeenCalled()
  })

  it('refuses a project viewer (task:read only)', async () => {
    const { route } = load('64b0000000000000000000e4', permsFor(Role.VIEWER, ProjectRole.PROJECT_VIEWER), baseTask())
    expect((await route.POST(body('POST', { content: 'hello' }), params)).status).toBe(403)
  })

  it('still lets the assignee comment', async () => {
    const task = baseTask({ assignedTo: [{ user: '64b0000000000000000000e5' }] })
    const { route } = load('64b0000000000000000000e5', permsFor(Role.TEAM_MEMBER), task)
    expect((await route.POST(body('POST', { content: 'hello' }), params)).status).not.toBe(403)
  })

  it('refuses a task in another organisation', async () => {
    const { route } = load('64b0000000000000000000e1', permsFor(Role.ADMIN), baseTask({ organization: 'other-org' }))
    expect((await route.POST(body('POST', { content: 'hello' }), params)).status).toBe(403)
  })
})

describe.each(['PATCH', 'DELETE'] as const)('%s /api/tasks/:id/comments', (method) => {
  const data = { commentId: COMMENT_ID, content: 'edited' }

  it('lets the author change their own comment', async () => {
    const { route, updateOne } = load('64b0000000000000000000e6', permsFor(Role.TEAM_MEMBER, ProjectRole.PROJECT_MEMBER), baseTask())
    expect((await route[method](body(method, data), params)).status).toBe(200)
    expect(updateOne).toHaveBeenCalled()
  })

  it('refuses another member of the same organisation (was allowed before)', async () => {
    const { route, updateOne } = load('64b0000000000000000000e2', permsFor(Role.TEAM_MEMBER, ProjectRole.PROJECT_MEMBER), baseTask())
    expect((await route[method](body(method, data), params)).status).toBe(403)
    expect(updateOne).not.toHaveBeenCalled()
  })

  it('refuses a viewer in the same organisation (was allowed before)', async () => {
    const { route, updateOne } = load('64b0000000000000000000e4', permsFor(Role.VIEWER), baseTask())
    expect((await route[method](body(method, data), params)).status).toBe(403)
    expect(updateOne).not.toHaveBeenCalled()
  })

  it('lets a project manager on the project moderate (task:update on the project)', async () => {
    const { route } = load('64b0000000000000000000e7', permsFor(Role.TEAM_MEMBER, ProjectRole.PROJECT_MANAGER), baseTask())
    expect((await route[method](body(method, data), params)).status).toBe(200)
  })

  it('refuses even the author when the task is in another organisation', async () => {
    const { route } = load('64b0000000000000000000e6', permsFor(Role.ADMIN), baseTask({ organization: 'other-org' }))
    expect((await route[method](body(method, data), params)).status).toBe(403)
  })
})
