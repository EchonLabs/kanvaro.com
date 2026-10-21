/**
 * The spec's worked example (§12.3), as shared data.
 *
 * §12.3 says this "must be implemented exactly as described and should be used
 * as the primary QA fixture". Holding the numbers here rather than retyping them
 * into each test means every phase asserts against one definition of the case,
 * and a change to the scenario shows up everywhere at once instead of leaving
 * stale literals behind.
 *
 * The scenario, in full:
 *
 *   Kasun's nominal capacity is 8.0h. On stand-up day 3 the PM planned KAN-214
 *   for 6.0h and KAN-231 for 2.0h — a full, green day. Kasun then spent the
 *   whole day on KAN-214, logging 8.0h, and never touched KAN-231. KAN-214 is
 *   still in progress.
 *
 *   Day 4 must therefore show KAN-214 as V6 open_over_consumed (2.0h over) and
 *   KAN-231 as V7 not_started, with a 2.0h accrual against Kasun.
 *
 * Phase 1 can express the calendar, capacity, task estimates and logged time.
 * Allocations, variance records and ledger entries arrive with their models in
 * Phases 4–5, at which point the constants below are extended rather than
 * replaced.
 */
import { hoursToMinutes, type Minutes } from '../minutes'

/** Project timezone for the example. Colombo is UTC+05:30 with no DST. */
export const FIXTURE_TIMEZONE = 'Asia/Colombo'

/** Monday-to-Friday, the working week the example assumes. */
export const FIXTURE_WORKING_DAYS = [1, 2, 3, 4, 5]

export const FIXTURE_STANDARD_MINUTES: Minutes = hoursToMinutes(8)

/**
 * Sprint days used by the example.
 *
 * Chosen so day 3 and day 4 are consecutive working days with no holiday
 * between them — the example compares "yesterday" against today, and a weekend
 * or Poya day in the gap would change which stand-up counts as yesterday.
 */
export const FIXTURE_DAY_3 = '2026-08-19' // Wednesday
export const FIXTURE_DAY_4 = '2026-08-20' // Thursday

export const KASUN = {
  reference: 'kasun',
  firstName: 'Kasun',
  lastName: 'Perera',
  nominalMinutes: FIXTURE_STANDARD_MINUTES
} as const

/** Amal supplies the contrasting under-estimate case (V1, credit). */
export const AMAL = {
  reference: 'amal',
  firstName: 'Amal',
  lastName: 'Fernando',
  nominalMinutes: FIXTURE_STANDARD_MINUTES
} as const

export const KAN_214 = {
  key: 'KAN-214',
  title: 'Invoice model',
  originalEstimateMinutes: hoursToMinutes(6),
  remainingBeforeDay3Minutes: hoursToMinutes(6),
  plannedDay3Minutes: hoursToMinutes(6),
  /** Kasun spent the whole day here. */
  loggedDay3Minutes: hoursToMinutes(8),
  statusAtDay4: 'in_progress',
  /** What the PM enters when asked how much longer. */
  revisedRemainingMinutes: hoursToMinutes(3),
  revisionReason: 'underestimated',
  expectedOutcome: 'open_over_consumed',
  /** Logged 8.0h against a 6.0h plan. */
  expectedDayVarianceMinutes: hoursToMinutes(2),
  /** Total 8.0h logged against a 6.0h original estimate. */
  expectedTaskVarianceMinutes: hoursToMinutes(2)
} as const

export const KAN_231 = {
  key: 'KAN-231',
  title: 'PDF render',
  originalEstimateMinutes: hoursToMinutes(2),
  remainingBeforeDay3Minutes: hoursToMinutes(2),
  plannedDay3Minutes: hoursToMinutes(2),
  /** Never touched. */
  loggedDay3Minutes: hoursToMinutes(0),
  statusAtDay4: 'todo',
  expectedOutcome: 'not_started',
  /** 2.0h of planned work simply did not happen. */
  expectedDayVarianceMinutes: hoursToMinutes(-2),
  expectedTaskVarianceMinutes: hoursToMinutes(-2)
} as const

/** The accrual posted against Kasun once day 4 completes. */
export const KASUN_DEBT_MINUTES: Minutes = hoursToMinutes(2)

/**
 * Day 4 capacity under each overrun policy, exactly as §12.3 sets it out.
 *
 * Pre-filled allocations are the same under both — KAN-214 at its revised 3.0h
 * and KAN-231 carried at its full 2.0h — but the gap differs because `reduce`
 * takes the debt out of capacity while `absorb` only badges it.
 */
export const DAY_4_PREFILLED_MINUTES: Minutes = hoursToMinutes(5)

export const DAY_4_ABSORB = {
  nominalMinutes: hoursToMinutes(8),
  adjustedMinutes: hoursToMinutes(8),
  outstandingDebtMinutes: KASUN_DEBT_MINUTES,
  /** Debt is a badge, not a reduction. */
  effectiveMinutes: hoursToMinutes(8),
  allocatedMinutes: DAY_4_PREFILLED_MINUTES,
  gapMinutes: hoursToMinutes(3),
  status: 'under',
  /** The PM adds a 3.0h task and the meter turns green at 8.0h. */
  topUpMinutes: hoursToMinutes(3)
} as const

export const DAY_4_REDUCE = {
  nominalMinutes: hoursToMinutes(8),
  adjustedMinutes: hoursToMinutes(8),
  outstandingDebtMinutes: KASUN_DEBT_MINUTES,
  /** Debt applied: 8.0h becomes 6.0h. */
  effectiveMinutes: hoursToMinutes(6),
  allocatedMinutes: DAY_4_PREFILLED_MINUTES,
  gapMinutes: hoursToMinutes(1),
  status: 'under',
  /** A 1.0h task turns the meter green at 6.0h of 6.0h. */
  topUpMinutes: hoursToMinutes(1)
} as const

/**
 * Sri Lankan holidays that fall inside the fixture's sprint window.
 *
 * Deliberately includes Nikini Poya so the fixture also exercises a mid-sprint
 * holiday, which is the case that breaks naive day numbering.
 */
export const FIXTURE_HOLIDAYS = [
  { name: 'Milad un-Nabi (Holy Prophet’s Birthday)', date: '2026-08-26', type: 'public' },
  { name: 'Nikini Full Moon Poya Day', date: '2026-08-27', type: 'public' }
] as const

/** The sprint the example runs inside: Mon 17 Aug to Fri 28 Aug 2026. */
export const FIXTURE_SPRINT = {
  name: 'Sprint 13',
  goal: 'Ship the invoicing module end to end for pilot customers.',
  startDate: '2026-08-17',
  endDate: '2026-08-28'
} as const
