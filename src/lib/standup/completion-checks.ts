/**
 * The completion-check evaluator (spec §10.3, payload shape §17.8).
 *
 * Pure. Given the board as the server sees it, it returns one result per check
 * in the spec's table order, and `blockingFailures()` says whether the Complete
 * button may enable.
 *
 * **Phase 7 answers six of the eleven** — CC-1, CC-2, CC-5, CC-6, CC-7, CC-10.
 * The other five need the variance engine (Phase 8), the carry-forward register
 * (Phase 9), blockers and sprint health (Phase 10) and the final-day
 * disposition (Phase 11).
 *
 * They are returned anyway, as `not_evaluated` naming the owning phase. Two
 * reasons. A PM reading Panel 7 must not see a complete-looking list that never
 * asked whether the aged carry-forward items have notes; and "could not be
 * evaluated" is a genuinely different state from "passed", so the payload has
 * to be able to say which. An unbuilt check blocks nothing — it has failed
 * nothing — but it is visible.
 *
 * **No override path is built here.** That is Phase 10. `overridable` on a
 * result is data, transcribed from the spec's table, not a control.
 */
import type { AttendanceStatus, CapacityBreakdown } from './capacity'
import type { Minutes } from './minutes'

export type CheckId =
  | 'CC-1'
  | 'CC-2'
  | 'CC-3'
  | 'CC-4'
  | 'CC-5'
  | 'CC-6'
  | 'CC-7'
  | 'CC-8'
  | 'CC-9'
  | 'CC-10'
  | 'CC-11'

export type CheckStatus = 'pass' | 'fail' | 'warn' | 'not_evaluated'

export interface CompletionCheckResult {
  checkId: CheckId
  status: CheckStatus
  /** Hard checks block completion; soft ones warn. From the §10.3 table. */
  hard: boolean
  overridable: boolean
  message: string
  /** The offending rows, so the UI can offer RUN-19's jump links. */
  entities: Record<string, unknown>[]
  /** Set only on `not_evaluated`: the phase that will make this answerable. */
  ownedBy?: string
}

export interface CheckAllocation {
  allocationId: string
  taskId: string
  taskKey?: string
  memberId: string
  plannedMinutes: Minutes
  remainingEstimateMinutes: Minutes
  isBlocked: boolean
  excludedFromCapacity: boolean
  detachedReason?: string
  pairedDeliberately: boolean
}

export interface CheckMember {
  memberId: string
  name?: string
  /** Undefined means nobody has set it yet — CC-7's failure. */
  attendance?: AttendanceStatus
  capacity: CapacityBreakdown
  allocations: CheckAllocation[]
}

export interface EvaluateCompletionChecksInput {
  shape: 'day_one' | 'mid_sprint' | 'final_day'
  members: CheckMember[]
}

/** The five checks Phase 7 cannot answer, and who will. */
const DEFERRED: Record<string, { phase: string; hard: boolean; overridable: boolean; what: string }> =
  {
    'CC-3': {
      phase: 'Phase 8',
      hard: true,
      overridable: true,
      what: 'Revised remaining estimates need the variance engine.'
    },
    'CC-4': {
      phase: 'Phase 9',
      hard: true,
      overridable: false,
      what: 'Carry-forward notes need the register.'
    },
    'CC-8': {
      phase: 'Phase 11',
      hard: true,
      overridable: false,
      what: 'Final-day dispositions need the sprint-close panel.'
    },
    'CC-9': {
      phase: 'Phase 10',
      hard: false,
      overridable: false,
      what: 'Blocker owners and target dates need the blocker panel.'
    },
    'CC-11': {
      phase: 'Phase 10',
      hard: false,
      overridable: false,
      what: 'Sprint health needs the projected-burn calculation.'
    }
  }

export function evaluateCompletionChecks(
  input: EvaluateCompletionChecksInput
): CompletionCheckResult[] {
  const members = input.members

  /**
   * Rows that actually plan something today.
   *
   * A detached row (RUN-7 — the owner is absent) is on the board for Phase 9 to
   * sweep, but it commits nobody to anything, so no check may fail on it. CC-10
   * is the case that matters: failing on a detached row would make every RUN-7
   * reassignment un-completable, because the absent owner's original and the
   * replacement both name the same task.
   */
  const liveRows = members.flatMap((member) =>
    member.allocations.filter((row) => !row.detachedReason)
  )

  return [
    cc1(members),
    cc2(liveRows),
    deferred('CC-3'),
    deferred('CC-4'),
    cc5(liveRows),
    cc6(members),
    cc7(members),
    deferred('CC-8'),
    deferred('CC-9'),
    cc10(liveRows),
    deferred('CC-11')
  ]
}

/**
 * The hard failures standing between the PM and a completed stand-up.
 *
 * `not_evaluated` is deliberately not a failure. A check nobody has built has
 * not been failed by anybody, and treating it as blocking would make every
 * stand-up in Phase 7 impossible to complete.
 */
export function blockingFailures(
  results: readonly CompletionCheckResult[]
): CompletionCheckResult[] {
  return results.filter((result) => result.hard && result.status === 'fail')
}

/* --- the six Phase 7 checks ---------------------------------------------- */

/**
 * CC-1. Every present member's allocated hours equal their effective capacity
 * within tolerance.
 *
 * Only `under` counts. An unavailable member needs no action (ALO-3's table
 * says so in as many words), and an over-allocated one is CC-6's business —
 * reporting both would tell the PM the same thing twice in two different words
 * and offer two overrides for one decision.
 */
function cc1(members: readonly CheckMember[]): CompletionCheckResult {
  const offenders = members.filter((member) => member.capacity.status === 'under')

  return {
    checkId: 'CC-1',
    status: offenders.length ? 'fail' : 'pass',
    hard: true,
    overridable: true,
    message: offenders.length
      ? `${count(offenders.length, 'member')} ${offenders.length === 1 ? 'is' : 'are'} not planned to full capacity.`
      : 'Everybody is planned to capacity.',
    entities: offenders.map((member) => ({
      memberId: member.memberId,
      name: member.name,
      effectiveMinutes: member.capacity.effectiveMinutes,
      allocatedMinutes: member.capacity.allocatedMinutes,
      gapMinutes: member.capacity.gapMinutes
    }))
  }
}

/** CC-2. Every allocation references a task with an estimate. Never overridable. */
function cc2(rows: readonly CheckAllocation[]): CompletionCheckResult {
  const offenders = rows.filter((row) => row.remainingEstimateMinutes <= 0)
  const first = offenders[0]

  return {
    checkId: 'CC-2',
    status: offenders.length ? 'fail' : 'pass',
    hard: true,
    overridable: false,
    message: offenders.length
      ? `${first.taskKey ?? 'A task'} has no estimate. Estimate it before allocating.`
      : 'Every allocated task is estimated.',
    entities: offenders.map((row) => ({ taskId: row.taskId, key: row.taskKey }))
  }
}

/** CC-5. Every allocation has hours on it. */
function cc5(rows: readonly CheckAllocation[]): CompletionCheckResult {
  const offenders = rows.filter((row) => row.plannedMinutes <= 0)

  return {
    checkId: 'CC-5',
    status: offenders.length ? 'fail' : 'pass',
    hard: true,
    overridable: false,
    message: offenders.length
      ? `Remove or set hours on ${count(offenders.length, 'empty allocation')}.`
      : 'Every allocation has hours.',
    entities: offenders.map((row) => ({
      allocationId: row.allocationId,
      taskId: row.taskId,
      key: row.taskKey
    }))
  }
}

/** CC-6. Nobody exceeds effective capacity beyond the over-allocation tolerance. */
function cc6(members: readonly CheckMember[]): CompletionCheckResult {
  const offenders = members.filter((member) => member.capacity.status === 'over')

  return {
    checkId: 'CC-6',
    status: offenders.length ? 'fail' : 'pass',
    hard: true,
    overridable: true,
    message: offenders.length
      ? `${count(offenders.length, 'member')} ${offenders.length === 1 ? 'is' : 'are'} over allocated.`
      : 'Nobody is over allocated.',
    entities: offenders.map((member) => ({
      memberId: member.memberId,
      name: member.name,
      effectiveMinutes: member.capacity.effectiveMinutes,
      allocatedMinutes: member.capacity.allocatedMinutes,
      gapMinutes: member.capacity.gapMinutes
    }))
  }
}

/** CC-7. Attendance has been set for every expected attendee. */
function cc7(members: readonly CheckMember[]): CompletionCheckResult {
  const offenders = members.filter((member) => !member.attendance)

  return {
    checkId: 'CC-7',
    status: offenders.length ? 'fail' : 'pass',
    hard: true,
    overridable: false,
    message: offenders.length
      ? `Set attendance for ${count(offenders.length, 'member')}.`
      : 'Attendance is set.',
    entities: offenders.map((member) => ({
      memberId: member.memberId,
      name: member.name
    }))
  }
}

/**
 * CC-10. No task is allocated to two different members on the same day.
 *
 * Overridable "with a note, for genuine pairing" (ALO-9). The pairing must be
 * confirmed on **every** row for the task, not one of them: a single member
 * ticking the box while the other row is an accident is precisely the case this
 * check exists to catch.
 */
function cc10(rows: readonly CheckAllocation[]): CompletionCheckResult {
  const byTask = new Map<string, CheckAllocation[]>()
  for (const row of rows) {
    const existing = byTask.get(row.taskId)
    if (existing) existing.push(row)
    else byTask.set(row.taskId, [row])
  }

  const offenders = Array.from(byTask.values()).filter((group) => {
    if (new Set(group.map((row) => row.memberId)).size < 2) return false
    return !group.every((row) => row.pairedDeliberately)
  })

  const first = offenders[0]

  return {
    checkId: 'CC-10',
    status: offenders.length ? 'fail' : 'pass',
    hard: true,
    overridable: true,
    message: offenders.length
      ? `${first[0].taskKey ?? 'A task'} is allocated to two people.`
      : 'No task is double allocated.',
    entities: offenders.map((group) => ({
      taskId: group[0].taskId,
      key: group[0].taskKey,
      memberIds: Array.from(new Set(group.map((row) => row.memberId)))
    }))
  }
}

/* --- internals ----------------------------------------------------------- */

function deferred(checkId: CheckId): CompletionCheckResult {
  const spec = DEFERRED[checkId]
  return {
    checkId,
    status: 'not_evaluated',
    hard: spec.hard,
    overridable: spec.overridable,
    message: `Not checked yet. ${spec.what}`,
    entities: [],
    ownedBy: spec.phase
  }
}

function count(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`
}
