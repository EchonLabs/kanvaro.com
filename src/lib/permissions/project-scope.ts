import { Permission, Role } from './permission-definitions'
import type { UserPermissions } from './permission-service'

/**
 * Which projects a caller may read, worked out from permissions already loaded
 * with `PermissionService.getUserPermissions` (no extra query). Same rule as
 * `PermissionService.canAccessProjectIn` and the search route: admins and
 * `project:view_all` see every project in their organisation, everyone else
 * the projects they are on.
 */
export interface ProjectScope {
  allProjects: boolean
  /** The projects the caller is on; empty when `allProjects` is true. */
  projectIds: string[]
}

export function projectScopeOf(permissions: UserPermissions): ProjectScope {
  const allProjects =
    permissions.globalPermissions.includes(Permission.PROJECT_VIEW_ALL) ||
    permissions.userRole === Role.ADMIN ||
    permissions.userRole === Role.SUPER_ADMIN
  return {
    allProjects,
    projectIds: allProjects ? [] : Array.from(permissions.projectPermissions.keys())
  }
}

export function canReadProject(scope: ProjectScope, projectId: string): boolean {
  return scope.allProjects || scope.projectIds.includes(projectId)
}
