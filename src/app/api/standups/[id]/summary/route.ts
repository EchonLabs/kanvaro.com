/**
 * `GET /api/standups/:id/summary` — the §15.13 summary screen's own payload.
 *
 * Read-only, gated on `standup:view` like every other read in this phase
 * (`variance`, `yesterday`).
 *
 * Completion is decided by the stand-up's own `status`, not by whether a
 * summary happens to exist, so that is checked first. Both outcomes still
 * answer the catalogued 404 NOT_FOUND the screen already handles, but with a
 * `details.reason` that keeps them apart: `not_completed` is the ordinary
 * "come back later", while `summary_missing` means the stand-up completed and
 * its summary is gone, a data problem the screen must not pass off as
 * "not completed yet".
 */
import { Permission } from '@/lib/permissions/permission-definitions'
import { StandupError } from '@/lib/standup/errors'
import { getSummary } from '@/lib/standup/summary-service'
import { ok, withStandupIdPermission } from '@/lib/standup/route-helpers'

export const dynamic = 'force-dynamic'

/**
 * `Reopened` is here because reopening keeps the last completion's summary
 * until the stand-up is completed again, and the screen has always shown it.
 */
const HAS_BEEN_COMPLETED = new Set(['Completed', 'Reopened'])

export const GET = withStandupIdPermission(
  { permission: Permission.STANDUP_VIEW },
  async (_request, { standupId, standup }) => {
    if (!HAS_BEEN_COMPLETED.has(standup?.status)) {
      throw new StandupError('NOT_FOUND', 'This stand-up has not been completed yet.', {
        reason: 'not_completed',
        status: standup?.status
      })
    }

    try {
      return ok(await getSummary(standupId))
    } catch (error) {
      if (error instanceof StandupError && error.code === 'NOT_FOUND') {
        throw new StandupError('NOT_FOUND', 'This stand-up completed but its summary is missing.', {
          reason: 'summary_missing'
        })
      }
      throw error
    }
  }
)
