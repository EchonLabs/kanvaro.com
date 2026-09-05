/**
 * Panel 4 — the carry-forward register's read and build (spec CFW-6, CFW-10, CFW-11).
 *
 *   GET  /api/standups/:id/carry-forward   — the panel, as it stands today
 *   POST /api/standups/:id/carry-forward   — build the set the *next* stand-up opens with
 *
 * The `GET` is read-only, gated on `standup:view` like Panels 2 and 3: the
 * register is part of the board, not a mutation surface. The `POST` mirrors
 * `variance/route.ts`'s `classifyAndPost` seam exactly, and for the same
 * reason — `buildCarryForwardSet` is the write Phase 10's completion saga will
 * call, exposed early so the register is not dead code between here and
 * Phase 10. Gated on `standup:complete`: building tomorrow's carry-forward set
 * is part of closing today's stand-up, not part of reading it. Notes and
 * resolutions have their own item-scoped endpoints under
 * `/api/carry-forward/:itemId/...`, matching §17.6's route table.
 */
import { Permission } from '@/lib/permissions/permission-definitions'
import { buildCarryForwardSet, loadCarryForwardPanel } from '@/lib/standup/carry-forward-service'
import {
  ok,
  requireStandupVersion,
  withStandupIdPermission
} from '@/lib/standup/route-helpers'
import { StandupError } from '@/lib/standup/errors'

export const dynamic = 'force-dynamic'

export const GET = withStandupIdPermission(
  { permission: Permission.STANDUP_VIEW },
  async (_request, { standupId }) => ok(await loadCarryForwardPanel(standupId))
)

export const POST = withStandupIdPermission(
  { permission: Permission.STANDUP_COMPLETE },
  async (request, { standupId, userId, standup }) => {
    // RUN-23, matching `variance/route.ts`: a second PM building the register
    // from a stale board must not post against a day they never saw.
    const expectedVersion = requireStandupVersion(request)
    const current = (standup as any).version ?? 0
    if (current !== expectedVersion) {
      throw new StandupError(
        'STALE_STANDUP',
        'Somebody else changed this stand-up while you were working.',
        { currentVersion: current, standupId, status: (standup as any).status }
      )
    }

    const result = await buildCarryForwardSet({
      standupId,
      actor: { type: 'user', userId }
    })
    return ok(result)
  }
)
