/**
 * Decision record F11, confirmed live in task 0.6: a viewer called
 * POST /api/roles with every permission, then PUT /api/users/{own id}/role to
 * assign it, and became an administrator. Both steps, and the PM/HR variants,
 * must now be refused.
 */
import { NextRequest } from 'next/server'
import { Permission, Role, ROLE_PERMISSIONS } from '@/lib/permissions/permission-definitions'

const ALL = Object.values(Permission)

const actorFor = (role: Role) => ({
  globalPermissions: [...ROLE_PERMISSIONS[role]],
  projectPermissions: new Map(),
  projectRoles: new Map(),
  userRole: role
})

afterEach(() => jest.resetModules())

function mockAuth(userId: string, role: Role) {
  jest.doMock('@/lib/db-config', () => ({ __esModule: true, default: jest.fn() }))
  jest.doMock('@/lib/auth-utils', () => ({
    authenticateUser: jest.fn().mockResolvedValue({ user: { id: userId, organization: 'org1', role } })
  }))
  jest.doMock('@/lib/permissions/permission-service', () => {
    const real = jest.requireActual('@/lib/permissions/permission-service')
    return {
      PermissionService: {
        getUserPermissions: jest.fn().mockResolvedValue(actorFor(role)),
        hasPermissionIn: real.PermissionService.hasPermissionIn
      }
    }
  })
}

const json = (method: string, body: unknown) =>
  new NextRequest('http://localhost/x', { method, body: JSON.stringify(body) })

describe('POST /api/roles', () => {
  function load(role: Role) {
    mockAuth('caller', role)
    const save = jest.fn()
    const CustomRole: any = jest.fn().mockImplementation((doc: any) => ({ ...doc, save, toObject: () => doc }))
    CustomRole.findOne = jest.fn().mockResolvedValue(null)
    CustomRole.deleteOne = jest.fn()
    jest.doMock('@/models/CustomRole', () => ({ CustomRole }))
    jest.doMock('@/models/User', () => ({ User: { countDocuments: jest.fn() } }))
    return { route: require('@/app/api/roles/route'), save }
  }

  const allPermissionsRole = { name: 'Escalate', description: 'x', permissions: ALL }

  it('refuses a viewer (no user:manage_roles) and saves nothing', async () => {
    const { route, save } = load(Role.VIEWER)
    expect((await route.POST(json('POST', allPermissionsRole))).status).toBe(403)
    expect(save).not.toHaveBeenCalled()
  })

  it.each([Role.PROJECT_MANAGER, Role.HUMAN_RESOURCE])(
    'refuses %s creating an all-permissions role',
    async (role) => {
      const { route, save } = load(role)
      expect((await route.POST(json('POST', allPermissionsRole))).status).toBe(403)
      expect(save).not.toHaveBeenCalled()
    }
  )

  it('lets a project manager create a role within their permissions', async () => {
    const { route, save } = load(Role.PROJECT_MANAGER)
    const res = await route.POST(json('POST', { name: 'Helper', description: 'x', permissions: ROLE_PERMISSIONS[Role.TEAM_MEMBER] }))
    expect(res.status).toBe(201)
    expect(save).toHaveBeenCalled()
  })

  it('lets an admin create an all-permissions role', async () => {
    const { route } = load(Role.ADMIN)
    expect((await route.POST(json('POST', allPermissionsRole))).status).toBe(201)
  })
})

describe('PUT /api/roles/:id', () => {
  function load(role: Role, existingPermissions: string[]) {
    mockAuth('caller', role)
    const save = jest.fn()
    const existing = { _id: 'r1', name: 'Old', description: 'x', permissions: existingPermissions, save, toObject: () => ({}) }
    jest.doMock('@/models/CustomRole', () => ({
      CustomRole: { findOne: jest.fn().mockResolvedValueOnce(existing).mockResolvedValue(null) }
    }))
    jest.doMock('@/models/User', () => ({ User: { countDocuments: jest.fn().mockResolvedValue(0) } }))
    return { route: require('@/app/api/roles/[id]/route'), save }
  }

  it('refuses a viewer', async () => {
    const { route, save } = load(Role.VIEWER, [])
    const res = await route.PUT(json('PUT', { name: 'Old', description: 'x', permissions: ALL }), { params: { id: 'r1' } })
    expect(res.status).toBe(403)
    expect(save).not.toHaveBeenCalled()
  })

  it('refuses a project manager widening a role beyond their permissions', async () => {
    const { route, save } = load(Role.PROJECT_MANAGER, [])
    const res = await route.PUT(json('PUT', { name: 'Old', description: 'x', permissions: ALL }), { params: { id: 'r1' } })
    expect(res.status).toBe(403)
    expect(save).not.toHaveBeenCalled()
  })

  it('refuses a project manager editing a role an admin made more powerful than them', async () => {
    const { route, save } = load(Role.PROJECT_MANAGER, ALL)
    const res = await route.PUT(json('PUT', { name: 'Old', description: 'x', permissions: [] }), { params: { id: 'r1' } })
    expect(res.status).toBe(403)
    expect(save).not.toHaveBeenCalled()
  })
})

describe('PUT /api/users/:id/role', () => {
  function load(role: Role, callerId: string, target: { _id: string; role: string; customRole?: any }, newRolePermissions: string[]) {
    mockAuth(callerId, role)
    const save = jest.fn()
    const user = { ...target, _id: { toString: () => target._id }, save }
    jest.doMock('@/models/User', () => ({
      User: { findOne: jest.fn(() => ({ populate: jest.fn().mockResolvedValue(user) })) }
    }))
    jest.doMock('@/models/CustomRole', () => ({
      CustomRole: { findOne: jest.fn().mockResolvedValue({ _id: 'r1', permissions: newRolePermissions }) }
    }))
    return { route: require('@/app/api/users/[id]/role/route'), save }
  }

  it('refuses a viewer assigning a role to themselves (the confirmed exploit)', async () => {
    const { route, save } = load(Role.VIEWER, 'v1', { _id: 'v1', role: 'viewer' }, ALL)
    const res = await route.PUT(json('PUT', { customRoleId: 'r1' }), { params: { id: 'v1' } })
    expect(res.status).toBe(403)
    expect(save).not.toHaveBeenCalled()
  })

  it('refuses anyone changing their own role, even with user:manage_roles', async () => {
    const { route, save } = load(Role.PROJECT_MANAGER, 'pm', { _id: 'pm', role: 'project_manager' }, [])
    const res = await route.PUT(json('PUT', { customRoleId: 'r1' }), { params: { id: 'pm' } })
    expect(res.status).toBe(403)
    expect(save).not.toHaveBeenCalled()
  })

  it('refuses a project manager changing an admin\'s role', async () => {
    const { route } = load(Role.PROJECT_MANAGER, 'pm', { _id: 'a1', role: 'admin' }, [])
    expect((await route.PUT(json('PUT', { customRoleId: null }), { params: { id: 'a1' } })).status).toBe(403)
  })

  it('refuses a project manager assigning a role beyond their permissions', async () => {
    const { route, save } = load(Role.PROJECT_MANAGER, 'pm', { _id: 't1', role: 'team_member' }, ALL)
    const res = await route.PUT(json('PUT', { customRoleId: 'r1' }), { params: { id: 't1' } })
    expect(res.status).toBe(403)
    expect(save).not.toHaveBeenCalled()
  })

  it('refuses a project manager removing a custom role more powerful than them', async () => {
    const { route } = load(Role.PROJECT_MANAGER, 'pm', { _id: 't1', role: 'team_member', customRole: { permissions: ALL } }, [])
    expect((await route.PUT(json('PUT', { customRoleId: null }), { params: { id: 't1' } })).status).toBe(403)
  })

  it('lets a project manager assign a role within their permissions to a team member', async () => {
    const { route, save } = load(Role.PROJECT_MANAGER, 'pm', { _id: 't1', role: 'team_member' }, ROLE_PERMISSIONS[Role.TEAM_MEMBER])
    const res = await route.PUT(json('PUT', { customRoleId: 'r1' }), { params: { id: 't1' } })
    expect(res.status).toBe(200)
    expect(save).toHaveBeenCalled()
  })
})

describe('POST /api/members/invite', () => {
  function load(role: Role, customRolePermissions: string[] = []) {
    mockAuth('caller', role)
    const invitationCreate = jest.fn()
    jest.doMock('@/models/User', () => ({ User: { findOne: jest.fn().mockResolvedValue(null), findById: jest.fn() } }))
    jest.doMock('@/models/UserInvitation', () => {
      const UserInvitation: any = jest.fn().mockImplementation(() => ({ save: invitationCreate }))
      UserInvitation.findOne = jest.fn().mockResolvedValue(null)
      UserInvitation.create = invitationCreate
      return { UserInvitation }
    })
    jest.doMock('@/models/Organization', () => ({ Organization: { findById: jest.fn().mockResolvedValue(null) } }))
    jest.doMock('@/models/CustomRole', () => ({
      CustomRole: { findOne: jest.fn().mockResolvedValue({ _id: '507f1f77bcf86cd799439011', name: 'X', permissions: customRolePermissions }) }
    }))
    jest.doMock('@/lib/email/EmailService', () => ({ emailService: { sendEmail: jest.fn() } }))
    jest.doMock('@/lib/notification-service', () => ({ notificationService: {} }))
    return { route: require('@/app/api/members/invite/route'), invitationCreate }
  }

  const invite = (role: string) => json('POST', { email: 'new@example.com', role, firstName: 'New', lastName: 'Person' })

  it.each([Role.PROJECT_MANAGER, Role.HUMAN_RESOURCE])('refuses %s inviting an admin', async (role) => {
    const { route, invitationCreate } = load(role)
    const res = await route.POST(invite('admin'))
    expect(res.status).toBe(403)
    expect(invitationCreate).not.toHaveBeenCalled()
  })

  it('refuses a project manager inviting into a custom role beyond their permissions', async () => {
    const { route, invitationCreate } = load(Role.PROJECT_MANAGER, ALL)
    const res = await route.POST(invite('507f1f77bcf86cd799439011'))
    expect(res.status).toBe(403)
    expect(invitationCreate).not.toHaveBeenCalled()
  })

  it('does not refuse a project manager inviting a team member', async () => {
    const { route } = load(Role.PROJECT_MANAGER)
    expect((await route.POST(invite('team_member'))).status).not.toBe(403)
  })
})
