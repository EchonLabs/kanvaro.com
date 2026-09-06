/**
 * `GET /api/standups/:id/summary` — the §15.13 summary screen's own payload.
 *
 * Read-only, gated on `standup:view` like every other read in this phase
 * (`variance`, `yesterday`). `getSummary` 404s with the catalogued NOT_FOUND
 * code when the stand-up has not completed yet — the screen shows that as
 * "not available", not a blank page.
 */
import { Permission } from '@/lib/permissions/permission-definitions'
import { getSummary } from '@/lib/standup/summary-service'
import { ok, withStandupIdPermission } from '@/lib/standup/route-helpers'

export const dynamic = 'force-dynamic'

export const GET = withStandupIdPermission(
  { permission: Permission.STANDUP_VIEW },
  async (_request, { standupId }) => ok(await getSummary(standupId))
)
