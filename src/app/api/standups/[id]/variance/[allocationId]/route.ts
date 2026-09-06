/**
 * The two answers a variance row can demand (spec VAR-15, VAR-16, AC-17/18).
 *
 *   POST /api/standups/:id/variance/:allocationId
 *
 * One route, two bodies, because they are the same act from the PM's side:
 * answering the question the row is asking.
 *
 *   { newRemainingMinutes, reason, detail? }  — how much longer (V5, V6)
 *   { notStartedReason }                      — why it did not happen (V7)
 *
 * Gated on `standup:revise_estimate`. A team member may read the panel and may
 * not rewrite the numbers the sprint report is built from.
 */
import { Permission } from '@/lib/permissions/permission-definitions'
import { StandupError } from '@/lib/standup/errors'
import {
  recordNotStartedReason,
  reviseRemainingEstimate
} from '@/lib/standup/revision-service'
import {
  ok,
  readJson,
  requireStandupVersion,
  withStandupIdPermission
} from '@/lib/standup/route-helpers'

export const dynamic = 'force-dynamic'

interface AnswerBody {
  newRemainingMinutes?: number
  reason?: string
  detail?: string
  notStartedReason?: string
}

export const POST = withStandupIdPermission(
  { permission: Permission.STANDUP_REVISE_ESTIMATE },
  async (request, { standupId, userId, params }) => {
    const body = await readJson<AnswerBody>(request)
    const expectedVersion = requireStandupVersion(request)
    const allocationId = String(params.allocationId)

    if (body.notStartedReason !== undefined) {
      const result = await recordNotStartedReason({
        standupId,
        allocationId,
        reason: String(body.notStartedReason),
        expectedVersion,
        actor: { userId }
      })
      return ok({ standupId, allocationId, ...result })
    }

    if (body.newRemainingMinutes === undefined) {
      throw new StandupError(
        'VALIDATION_FAILED',
        'Send either a revised remaining estimate or a reason.',
        { allocationId }
      )
    }

    const result = await reviseRemainingEstimate({
      standupId,
      allocationId,
      newRemainingMinutes: Number(body.newRemainingMinutes),
      reason: body.reason as any,
      ...(body.detail === undefined ? {} : { detail: String(body.detail) }),
      expectedVersion,
      actor: { userId }
    })

    return ok({ standupId, allocationId, ...result })
  }
)
