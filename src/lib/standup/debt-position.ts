/**
 * The debt position a stand-up's board must show, and the classifier inputs
 * behind it (Phase 8, Task 6b — AC-13, AC-15, AC-16).
 *
 * **Why this is its own module.** VAR-2 says classification happens when the
 * *next* stand-up completes, but AC-13 requires day 4's panel to show the
 * numbers when day 4's board is built, and AC-15/16 require day 4's *capacity*
 * to already reflect that debt. So the classifier runs twice over identical
 * inputs: provisionally, for display, and persistently, at completion.
 *
 * Both `capacity-context.ts` and `variance-service.ts` need the provisional
 * answer. `variance-service.ts` already imports `capacity-context.ts` — it
 * needs `adjustedMinutes` to size a settlement — so the dependency cannot run
 * the other way without a cycle, which under Next.js's module graph surfaces
 * as an undefined export at runtime rather than a build error. This module
 * imports neither: models and pure functions only.
 *
 * **Provisional entries are de-duplicated against the ledger.** Once a
 * stand-up's completion has persisted an accrual, the same allocation must not
 * also contribute a provisional one, or the debt doubles the moment it becomes
 * real. The `(allocation, entryType)` key that makes the ledger idempotent is
 * the same key used here.
 */
import { Allocation } from '@/models/Allocation'
import { EstimateDebtLedger } from '@/models/EstimateDebtLedger'
import { ProjectStandupSettings } from '@/models/ProjectStandupSettings'
import { Standup } from '@/models/Standup'
import { Task } from '@/models/Task'

import { loadCalendarContext } from './calendar-service'
import { computeDebtPosition, type DebtPosition, type LedgerEntryLike } from './debt'
import { StandupError } from './errors'
import { minutes, ZERO_MINUTES, type Minutes } from './minutes'
import { ownsTaskVariance } from './task-ownership'
import { loadLoggedMinutes, loadTotalLoggedOnTasks, type LoggedMinutesIndex } from './time-logs'
import { classifyAll, type ClassifyInput, type TaskStatusSets } from './variance'

/**
 * The statuses a project treats as done, in progress and blocked.
 *
 * `ProjectStandupSettings` carries `doneStatuses` where a project has
 * customised it; Kanvaro allows free-form kanban statuses, so the defaults
 * below are the ones the rest of this module already assumes (they match
 * `allocation-service.ts`'s pool partition, which must agree with the
 * classifier or a task can be "done" in one and open in the other).
 */
export const DEFAULT_STATUS_SETS: TaskStatusSets = {
  done: ['done', 'cancelled', 'released', 'completed'],
  inProgress: ['in_progress', 'in_review', 'review', 'testing'],
  blocked: ['blocked']
}

export function resolveStatusSets(settings: any): TaskStatusSets {
  return {
    done: settings?.doneStatuses ?? DEFAULT_STATUS_SETS.done,
    inProgress: settings?.inProgressStatuses ?? DEFAULT_STATUS_SETS.inProgress,
    blocked: settings?.blockedStatuses ?? DEFAULT_STATUS_SETS.blocked
  }
}

/**
 * The stand-up "yesterday" means: the previous one **in this sprint** that
 * actually ran (§10.2 step 2). After a weekend, yesterday is Friday; a
 * holiday, a cancellation or a stand-up nobody started is not yesterday at
 * all, because it planned nothing to compare against.
 */
export async function findPreviousStandup(standup: any): Promise<any | null> {
  return Standup.findOne({
    sprint: standup.sprint,
    sprintDayNumber: { $lt: standup.sprintDayNumber },
    status: { $in: ['Completed', 'Reopened', 'In_Progress'] }
  })
    .sort({ sprintDayNumber: -1 })
    .lean()
}

export interface AssembledInputs {
  previousStandupId?: string
  previousStandupDate?: string
  inputs: ClassifyInput[]
  context: {
    standup: any
    previousStandup: any | null
    settings: any
    statusSets: TaskStatusSets
    timezone: string
    taskById: Map<string, any>
    allocationById: Map<string, any>
    logged: LoggedMinutesIndex | null
  }
}

/**
 * Builds the `ClassifyInput[]` for the stand-up *before* `standupId`.
 *
 * The single place those inputs are assembled, so the provisional path and the
 * persisted path cannot drift: whatever the PM read at 09:15 is what the
 * ledger records at 09:30, structurally rather than by inspection.
 */
export async function assembleClassifyInputs(standupId: string): Promise<AssembledInputs> {
  const standup = (await Standup.findById(standupId).lean()) as any
  if (!standup) {
    throw new StandupError('NOT_FOUND', 'That stand-up no longer exists.', { standupId })
  }

  const previous = await findPreviousStandup(standup)
  const settings = await ProjectStandupSettings.findOne({ project: standup.project }).lean()
  const statusSets = resolveStatusSets(settings)

  const empty: AssembledInputs = {
    inputs: [],
    context: {
      standup,
      previousStandup: null,
      settings,
      statusSets,
      timezone: 'UTC',
      taskById: new Map(),
      allocationById: new Map(),
      logged: null
    }
  }

  // Day one has no yesterday, and neither does a sprint whose earlier
  // stand-ups were all skipped.
  if (!previous) return empty

  const allocations = (await Allocation.find({ standup: previous._id })
    .sort({ createdAt: 1 })
    .lean()) as any[]
  if (allocations.length === 0) {
    return { ...empty, previousStandupId: String(previous._id), previousStandupDate: previous.standupDate }
  }

  // `Array.from` rather than spreading a Set: the project's tsconfig targets a
  // level where iterating a Set needs downlevelIteration.
  const taskIds = Array.from(new Set(allocations.map((row) => String(row.task))))
  const memberIds = Array.from(new Set(allocations.map((row) => String(row.member))))

  const calendar = await loadCalendarContext(
    String(standup.project),
    previous.standupDate,
    previous.standupDate
  )

  const [tasks, logged, totals] = await Promise.all([
    Task.find({ _id: { $in: taskIds } })
      .select(
        'displayId title status assignedTo standupOwner originalEstimateMinutes ' +
          'remainingEstimateMinutes sprint descopedAt standupSpillCount carryChainRoot'
      )
      .lean() as Promise<any[]>,
    loadLoggedMinutes({
      projectId: String(standup.project),
      date: previous.standupDate,
      timezone: calendar.timezone,
      memberIds
    }),
    loadTotalLoggedOnTasks(taskIds)
  ])

  const taskById = new Map(tasks.map((task) => [String(task._id), task]))
  const allocationById = new Map(allocations.map((row) => [String(row._id), row]))

  const inputs: ClassifyInput[] = allocations.map((row) => {
    const task = taskById.get(String(row.task))
    const memberId = String(row.member)
    const assignedTo: string[] = (task?.assignedTo ?? [])
      .map((entry: any) => String(entry?.user ?? entry))
      .filter(Boolean)

    return {
      allocationId: String(row._id),
      memberId,
      taskId: String(row.task),
      plannedMinutes: minutes(row.plannedMinutes ?? 0),
      loggedMinutesOnDay: logged.forMemberTask(memberId, String(row.task)),
      originalEstimateMinutes: minutes(task?.originalEstimateMinutes ?? 0),
      totalLoggedMinutesOnTask: totals.get(String(row.task)) ?? ZERO_MINUTES,
      remainingBeforeMinutes: minutes(task?.remainingEstimateMinutes ?? 0),
      taskStatusAtClose: task?.status ?? 'unknown',
      // Rows written before Phase 8 carry no stamp. Falling back to the
      // current status reads as "unchanged", which lands a zero-hour row on
      // V7 — the outcome that accrues no debt and asks the PM a question,
      // rather than V12, which would assert progress nobody recorded.
      taskStatusAtAllocation: row.taskStatusAtAllocation ?? task?.status ?? 'unknown',
      statusSets,
      ...(row.detachedReason ? { detachedReason: row.detachedReason } : {}),
      descoped: Boolean(task?.descopedAt) || String(task?.sprint ?? '') !== String(previous.sprint),
      // The signal available without a status history: the member who was
      // allocated the work is no longer among the task's assignees.
      reassigned: assignedTo.length > 0 && !assignedTo.includes(memberId),
      ownsTaskVariance: ownsTaskVariance(
        { memberId },
        { standupOwner: task?.standupOwner ? String(task.standupOwner) : undefined, assignedTo }
      )
    }
  })

  return {
    previousStandupId: String(previous._id),
    previousStandupDate: previous.standupDate,
    inputs,
    context: {
      standup,
      previousStandup: previous,
      settings,
      statusSets,
      timezone: calendar.timezone,
      taskById,
      allocationById,
      logged
    }
  }
}

/**
 * Each member's debt as this stand-up's board must show it: the persisted
 * ledger balance plus whatever yesterday's rows will post when today completes.
 *
 * This is what makes AC-15 and AC-16 true on day 4 *before* day 4 completes —
 * the 2.0h Kasun went over on day 3 is visible on day 4's board, badged under
 * the absorb policy and taken out of capacity under reduce.
 */
export async function loadDebtPositions(
  standupId: string
): Promise<Map<string, DebtPosition>> {
  const assembled = await assembleClassifyInputs(standupId)
  const standup = assembled.context.standup

  const [persisted] = await Promise.all([
    EstimateDebtLedger.find({ sprint: standup.sprint }).lean() as Promise<any[]>
  ])

  const byMember = new Map<string, LedgerEntryLike[]>()
  const push = (memberId: string, entry: LedgerEntryLike) => {
    const existing = byMember.get(memberId)
    if (existing) existing.push(entry)
    else byMember.set(memberId, [entry])
  }

  /** VAR-3's key: an allocation contributes each entry type at most once. */
  const alreadyPosted = new Set(
    persisted
      .filter((entry) => entry.sourceAllocation)
      .map((entry) => `${String(entry.sourceAllocation)}:${entry.entryType}`)
  )

  for (const entry of persisted) {
    push(String(entry.member), {
      entryType: entry.entryType,
      minutes: minutes(entry.minutes)
    })
  }

  for (const computed of classifyAll(assembled.inputs)) {
    const input = assembled.inputs.find((row) => row.allocationId === computed.allocationId)!
    if (computed.overrunMinutes > 0 && !alreadyPosted.has(`${computed.allocationId}:accrual`)) {
      push(input.memberId, { entryType: 'accrual', minutes: computed.overrunMinutes })
    }
    if (computed.creditMinutes > 0 && !alreadyPosted.has(`${computed.allocationId}:credit`)) {
      push(input.memberId, { entryType: 'credit', minutes: computed.creditMinutes })
    }
  }

  const positions = new Map<string, DebtPosition>()
  const everyone = new Set<string>([
    ...Array.from(byMember.keys()),
    ...(standup.expectedAttendees ?? []).map((id: unknown) => String(id))
  ])
  for (const memberId of Array.from(everyone)) {
    positions.set(memberId, computeDebtPosition(byMember.get(memberId) ?? []))
  }

  return positions
}

/** Convenience for a caller that wants one member and does not have the map. */
export async function debtPositionFor(
  standupId: string,
  memberId: string
): Promise<DebtPosition> {
  const positions = await loadDebtPositions(standupId)
  return positions.get(memberId) ?? computeDebtPosition([])
}

export type { DebtPosition }
export type { Minutes }
