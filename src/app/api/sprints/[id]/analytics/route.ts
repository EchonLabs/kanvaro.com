/**
 * The sprint's stand-up analytics report (spec §15.15, UI-13).
 *
 *   GET /api/sprints/:id/analytics
 *
 * Open to anyone holding `standup:view_analytics` on the sprint's project.
 * Which shape they get turns on `standup:view_debt`, never on a role name:
 * holders (Admin, PM) see the full report with individual figures; everyone
 * else sees team aggregates only (NFR-13, D2). The split is applied when the
 * payload is built, so the aggregate response never carries the individual
 * data at all — hiding it in the page would not be enough.
 */
import { PermissionService } from '@/lib/permissions/permission-service'
import { Permission } from '@/lib/permissions/permission-definitions'
import { getSprintAnalytics } from '@/lib/standup/analytics-service'
import { ok, withSprintPermission } from '@/lib/standup/route-helpers'

export const dynamic = 'force-dynamic'

export const GET = withSprintPermission(
  { permission: Permission.STANDUP_VIEW_ANALYTICS },
  async (_request, { userId, projectId, sprint }) => {
    const seesIndividuals = await PermissionService.hasPermission(
      userId,
      Permission.STANDUP_VIEW_DEBT,
      projectId
    )

    return ok(await getSprintAnalytics(sprint, seesIndividuals ? 'full' : 'aggregate'))
  }
)
