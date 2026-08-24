/**
 * The degradation feed the run screen, schedule and hub all read (plan §3).
 *
 * Behind `STANDUP_VIEW` rather than open: the notices name infrastructure
 * conditions, which is not something to hand to an unauthenticated caller.
 *
 * The permission check is org-scoped because this route has no dynamic segment
 * for `withStandupPermission` to read a project from. Most notices here are
 * module-wide. When a caller does narrow the scope with `?projectId=`, project
 * access is verified explicitly below — later phases add project-scoped codes
 * (HOLIDAY_COVERAGE_GAP), and an org-scoped check alone would leak them.
 */
import { Permission } from '@/lib/permissions/permission-definitions'
import { PermissionService } from '@/lib/permissions/permission-service'
import { getActiveDegradations } from '@/lib/standup/degradation'
import { ok, withStandupPermission } from '@/lib/standup/route-helpers'

export const dynamic = 'force-dynamic'

export const GET = withStandupPermission(
  { permission: Permission.STANDUP_VIEW },
  async (request, { userId, organizationId }) => {
    const projectId = request.nextUrl.searchParams.get('projectId') ?? undefined
    const sprintId = request.nextUrl.searchParams.get('sprintId') ?? undefined

    if (projectId) {
      await PermissionService.requireProjectAccess(userId, projectId)
    }

    const degradations = await getActiveDegradations({ organizationId, projectId, sprintId })

    return ok({ degradations })
  }
)
