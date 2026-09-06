/**
 * Estimate-debt arithmetic (spec §12.4 — VAR-6, VAR-7, VAR-17).
 *
 * The ledger is append-only and every entry's `minutes` is positive, so the
 * balance is a single signed sum over entry types rather than a running total
 * anybody maintains. That is the whole reason VAR-7 needs no code: credits
 * reduce debt *first* because there is only one number, and only once it falls
 * below zero is there anything to call surplus.
 *
 * Pure, like the classifier: the service reads the entries, this decides what
 * they add up to.
 */
import type { LedgerEntryType } from '@/models/EstimateDebtLedger'
import type { OverrunPolicy } from '@/models/ProjectStandupSettings'

import { clampToZero, minMinutes, minutes, ZERO_MINUTES, type Minutes } from './minutes'

/**
 * VAR-8. A write-off erases debt the team really did incur, so the
 * justification has to be long enough to say something.
 *
 * It lives here rather than on the model because the write-off dialog needs it
 * too, and a component that imports from a Mongoose model drags the database
 * driver into the browser bundle. The model imports it from here.
 */
export const WRITEOFF_REASON_MIN_LENGTH = 20

export interface LedgerEntryLike {
  entryType: LedgerEntryType
  minutes: Minutes
}

export interface DebtPosition {
  /**
   * VAR-6, floored at zero. This is what the badge shows and what
   * `computeCapacity` receives under the reduce policy.
   */
  outstandingMinutes: Minutes
  /**
   * Positive only when the raw balance went below zero (VAR-6, E42).
   * "Ahead of estimate by Xh" — never rendered as negative debt, and never
   * an increase in capacity beyond nominal.
   */
  surplusMinutes: Minutes
  accruedMinutes: Minutes
  creditedMinutes: Minutes
  settledMinutes: Minutes
  writtenOffMinutes: Minutes
  carriedInMinutes: Minutes
}

/** VAR-6: `accrual + carry_in - credit - settlement - writeoff`. */
export function computeDebtPosition(entries: readonly LedgerEntryLike[]): DebtPosition {
  let accrued = 0
  let credited = 0
  let settled = 0
  let writtenOff = 0
  let carriedIn = 0

  for (const entry of entries) {
    switch (entry.entryType) {
      case 'accrual':
        accrued += entry.minutes
        break
      case 'credit':
        credited += entry.minutes
        break
      case 'settlement':
        settled += entry.minutes
        break
      case 'writeoff':
        writtenOff += entry.minutes
        break
      case 'carry_in':
        carriedIn += entry.minutes
        break
    }
  }

  const balance = accrued + carriedIn - credited - settled - writtenOff

  return {
    outstandingMinutes: clampToZero(minutes(balance)),
    // Written as a branch rather than `clampToZero(-balance)`: negating zero
    // gives `-0`, which is equal to 0 under `==` but not under `Object.is`,
    // and would surface as "-0.0h" the first time somebody formatted it.
    surplusMinutes: balance < 0 ? minutes(-balance) : ZERO_MINUTES,
    accruedMinutes: minutes(accrued),
    creditedMinutes: minutes(credited),
    settledMinutes: minutes(settled),
    writtenOffMinutes: minutes(writtenOff),
    carriedInMinutes: minutes(carriedIn)
  }
}

/**
 * How much debt the reduce policy actually consumed today, and therefore how
 * much settlement to post at completion (AC-16).
 *
 * Capped at the capacity that was available, because a settlement records debt
 * that was *paid* — and a day can only pay with the hours it had. E43's case
 * (debt larger than a full day) settles the whole day and leaves the rest
 * outstanding for tomorrow; settling the full amount would forgive debt the
 * member never worked off.
 *
 * Under the absorb policy nothing is consumed: the debt is a badge, capacity
 * stays at nominal, and no settlement is posted (AC-15).
 */
export function settlementMinutes(input: {
  outstandingMinutes: Minutes
  adjustedMinutes: Minutes
  policy: OverrunPolicy
}): Minutes {
  if (input.policy !== 'reduce') return ZERO_MINUTES
  return minMinutes(clampToZero(input.outstandingMinutes), clampToZero(input.adjustedMinutes))
}

/**
 * VAR-17 — estimation accuracy as a percentage: the estimates the team agreed
 * over the time the work actually took. Above 100 means they finish faster
 * than they estimate.
 *
 * `undefined` rather than zero when there is nothing to divide by. Zero would
 * render as "0% accurate", which is a damning statement about a team that has
 * simply not completed anything yet — and VAR-17 is explicitly a team
 * improvement metric, not a verdict.
 */
export function estimationAccuracy(
  tasks: readonly { originalEstimateMinutes: Minutes; totalLoggedMinutesOnTask: Minutes }[]
): number | undefined {
  if (tasks.length === 0) return undefined

  let estimated = 0
  let logged = 0
  for (const task of tasks) {
    estimated += task.originalEstimateMinutes
    logged += task.totalLoggedMinutesOnTask
  }

  if (logged <= 0) return undefined
  return (estimated / logged) * 100
}
