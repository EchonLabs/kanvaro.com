/**
 * A carry-forward item's mandatory note thread (spec CFW-4, CFW-5, §17.6).
 *
 *   POST /api/carry-forward/:itemId/note   { text, standupId }
 *
 * Gated on `standup:carry_forward_note` — the permission Phase 4's role
 * matrix already carries for exactly this, separate from `standup:run`, so a
 * facilitator role that can run a stand-up but not one entitled to add carry
 * forward commentary is expressible.
 */
import { Permission } from '@/lib/permissions/permission-definitions'
import { addCarryForwardNote } from '@/lib/standup/carry-forward-service'
import { StandupError } from '@/lib/standup/errors'
import { ok, readJson, withCarryForwardItemPermission } from '@/lib/standup/route-helpers'

export const dynamic = 'force-dynamic'

interface NoteBody {
  text: string
  standupId: string
}

export const POST = withCarryForwardItemPermission(
  { permission: Permission.STANDUP_CARRY_FORWARD_NOTE },
  async (request, { itemId, userId }) => {
    const body = await readJson<NoteBody>(request)
    if (!body.standupId) {
      throw new StandupError('VALIDATION_FAILED', 'standupId is required.', { field: 'standupId' })
    }

    const item = await addCarryForwardNote({
      itemId,
      standupId: body.standupId,
      text: String(body.text ?? ''),
      actor: { userId }
    })

    return ok(item)
  }
)
