/**
 * The variance classifier (spec §12.1, §12.2 — outcomes V1–V12).
 *
 * This is the intelligence the PM sees every morning: yesterday's plan against
 * what actually happened, reduced to one named outcome per allocation plus the
 * two numbers §12.1 insists are never conflated —
 *
 *   day variance   logged - planned, for that person on that task on that day.
 *                  Drives today's capacity conversation.
 *   task variance  total logged - the original estimate, across everybody and
 *                  every day. Drives the estimation-quality conversation.
 *
 * **Pure, and deliberately so.** VAR-3 requires classification to be
 * re-runnable: the same inputs must always produce the same outputs and must
 * not post duplicate ledger entries. That is only provable if the decision
 * itself reads nothing — no database, no clock, no settings lookup that might
 * answer differently at 09:15 and at 09:30. The service layer gathers the
 * facts; this module decides what they mean, and it is called twice against
 * identical inputs — once provisionally to render the board, once at
 * completion to write the ledger.
 *
 * **Precedence, because §12.2's conditions overlap.** A task can be blocked
 * *and* over-consumed, reassigned *and* delivered, absent *and* untouched, but
 * VAR-2 demands exactly one outcome. The order below is the decision, and it
 * is ordered by what a PM most needs to be told:
 *
 *   1. descoped (V9)     — the task is gone; nothing else about it matters.
 *   2. owner_absent (V11)— the person was not here. No overrun, no credit, no
 *                          ledger entry: retroactive absence must never accrue
 *                          estimate debt against somebody who was away.
 *   3. blocked (V8)      — not an overrun. The blocker owns this row.
 *   4. nothing logged    — V12 if the status advanced anyway (warn, accrue
 *                          nothing until real hours exist), else V7. Above the
 *                          done branch because E36 and E37 say so: a task
 *                          moved to Done with no logged time is a warning, not
 *                          a delivery that earns a credit.
 *   5. the done branch   — V1 / V2 / V3, split by the ±0.25h tolerance.
 *   6. reassigned (V10)  — attribution only, so it ranks *below* the done
 *                          branch: a task reassigned and then finished is
 *                          still a delivery, and saying "reassigned" instead
 *                          would hide that it closed.
 *   7. the open branch   — V4 / V5 / V6, split by the same tolerance.
 */
import type { VarianceOutcome } from '@/models/AllocationVariance'

import {
  addMinutes,
  clampToZero,
  minutes,
  subtractMinutes,
  ZERO_MINUTES,
  type Minutes
} from './minutes'

/**
 * §12.2's ±0.25h, in minutes.
 *
 * The comparison is `abs(A - P) <= tolerance`, so exactly fifteen minutes over
 * is *on estimate* and sixteen is over. The boundary is inclusive on purpose:
 * a quarter-hour either way is rounding in how people log time, not a signal
 * about the estimate.
 */
export const VARIANCE_TOLERANCE_MINUTES: Minutes = minutes(15)

/** The done / in-progress / blocked status names, per project (§10.2). */
export interface TaskStatusSets {
  done: readonly string[]
  inProgress: readonly string[]
  blocked: readonly string[]
}

export interface ClassifyInput {
  allocationId: string
  memberId: string
  taskId: string
  /** P — what the previous stand-up planned. */
  plannedMinutes: Minutes
  /** A — what this member logged on this task on that date. */
  loggedMinutesOnDay: Minutes
  /** E — never changes (VAR-16). */
  originalEstimateMinutes: Minutes
  /** Running total across every member and every day. */
  totalLoggedMinutesOnTask: Minutes
  /** R — the remaining estimate as it stood before that day. */
  remainingBeforeMinutes: Minutes
  /** S — the task's status now, and the status it held at the previous stand-up. */
  taskStatusAtClose: string
  taskStatusAtAllocation: string
  statusSets: TaskStatusSets
  /** RUN-7 — the allocation was detached because the owner was away. */
  detachedReason?: 'owner_absent'
  /** The task left the sprint or was cancelled. */
  descoped: boolean
  /** The task's assignee changed after the allocation was made. */
  reassigned: boolean
  /** D-D — false on a non-owner allocation of a shared task. */
  ownsTaskVariance: boolean
}

export interface VarianceComputation {
  allocationId: string
  outcome: VarianceOutcome
  /** logged - planned. Signed: negative means planned work did not happen. */
  dayVarianceMinutes: Minutes
  /** total logged - original estimate. Signed (E38). Zero when !ownsTaskVariance. */
  taskVarianceMinutes: Minutes
  /** 0 unless the outcome produces one. */
  overrunMinutes: Minutes
  creditMinutes: Minutes
  /** max(0, R - A). */
  remainingAfterMinutes: Minutes
  /** V5 with nothing left, and every V6 (§12.2). */
  requiresRevision: boolean
  /** V7, and V4 where nothing at all was logged (§12.2). */
  requiresReason: boolean
  /** V12 — "status moved but no time was logged." */
  warnsNoTimeLogged: boolean
  /** D-D — a non-owner's contribution to a shared task. */
  sharedContribution: boolean
  reassigned: boolean
}

const includesStatus = (statuses: readonly string[], status: string) =>
  statuses.some((candidate) => candidate.toLowerCase() === status.toLowerCase())

/** One allocation, one outcome (VAR-2). */
export function classifyAllocation(input: ClassifyInput): VarianceComputation {
  const planned = input.plannedMinutes
  const logged = input.loggedMinutesOnDay

  const dayVarianceMinutes = subtractMinutes(logged, planned)
  const taskVarianceMinutes = input.ownsTaskVariance
    ? subtractMinutes(input.totalLoggedMinutesOnTask, input.originalEstimateMinutes)
    : ZERO_MINUTES
  const remainingAfterMinutes = clampToZero(subtractMinutes(input.remainingBeforeMinutes, logged))

  const base = {
    allocationId: input.allocationId,
    dayVarianceMinutes,
    taskVarianceMinutes,
    remainingAfterMinutes,
    overrunMinutes: ZERO_MINUTES,
    creditMinutes: ZERO_MINUTES,
    requiresRevision: false,
    requiresReason: false,
    warnsNoTimeLogged: false,
    sharedContribution: !input.ownsTaskVariance,
    reassigned: input.reassigned
  }

  const overBy = subtractMinutes(logged, addMinutes(planned, VARIANCE_TOLERANCE_MINUTES))
  const underBy = subtractMinutes(subtractMinutes(planned, VARIANCE_TOLERANCE_MINUTES), logged)
  const isOver = overBy > 0
  const isUnder = underBy > 0

  // 1 — descoped. The task left the sprint; its day is not a story about hours.
  if (input.descoped) {
    return { ...base, outcome: 'descoped' }
  }

  // 2 — the owner was absent (V11). No overrun, no credit, no ledger entry.
  if (input.detachedReason === 'owner_absent') {
    return { ...base, outcome: 'owner_absent' }
  }

  // 3 — blocked (V8). Moves to the blocker register, never counted as overrun.
  if (includesStatus(input.statusSets.blocked, input.taskStatusAtClose)) {
    return { ...base, outcome: 'blocked' }
  }

  // 4 — not a minute logged. This sits *above* the done branch because E36 and
  // E37 say so explicitly: zero hours with no status change is V7 not_started,
  // and zero hours with the status moved to Done is V12 — a warning that the
  // board moved without anybody's time behind it, accruing nothing until real
  // hours are entered. Classifying a zero-hour close as `delivered_under`
  // would hand the member a credit for work no timesheet can show.
  if (logged === 0) {
    if (input.taskStatusAtClose !== input.taskStatusAtAllocation) {
      return { ...base, outcome: 'no_time_logged_but_progressed', warnsNoTimeLogged: true }
    }
    return { ...base, outcome: 'not_started', requiresReason: true }
  }

  // 5 — the task closed. Under credits, over accrues, within tolerance is clean.
  if (includesStatus(input.statusSets.done, input.taskStatusAtClose)) {
    if (isUnder) {
      return {
        ...base,
        outcome: 'delivered_under',
        creditMinutes: clampToZero(subtractMinutes(planned, logged))
      }
    }
    if (isOver) {
      return {
        ...base,
        outcome: 'delivered_over',
        overrunMinutes: clampToZero(subtractMinutes(logged, planned))
      }
    }
    return { ...base, outcome: 'delivered_on_estimate' }
  }

  // 6 — reassigned mid-flight (V10). Attribution only: the logged hours stay
  // with the member who burned them and the remaining estimate travels with the
  // task, so neither ledger moves.
  if (input.reassigned) {
    return { ...base, outcome: 'reassigned' }
  }

  // 7 — the task is still open and hours were burned.
  if (isUnder) {
    return { ...base, outcome: 'open_under_consumed' }
  }
  if (isOver) {
    return {
      ...base,
      outcome: 'open_over_consumed',
      overrunMinutes: clampToZero(subtractMinutes(logged, planned)),
      // §12.2 V6: the headline case. "How much longer?" is the question the
      // stand-up exists to ask, so the answer is mandatory before completion.
      requiresRevision: true
    }
  }
  return {
    ...base,
    outcome: 'open_fully_consumed',
    // §12.2 V5: the planned hours are gone and the task is not done. If that
    // also exhausted the remaining estimate, the estimate is now known to be
    // wrong and a revision is mandatory.
    requiresRevision: remainingAfterMinutes === 0
  }
}

export function classifyAll(inputs: readonly ClassifyInput[]): VarianceComputation[] {
  return inputs.map(classifyAllocation)
}
