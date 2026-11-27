import { User } from '@/models/User'
import { Permission } from '@/lib/permissions/permission-definitions'
import { PermissionService, type UserPermissions } from '@/lib/permissions/permission-service'

/**
 * Whose time entries a report may include (decision record F2).
 *
 * Same rule as GET /api/time-tracking/entries:
 * - time_tracking:view_all      → anyone in the organisation
 * - time_tracking:view_assigned → yourself and the people whose project manager
 *                                 or HR partner you are
 * - otherwise                   → only yourself
 *
 * Returns the Mongo filter for TimeEntry.user, `null` for "no restriction", or
 * `'forbidden'` when a specific user was requested that the viewer may not see.
 */
export async function resolveReportUserFilter(args: {
  permissions: UserPermissions
  viewerId: string
  organizationId: string
  requestedUserId?: string | null
}): Promise<string | { $in: string[] } | null | 'forbidden'> {
  const { permissions, viewerId, organizationId, requestedUserId } = args

  if (PermissionService.hasPermissionIn(permissions, Permission.TIME_TRACKING_VIEW_ALL)) {
    return requestedUserId || null
  }

  const allowed = new Set<string>([viewerId])
  if (PermissionService.hasPermissionIn(permissions, Permission.TIME_TRACKING_VIEW_ASSIGNED)) {
    const assigned = (await User.find({
      organization: organizationId,
      $or: [{ projectManager: viewerId }, { humanResourcePartner: viewerId }]
    })
      .select('_id')
      .lean()) as Array<{ _id: unknown }>
    for (const user of assigned) allowed.add(String(user._id))
  }

  if (requestedUserId) {
    return allowed.has(requestedUserId) ? requestedUserId : 'forbidden'
  }
  return { $in: Array.from(allowed) }
}
