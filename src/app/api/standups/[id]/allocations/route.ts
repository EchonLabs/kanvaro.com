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
 * Instead this route accepts either permission and lets `createAllocation`'s
 * own ALO-23 ownership check (input.memberId !== actor.userId) do the actual
 * narrowing, exactly as it already does for self-select. A member holding
 * neither permission never reaches this handler at all.
 */
export const POST = withStandupIdPermission(
  { permission: Permission.STANDUP_ALLOCATE_OWN },
  async (request, { standupId, userId, projectId }) => {
    const body = await readJson<CreateBody>(request)
    const expectedVersion = requireStandupVersion(request)

    const isSelfSelect = Boolean(body.selfSelect)
    const isOwnRow = String(body.memberId) === userId

    // A member with only STANDUP_ALLOCATE_OWN may act on their own row
    // (self-select, or their own top-up once ALO-22 opens that to members —
    // it does not yet, so topUp+own-row still requires STANDUP_ALLOCATE
    // below). Acting on somebody else's row requires the full STANDUP_ALLOCATE
    // a PM holds.
    if (!isOwnRow || body.topUp) {
      const canAllocateOthers = await PermissionService.hasPermission(
        userId,
        Permission.STANDUP_ALLOCATE,
        projectId
      )
      if (!canAllocateOthers) {
        throw new StandupError(
          'VALIDATION_FAILED',
          'You can only add work to your own day.',
          { memberId: body.memberId }
        )
      }
    }

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
