/**
 * Attendance and the RUN-7 reassign action (spec §10.2 step 1; plan §6.4 OB-13).
 *
 *   PATCH /api/standups/:id/attendance            — set one member's state
 *   POST  /api/standups/:id/attendance/reassign   — answer the reassign prompt
 *
 * Both live on one file because they are one interaction: setting somebody
 * absent raises the prompt, and the prompt's only action is the reassignment.
 * Splitting them across two routes would let a client take the first half
 * without ever being offered the second, which is how six hours of planned work
 * quietly leaves the board.
 *
 * Gated on `standup:run` rather than `standup:allocate`: marking who turned up
 * is the facilitator's job, and it is the act that *causes* an allocation
 * change rather than being one.
 */
import { Permission } from '@/lib/permissions/permission-definitions'
import { reassignDetached, setAttendance } from '@/lib/standup/attendance-service'
import { minutes } from '@/lib/standup/minutes'
import {
  ok,
  readJson,
  requireStandupVersion,
  withStandupIdPermission
} from '@/lib/standup/route-helpers'

export const dynamic = 'force-dynamic'

interface AttendanceBody {
  memberId: string
  state: string
  partialMinutes?: number
  reason?: string
  note?: string
}

export const PATCH = withStandupIdPermission(
  { permission: Permission.STANDUP_RUN },
  async (request, { standupId, userId }) => {
    const body = await readJson<AttendanceBody>(request)
    const expectedVersion = requireStandupVersion(request)

    return ok(
      await setAttendance({
        standupId,
        memberId: String(body.memberId),
        state: body.state as any,
        ...(body.partialMinutes === undefined
          ? {}
          : { partialMinutes: minutes(Number(body.partialMinutes)) }),
        ...(body.reason ? { reason: body.reason } : {}),
        ...(body.note ? { note: body.note } : {}),
        expectedVersion,
        actor: { userId }
      })
    )
  }
)

interface ReassignBody {
  fromMemberId: string
  toMemberId: string
  /** Omitted means every detached row for that member. */
  allocationIds?: string[]
}

export const POST = withStandupIdPermission(
  { permission: Permission.STANDUP_ALLOCATE },
  async (request, { standupId, userId }) => {
    const body = await readJson<ReassignBody>(request)
    const expectedVersion = requireStandupVersion(request)

    return ok(
      await reassignDetached({
        standupId,
        fromMemberId: String(body.fromMemberId),
        toMemberId: String(body.toMemberId),
        ...(body.allocationIds?.length ? { allocationIds: body.allocationIds } : {}),
        expectedVersion,
        actor: { userId }
      })
    )
  }
)
