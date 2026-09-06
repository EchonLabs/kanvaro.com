/**
 * The capacity board and the allocation pool (spec §11, §15.8.7, §17.8).
 *
 *   GET  /api/standups/:id/allocations   — the whole of Panel 5, in one read
 *   POST /api/standups/:id/allocations   — place a task on a member
 *
 * The `GET` is gated on `standup:view`. The `POST` is gated on the narrower
 * `standup:allocate_own` — every role holding `standup:allocate` already
 * holds `standup:allocate_own` too — and then branches internally: acting on
 * somebody else's row, or doing a top-up, still requires the full
 * `standup:allocate` via a direct permission check; self-selecting onto your
 * own row does not (ALO-22/23, SEC-1).
 *
 * The `POST` carries `X-Standup-Version` and is rejected with 409
 * `STALE_STANDUP` on a mismatch. The rejection carries the current server state
 * so the client can roll its optimistic edit back and re-render in one round
 * trip rather than two (RUN-25).
 */
import { Permission } from '@/lib/permissions/permission-definitions'
import { PermissionService } from '@/lib/permissions/permission-service'
import { createAllocation, loadAllocationBoard } from '@/lib/standup/allocation-service'
import { minutes } from '@/lib/standup/minutes'
import { StandupError } from '@/lib/standup/errors'
import {
  ok,
  readJson,
  requireStandupVersion,
  withStandupIdPermission
} from '@/lib/standup/route-helpers'

export const dynamic = 'force-dynamic'

export const GET = withStandupIdPermission(
  { permission: Permission.STANDUP_VIEW },
  async (_request, { standupId }) => ok(await loadAllocationBoard(standupId))
)

interface CreateBody {
  memberId: string
  taskId: string
  plannedMinutes?: number
  source?: string
  note?: string
  pairedDeliberately?: boolean
  selfSelect?: boolean
  topUp?: { reason: string }
}

/**
 * Gated on `standup:allocate_own` here — the wider `standup:allocate` check
 * happens inside `withStandupIdPermission` and would refuse a member outright.
 * Instead this route accepts either permission and narrows internally. A member
 * holding neither permission never reaches this handler at all.
 *
 * **`selfSelect` is derived, never trusted.** The body flag used to decide
 * whether `createAllocation`'s two ALO-23 guards (the project's
 * `allowSelfSelect` setting, and the ownership check) ran at all — so a member
 * holding only `standup:allocate_own` could simply omit it and skip both,
 * landing a row on their own day with a `source` of their choosing even on a
 * project with self-select turned off. Anyone who does not hold the full
 * `standup:allocate` is, by definition, self-selecting: their own row is the
 * only row this handler lets them touch.
 *
 * **RUN-26 is enforced here, not only in the two screens.** A member's own row
 * locks the moment the stand-up leaves `Ready`; `MUTABLE_STATUSES` in
 * `allocation-service.ts` is wider than that on purpose (a PM keeps writing
 * through `In_Progress`), so the member-only restriction belongs on the route
 * that knows who is asking. A PM is deliberately exempt — they are the one
 * running the stand-up.
 */
export const POST = withStandupIdPermission(
  { permission: Permission.STANDUP_ALLOCATE_OWN },
  async (request, { standupId, userId, projectId, standup }) => {
    const body = await readJson<CreateBody>(request)
    const expectedVersion = requireStandupVersion(request)

    const isOwnRow = String(body.memberId) === userId
    const canAllocateOthers = await PermissionService.hasPermission(
      userId,
      Permission.STANDUP_ALLOCATE,
      projectId
    )

    if (!canAllocateOthers) {
      // A member with only STANDUP_ALLOCATE_OWN may act on their own row
      // (self-select, or their own top-up once ALO-22 opens that to members —
      // it does not yet, so topUp still requires STANDUP_ALLOCATE).
      if (!isOwnRow || body.topUp) {
        throw new StandupError(
          'VALIDATION_FAILED',
          'You can only add work to your own day.',
          { memberId: body.memberId }
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

    const isSelfSelect = canAllocateOthers ? Boolean(body.selfSelect) : true

    const result = await createAllocation({
      standupId,
      memberId: String(body.memberId),
      taskId: String(body.taskId),
      ...(body.plannedMinutes === undefined
        ? {}
        : { plannedMinutes: minutes(Number(body.plannedMinutes)) }),
      ...(body.source ? { source: body.source as any } : {}),
      ...(body.note ? { note: body.note } : {}),
      pairedDeliberately: body.pairedDeliberately ?? false,
      selfSelect: isSelfSelect,
      ...(body.topUp ? { topUp: body.topUp } : {}),
      expectedVersion,
      actor: { userId }
    })

    return ok(result, { status: 201 })
  }
)
