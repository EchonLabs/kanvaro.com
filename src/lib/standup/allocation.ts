/**
 * The pure allocation rules (spec §11.2 and §11.4, ALO-5 … ALO-9 and ALO-13 … ALO-17).
 *
 * Everything here is a function of numbers. It runs unchanged on the server,
 * where it decides what a `POST` stores, and on the client, where it previews
 * what a drop will do before the request is sent — which is precisely why it
 * must not throw on inputs the service layer would refuse. An unestimated task
 * is a completion-check failure (CC-2), not an exception; the preview still has
 * to render.
 *
 * Two halves: the per-allocation rules that decide a row's numbers, and the
 * pool rules that decide which tasks are still unplanned. They share a file
 * because the "fits" indicator sits across the seam — it is a pool concern
 * expressed against a capacity gap.
 */
import {
  clampToZero,
  minMinutes,
  minutes,
  subtractMinutes,
  sumMinutes,
  ZERO_MINUTES,
  type Minutes
} from './minutes'

/**
 * The allocation grain: 0.25 hours (ALO-6).
 *
 * Also the floor for ALO-5's default, which is why it lives here rather than
 * inside the stepper component — the server applies the same floor the UI
 * shows, or the two disagree on the first sub-quarter-hour task.
 */
export const ALLOCATION_STEP_MINUTES = minutes(15)

/**
 * What ALO-5 offers against a day with no room left.
 *
 * The spec's wording — "the default is min(remaining, 1) and the member goes
 * into over status, prompting the PM" — is deliberate: the PM dropped the task
 * knowing the day was full, so the rule produces a number and lets the capacity
 * meter raise the objection. Refusing here would mean the only way to plan an
 * overcommitted day is to first fake a gap.
 */
const FULL_DAY_FALLBACK_MINUTES = minutes(60)

export interface DefaultPlannedMinutesInput {
  remainingEstimateMinutes: Minutes
  /** The member's `gapMinutes` from `computeCapacity`. May be zero or negative. */
  gapMinutes: Minutes
  /** The member's full-day capacity, used only for the ALO-8 advisory upstream. */
  nominalMinutes: Minutes
}

/**
 * ALO-5. The hours to pre-fill when a task lands on a member.
 *
 * `min(remaining, gap)`, floored at one step and never zero. When the gap is
 * gone the offer is `min(remaining, 1h)` instead, which lands the member in
 * `over` on purpose.
 */
export function defaultPlannedMinutes(input: DefaultPlannedMinutesInput): Minutes {
  const remaining = clampToZero(input.remainingEstimateMinutes)

  const ceiling =
    input.gapMinutes > ZERO_MINUTES ? input.gapMinutes : FULL_DAY_FALLBACK_MINUTES

  const offered = minMinutes(remaining, ceiling)

  return offered < ALLOCATION_STEP_MINUTES ? ALLOCATION_STEP_MINUTES : offered
}

export interface SplitDescription {
  plannedMinutes: Minutes
  remainingEstimateMinutes: Minutes
  /** What is left for tomorrow. Always positive — a null result means nothing carries. */
  carriesMinutes: Minutes
}

/**
 * ALO-7. The explicit split shown under a partial allocation —
 * "3.0h of 7.0h remaining, 4.0h will carry to tomorrow."
 *
 * Null when the allocation covers the remainder, so the caller renders nothing
 * rather than "0.0h will carry", which reads as a defect.
 */
export function describeSplit(
  plannedMinutes: Minutes,
  remainingEstimateMinutes: Minutes
): SplitDescription | null {
  const carries = subtractMinutes(remainingEstimateMinutes, plannedMinutes)
  if (carries <= ZERO_MINUTES) return null

  return { plannedMinutes, remainingEstimateMinutes, carriesMinutes: carries }
}

/**
 * ALO-8. Whether to advise splitting a task into subtasks.
 *
 * Measured against **nominal** capacity, never effective. The advisory is about
 * the task being too coarse to show daily progress, which is a property of the
 * task; a member on half a day of leave has not suddenly made every four-hour
 * task oversized.
 *
 * Advisory only. Nothing in the module may block on it.
 */
export function largerThanOneDay(
  remainingEstimateMinutes: Minutes,
  nominalMinutes: Minutes
): boolean {
  return remainingEstimateMinutes > nominalMinutes
}

export interface PairingWarning {
  totalMinutes: Minutes
  remainingEstimateMinutes: Minutes
  overByMinutes: Minutes
}

/**
 * ALO-9. Two members on one task is legal when the PM confirms it is deliberate
 * pairing; the warning is about the *arithmetic*, not the pairing.
 *
 * Silent for a single allocation however large — that case belongs to ALO-8,
 * and raising both would tell the PM the same thing twice in two different
 * words.
 */
export function pairingWarning(
  allocations: readonly { plannedMinutes: Minutes }[],
  remainingEstimateMinutes: Minutes
): PairingWarning | null {
  if (allocations.length < 2) return null

  const total = sumMinutes(allocations, (allocation) => allocation.plannedMinutes)
  const overBy = subtractMinutes(total, remainingEstimateMinutes)
  if (overBy <= ZERO_MINUTES) return null

  return { totalMinutes: total, remainingEstimateMinutes, overByMinutes: overBy }
}

/* ------------------------------------------------------------------------- *
 * The unassigned pool (spec §11.4, ALO-13 … ALO-17)
 * ------------------------------------------------------------------------- */

/** A sprint task as the pool sees it. Deliberately not the Mongoose document. */
export interface PoolTask {
  taskId: string
  key?: string
  title: string
  status: string
  type: string
  priority: string
  labels: string[]
  epicId?: string
  remainingEstimateMinutes: Minutes
  /** Backlog rank. `position` on the Task document. */
  position: number
  assigneeIds: string[]
}

/** The subset of an allocation the partition needs. */
export interface PoolAllocation {
  taskId: string
  memberId: string
  excludedFromCapacity?: boolean
  /** Set means the row was detached by RUN-7 and no longer plans anything. */
  detachedReason?: string
}

export interface PoolPartition {
  /** ALO-14 tab 1: no assignee at all. */
  unassigned: PoolTask[]
  /** ALO-14 tab 2: has an assignee, but nothing planned for today. */
  assignedNotPlanned: PoolTask[]
}

/**
 * ALO-13 and ALO-14. Splits the sprint's tasks into the pool's two tabs.
 *
 * A task is in the pool when it is not done and has no *live* allocation on
 * this stand-up.
 *
 * "Live" is the load-bearing word. A detached allocation (RUN-7 — the owner is
 * absent, §6.4 OB-13) is kept for Phase 9 to sweep into the carry-forward
 * register, but it plans nothing: its task must return to the pool or the
 * reassign prompt has nothing to offer and the work silently leaves the board
 * for the day.
 *
 * A row merely excluded from capacity (RUN-15 — blocked) is the opposite case
 * and stays out of the pool. It is still planned; it just does not count
 * against the meter. Offering it again would let the PM allocate the same task
 * twice and trip CC-10 at completion.
 */
export function partitionPool(
  tasks: readonly PoolTask[],
  allocations: readonly PoolAllocation[],
  doneStatuses: readonly string[]
): PoolPartition {
  const done = new Set(doneStatuses.map((status) => status.toLowerCase()))

  const planned = new Set(
    allocations.filter((row) => !row.detachedReason).map((row) => row.taskId)
  )

  const partition: PoolPartition = { unassigned: [], assignedNotPlanned: [] }

  for (const task of tasks) {
    if (done.has(task.status.toLowerCase())) continue
    if (planned.has(task.taskId)) continue

    if (task.assigneeIds.length === 0) {
      partition.unassigned.push(task)
    } else {
      partition.assignedNotPlanned.push(task)
    }
  }

  return partition
}

export type PoolSort = 'priority' | 'estimate_asc' | 'estimate_desc' | 'backlog_rank'

/** Most urgent first. Matches the Task model's enum. */
const PRIORITY_ORDER: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3
}

/** ALO-15's sorts. Returns a new array; the caller's order is never disturbed. */
export function sortPool(tasks: readonly PoolTask[], sort: PoolSort): PoolTask[] {
  const sorted = [...tasks]

  switch (sort) {
    case 'priority':
      return sorted.sort(
        (a, b) =>
          (PRIORITY_ORDER[a.priority] ?? Number.MAX_SAFE_INTEGER) -
          (PRIORITY_ORDER[b.priority] ?? Number.MAX_SAFE_INTEGER)
      )
    case 'estimate_asc':
      return sorted.sort((a, b) => a.remainingEstimateMinutes - b.remainingEstimateMinutes)
    case 'estimate_desc':
      return sorted.sort((a, b) => b.remainingEstimateMinutes - a.remainingEstimateMinutes)
    case 'backlog_rank':
      return sorted.sort((a, b) => a.position - b.position)
  }
}

export interface PoolFilter {
  types?: string[]
  priorities?: string[]
  labels?: string[]
  epicIds?: string[]
  /** The estimate band's upper bound. */
  maxEstimateMinutes?: Minutes
  minEstimateMinutes?: Minutes
  /** Matches key and title, case-insensitively. */
  search?: string
}

/** ALO-15's filters. Conjunctive: every supplied criterion must hold. */
export function filterPool(tasks: readonly PoolTask[], filter: PoolFilter): PoolTask[] {
  const search = filter.search?.trim().toLowerCase()

  return tasks.filter((task) => {
    if (filter.types?.length && !filter.types.includes(task.type)) return false
    if (filter.priorities?.length && !filter.priorities.includes(task.priority)) return false
    if (filter.labels?.length && !filter.labels.some((label) => task.labels.includes(label))) {
      return false
    }
    if (filter.epicIds?.length && (!task.epicId || !filter.epicIds.includes(task.epicId))) {
      return false
    }
    if (
      filter.maxEstimateMinutes !== undefined &&
      task.remainingEstimateMinutes > filter.maxEstimateMinutes
    ) {
      return false
    }
    if (
      filter.minEstimateMinutes !== undefined &&
      task.remainingEstimateMinutes < filter.minEstimateMinutes
    ) {
      return false
    }
    if (search) {
      const haystack = `${task.key ?? ''} ${task.title}`.toLowerCase()
      if (!haystack.includes(search)) return false
    }
    return true
  })
}

/**
 * ALO-17. How a pool task sits against the selected member's remaining gap, so
 * the PM can see at a glance which task closes the day exactly.
 *
 * A closed gap always overflows, however small the task — the point of the
 * indicator is to show what fits in the room that is left, and there is none.
 */
export function fitsIndicator(
  remainingEstimateMinutes: Minutes,
  gapMinutes: Minutes
): 'exact' | 'fits' | 'overflows' {
  if (gapMinutes <= ZERO_MINUTES) return 'overflows'
  if (remainingEstimateMinutes === gapMinutes) return 'exact'
  return remainingEstimateMinutes < gapMinutes ? 'fits' : 'overflows'
}
