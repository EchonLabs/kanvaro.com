/**
 * `POST /api/standups/:id/backfill` — SCH-14, E49, §17.6.
 *
 * Thin route; the real work (window check, running the completion saga,
 * stamping `wasBackfilled`/`backfilledAt`) lives in `backfill-service.ts` —
 * same "thin route, real work in a service" split as `start/route.ts`. This
 * route did not exist at all before this task; see `backfill-service.ts`'s
 * docblock for the full picture, including why no `X-Standup-Version` header
 * is required here.
 *
 * Gated on `STANDUP_COMPLETE` rather than a dedicated backfill permission:
 * a backfill *is* a completion (it runs the same saga), just against a
 * `Missed` standup instead of an `In_Progress` one, so whoever may complete
 * a stand-up may also backfill one.
 */
import { NextResponse } from 'next/server'

import { Permission } from '@/lib/permissions/permission-definitions'
import {
  backfillStandup,
  type BackfillAttendanceEntry
} from '@/lib/standup/backfill-service'
import { toErrorResponse } from '@/lib/standup/errors'
import { ok, readJson, withStandupIdPermission } from '@/lib/standup/route-helpers'

export const dynamic = 'force-dynamic'

/**
 * SCH-14 and the route table both describe backfill as taking a **full run
 * payload**; this body took only `notes`, which left the one thing a missed
 * day is missing — attendance — unsendable, and the hard CC-7 check therefore
 * unsatisfiable. `attendance` is validated by the service against the
 * stand-up's own `expectedAttendees`, not here.
 */
interface BackfillBody {
  notes?: string
  attendance?: BackfillAttendanceEntry[]
}

export const POST = withStandupIdPermission(
  { permission: Permission.STANDUP_COMPLETE },
  async (request, { userId, standupId }) => {
    try {
      const body = await readJson<BackfillBody>(request)

      const result = await backfillStandup({
        standupId,
        backfilledBy: userId,
        notes: body.notes,
        attendance: body.attendance
      })

      return ok({
        status: 'completed',
        summaryId: result.summaryId,
        standupId,
        wasBackfilled: result.standup.wasBackfilled,
        backfilledAt: result.standup.backfilledAt
      })
    } catch (error) {
      const { status, body: errorBody } = toErrorResponse(error)
      return NextResponse.json(errorBody, { status })
    }
  }
)
