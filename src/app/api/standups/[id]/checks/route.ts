/**
 * The completion checks for one stand-up (spec §10.3, §17.8).
 *
 *   GET /api/standups/:id/checks
 *
 * Panel 7 reads this. It returns all eleven checks — the seven that can be
 * answered and the four that report `not_evaluated` naming their owning phase —
 * plus the blocking subset, so the Complete button's disabled state and its
 * tooltip come from the server rather than being re-derived in the browser.
 *
 * Read-only, and gated on `standup:view`: knowing what stands between the team
 * and a completed stand-up is not a privileged act. Actually completing it is
 * `standup:complete`, and that route is Phase 10's.
 */
import { Permission } from '@/lib/permissions/permission-definitions'
import { loadAllocationBoard } from '@/lib/standup/allocation-service'
import { loadBlockersAndSprintHealth } from '@/lib/standup/check-extras'
import { loadCarryForwardPanel } from '@/lib/standup/carry-forward-service'
import {
  blockingFailures,
  evaluateCompletionChecks,
  type CheckAllocation,
  type CheckCarryForwardItem,
  type CheckMember,
  type CheckVarianceRow
} from '@/lib/standup/completion-checks'
import { loadSprintCloseReadiness } from '@/lib/standup/sprint-close-service'
import { loadVariancePanel } from '@/lib/standup/variance-service'
import { ok, withStandupIdPermission } from '@/lib/standup/route-helpers'
import { StandupOverride } from '@/models/StandupOverride'

export const dynamic = 'force-dynamic'

export const GET = withStandupIdPermission(
  { permission: Permission.STANDUP_VIEW },
  async (_request, { standupId, standup }) => {
    const sprintId = String(standup.sprint)

    const [
      board,
      variance,
      carryForward,
      { blockers, sprintHealth },
      sprintCloseReadiness,
      overrideDocs
    ] = await Promise.all([
        loadAllocationBoard(standupId),
        // CC-3 asks whether yesterday has been explained, so it needs yesterday.
        // Passing the rows rather than omitting them is what separates
        // "explained" from "nobody looked".
        loadVariancePanel(standupId),
        loadCarryForwardPanel(standupId),
        // CC-9's blockers and CC-11's sprint health — shared with the /complete
        // saga's server-side re-check so the two never disagree (see
        // check-extras.ts's docblock for what happens when they do).
        loadBlockersAndSprintHealth(standupId, sprintId),
        // CC-8, final day only.
        loadSprintCloseReadiness(standupId),
        // The overrides already on record. The run screen used to track only
        // the ones issued since the page loaded, so a reload re-blocked a check
        // the saga would happily pass — and for CC-3 the second attempt is
        // refused outright ("already deferred once"), stranding the PM.
        StandupOverride.find({ standup: standupId }).lean() as Promise<any[]>
      ])

    // `loadAllocationBoard` already resolves each allocation row's task
    // (`taskId`, `taskKey`, `remainingEstimateMinutes`) via its own Task join
    // — CC-2's inputs need no second query here (this route previously ran
    // one anyway, keyed on a `row.task` field the board's rows don't carry,
    // which cast `"undefined"` to an ObjectId and 500'd on every call; this
    // route had no caller to ever surface that until now).
    const attendanceByMember = new Map<string, string>(
      (standup.attendance ?? []).map((entry: any) => [String(entry.user), entry.state])
    )

    const members: CheckMember[] = board.members.map((member) => ({
      memberId: member.memberId,
      name: member.name,
      attendance: attendanceByMember.get(member.memberId) as any,
      capacity: member.capacity,
      allocations: member.allocations.map(
        (row): CheckAllocation => ({
          allocationId: row.allocationId,
          taskId: row.taskId,
          taskKey: row.taskKey,
          memberId: member.memberId,
          plannedMinutes: row.plannedMinutes,
          remainingEstimateMinutes: row.remainingEstimateMinutes,
          isBlocked: row.isBlocked,
          excludedFromCapacity: row.excludedFromCapacity,
          detachedReason: row.detachedReason,
          pairedDeliberately: row.pairedDeliberately
        })
      )
    }))

    const isDayOne = board.shape === 'day_one'

    const varianceRows: CheckVarianceRow[] = isDayOne
      ? []
      : variance.rows.map((row) => ({
          allocationId: row.allocationId,
          taskId: row.taskId,
          taskKey: row.taskKey,
          memberId: row.memberId,
          requiresRevision: row.requiresRevision,
          requiresReason: row.requiresReason,
          revisedRemainingMinutes: row.revisedRemainingMinutes,
          notStartedReason: row.notStartedReason
        }))

    const carryForwardRows: CheckCarryForwardItem[] = isDayOne
      ? []
      : carryForward.items.map((item) => ({
          itemId: item.itemId,
          taskKey: item.taskKey,
          memberId: item.memberId,
          requiresNoteToday: item.requiresNoteToday,
          notedToday: item.notedToday
        }))

    const checks = evaluateCompletionChecks({
      shape: board.shape as any,
      members,
      variance: varianceRows,
      carryForward: carryForwardRows,
      blockers,
      sprintHealth,
      openTasks: sprintCloseReadiness.openTasks
    })

    return ok({
      standupId,
      standupVersion: board.standupVersion,
      checks,
      overridesIssued: overrideDocs.map((override) => ({
        type: String(override.type),
        affectedMemberIds: (override.affectedMemberIds ?? []).map(String),
        affectedTaskIds: (override.affectedTaskIds ?? []).map(String)
      })),
      blocking: blockingFailures(checks).map((check) => check.checkId),
      canComplete: blockingFailures(checks).length === 0
    })
  }
)
