/**
 * One allocation row (spec ALO-6, RUN-15, RUN-16, RUN-23).
 *
 *   PATCH  /api/standups/:id/allocations/:allocationId  — hours, blocked flags, note
 *   DELETE /api/standups/:id/allocations/:allocationId  — remove the row
 *
 * Both carry `X-Standup-Version`. Both return the member's recomputed capacity,
 * so the stepper and the meter beside it can never disagree: the client renders
 * what the server computed rather than adjusting the number it already had.
 */
import { Permission } from '@/lib/permissions/permission-definitions'
import { removeAllocation, updateAllocation } from '@/lib/standup/allocation-service'
import { minutes } from '@/lib/standup/minutes'
import {
  ok,
  readJson,
  requireStandupVersion,
  withStandupIdPermission
} from '@/lib/standup/route-helpers'

export const dynamic = 'force-dynamic'

interface PatchBody {
  plannedMinutes?: number
  isBlocked?: boolean
  allocatedDespiteBlocked?: boolean
  blockedNote?: string
  excludedFromCapacity?: boolean
  excludeReason?: string
  note?: string
  pairedDeliberately?: boolean
}

export const PATCH = withStandupIdPermission(
  { permission: Permission.STANDUP_ALLOCATE },
  async (request, { standupId, userId, params }) => {
    const body = await readJson<PatchBody>(request)
    const expectedVersion = requireStandupVersion(request)

    return ok(
      await updateAllocation({
        standupId,
        allocationId: params.allocationId,
        ...(body.plannedMinutes === undefined
          ? {}
          : { plannedMinutes: minutes(Number(body.plannedMinutes)) }),
        ...(body.isBlocked === undefined ? {} : { isBlocked: body.isBlocked }),
        ...(body.allocatedDespiteBlocked === undefined
          ? {}
          : { allocatedDespiteBlocked: body.allocatedDespiteBlocked }),
        ...(body.blockedNote === undefined ? {} : { blockedNote: body.blockedNote }),
        ...(body.excludedFromCapacity === undefined
          ? {}
          : { excludedFromCapacity: body.excludedFromCapacity }),
        ...(body.excludeReason === undefined ? {} : { excludeReason: body.excludeReason }),
        ...(body.note === undefined ? {} : { note: body.note }),
        ...(body.pairedDeliberately === undefined
          ? {}
          : { pairedDeliberately: body.pairedDeliberately }),
        expectedVersion,
        actor: { userId }
      })
    )
  }
)

export const DELETE = withStandupIdPermission(
  { permission: Permission.STANDUP_ALLOCATE },
  async (request, { standupId, userId, params }) =>
    ok(
      await removeAllocation({
        standupId,
        allocationId: params.allocationId,
        expectedVersion: requireStandupVersion(request),
        actor: { userId }
      })
    )
)
