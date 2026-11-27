import { NextResponse } from 'next/server'
import { Project } from '@/models/Project'
import { PermissionService, type UserPermissions } from '@/lib/permissions/permission-service'

/**
 * Field allow-lists for update routes (decision record F7).
 *
 * Several update routes passed the request body straight to the database, so a
 * caller could rewrite fields no form ever sends: organization, createdBy,
 * server-computed estimates and counters, and so on. Each route now lists the
 * fields a client may change; everything else in the body is ignored.
 */
export function pickFields<T extends string>(
  body: unknown,
  allowed: readonly T[]
): Partial<Record<T, any>> {
  const picked: Partial<Record<T, any>> = {}
  if (!body || typeof body !== 'object') return picked
  for (const field of allowed) {
    if (Object.prototype.hasOwnProperty.call(body, field)) {
      picked[field] = (body as Record<string, unknown>)[field]
    }
  }
  return picked
}

/**
 * Moving an item to another project: the target must exist in the caller's
 * organisation and be a project the caller can access. Kanvaro never checked
 * the target project (decision record §2.3), so an item could be moved into a
 * project the caller cannot see. Returns an error response, or null when the
 * move is allowed or the project is unchanged.
 */
export async function rejectUnlessProjectMoveAllowed(args: {
  requestedProjectId: unknown
  currentProjectId: string | undefined
  organizationId: string
  permissions: UserPermissions
}): Promise<NextResponse | null> {
  const { requestedProjectId, currentProjectId, organizationId, permissions } = args
  if (requestedProjectId === undefined || requestedProjectId === null || requestedProjectId === '') return null

  const target = String(requestedProjectId)
  if (target === currentProjectId) return null

  const project = await Project.findOne({ _id: target, organization: organizationId }).select('_id').lean()
  if (!project || !PermissionService.canAccessProjectIn(permissions, target)) {
    return NextResponse.json(
      { error: 'You cannot move this item to that project' },
      { status: 403 }
    )
  }
  return null
}
