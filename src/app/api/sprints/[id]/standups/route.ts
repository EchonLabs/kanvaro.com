/**
 * The sprint's stand-up schedule (spec §15.6, UI-8, UI-9).
 *
 *   GET /api/sprints/:id/standups
 *
 * Returns every stand-up, including the skipped and cancelled ones with their
 * reasons — UI-9 requires them to stay visible, and a client cannot invent a
 * reason it was never sent.
 */
import { Permission } from '@/lib/permissions/permission-definitions'
import { ok, withSprintPermission } from '@/lib/standup/route-helpers'
import { getSprintSchedule } from '@/lib/standup/schedule'

export const dynamic = 'force-dynamic'

export const GET = withSprintPermission(
  { permission: Permission.STANDUP_VIEW },
  async (_request, { sprintId }) => ok(await getSprintSchedule(sprintId))
)
