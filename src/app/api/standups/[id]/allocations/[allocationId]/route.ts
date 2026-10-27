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
import { NextResponse } from 'next/server'

import { Permission } from '@/lib/permissions/permission-definitions'
import { PermissionService } from '@/lib/permissions/permission-service'
import { Allocation } from '@/models/Allocation'
import { removeAllocation, updateAllocation } from '@/lib/standup/allocation-service'
import { StandupError } from '@/lib/standup/errors'
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

/**
 * RUN-25's "member pre-edit while `Ready`". Gated on the narrower
 * `standup:allocate_own` so a member can adjust the hours on their *own* row
 * from `/my/standup`, then narrowed inside exactly like the sibling POST:
 * somebody else's row needs the full `standup:allocate`, and a caller without
 * it is additionally held to RUN-26 — their own row locks the moment the
 * stand-up leaves `Ready`. A PM holding `standup:allocate` is exempt from that
 * lock by design.
 *
 * The ownership read below is a `.lean()` select of two fields, not a write —
 * `allocation-service.ts` remains the module's only writer of `Allocation`.
 */
export const PATCH = withStandupIdPermission(
  { permission: Permission.STANDUP_ALLOCATE_OWN },
  async (request, { standupId, userId, projectId, params, standup }) => {
    const body = await readJson<PatchBody>(request)
    const expectedVersion = requireStandupVersion(request)

    const row = (await Allocation.findById(params.allocationId)
      .select('member standup')
      .lean()) as { member?: unknown; standup?: unknown } | null

    // Same "not found" shape `updateAllocation`'s own `findAllocation` uses for
    // an allocation belonging to another stand-up.
    if (!row || String(row.standup) !== standupId) {
      throw new StandupError('NOT_FOUND', 'That allocation no longer exists.', {
        allocationId: params.allocationId
      })
    }

    const canAllocateOthers = await PermissionService.hasPermission(
      userId,
      Permission.STANDUP_ALLOCATE,
      projectId
    )

    if (!canAllocateOthers) {
      if (String(row.member) !== userId) {
        return NextResponse.json(
          { error: { code: 'FORBIDDEN', message: 'You can only change your own row.' } },
          { status: 403 }
        )
      }
      if (standup.status !== 'Ready') {
        throw new StandupError(
          'VALIDATION_FAILED',
          'Your own row can only be edited while the stand-up is Ready.',
          { status: standup.status }
        )
      }
    }

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

/**
 * PM-only, deliberately. ALO-22 is "additions only, never removals" for the
 * member-facing surface, and nothing in `/my/standup` calls this — so the
 * narrower `standup:allocate_own` is not extended to row removal.
 */
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
