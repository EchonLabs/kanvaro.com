/**
 * The stand-up lifecycle machine (spec §10.1, RUN-2..RUN-5).
 *
 * Kept pure and outside the Mongoose schema for two reasons. A schema-level
 * enum can say a status is valid but not that a *move* between two statuses is;
 * and the reconciler needs to ask "could this stand-up legally be skipped?"
 * about documents it has not loaded yet.
 *
 * The table below is §10.1 verbatim. Two edges deserve a note because they are
 * easy to read as mistakes:
 *   - `Missed → Skipped_Holiday` is the CAL-12 Missed row: a day that turns out
 *     to have been a holiday was never missed, so the flag is cleared.
 *   - `Completed → Reopened → Completed` is the only cycle. Everything else is
 *     forward-only, and `Skipped_Holiday` and `Cancelled` are terminal.
 */
import { formatInTimeZone } from 'date-fns-tz'

import { STANDUP_STATUSES, type StandupStatus } from '@/models/Standup'

import { type IsoDate } from './calendar-dates'
import { StandupError } from './errors'
import type { Minutes } from './minutes'
import { standupStrings } from './strings'

export const ALLOWED_TRANSITIONS: Record<StandupStatus, StandupStatus[]> = {
  Scheduled: ['Ready', 'Missed', 'Skipped_Holiday', 'Cancelled'],
  Ready: ['In_Progress', 'Missed', 'Skipped_Holiday', 'Cancelled'],
  In_Progress: ['Completed', 'Cancelled'],
  Completed: ['Reopened'],
  Reopened: ['Completed'],
  Missed: ['Completed', 'Skipped_Holiday'],
  Skipped_Holiday: [],
  Cancelled: []
}

/** Minimum characters for a reopen reason (RUN-4). Matches the override rule. */
export const REOPEN_REASON_MIN_LENGTH = 20

/** Terminal states, exported so the reconciler never has to hard-code the list. */
export const TERMINAL_STATUSES: StandupStatus[] = ['Skipped_Holiday', 'Cancelled']

/** States a reconcile may still change. Completed is excluded by CAL-16. */
export const RECONCILABLE_STATUSES: StandupStatus[] = ['Scheduled', 'Ready', 'Missed']

export function isTerminal(status: StandupStatus): boolean {
  return TERMINAL_STATUSES.indexOf(status) !== -1
}

export function canTransition(from: StandupStatus, to: StandupStatus): boolean {
  return ALLOWED_TRANSITIONS[from].indexOf(to) !== -1
}

export function assertTransition(from: StandupStatus, to: StandupStatus): void {
  if (!canTransition(from, to)) {
    throw new StandupError(
      'STANDUP_NOT_STARTABLE',
      standupStrings.lifecycle.invalidTransition({ from, to }),
      { from, to, allowed: ALLOWED_TRANSITIONS[from] }
    )
  }
}

export interface StartabilityInput {
  status: StandupStatus
  scheduledStartAt: Date
  /** Lead time before the scheduled start at which starting becomes legal (SCH-8). */
  readyLeadMinutes: number
  now: Date
  /** Project timezone, so the refusal can name a local time the PM recognises. */
  timezone: string
  /**
   * Set when another stand-up in the same sprint is already In_Progress.
   * RUN-2 allows exactly one at a time; E52 requires the refusal to name it.
   */
  otherInProgressDate?: IsoDate
}

/**
 * RUN-2: not before the lead boundary, and never a second concurrent one.
 *
 * The concurrency check runs first: when both would fail, "another stand-up is
 * running" is the actionable message, and the PM would otherwise fix the clock
 * complaint only to hit the second refusal.
 */
export function assertStartable(input: StartabilityInput): void {
  const { status, scheduledStartAt, readyLeadMinutes, now, timezone } = input

  if (input.otherInProgressDate) {
    throw new StandupError(
      'STANDUP_NOT_STARTABLE',
      standupStrings.lifecycle.anotherInProgress({ date: input.otherInProgressDate }),
      { inProgressDate: input.otherInProgressDate }
    )
  }

  if (!canTransition(status, 'In_Progress') && status !== 'Scheduled') {
    throw new StandupError(
      'STANDUP_NOT_STARTABLE',
      standupStrings.lifecycle.notStartableFromStatus({ status }),
      { status }
    )
  }

  const openFrom = new Date(scheduledStartAt.getTime() - readyLeadMinutes * 60_000)
  if (now.getTime() < openFrom.getTime()) {
    throw new StandupError(
      'STANDUP_NOT_STARTABLE',
      standupStrings.lifecycle.notStartableYet({
        // The scheduled time, not the lead boundary: "available at 09:00" is
        // what E51 asks for and what the PM has in their calendar.
        localTime: formatInTimeZone(scheduledStartAt, timezone, 'HH:mm'),
        localDate: formatInTimeZone(scheduledStartAt, timezone, 'dd MMM')
      }),
      { openFrom: openFrom.toISOString(), scheduledStartAt: scheduledStartAt.toISOString() }
    )
  }

  // A `Scheduled` stand-up whose lead boundary has passed is startable: the
  // promote-to-ready job runs on a 60-second tick, so refusing here would make
  // a punctual PM wait for a background job that has not caught up yet.
}

/** RUN-3: whole minutes late, floored, never negative. */
export function lateByMinutes(scheduledStartAt: Date, startedAt: Date): Minutes {
  const diff = startedAt.getTime() - scheduledStartAt.getTime()
  return (diff <= 0 ? 0 : Math.floor(diff / 60_000)) as Minutes
}

export interface ReopenInput {
  completedAt: Date
  now: Date
  reopenWindowHours: number
  reason: string
  isOrgAdmin: boolean
  /** RUN-5: nothing reopens once the sprint itself is Completed. */
  sprintCompleted: boolean
}

export function assertReopenable(input: ReopenInput): void {
  if (input.reason.trim().length < REOPEN_REASON_MIN_LENGTH) {
    throw new StandupError(
      'INVALID_JUSTIFICATION',
      standupStrings.lifecycle.reopenReasonTooShort({ minLength: REOPEN_REASON_MIN_LENGTH })
    )
  }

  if (input.sprintCompleted) {
    throw new StandupError(
      'REOPEN_WINDOW_EXPIRED',
      standupStrings.lifecycle.reopenSprintCompleted()
    )
  }

  const windowEnds = input.completedAt.getTime() + input.reopenWindowHours * 3_600_000
  const expired = input.now.getTime() > windowEnds

  if (expired && !input.isOrgAdmin) {
    throw new StandupError(
      'REOPEN_WINDOW_EXPIRED',
      standupStrings.lifecycle.reopenWindowExpired({ hours: input.reopenWindowHours }),
      { windowEndsAt: new Date(windowEnds).toISOString() }
    )
  }
}

/** Re-exported so callers do not have to import the model for a type. */
export { STANDUP_STATUSES }
export type { StandupStatus }
