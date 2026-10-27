/**
 * Panel 3 — variance and estimate debt (spec §12, §15.8.5, §17.8).
 *
 *   GET  /api/standups/:id/variance   — the panel, computed live
 *   POST /api/standups/:id/variance   — classify and post to the ledger
 *
 * The `GET` is gated on `standup:view` and writes nothing: it classifies
 * yesterday in memory so the board and the panel show the same numbers the
 * ledger will record. The `POST` is the idempotent unit Phase 10's completion
 * saga will call, so it is gated on `standup:complete` — posting estimate debt
 * is part of closing a day, not part of reading one.
 */
import { Permission } from '@/lib/permissions/permission-definitions'
import { classifyAndPost, loadVariancePanel } from '@/lib/standup/variance-service'
import {
  ok,
  requireStandupVersion,
  withStandupIdPermission
} from '@/lib/standup/route-helpers'

export const dynamic = 'force-dynamic'

export const GET = withStandupIdPermission(
  { permission: Permission.STANDUP_VIEW },
  async (_request, { standupId }) => ok(await loadVariancePanel(standupId))
)

export const POST = withStandupIdPermission(
  { permission: Permission.STANDUP_COMPLETE },
  async (request, { standupId, userId, standup }) => {
    // RUN-23. Classification changes the ledger, so it carries the version like
    // every other mutation — a second PM completing from a stale board would
    // otherwise post against numbers they never saw.
    const expectedVersion = requireStandupVersion(request)
    const current = (standup as any).version ?? 0
    if (current !== expectedVersion) {
      const { StandupError } = await import('@/lib/standup/errors')
      throw new StandupError(
        'STALE_STANDUP',
        'Somebody else changed this stand-up while you were working.',
        { currentVersion: current, standupId, status: (standup as any).status }
      )
    }

    const result = await classifyAndPost({ standupId, actor: { userId } })
    return ok({ standupId, ...result })
  }
)
