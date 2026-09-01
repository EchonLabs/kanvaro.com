/**
 * Resolving a carry-forward item directly from the register row (spec CFW-7).
 *
 *   POST /api/carry-forward/:itemId/resolve   { resolutionType, comment?, standupId }
 *
 * Gated on `standup:run` — resolving is a run-screen action a facilitator
 * takes during the meeting, the same permission that gates attendance and
 * allocation edits, not a configuration change.
 */
import { Permission } from '@/lib/permissions/permission-definitions'
import type { CarryForwardResolutionType } from '@/models/CarryForwardItem'
import { resolveCarryForwardItem } from '@/lib/standup/carry-forward-service'
import { StandupError } from '@/lib/standup/errors'
import { ok, readJson, withCarryForwardItemPermission } from '@/lib/standup/route-helpers'

export const dynamic = 'force-dynamic'

interface ResolveBody {
  resolutionType: CarryForwardResolutionType
  comment?: string
  standupId: string
}

export const POST = withCarryForwardItemPermission(
  { permission: Permission.STANDUP_RUN },
  async (request, { itemId, userId }) => {
    const body = await readJson<ResolveBody>(request)
    if (!body.standupId) {
      throw new StandupError('VALIDATION_FAILED', 'standupId is required.', { field: 'standupId' })
    }
    if (!body.resolutionType) {
      throw new StandupError('VALIDATION_FAILED', 'resolutionType is required.', {
        field: 'resolutionType'
      })
    }

    const item = await resolveCarryForwardItem({
      itemId,
      standupId: body.standupId,
      resolutionType: body.resolutionType,
      comment: body.comment,
      actor: { userId }
    })

    return ok(item)
  }
)
