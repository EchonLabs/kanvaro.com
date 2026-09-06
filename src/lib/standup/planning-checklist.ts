/**
 * The planning completion checklist (spec §8.3 — PC-1..7, PA-1..6).
 *
 * Pure: it is handed everything it needs and reaches nothing. That is what
 * makes the twelve checks exhaustively testable, and it keeps the gate honest —
 * a check that quietly queried the database could pass or fail depending on
 * timing.
 *
 * Two kinds of item, and the difference is the whole point of the gate:
 *
 *   mandatory (PC-n)  completion is blocked while any of these fails.
 *   advisory  (PA-n)  warns, needs an explicit acknowledgement tick, never
 *                     blocks. PLN-7.
 *
 * Every failing item carries `offendingIds`, because UI-5 requires each failure
 * to expand into the specific tasks with an inline fix control — "3 tasks have
 * no estimate" without saying which three is exactly the hunting the spec is
 * trying to eliminate.
 */
import { formatMinutesAsHours } from './minutes'
import { standupStrings } from './strings'

export type ChecklistKind = 'mandatory' | 'advisory'

export interface ChecklistItem {
  checkId: string
  kind: ChecklistKind
  passed: boolean
  /** Absent when the check passes. */
  message?: string
  /** Task or member ids that caused the failure (UI-5). */
  offendingIds?: string[]
}

export interface ChecklistTaskInput {
  id: string
  /** `KAN-214` — shown in the fix list. */
  key?: string
  title?: string
  type?: string | null
  priority?: string | null
  description?: string | null
  /** Absent or zero means unestimated (PC-3). */
  originalEstimateMinutes?: number | null
  estimateMethod?: 'poker' | 'manual' | null
  /** Members this task is pre-assigned to. Empty is valid — it becomes day-one pool. */
  assigneeIds?: string[]
}

export interface ChecklistMemberInput {
  memberId: string
  name: string
  /** The member's own working day, which may not be the project standard. */
  dailyCapacityMinutes: number
}

export interface ChecklistInput {
  sprintGoal?: string | null
  tasks: ChecklistTaskInput[]
  members: ChecklistMemberInput[]
  /** Working days in the sprint range, from the Phase 1 calendar engine. */
  workingDayCount: number
  startDate: string
  endDate: string
  /** Leave and other adjustments already deducted, in minutes. */
  capacityAdjustmentMinutes?: number
  locale?: string
}

export interface ChecklistResult {
  items: ChecklistItem[]
  mandatory: ChecklistItem[]
  advisory: ChecklistItem[]
  /** Mandatory items that failed. Empty means planning may complete. */
  blockers: ChecklistItem[]
  canComplete: boolean
  /** Totals the planning screen shows above the checklist. */
  totals: {
    taskCount: number
    estimatedTaskCount: number
    totalEstimatedMinutes: number
    totalCapacityMinutes: number
    netCapacityMinutes: number
  }
}

/** PC-1: a goal shorter than this does not say anything. */
const MIN_GOAL_LENGTH = 10
/** PC-4: what "done" means needs at least this much text. */
const MIN_DESCRIPTION_LENGTH = 10
/** PA-2: below this fraction of capacity the team runs dry. */
const UNDER_SCOPE_THRESHOLD = 0.7

const estimateOf = (task: ChecklistTaskInput) => task.originalEstimateMinutes ?? 0
const isEstimated = (task: ChecklistTaskInput) => estimateOf(task) > 0

/**
 * Runs all twelve checks.
 *
 * Order matters only for display; each check is independent, and one failing
 * never suppresses another. The PM should see every problem at once rather than
 * fixing them one reload at a time.
 */
export function evaluatePlanningChecklist(input: ChecklistInput): ChecklistResult {
  const { tasks, members, workingDayCount, locale } = input

  const totalCapacityMinutes = members.reduce(
    (total, member) => total + member.dailyCapacityMinutes * workingDayCount,
    0
  )
  const netCapacityMinutes = Math.max(
    0,
    totalCapacityMinutes - (input.capacityAdjustmentMinutes ?? 0)
  )
  const totalEstimatedMinutes = tasks.reduce((total, task) => total + estimateOf(task), 0)

  const items: ChecklistItem[] = [
    ...mandatoryChecks(input, { workingDayCount }),
    ...advisoryChecks(input, { netCapacityMinutes, totalEstimatedMinutes, locale })
  ]

  const mandatory = items.filter((item) => item.kind === 'mandatory')
  const advisory = items.filter((item) => item.kind === 'advisory')
  const blockers = mandatory.filter((item) => !item.passed)

  return {
    items,
    mandatory,
    advisory,
    blockers,
    canComplete: blockers.length === 0,
    totals: {
      taskCount: tasks.length,
      estimatedTaskCount: tasks.filter(isEstimated).length,
      totalEstimatedMinutes,
      totalCapacityMinutes,
      netCapacityMinutes
    }
  }
}

function mandatoryChecks(
  input: ChecklistInput,
  context: { workingDayCount: number }
): ChecklistItem[] {
  const { sprintGoal, tasks, members, startDate, endDate } = input
  const { planning } = standupStrings

  // PC-1 — a sprint goal of at least 10 characters.
  const goal = (sprintGoal ?? '').trim()
  const pc1: ChecklistItem = pass('PC-1', 'mandatory', goal.length >= MIN_GOAL_LENGTH, planning.pc1)

  // PC-2 — at least one task.
  const pc2: ChecklistItem = pass('PC-2', 'mandatory', tasks.length > 0, planning.pc2)

  // PC-3 — every task estimated. The single most important check: the whole
  // capacity board is meaningless without it.
  const unestimated = tasks.filter((task) => !isEstimated(task))
  const pc3: ChecklistItem = {
    checkId: 'PC-3',
    kind: 'mandatory',
    passed: unestimated.length === 0,
    ...(unestimated.length
      ? {
          message: planning.pc3({ count: unestimated.length }),
          offendingIds: unestimated.map((task) => task.id)
        }
      : {})
  }

  // PC-4 — every task says what done means.
  const undescribed = tasks.filter(
    (task) => (task.description ?? '').trim().length < MIN_DESCRIPTION_LENGTH
  )
  const pc4: ChecklistItem = {
    checkId: 'PC-4',
    kind: 'mandatory',
    passed: undescribed.length === 0,
    ...(undescribed.length
      ? {
          message: planning.pc4({ count: undescribed.length }),
          offendingIds: undescribed.map((task) => task.id)
        }
      : {})
  }

  // PC-5 — every task has a type and a priority.
  const untyped = tasks.filter((task) => !task.type || !task.priority)
  const pc5: ChecklistItem = {
    checkId: 'PC-5',
    kind: 'mandatory',
    passed: untyped.length === 0,
    ...(untyped.length
      ? {
          message: planning.pc5({ count: untyped.length }),
          offendingIds: untyped.map((task) => task.id)
        }
      : {})
  }

  // PC-6 — the sprint has a team.
  const pc6: ChecklistItem = pass('PC-6', 'mandatory', members.length > 0, planning.pc6)

  // PC-7 — a sane date range containing at least one working day. Two distinct
  // failures with different messages: an inverted range and a range that is
  // simply all weekend are different mistakes (E2).
  const rangeValid = startDate <= endDate
  const pc7: ChecklistItem = {
    checkId: 'PC-7',
    kind: 'mandatory',
    passed: rangeValid && context.workingDayCount > 0,
    ...(rangeValid
      ? context.workingDayCount > 0
        ? {}
        : { message: planning.pc7NoWorkingDays() }
      : { message: planning.pc7BadRange() })
  }

  return [pc1, pc2, pc3, pc4, pc5, pc6, pc7]
}

function advisoryChecks(
  input: ChecklistInput,
  context: { netCapacityMinutes: number; totalEstimatedMinutes: number; locale?: string }
): ChecklistItem[] {
  const { tasks, members } = input
  const { netCapacityMinutes, totalEstimatedMinutes, locale } = context
  const { planning } = standupStrings

  const hours = (value: number) => formatMinutesAsHours(value as any, { locale })

  // PA-1 — scope over capacity.
  const overBy = totalEstimatedMinutes - netCapacityMinutes
  const pa1: ChecklistItem = {
    checkId: 'PA-1',
    kind: 'advisory',
    passed: overBy <= 0,
    ...(overBy > 0 ? { message: planning.pa1({ overBy: hours(overBy) }) } : {})
  }

  // PA-2 — scope well under capacity. Only meaningful once there *is* capacity;
  // a sprint with no members is PC-6's problem, not this one.
  const ratio = netCapacityMinutes > 0 ? totalEstimatedMinutes / netCapacityMinutes : 1
  const pa2: ChecklistItem = {
    checkId: 'PA-2',
    kind: 'advisory',
    passed: netCapacityMinutes === 0 || ratio >= UNDER_SCOPE_THRESHOLD,
    ...(netCapacityMinutes > 0 && ratio < UNDER_SCOPE_THRESHOLD
      ? { message: planning.pa2({ percent: Math.round(ratio * 100) }) }
      : {})
  }

  // PA-3 — a task bigger than anybody's single day. Compared against the
  // largest day on the team: a task that fits the full-timers is not oversized
  // just because a part-timer could not finish it in one sitting.
  const largestDay = members.reduce(
    (largest, member) => Math.max(largest, member.dailyCapacityMinutes),
    0
  )
  const oversized = largestDay > 0 ? tasks.filter((task) => estimateOf(task) > largestDay) : []
  const pa3: ChecklistItem = {
    checkId: 'PA-3',
    kind: 'advisory',
    passed: oversized.length === 0,
    ...(oversized.length
      ? {
          message: planning.pa3({ count: oversized.length }),
          offendingIds: oversized.map((task) => task.id)
        }
      : {})
  }

  // PA-4 — estimated without a team vote. Allowed, but visible (PLN-11, E16).
  const manual = tasks.filter((task) => isEstimated(task) && task.estimateMethod === 'manual')
  const pa4: ChecklistItem = {
    checkId: 'PA-4',
    kind: 'advisory',
    passed: manual.length === 0,
    ...(manual.length
      ? {
          message: planning.pa4({ count: manual.length }),
          offendingIds: manual.map((task) => task.id)
        }
      : {})
  }

  // PA-5 / PA-6 — per-member pre-assignment against their own sprint capacity.
  const assignedMinutes = new Map<string, number>()
  for (const task of tasks) {
    for (const memberId of task.assigneeIds ?? []) {
      assignedMinutes.set(memberId, (assignedMinutes.get(memberId) ?? 0) + estimateOf(task))
    }
  }

  const workingDayCount = input.workingDayCount
  const overloaded: ChecklistMemberInput[] = []
  const idle: ChecklistMemberInput[] = []

  for (const member of members) {
    const assigned = assignedMinutes.get(member.memberId) ?? 0
    const capacity = member.dailyCapacityMinutes * workingDayCount
    if (assigned > capacity) overloaded.push(member)
    if (assigned === 0) idle.push(member)
  }

  const pa5: ChecklistItem = {
    checkId: 'PA-5',
    kind: 'advisory',
    passed: overloaded.length === 0,
    ...(overloaded.length
      ? {
          // One sentence per member: the spec's wording names the person and
          // both numbers, which a count alone cannot carry.
          message: overloaded
            .map((member) =>
              planning.pa5({
                name: member.name,
                assigned: hours(assignedMinutes.get(member.memberId) ?? 0),
                capacity: hours(member.dailyCapacityMinutes * workingDayCount)
              })
            )
            .join(' '),
          offendingIds: overloaded.map((member) => member.memberId)
        }
      : {})
  }

  const pa6: ChecklistItem = {
    checkId: 'PA-6',
    kind: 'advisory',
    passed: idle.length === 0,
    ...(idle.length
      ? {
          message: idle.map((member) => planning.pa6({ name: member.name })).join(' '),
          offendingIds: idle.map((member) => member.memberId)
        }
      : {})
  }

  return [pa1, pa2, pa3, pa4, pa5, pa6]
}

/** Helper for the checks whose failure is a single fixed sentence. */
function pass(
  checkId: string,
  kind: ChecklistKind,
  passed: boolean,
  message: () => string
): ChecklistItem {
  return passed ? { checkId, kind, passed } : { checkId, kind, passed, message: message() }
}

/**
 * Whether every failing advisory item has been acknowledged (PLN-7).
 *
 * Advisory items never block completion on their own, but the spec requires an
 * explicit tick so nobody can later claim they were not told.
 */
export function unacknowledgedAdvisories(
  result: ChecklistResult,
  acknowledgedCheckIds: string[]
): ChecklistItem[] {
  return result.advisory.filter(
    (item) => !item.passed && !acknowledgedCheckIds.includes(item.checkId)
  )
}
