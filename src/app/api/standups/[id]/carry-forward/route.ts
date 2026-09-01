/**
 * Panel 4 — the carry-forward register's read (spec CFW-10, CFW-11).
 *
 *   GET /api/standups/:id/carry-forward
 *
 * Read-only, gated on `standup:view` like Panels 2 and 3: the register is
 * part of the board, not a mutation surface. Notes and resolutions have their
 * own item-scoped endpoints under `/api/carry-forward/:itemId/...`, matching
 * §17.6's route table.
 */
import { Permission } from '@/lib/permissions/permission-definitions'
import { loadCarryForwardPanel } from '@/lib/standup/carry-forward-service'
import { ok, withStandupIdPermission } from '@/lib/standup/route-helpers'

export const dynamic = 'force-dynamic'

export const GET = withStandupIdPermission(
  { permission: Permission.STANDUP_VIEW },
  async (_request, { standupId }) => ok(await loadCarryForwardPanel(standupId))
)
