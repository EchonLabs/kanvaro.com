/**
 * The final-day Sprint-close-readiness panel's data (spec §15.8.11, CC-8, CFW-9).
 * GET is gated on `standup:view` — a member may see what is blocking close,
 * only a PM may change it (that write lives at `.../tasks/[taskId]`).
 */
import { Permission } from '@/lib/permissions/permission-definitions'
import { loadSprintCloseReadiness } from '@/lib/standup/sprint-close-service'
import { ok, withStandupIdPermission } from '@/lib/standup/route-helpers'

export const dynamic = 'force-dynamic'

export const GET = withStandupIdPermission(
  { permission: Permission.STANDUP_VIEW },
  async (_request, { standupId }) => ok(await loadSprintCloseReadiness(standupId))
)
