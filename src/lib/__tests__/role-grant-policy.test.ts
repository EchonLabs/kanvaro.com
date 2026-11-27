/**
 * F11 role-grant rules, checked against the real system role permission
 * tables so a change to ROLE_PERMISSIONS that reopens an escalation fails here.
 */
import { Permission, Role, ROLE_PERMISSIONS } from '../permissions/permission-definitions'
import type { UserPermissions } from '../permissions/permission-service'
import {
  canManageRoles,
  canWorkWithCustomRole,
  canGrantSystemRole,
  canChangeRoleOf,
  permissionsBeyondActor
} from '../permissions/role-grant-policy'

const as = (role: Role, extra: Permission[] = []): UserPermissions => ({
  globalPermissions: [...ROLE_PERMISSIONS[role], ...extra],
  projectPermissions: new Map(),
  projectRoles: new Map(),
  userRole: role
})

const ALL = Object.values(Permission)

describe('canManageRoles', () => {
  it.each([Role.VIEWER, Role.CLIENT, Role.TEAM_MEMBER])('refuses %s', (role) => {
    expect(canManageRoles(as(role)).ok).toBe(false)
  })

  it.each([Role.ADMIN, Role.SUPER_ADMIN, Role.PROJECT_MANAGER, Role.HUMAN_RESOURCE])('allows %s', (role) => {
    expect(canManageRoles(as(role)).ok).toBe(true)
  })
})

describe('canWorkWithCustomRole', () => {
  it('stops a project manager creating an all-permissions role', () => {
    const decision = canWorkWithCustomRole(as(Role.PROJECT_MANAGER), ALL)
    expect(decision.ok).toBe(false)
  })

  it('stops HR creating an all-permissions role', () => {
    expect(canWorkWithCustomRole(as(Role.HUMAN_RESOURCE), ALL).ok).toBe(false)
  })

  it('lets a project manager create a role within their own permissions', () => {
    expect(canWorkWithCustomRole(as(Role.PROJECT_MANAGER), ROLE_PERMISSIONS[Role.TEAM_MEMBER]).ok).toBe(true)
  })

  it('lets an admin grant anything, even permissions the admin role lacks', () => {
    expect(permissionsBeyondActor(as(Role.ADMIN), ALL)).toEqual([])
    expect(canWorkWithCustomRole(as(Role.ADMIN), ALL).ok).toBe(true)
  })

  it('names the permissions the caller lacks', () => {
    const decision = canWorkWithCustomRole(as(Role.PROJECT_MANAGER), [Permission.SETTINGS_VIEW])
    expect(decision).toEqual({ ok: false, error: expect.stringContaining('settings:view') })
  })
})

describe('canGrantSystemRole', () => {
  it.each([Role.PROJECT_MANAGER, Role.HUMAN_RESOURCE])('stops %s granting the admin role', (role) => {
    expect(canGrantSystemRole(as(role), 'admin').ok).toBe(false)
  })

  it('lets an admin grant the admin role', () => {
    expect(canGrantSystemRole(as(Role.ADMIN), 'admin').ok).toBe(true)
  })

  it.each(['project_manager', 'team_member', 'client', 'viewer', 'human_resource'])(
    'keeps today\'s behaviour for a project manager inviting %s',
    (role) => {
      expect(canGrantSystemRole(as(Role.PROJECT_MANAGER), role).ok).toBe(true)
    }
  )
})

describe('canChangeRoleOf', () => {
  it('refuses changing your own role, even for an admin', () => {
    expect(canChangeRoleOf(as(Role.ADMIN), 'me', { id: 'me', role: 'admin' }).ok).toBe(false)
  })

  it('stops a project manager changing an admin\'s role', () => {
    expect(canChangeRoleOf(as(Role.PROJECT_MANAGER), 'pm', { id: 'a1', role: 'admin' }).ok).toBe(false)
  })

  it('lets a project manager change a team member\'s role', () => {
    expect(canChangeRoleOf(as(Role.PROJECT_MANAGER), 'pm', { id: 't1', role: 'team_member' }).ok).toBe(true)
  })

  it('lets an admin change another admin\'s role', () => {
    expect(canChangeRoleOf(as(Role.ADMIN), 'a1', { id: 'a2', role: 'admin' }).ok).toBe(true)
  })
})
