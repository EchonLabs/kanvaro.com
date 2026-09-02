/**
 * `POST /api/standups/:id/complete` — RUN-19..22, §17.6.
 *
 * Assembles a real `CompletionContext` from the database and hands it to
 * `runCompletionSaga` (Task 16). The saga itself takes fully-loaded data so
 * it stays testable without asserting on every possible loader query — this
 * route is where those loader queries actually live, per the plan's own
 * note that `assembleCompletionContext` is route-local, not a reusable
 * service ("if a second caller ever needs it, promote it then").
 *
 * Two things this route must get right that are easy to get quietly wrong:
 *
 * **`runId` reuse.** `completion-saga.ts`'s own docblock spells out why: a
 * resume call must pass the *same* `runId` the failed attempt used, or
 * `standupCheckpoint.load` reads it as "no prior run" and the saga restarts
 * from `freeze-allocations` instead of resuming. So `assembleCompletionContext`
 * reads `standup.completionState?.runId` back off the document first, and
 * only mints a fresh id when there is none.
 *
 * **`checkInput.blockers` / `checkInput.sprintHealth` must be populated.**
 * Leaving either `undefined` makes the server-side re-check (RUN-19) read
 * CC-9/CC-11 as `not_evaluated` even when the client's provisional check saw
 * real data — exactly the client/server disagreement RUN-19 exists to catch.
 */
import { NextResponse } from 'next/server'

import { Permission } from '@/lib/permissions/permission-definitions'
import { Project } from '@/models/Project'
import { Sprint } from '@/models/Sprint'
import { StandupBlocker } from '@/models/StandupBlocker'
import { StandupOverride } from '@/models/StandupOverride'
import { Task } from '@/models/Task'

import { loadAllocationBoard } from '@/lib/standup/allocation-service'
import {
  type CheckAllocation,
  type CheckBlocker,
  type CheckCarryForwardItem,
  type CheckMember,
  type CheckVarianceRow,
  type EvaluateCompletionChecksInput
} from '@/lib/standup/completion-checks'
import { runCompletionSaga, type CompletionContext } from '@/lib/standup/completion-saga'
import { loadCarryForwardPanel } from '@/lib/standup/carry-forward-service'
import { toErrorResponse } from '@/lib/standup/errors'
import { loadSprintHealthTotals } from '@/lib/standup/jobs/sprint-health'
import { minutes } from '@/lib/standup/minutes'
import {
  readJson,
  requireStandupVersion,
  withStandupIdPermission
} from '@/lib/standup/route-helpers'
import { loadVariancePanel } from '@/lib/standup/variance-service'

export const dynamic = 'force-dynamic'

interface CompleteBody {
  notes?: string
}

export const POST = withStandupIdPermission(
  { permission: Permission.STANDUP_COMPLETE },
  async (request, { userId, organizationId, projectId, standupId, standup }) => {
    try {
      const expectedVersion = requireStandupVersion(request)
      const body = await readJson<CompleteBody>(request)

      const ctx = await assembleCompletionContext({
        standupId,
        standup,
        projectId: projectId ?? String((standup as any).project),
        organizationId,
        completedBy: userId,
        notes: body.notes,
        expectedVersion
      })

      const result = await runCompletionSaga(ctx)

      return NextResponse.json({ status: result.status, summaryId: result.summaryId, standupId })
    } catch (error) {
      const { status, body: errorBody } = toErrorResponse(error)
      return NextResponse.json(errorBody, { status })
    }
  }
)

/**
 * Loads everything `CompletionContext` needs from the same board a client's
 * own provisional check already reads, plus the Phase 8/9/10 rows the saga's
 * own steps and the checks evaluator need.
 */
async function assembleCompletionContext(input: {
  standupId: string
  standup: any
  projectId: string
  organizationId: string
  completedBy: string
  notes?: string
  expectedVersion: number
}): Promise<CompletionContext> {
  const { standupId, standup, projectId, organizationId, completedBy, notes, expectedVersion } =
    input

  const sprintId = String(standup.sprint)

  // Reuse the in-flight run's id on a resume call — see the module docblock.
  const runId: string = standup.completionState?.runId ?? globalThis.crypto.randomUUID()

  const [board, variance, carryForward, blockerDocs, overrideDocs, sprint, adminRecipientIds] =
    await Promise.all([
      loadAllocationBoard(standupId),
      loadVariancePanel(standupId),
      loadCarryForwardPanel(standupId),
      StandupBlocker.find({ standup: standupId }).lean() as Promise<any[]>,
      StandupOverride.find({ standup: standupId }).lean() as Promise<any[]>,
      Sprint.findById(sprintId).select('project organization endDate').lean() as Promise<any>,
      loadProjectAdmins(projectId)
    ])

  // `loadAllocationBoard` already resolves each allocation row's task
  // (`taskKey`, `remainingEstimateMinutes`) via its own Task join, so CC-2's
  // inputs need no second query here. Blockers are a separate collection —
  // `StandupBlocker.task` — so their display key still needs one.
  const blockerTaskIds = blockerDocs.filter((blocker) => blocker.task).map((blocker) => blocker.task)
  const blockerTasks = blockerTaskIds.length
    ? ((await Task.find({ _id: { $in: blockerTaskIds } })
        .select('displayId')
        .lean()) as any[])
    : []
  const taskKeyById = new Map(blockerTasks.map((task) => [String(task._id), task.displayId as string]))

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

  const varianceRows: CheckVarianceRow[] | undefined = isDayOne
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

  const carryForwardRows: CheckCarryForwardItem[] | undefined = isDayOne
    ? []
    : carryForward.items.map((item) => ({
        itemId: item.itemId,
        taskKey: item.taskKey,
        memberId: item.memberId,
        requiresNoteToday: item.requiresNoteToday,
        notedToday: item.notedToday
      }))

  const blockers: CheckBlocker[] = blockerDocs.map((blocker) => ({
    blockerId: String(blocker._id),
    taskKey: blocker.task ? taskKeyById.get(String(blocker.task)) : undefined,
    hasOwner: Boolean(blocker.owner),
    hasTargetDate: Boolean(blocker.targetResolutionDate)
  }))

  const sprintHealth = sprint
    ? await loadSprintHealthTotals(sprint, new Date())
    : { remainingEstimateMinutes: minutes(0), remainingCapacityMinutes: minutes(0) }

  const checkInput: EvaluateCompletionChecksInput = {
    shape: board.shape as EvaluateCompletionChecksInput['shape'],
    members,
    variance: varianceRows,
    carryForward: carryForwardRows,
    blockers,
    sprintHealth
  }

  const attendeeIds: string[] = (standup.expectedAttendees ?? []).map(String)

  const memberCommitments = board.members.map((member) => ({
    memberId: member.memberId,
    hasAnyAllocation: member.allocations.length > 0
  }))

  const overridesIssued = overrideDocs.map((override) => ({
    overrideId: String(override._id),
    type: String(override.type),
    affectedMemberIds: (override.affectedMemberIds ?? []).map(String),
    affectedTaskIds: (override.affectedTaskIds ?? []).map(String)
  }))

  // §15.13's summary — assembled from the same reads above, so what the PM
  // saw on the board is what the summary records (mirrors `variance-service`'s
  // own "one set of facts" rule for classification vs. display).
  const nameById = new Map(board.members.map((member) => [member.memberId, member.name]))

  // Cast rather than typed literally: `IStandupSummary`'s sub-fields are
  // typed against Mongoose `Types.ObjectId`, but every id here is the plain
  // string id the rest of this route (and `BuildSummaryInput`'s own Mixed
  // schema storage) already works in.
  const summaryInputs = {
    headerFacts: {
      standupDate: board.date,
      dayNumber: board.sprintDayNumber,
      totalDays: board.totalSprintDays,
      facilitatorName: board.facilitatorName,
      durationMinutes: standup.durationMinutes ?? 0
    },
    attendance: (standup.attendance ?? []).map((entry: any) => ({
      memberId: entry.user,
      name: nameById.get(String(entry.user)) ?? String(entry.user),
      status: entry.state
    })),
    completedYesterday: variance.rows
      .filter((row) => row.outcome.startsWith('delivered'))
      .map((row) => ({ taskId: row.taskId, taskKey: row.taskKey, title: row.title })),
    varianceTable: variance.rows.map((row) => ({
      allocationId: row.allocationId,
      taskKey: row.taskKey,
      memberId: row.memberId,
      outcome: row.outcome,
      dayVarianceMinutes: row.dayVarianceMinutes
    })),
    debtMovements: variance.members.map((member) => ({
      memberId: member.memberId,
      outstandingDebtMinutes: member.outstandingDebtMinutes,
      surplusMinutes: member.surplusMinutes
    })),
    memberCommitments: board.members.map((member) => ({
      memberId: member.memberId as any,
      name: member.name,
      allocations: member.allocations.map((row) => ({
        taskId: row.taskId as any,
        taskKey: row.taskKey,
        plannedMinutes: row.plannedMinutes
      }))
    })),
    blockersRaised: blockerDocs.map((blocker) => ({
      blockerId: String(blocker._id),
      description: blocker.description,
      blockerType: blocker.blockerType,
      severity: blocker.severity,
      status: blocker.status
    })),
    blockersResolved: blockerDocs
      .filter((blocker) => blocker.status === 'resolved' || blocker.status === 'wont_resolve')
      .map((blocker) => ({
        blockerId: String(blocker._id),
        resolutionNote: blocker.resolutionNote
      })),
    carryForwardState: carryForward.items.map((item) => ({
      itemId: item.itemId,
      taskKey: item.taskKey,
      ageBand: item.ageBand,
      status: item.status
    })),
    overridesIssued: overrideDocs.map((override) => ({
      overrideId: String(override._id),
      type: override.type,
      reasonCode: override.reasonCode,
      justification: override.justification
    })),
    ...(notes ? { pmNotes: notes } : {})
  } as unknown as CompletionContext['summaryInputs']

  return {
    runId,
    standupId,
    sprintId,
    projectId,
    organizationId,
    completedBy,
    ...(notes ? { notes } : {}),
    checkInput,
    expectedVersion,
    attendeeIds,
    adminRecipientIds,
    memberCommitments,
    overridesIssued,
    summaryInputs,
    summaryUrl: `/standups/${standupId}`
  }
}

/** VAR-8's "the project admin", reused: the project's creator plus its project managers. */
async function loadProjectAdmins(projectId: string): Promise<string[]> {
  const project = (await Project.findById(projectId).select('createdBy projectRoles').lean()) as any
  if (!project) return []

  const managers = (project.projectRoles ?? [])
    .filter((entry: any) => entry?.role === 'project_manager')
    .map((entry: any) => String(entry.user))

  return Array.from(new Set([String(project.createdBy ?? ''), ...managers].filter(Boolean)))
}
