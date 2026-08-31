/**
 * The capacity board and the allocation pool (spec §11, §15.8.7, §17.8).
 *
 *   GET  /api/standups/:id/allocations   — the whole of Panel 5, in one read
 *   POST /api/standups/:id/allocations   — place a task on a member
 *
 * The `GET` is gated on `standup:view` and the `POST` on `standup:allocate`,
 * because reading who is planned to do what and *changing* it are different
 * powers: a team member may see the board, only a PM may fill it (SEC-1).
 *
 * The `POST` carries `X-Standup-Version` and is rejected with 409
 * `STALE_STANDUP` on a mismatch. The rejection carries the current server state
 * so the client can roll its optimistic edit back and re-render in one round
 * trip rather than two (RUN-25).
 */
import { Permission } from '@/lib/permissions/permission-definitions'
import { createAllocation, loadAllocationBoard } from '@/lib/standup/allocation-service'
import { minutes } from '@/lib/standup/minutes'
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
}

export const POST = withStandupIdPermission(
  { permission: Permission.STANDUP_ALLOCATE },
  async (request, { standupId, userId }) => {
    const body = await readJson<CreateBody>(request)
    const expectedVersion = requireStandupVersion(request)

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
      expectedVersion,
      actor: { userId }
    })

    return ok(result, { status: 201 })
  }
)
