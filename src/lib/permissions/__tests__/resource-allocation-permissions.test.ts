/**
 * Role matrix for the Resource Allocation module.
 *
 * Every internal role may read the sheet; only Admin/HR change it directly or
 * decide requests; only PMs raise requests; history and request reasons are
 * limited to Admin/HR/PM because reasons can carry sensitive HR text.
 */
import fs from 'fs'

import {
  Permission,
  PermissionScope,
  Role,
  ROLE_PERMISSIONS,
  getPermissionScope
} from '@/lib/permissions/permission-definitions'

const RA = [
  Permission.RESOURCE_ALLOCATION_VIEW,
  Permission.RESOURCE_ALLOCATION_MANAGE,
  Permission.RESOURCE_ALLOCATION_REQUEST,
  Permission.RESOURCE_ALLOCATION_APPROVE,
  Permission.RESOURCE_ALLOCATION_VIEW_HISTORY
]

const has = (role: Role, permission: Permission) => ROLE_PERMISSIONS[role].includes(permission)

describe('resource allocation role matrix', () => {
  it.each(RA)('%s is GLOBAL scope', (permission) => {
    expect(permission).toBeDefined()
    expect(getPermissionScope(permission)).toBe(PermissionScope.GLOBAL)
  })

  it('view: every internal role, never client/viewer', () => {
    for (const role of [
      Role.SUPER_ADMIN,
      Role.ADMIN,
      Role.HUMAN_RESOURCE,
      Role.PROJECT_MANAGER,
      Role.TEAM_MEMBER,
      Role.QA_ENGINEER,
      Role.TESTER
    ]) {
      expect(has(role, Permission.RESOURCE_ALLOCATION_VIEW)).toBe(true)
    }
    expect(has(Role.CLIENT, Permission.RESOURCE_ALLOCATION_VIEW)).toBe(false)
    expect(has(Role.VIEWER, Permission.RESOURCE_ALLOCATION_VIEW)).toBe(false)
  })

  it('manage + approve: admin and HR only', () => {
    for (const permission of [
      Permission.RESOURCE_ALLOCATION_MANAGE,
      Permission.RESOURCE_ALLOCATION_APPROVE
    ]) {
      expect(has(Role.ADMIN, permission)).toBe(true)
      expect(has(Role.HUMAN_RESOURCE, permission)).toBe(true)
      for (const role of [
        Role.PROJECT_MANAGER,
        Role.TEAM_MEMBER,
        Role.QA_ENGINEER,
        Role.TESTER,
        Role.CLIENT,
        Role.VIEWER
      ]) {
        expect(has(role, permission)).toBe(false)
      }
    }
  })

  it('request: project manager only (besides super admin)', () => {
    expect(has(Role.PROJECT_MANAGER, Permission.RESOURCE_ALLOCATION_REQUEST)).toBe(true)
    for (const role of [Role.ADMIN, Role.HUMAN_RESOURCE, Role.TEAM_MEMBER, Role.CLIENT]) {
      expect(has(role, Permission.RESOURCE_ALLOCATION_REQUEST)).toBe(false)
    }
  })

  it('view_history: admin, HR, PM only', () => {
    for (const role of [Role.ADMIN, Role.HUMAN_RESOURCE, Role.PROJECT_MANAGER]) {
      expect(has(role, Permission.RESOURCE_ALLOCATION_VIEW_HISTORY)).toBe(true)
    }
    for (const role of [Role.TEAM_MEMBER, Role.QA_ENGINEER, Role.TESTER, Role.CLIENT, Role.VIEWER]) {
      expect(has(role, Permission.RESOURCE_ALLOCATION_VIEW_HISTORY)).toBe(false)
    }
  })

  it('both role modals offer every resource allocation permission', () => {
    for (const file of [
      'src/components/roles/CreateRoleModal.tsx',
      'src/components/roles/EditRoleModal.tsx'
    ]) {
      const source = fs.readFileSync(file, 'utf8')
      expect(source).toContain('PermissionCategory.RESOURCE_ALLOCATION')
      for (const key of ['VIEW', 'MANAGE', 'REQUEST', 'APPROVE', 'VIEW_HISTORY']) {
        expect(source).toContain(`Permission.RESOURCE_ALLOCATION_${key},`)
      }
    }
  })
})
