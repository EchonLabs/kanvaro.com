/**
 * The completion-check evaluator (spec §10.3, payload shape §17.8).
 *
 * Pure. Given the board as the server sees it, it returns one result per check
 * in the spec's table order, and `blockingFailures()` says whether the Complete
 * button may enable.
 *
 * **Ten of the eleven are answered** — CC-1, CC-2, CC-5, CC-6, CC-7, CC-10
 * from Phase 7, CC-3 from Phase 8's variance engine, CC-4 from Phase 9's
 * carry-forward register, and CC-9/CC-11 from this phase's blockers and
 * sprint health. The last, CC-8, needs the final-day disposition (Phase 11).
 *
 * CC-8 is returned anyway, as `not_evaluated` naming the owning phase. Two
 * reasons. A PM reading Panel 7 must not see a complete-looking list that never
 * asked whether the final-day dispositions are set; and "could not be
 * evaluated" is a genuinely different state from "passed", so the payload has
 * to be able to say which. An unbuilt check blocks nothing — it has failed
 * nothing — but it is visible.
 *
 * **No override path is built here.** That is Phase 10. `overridable` on a
 * result is data, transcribed from the spec's table, not a control.
 */
import type { AttendanceStatus, CapacityBreakdown } from './capacity'
import type { Minutes } from './minutes'
import { computeSprintHealth, type SprintHealthInput } from './sprint-health'

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

/**
 * One variance row, as CC-3 needs to see it.
 *
 * Declared here rather than imported from `variance-service.ts` on purpose:
 * that module reads the database, and this one is pure and runs in the browser
 * alongside the run screen. `VarianceRow` is structurally assignable to this,
 * so the caller passes its rows straight in — the same arrangement
 * `CheckAllocation` already has with the board's rows.
 */
export interface CheckVarianceRow {
  allocationId: string
  taskKey?: string
  /**
   * The task's real id, so a `skip_reestimate` override (which names tasks,
   * not allocations or display keys — `StandupOverride.affectedTaskIds`
   * stores task ObjectIds) can be matched back to this failure by
   * `filterOverriddenFailures` in `override.ts`. Optional: a caller that
   * cannot supply it degrades safely to "this row's failure cannot be
   * resolved by an override," not a crash.
   */
  taskId?: string
  memberId: string
  /** V5 with nothing left, and every V6 (§12.2). */
  requiresRevision: boolean
  /** V7, and V4 where nothing at all was logged. */
  requiresReason: boolean
  revisedRemainingMinutes?: Minutes
  notStartedReason?: string
}

/**
 * One carry-forward item, as CC-4 needs to see it (spec CFW-3, CFW-4).
 *
 * `notedToday` rather than the item's full note thread: the check only cares
 * whether *this round* got its update, and computing that from a thread would
 * duplicate the "is the newest note dated today" logic the service already
 * owns.
 */
export interface CheckCarryForwardItem {
  itemId: string
  taskKey?: string
  memberId?: string
  requiresNoteToday: boolean
  notedToday: boolean
}

/**
 * One blocker, as CC-9 needs to see it (spec §10.3).
 *
 * `taskKey` is optional the same way it is on `CheckAllocation` — a blocker
 * need not be tied to a task the board already knows the key for.
 */
export interface CheckBlocker {
  blockerId: string
  taskKey?: string
  hasOwner: boolean
  hasTargetDate: boolean
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
  /**
   * Yesterday's classified rows (Phase 8).
   *
   * **Absent is not the same as empty.** A caller that forgot to load the
   * variance leaves CC-3 `not_evaluated` rather than passing it: telling a PM
   * the day is clean because nobody asked the question is the failure this
   * whole check exists to prevent.
   */
  variance?: CheckVarianceRow[]
  /**
   * The carry-forward items currently on this board (Phase 9).
   *
   * Same absent-vs-empty rule as `variance`: `undefined` means CC-4 was never
   * asked and reports `not_evaluated`; `[]` means it was asked and the board
   * genuinely holds no aged items.
   */
  carryForward?: CheckCarryForwardItem[]
  /**
   * Blockers raised this stand-up (Phase 10). Same absent-vs-empty rule as
   * `variance` and `carryForward`: `undefined` means CC-9 was never asked.
   */
  blockers?: CheckBlocker[]
  /**
   * Sprint-wide remaining estimate and capacity (Phase 10). `undefined` means
   * CC-11 was never asked.
   */
  sprintHealth?: SprintHealthInput
}

/** The one check still unanswerable, and who will answer it. */
const DEFERRED: Record<string, { phase: string; hard: boolean; overridable: boolean; what: string }> =
  {
    'CC-8': {
      phase: 'Phase 11',
      hard: true,
      overridable: false,
      what: 'Final-day dispositions need the sprint-close panel.'
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
    cc3(input.variance, input.shape),
    cc4(input.carryForward),
    cc5(liveRows),
    cc6(members),
    cc7(members),
    deferred('CC-8'),
    cc9(input.blockers),
    cc10(liveRows),
    cc11(input.sprintHealth)
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

/* --- the seven answerable checks ----------------------------------------- */

/**
 * CC-3. Every row the variance engine flagged has been answered.
 *
 * Two questions, one check: a revised remaining estimate where §12.2 demands
 * one (V5 with nothing left, and every V6), and a reason where planned time did
 * not happen (V7). Hard and overridable — a PM may complete without an answer,
 * but only deliberately, through Phase 10's override, never by accident.
 *
 * A day-one stand-up passes trivially: there is no yesterday to explain.
 */
function cc3(
  variance: readonly CheckVarianceRow[] | undefined,
  shape: EvaluateCompletionChecksInput['shape']
): CompletionCheckResult {
  const base = { checkId: 'CC-3' as const, hard: true, overridable: true }

  if (variance === undefined) {
    return {
      ...base,
      status: 'not_evaluated',
      message: 'Yesterday\u2019s variance was not loaded, so this could not be checked.',
      entities: [],
      ownedBy: 'Phase 8'
    }
  }

  if (shape === 'day_one') {
    return {
      ...base,
      status: 'pass',
      message: 'Day one has no previous stand-up to explain.',
      entities: []
    }
  }

  const needingRevision = variance.filter(
    (row) => row.requiresRevision && row.revisedRemainingMinutes === undefined
  )
  const needingReason = variance.filter(
    (row) => row.requiresReason && !(row.notStartedReason ?? '').trim()
  )
  const offenders = [
    ...needingRevision.map((row) => ({ ...identity(row), needs: 'revision' as const })),
    ...needingReason.map((row) => ({ ...identity(row), needs: 'reason' as const }))
  ]

  return {
    ...base,
    status: offenders.length ? 'fail' : 'pass',
    message: offenders.length
      ? `${count(offenders.length, 'row')} from yesterday still ${
          offenders.length === 1 ? 'needs an answer' : 'need answers'
        }.`
      : 'Yesterday\u2019s overruns and unstarted work are all explained.',
    entities: offenders
  }
}

const identity = (row: CheckVarianceRow) => ({
  allocationId: row.allocationId,
  taskKey: row.taskKey,
  memberId: row.memberId,
  ...(row.taskId === undefined ? {} : { taskId: row.taskId })
})

/**
 * CC-4. Every carry-forward item at or beyond the note threshold has a note
 * added on this stand-up (spec CFW-3, E61). Hard and never overridable — O7
 * is a listed hard block, not something a PM can wave through, because a
 * note is the one thing that keeps an aged item from going quiet.
 */
function cc4(items: readonly CheckCarryForwardItem[] | undefined): CompletionCheckResult {
  const base = { checkId: 'CC-4' as const, hard: true, overridable: false }

  if (items === undefined) {
    return {
      ...base,
      status: 'not_evaluated',
      message: 'The carry-forward register was not loaded, so this could not be checked.',
      entities: [],
      ownedBy: 'Phase 9'
    }
  }

  const offenders = items.filter((item) => item.requiresNoteToday && !item.notedToday)

  return {
    ...base,
    status: offenders.length ? 'fail' : 'pass',
    message: offenders.length
      ? `${count(offenders.length, 'carry forward item')} ${
          offenders.length === 1 ? 'needs' : 'need'
        } a note today.`
      : 'Every aged carry-forward item has today’s note.',
    entities: offenders.map((item) => ({
      carryForwardItemId: item.itemId,
      taskKey: item.taskKey,
      memberId: item.memberId
    }))
  }
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

/* --- the two Phase 10 checks ---------------------------------------------- */

/** CC-9 (soft). Every blocker raised this stand-up has an owner and a target date. */
function cc9(blockers: readonly CheckBlocker[] | undefined): CompletionCheckResult {
  const base = { checkId: 'CC-9' as const, hard: false, overridable: false }

  if (blockers === undefined) {
    return {
      ...base,
      status: 'not_evaluated',
      message: 'Blockers were not loaded, so this could not be checked.',
      entities: [],
      ownedBy: 'Phase 10'
    }
  }

  const offenders = blockers.filter((b) => !b.hasOwner || !b.hasTargetDate)

  return {
    ...base,
    status: offenders.length ? 'warn' : 'pass',
    message: offenders.length
      ? `${count(offenders.length, 'blocker')} still ${
          offenders.length === 1 ? 'needs' : 'need'
        } an owner or target date.`
      : 'Every blocker has an owner and a target date.',
    entities: offenders.map((b) => ({ blockerId: b.blockerId, taskKey: b.taskKey }))
  }
}

/** CC-11 (soft). Sprint-to-date allocation plus remaining estimates fit remaining sprint capacity. */
function cc11(sprintHealth: EvaluateCompletionChecksInput['sprintHealth']): CompletionCheckResult {
  const base = { checkId: 'CC-11' as const, hard: false, overridable: false }

  if (sprintHealth === undefined) {
    return {
      ...base,
      status: 'not_evaluated',
      message: 'Sprint health was not loaded, so this could not be checked.',
      entities: [],
      ownedBy: 'Phase 10'
    }
  }

  const result = computeSprintHealth(sprintHealth)

  return {
    ...base,
    status: result.exceedsCapacity ? 'warn' : 'pass',
    message: result.exceedsCapacity
      ? `Remaining sprint scope exceeds remaining capacity by ${(result.overageMinutes / 60).toFixed(1)}h.`
      : 'Remaining sprint scope fits remaining capacity.',
    entities: []
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
