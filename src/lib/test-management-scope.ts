import { NextResponse } from 'next/server'
import { Permission, ProjectRole } from '@/lib/permissions/permission-definitions'
import { PermissionService } from '@/lib/permissions/permission-service'
import { hasTestPermission } from '@/lib/permissions/test-permission-helper'

/**
 * Project roles that may see a project's test management data without a
 * global test read permission. Matches the single-item test routes: the
 * project's creator/manager, team members, QA lead and testers. Project viewers
 * and clients are not included.
 */
const TEST_PROJECT_ROLES: string[] = [
  ProjectRole.PROJECT_MANAGER,
  ProjectRole.PROJECT_MEMBER,
  ProjectRole.PROJECT_QA_LEAD,
  ProjectRole.PROJECT_TESTER
]

/**
 * The `project` filter for a test management list (decision record F8).
 *
 * The list endpoints (test cases, plans, suites) checked no permission and
 * returned everything in the organisation, so team members, clients and
 * viewers, who hold no test read permission, could read every project's test
 * data. Now:
 * - with the read permission (role or custom role) → every project, as before;
 * - otherwise → only projects where the caller holds one of TEST_PROJECT_ROLES.
 *
 * Returns the value for `query.project` (undefined = no restriction), or an
 * error response when `requestedProjectId` is outside what the caller may see.
 */
export async function resolveTestListProjectFilter(args: {
  user: { id: string; role: string }
  readPermission: Permission
  requestedProjectId?: string | null
}): Promise<{ filter: string | { $in: string[] } | undefined } | { error: NextResponse }> {
  const { user, readPermission, requestedProjectId } = args

  if (await hasTestPermission(user.id, user.role, readPermission)) {
    return { filter: requestedProjectId || undefined }
  }

  const permissions = await PermissionService.getUserPermissions(user.id)
  const allowed: string[] = []
  permissions.projectRoles.forEach((role, projectId) => {
    if (TEST_PROJECT_ROLES.includes(role)) allowed.push(projectId)
  })

  if (requestedProjectId) {
    return allowed.includes(requestedProjectId)
      ? { filter: requestedProjectId }
      : { error: NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 }) }
  }
  return { filter: { $in: allowed } }
}

export { escapeRegex } from '@/lib/text/escape-regex'
