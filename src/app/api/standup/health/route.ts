/**
 * The degradation feed the run screen, schedule and hub all read (plan §3).
 *
 * Behind `STANDUP_VIEW` rather than open: the notices name infrastructure
 * conditions, which is not something to hand to an unauthenticated caller.
 *
 * The route has no dynamic segment, so the project comes from `?projectId=`
 * and the helper checks the permission against it and verifies project access.
 * That matters in both directions: project-scoped codes (HOLIDAY_COVERAGE_GAP)
 * would leak under an org-scoped check alone, and a team member — whose
 * stand-up permissions come from project membership, never organisation-wide —
 * would be refused the banner on a project they are on.
 *
 * Called with no `projectId`, the check stays org-scoped and returns only
 * module-wide notices, which is what a caller with no project in hand wants.
 */
import { Permission } from '@/lib/permissions/permission-definitions'
import { getActiveDegradations } from '@/lib/standup/degradation'
import { ok, withStandupPermission } from '@/lib/standup/route-helpers'

export const dynamic = 'force-dynamic'

export const GET = withStandupPermission(
  // `projectIdQuery` so `?projectId=` drives the permission check itself, not
  // just the query below. Most non-admin roles hold STANDUP_VIEW through
  // project membership rather than organisation-wide, and an org-scoped check
  // would refuse them the banner on their own project.
  { permission: Permission.STANDUP_VIEW, projectIdQuery: 'projectId' },
  async (request, { organizationId, projectId }) => {
    const sprintId = request.nextUrl.searchParams.get('sprintId') ?? undefined

    // OB-3: coverage is only answerable against a range — "is the calendar
    // complete?" has no meaning without saying complete through when — so the
    // Schedule hub passes its sprint's range and HOLIDAY_COVERAGE_GAP can fire.
    const from = request.nextUrl.searchParams.get('from') ?? undefined
    const to = request.nextUrl.searchParams.get('to') ?? undefined
    const dateRange = from && to ? { from, to } : undefined

    const degradations = await getActiveDegradations({
      organizationId,
      projectId,
      sprintId,
      dateRange
    })

    return ok({ degradations })
  }
)
