/**
 * What a schedule change does to every stand-up (spec SCH-6, SCH-7, CAL-12..16).
 *
 * §7.3 calls calendar change propagation "the highest risk area in the module",
 * so the decision half is pure and the writing half is not. This file decides;
 * `reconcile.ts` executes. That split is what makes the nine triggers × eight
 * statuses matrix testable as a table rather than as seventy-two database
 * fixtures — and a rule that cannot be exhaustively tested is a rule that will
 * be wrong for some cell nobody tried.
 *
 * The CAL-12/13 disposition table itself is **not** re-derived here.
 * `analyseCalendarImpact()` already owns it and drives the pre-save preview the
 * PM confirms; if this file made its own decisions the preview and the outcome
 * could disagree, which is worse than either being wrong alone.
 */
import type { StandupStatus } from '@/models/Standup'

import {
  analyseCalendarImpact,
  type CalendarImpactItem,
  type ExistingStandup,
  type StandupStatusForImpact
} from './calendar-impact'
import type { IsoDate } from './calendar-dates'
import { numberSprintDays } from './day-numbering'
import { immutableCompletedStandup } from './errors'
import type { StandupShape } from '@/models/Standup'

/** The nine SCH-6 events. */
export type ReconcileTrigger =
  | 'sprint_start_earlier'
  | 'sprint_start_later'
  | 'sprint_end_later'
  | 'sprint_end_earlier'
  | 'date_became_non_working'
  | 'date_became_working'
  | 'standup_time_changed'
  | 'project_timezone_changed'
  | 'sprint_cancelled'

/** Triggers that move the sprint boundary, so dates can fall out of range. */
const RANGE_TRIGGERS: ReconcileTrigger[] = [
  'sprint_start_earlier',
  'sprint_start_later',
  'sprint_end_later',
  'sprint_end_earlier'
]

/** Triggers that only move the clock, never the set of days. */
const CLOCK_TRIGGERS: ReconcileTrigger[] = ['standup_time_changed', 'project_timezone_changed']

/** SCH-6: statuses the "sprint cancelled" row calls non-terminal. */
const CANCELLABLE: StandupStatus[] = ['Scheduled', 'Ready', 'In_Progress', 'Missed']

/** Statuses whose history CAL-16 protects absolutely. */
const PROTECTED: StandupStatus[] = ['Completed', 'Reopened']

export interface ExistingStandupRow {
  id: string
  date: IsoDate
  status: StandupStatus
  sprintDayNumber: number
  totalSprintDays: number
  shape: StandupShape
  displayedDayNumber?: number
  carryForwardCount?: number
}

export type ReconcileAction =
  /** CAL-13. `standupId` is set when a Skipped_Holiday row is being revived. */
  | {
      kind: 'create'
      date: IsoDate
      standupId?: string
      sprintDayNumber: number
      totalSprintDays: number
      shape: StandupShape
    }
  /** CAL-12: the date is no longer a working day. */
  | {
      kind: 'skip'
      date: IsoDate
      standupId: string
      clearMissed: boolean
      carryForwardCount: number
      reason: string
    }
  /** SCH-6: the date fell outside the sprint, or the sprint was cancelled. */
  | { kind: 'cancel'; date: IsoDate; standupId: string; reason: string }
  /** CAL-12 Completed row: record what happened, change nothing. */
  | { kind: 'anomaly'; date: IsoDate; standupId: string; reason: string }
  /** CAL-12 In_Progress row: the facilitator decides, not the reconciler. */
  | { kind: 'warn'; date: IsoDate; standupId: string; reason: string }
  /** SCH-6 clock rows: Scheduled stand-ups only. */
  | { kind: 'reschedule'; date: IsoDate; standupId: string }
  /** CAL-14. `freezeDisplayedDayNumber` is set once, on a completed stand-up. */
  | {
      kind: 'renumber'
      date: IsoDate
      standupId: string
      sprintDayNumber: number
      totalSprintDays: number
      shape: StandupShape
      freezeDisplayedDayNumber?: number
    }

export interface PlanReconcileInput {
  trigger: ReconcileTrigger
  /** The sprint range **after** the change. */
  range: { from: IsoDate; to: IsoDate }
  /** Working days inside that range, after the change, from `resolveWorkingDay`. */
  workingDates: IsoDate[]
  existing: ExistingStandupRow[]
  /** Why a date stopped being a working day, for the UI-9 skip reason. */
  reasonByDate?: Record<IsoDate, string>
}

export interface ReconcilePlan {
  actions: ReconcileAction[]
  /** The impact items, so the caller can send one consolidated N10 (CAL-15). */
  items: CalendarImpactItem[]
}

/**
 * Decides every write a reconcile will make.
 *
 * Throws `IMMUTABLE_COMPLETED_STANDUP` rather than returning a partial plan
 * when the change would destroy protected history (SCH-7, E9): a refusal that
 * still wrote half the schedule would be worse than either outcome.
 */
export function planReconcile(input: PlanReconcileInput): ReconcilePlan {
  const { trigger, range, existing } = input

  const workingDates = input.workingDates
    .filter((date) => date >= range.from && date <= range.to)
    .slice()
    .sort()
  const workingSet = new Set(workingDates)
  const byDate = new Map<IsoDate, ExistingStandupRow>()
  for (const row of existing) byDate.set(row.date, row)

  if (trigger === 'sprint_cancelled') {
    return { actions: planCancellation(existing), items: [] }
  }

  const outOfRange = existing.filter((row) => row.date < range.from || row.date > range.to)

  if (RANGE_TRIGGERS.indexOf(trigger) !== -1) {
    // SCH-6 rows 2 and 4: the move is refused outright when it would strand a
    // stand-up that is running or already history. Named dates, because "the
    // move is blocked" without them is unactionable.
    const protectedDates = outOfRange
      .filter(
        (row) => PROTECTED.indexOf(row.status) !== -1 || row.status === 'In_Progress'
      )
      .map((row) => row.date)
      .sort()

    if (protectedDates.length > 0) {
      throw immutableCompletedStandup(protectedDates)
    }
  }

  const actions: ReconcileAction[] = []

  // Dates that left the range are cancelled, not skipped: the day is not a
  // holiday, it simply is no longer part of this sprint.
  for (const row of outOfRange) {
    if (CANCELLABLE.indexOf(row.status) !== -1) {
      actions.push({
        kind: 'cancel',
        date: row.date,
        standupId: row.id,
        reason: 'The sprint no longer includes this date.'
      })
    }
  }

  // --- CAL-12 / CAL-13, for dates still inside the range --------------------
  const inRangeExisting = existing.filter(
    (row) => row.date >= range.from && row.date <= range.to
  )

  const before = new Map<IsoDate, boolean>()
  const after = new Map<IsoDate, boolean>()
  const impactExisting = new Map<IsoDate, ExistingStandup>()

  for (const row of inRangeExisting) {
    // A stand-up that exists and is not itself a skip record is the evidence
    // that the date used to be a working day. The persisted schedule is the
    // only record of the calendar as it was.
    before.set(row.date, row.status !== 'Skipped_Holiday' && row.status !== 'Cancelled')
    impactExisting.set(row.date, {
      date: row.date,
      status: row.status as StandupStatusForImpact,
      carryForwardCount: row.carryForwardCount
    })
  }

  for (const date of workingDates) {
    after.set(date, true)
    if (!before.has(date)) before.set(date, false)
  }
  for (const row of inRangeExisting) {
    if (!after.has(row.date)) after.set(row.date, false)
  }

  const impact = analyseCalendarImpact({ before, after, existing: impactExisting })

  for (const item of impact.items) {
    const row = byDate.get(item.date)

    switch (item.disposition) {
      case 'create': {
        // Numbering is filled in below, once the whole working set is known.
        actions.push({
          kind: 'create',
          date: item.date,
          ...(row ? { standupId: row.id } : {}),
          sprintDayNumber: 0,
          totalSprintDays: workingDates.length,
          shape: 'mid_sprint'
        })
        break
      }

      case 'skip':
      case 'skip_clear_missed':
        actions.push({
          kind: 'skip',
          date: item.date,
          standupId: row!.id,
          clearMissed: item.disposition === 'skip_clear_missed',
          carryForwardCount: row?.carryForwardCount ?? 0,
          reason: input.reasonByDate?.[item.date] ?? 'This date is no longer a working day.'
        })
        break

      case 'warn_in_progress':
        actions.push({
          kind: 'warn',
          date: item.date,
          standupId: row!.id,
          reason: item.message
        })
        break

      case 'blocked_completed':
        actions.push({
          kind: 'anomaly',
          date: item.date,
          standupId: row!.id,
          reason: item.message
        })
        break

      case 'no_change':
        break
    }
  }

  // --- SCH-6 clock rows ------------------------------------------------------
  if (CLOCK_TRIGGERS.indexOf(trigger) !== -1) {
    for (const row of inRangeExisting) {
      // "Scheduled stand-ups only. Never touch Ready, In_Progress or terminal
      // ones" — a Ready stand-up's snapshot is already built against its start
      // time and members have been told when to attend.
      if (row.status === 'Scheduled' && workingSet.has(row.date)) {
        actions.push({ kind: 'reschedule', date: row.date, standupId: row.id })
      }
    }
  }

  // --- CAL-14 renumbering ----------------------------------------------------
  const numbering = numberSprintDays(workingDates)
  const numberByDate = new Map(numbering.map((day) => [day.date, day]))

  for (const action of actions) {
    if (action.kind !== 'create') continue
    const day = numberByDate.get(action.date)
    if (!day) continue
    action.sprintDayNumber = day.sprintDayNumber
    action.totalSprintDays = day.totalSprintDays
    action.shape = day.shape
  }

  const skippedOrCancelled = new Set(
    actions
      .filter((action) => action.kind === 'skip' || action.kind === 'cancel')
      .map((action) => action.date)
  )

  for (const row of inRangeExisting) {
    if (skippedOrCancelled.has(row.date)) continue
    const day = numberByDate.get(row.date)

    if (!day) {
      // The date left the working set. For a completed stand-up that is exactly
      // when CAL-14's frozen copy matters: the schedule around it is about to be
      // renumbered and its own number would otherwise be the only unexplained
      // one left. Its live numbers stay as they are.
      if (PROTECTED.indexOf(row.status) !== -1 && row.displayedDayNumber === undefined) {
        actions.push({
          kind: 'renumber',
          date: row.date,
          standupId: row.id,
          sprintDayNumber: row.sprintDayNumber,
          totalSprintDays: row.totalSprintDays,
          shape: row.shape,
          freezeDisplayedDayNumber: row.sprintDayNumber
        })
      }
      continue
    }

    const needsRenumber =
      row.sprintDayNumber !== day.sprintDayNumber ||
      row.totalSprintDays !== day.totalSprintDays ||
      row.shape !== day.shape

    const freeze =
      PROTECTED.indexOf(row.status) !== -1 && row.displayedDayNumber === undefined
        ? row.sprintDayNumber
        : undefined

    if (!needsRenumber && freeze === undefined) continue

    actions.push({
      kind: 'renumber',
      date: row.date,
      standupId: row.id,
      sprintDayNumber: day.sprintDayNumber,
      totalSprintDays: day.totalSprintDays,
      shape: day.shape,
      ...(freeze === undefined ? {} : { freezeDisplayedDayNumber: freeze })
    })
  }

  return { actions, items: impact.items }
}

/** SCH-6's last row. Completed history is left exactly as it is. */
function planCancellation(existing: ExistingStandupRow[]): ReconcileAction[] {
  return existing
    .filter((row) => CANCELLABLE.indexOf(row.status) !== -1)
    .map((row) => ({
      kind: 'cancel' as const,
      date: row.date,
      standupId: row.id,
      reason: 'The sprint was cancelled.'
    }))
}
