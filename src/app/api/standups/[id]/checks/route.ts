/**
 * The completion checks for one stand-up (spec §10.3, §17.8).
 *
 *   GET /api/standups/:id/checks
 *
 * Panel 7 reads this. It returns all eleven checks — the six Phase 7 can answer
 * and the five that report `not_evaluated` naming their owning phase — plus the
 * blocking subset, so the Complete button's disabled state and its tooltip come
 * from the server rather than being re-derived in the browser.
 *
 * Read-only, and gated on `standup:view`: knowing what stands between the team
 * and a completed stand-up is not a privileged act. Actually completing it is
 * `standup:complete`, and that route is Phase 10's.
 */
import { Permission } from '@/lib/permissions/permission-definitions'
import { loadAllocationBoard } from '@/lib/standup/allocation-service'
import {
  blockingFailures,
  evaluateCompletionChecks,
  type CheckAllocation,
  type CheckMember
} from '@/lib/standup/completion-checks'
import { minutes } from '@/lib/standup/minutes'
import { Task } from '@/models/Task'
import { ok, withStandupIdPermission } from '@/lib/standup/route-helpers'

export const dynamic = 'force-dynamic'

export const GET = withStandupIdPermission(
  { permission: Permission.STANDUP_VIEW },
  async (_request, { standupId, standup }) => {
    const board = await loadAllocationBoard(standupId)

    // The evaluator needs each allocated task's remaining estimate (CC-2), which
    // the board itself does not carry — the board shows what is planned, not
    // what is left on the task.
    const taskIds = board.members.flatMap((member) =>
      member.allocations.map((row: any) => String(row.task))
    )
    const tasks = (await Task.find({ _id: { $in: taskIds } })
      .select('displayId remainingEstimateMinutes')
      .lean()) as any[]
    const byId = new Map(tasks.map((task) => [String(task._id), task]))

    const attendanceByMember = new Map<string, string>(
      (standup.attendance ?? []).map((entry: any) => [String(entry.user), entry.state])
    )

    const members: CheckMember[] = board.members.map((member) => ({
      memberId: member.memberId,
      attendance: attendanceByMember.get(member.memberId) as any,
      capacity: member.capacity,
      allocations: member.allocations.map((row: any): CheckAllocation => {
        const task = byId.get(String(row.task))
        return {
          allocationId: String(row._id),
          taskId: String(row.task),
          taskKey: task?.displayId,
          memberId: member.memberId,
          plannedMinutes: minutes(row.plannedMinutes),
          remainingEstimateMinutes: minutes(task?.remainingEstimateMinutes ?? 0),
          isBlocked: row.isBlocked ?? false,
          excludedFromCapacity: row.excludedFromCapacity ?? false,
          detachedReason: row.detachedReason,
          pairedDeliberately: row.pairedDeliberately ?? false
        }
      })
    }))

    const checks = evaluateCompletionChecks({ shape: board.shape as any, members })

    return ok({
      standupId,
      standupVersion: board.standupVersion,
      checks,
      blocking: blockingFailures(checks).map((check) => check.checkId),
      canComplete: blockingFailures(checks).length === 0
    })
  }
)
