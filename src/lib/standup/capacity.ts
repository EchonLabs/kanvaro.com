/**
 * Capacity computation — the "eight hours must be filled" engine (spec §11.1).
 *
 * ALO-1 specifies the order of operations exactly, and it matters: leave,
 * attendance and commitments are subtracted from a *partial-day-scaled* nominal,
 * the result floors at zero, and only then does the overrun policy decide
 * whether estimate debt reduces what can be allocated.
 *
 * Everything returns an **itemised breakdown** rather than a single number. The
 * capacity board has to be able to say why someone has 6.0h instead of 8.0h, or
 * the PM cannot have the conversation the module exists to cause.
 *
 * Pure by design: callers supply the resolved working day, the member's capacity
 * record, attendance and debt. Nothing here reads the database or the clock.
 */
import type { OverrunPolicy } from '@/models/ProjectStandupSettings'

import { dayOfWeek, isWithinRange, type IsoDate } from './calendar-dates'
import {
  addMinutes,
  clampToZero,
  minutes,
  subtractMinutes,
  ZERO_MINUTES,
  type Minutes
} from './minutes'
import type { WorkingDayResolution } from './working-day'

/** Attendance states a PM can set (spec RUN-6). */
export const ATTENDANCE_STATUSES = [
  'present',
  'absent_planned',
  'absent_unplanned',
  'partial'
] as const
export type AttendanceStatus = typeof ATTENDANCE_STATUSES[number]

/** Allocation status thresholds (spec ALO-3). */
export type AllocationStatus = 'full' | 'under' | 'over' | 'zero' | 'unavailable'

/** One named reason capacity differs from nominal. `minutes` is always the amount removed. */
export interface CapacityAdjustment {
  type:
    | 'partial_day'
    | 'leave'
    | 'attendance'
    | 'non_project_commitment'
    | 'optional_holiday'
    /** A member-scoped calendar override — layer 4 of CAL-4. */
    | 'member_exception'
  label: string
  minutes: Minutes
}

export interface MemberLeaveInput {
  startDate: IsoDate
  endDate: IsoDate
  /** Minutes removed per day. Absent means the member's whole nominal day. */
  minutesPerDay?: number
  reason?: string
}

export interface NonProjectCommitmentInput {
  label: string
  minutesPerDay: number
  /** Empty means every working day. */
  daysOfWeek: number[]
}

export interface ComputeCapacityInput {
  memberId: string
  date: IsoDate
  /** The already-resolved working day. Supplies the partial-day factor. */
  resolution: WorkingDayResolution
  /** The member's configured minutes for a full day (DAT-1: as of `date`). */
  nominalMinutes: Minutes
  attendance?: AttendanceStatus
  /** Required when attendance is `partial`. */
  attendancePartialMinutes?: Minutes
  leave?: MemberLeaveInput[]
  nonProjectCommitments?: NonProjectCommitmentInput[]
  /** Holiday ids from `resolution.optionalHolidays` that this member observes (CAL-9). */
  observedOptionalHolidayIds?: string[]
  /** Outstanding estimate debt for the member on this sprint (VAR-6). */
  outstandingDebtMinutes?: Minutes
  overrunPolicy?: OverrunPolicy
  /** Sum of planned minutes already allocated, excluding rows excluded from capacity. */
  allocatedMinutes?: Minutes
  underToleranceMinutes?: Minutes
  overToleranceMinutes?: Minutes
}

export interface CapacityBreakdown {
  memberId: string
  date: IsoDate
  nominalMinutes: Minutes
  adjustments: CapacityAdjustment[]
  /** Nominal, scaled for a partial day, less every adjustment, floored at zero. */
  adjustedMinutes: Minutes
  outstandingDebtMinutes: Minutes
  overrunPolicy: OverrunPolicy
  /** What may actually be allocated today. */
  effectiveMinutes: Minutes
  allocatedMinutes: Minutes
  /** Effective minus allocated. Positive means the day is not full. */
  gapMinutes: Minutes
  status: AllocationStatus
  /** True when the day is unavailable because the member is out, not merely empty. */
  isUnavailable: boolean
}

const DEFAULT_TOLERANCE = minutes(15)

/**
 * Computes one member's capacity for one date, in ALO-1's exact order.
 */
export function computeCapacity(input: ComputeCapacityInput): CapacityBreakdown {
  const {
    memberId,
    date,
    resolution,
    nominalMinutes,
    attendance = 'present',
    attendancePartialMinutes,
    leave = [],
    nonProjectCommitments = [],
    observedOptionalHolidayIds = [],
    outstandingDebtMinutes = ZERO_MINUTES,
    overrunPolicy = 'absorb',
    allocatedMinutes = ZERO_MINUTES,
    underToleranceMinutes = DEFAULT_TOLERANCE,
    overToleranceMinutes = DEFAULT_TOLERANCE
  } = input

  const adjustments: CapacityAdjustment[] = []

  // A non-working day has no capacity at all, and no adjustment list is
  // meaningful — nothing was ever available to reduce.
  if (!resolution.isWorkingDay) {
    return {
      memberId,
      date,
      nominalMinutes,
      adjustments,
      adjustedMinutes: ZERO_MINUTES,
      outstandingDebtMinutes,
      overrunPolicy,
      effectiveMinutes: ZERO_MINUTES,
      allocatedMinutes,
      gapMinutes: ZERO_MINUTES,
      status: 'unavailable',
      isUnavailable: true
    }
  }

  // Step 1 — scale nominal by the partial-day factor. The resolution already
  // knows the shortened standard day, so this is a ratio rather than a subtraction.
  let working = nominalMinutes
  if (resolution.isPartialDay) {
    const scaled = scaleForPartialDay(nominalMinutes, resolution)
    if (scaled < nominalMinutes) {
      adjustments.push({
        type: 'partial_day',
        label: resolution.holidayName ?? resolution.overrideName ?? 'Half day',
        minutes: subtractMinutes(nominalMinutes, scaled)
      })
    }
    working = scaled
  }

  // Step 2 — leave.
  const leaveMinutes = leave
    .filter((entry) => isWithinRange(date, entry.startDate, entry.endDate))
    .reduce<Minutes>(
      (total, entry) =>
        addMinutes(total, entry.minutesPerDay === undefined ? working : minutes(entry.minutesPerDay)),
      ZERO_MINUTES
    )

  if (leaveMinutes > 0) {
    adjustments.push({ type: 'leave', label: 'Approved leave', minutes: leaveMinutes })
  }

  // Step 3 — attendance. Absent removes the whole day; partial removes the
  // difference between nominal and the hours actually being worked.
  const attendanceMinutes = attendanceAdjustment(attendance, working, attendancePartialMinutes)
  if (attendanceMinutes > 0) {
    adjustments.push({
      type: 'attendance',
      label: attendanceLabel(attendance),
      minutes: attendanceMinutes
    })
  }

  // Step 4 — recurring non-project commitments, e.g. a support rota. Filtered
  // once so the itemised list and the total can never disagree.
  const weekday = dayOfWeek(date)
  const applicableCommitments = nonProjectCommitments.filter(
    (c) => c.daysOfWeek.length === 0 || c.daysOfWeek.includes(weekday)
  )

  let commitmentMinutes: Minutes = ZERO_MINUTES
  for (const commitment of applicableCommitments) {
    const amount = minutes(commitment.minutesPerDay)
    commitmentMinutes = addMinutes(commitmentMinutes, amount)
    adjustments.push({
      type: 'non_project_commitment',
      label: commitment.label,
      minutes: amount
    })
  }

  // Step 5 — optional holidays this member observes (CAL-9). The project keeps
  // its working day and the stand-up still runs; only observers lose capacity.
  const observed = resolution.optionalHolidays.filter((holiday) =>
    observedOptionalHolidayIds.includes(holiday.id)
  )
  const optionalHolidayMinutes = observed.reduce<Minutes>(
    (total, holiday) =>
      addMinutes(
        total,
        holiday.isFullDay ? working : minutes(holiday.minutesIfPartial ?? 0)
      ),
    ZERO_MINUTES
  )

  for (const holiday of observed) {
    adjustments.push({
      type: 'optional_holiday',
      label: holiday.name,
      minutes: holiday.isFullDay ? working : minutes(holiday.minutesIfPartial ?? 0)
    })
  }

  // Step 5b — member-scoped calendar overrides (CAL-4, layer 4). The date stays
  // a working day for the project; only the named members lose capacity.
  const applicableExceptions = (resolution.memberExceptions ?? []).filter((exception) =>
    exception.memberIds.includes(memberId)
  )

  let memberExceptionMinutes: Minutes = ZERO_MINUTES
  for (const exception of applicableExceptions) {
    // A partial exception leaves the member working `minutesIfPartial`, so the
    // amount *removed* is the remainder of their day.
    const removed = exception.isPartialDay
      ? clampToZero(subtractMinutes(working, minutes(exception.minutesIfPartial ?? 0)))
      : working
    memberExceptionMinutes = addMinutes(memberExceptionMinutes, removed)
    adjustments.push({
      type: 'member_exception',
      label: exception.name,
      minutes: removed
    })
  }

  const adjustedMinutes = clampToZero(
    subtractMinutes(
      working,
      addMinutes(
        leaveMinutes,
        attendanceMinutes,
        commitmentMinutes,
        optionalHolidayMinutes,
        memberExceptionMinutes
      )
    )
  )

  // Step 6 — the overrun policy decides whether debt eats into today.
  const effectiveMinutes =
    overrunPolicy === 'reduce'
      ? clampToZero(subtractMinutes(adjustedMinutes, outstandingDebtMinutes))
      : adjustedMinutes

  const gapMinutes = subtractMinutes(effectiveMinutes, allocatedMinutes)

  return {
    memberId,
    date,
    nominalMinutes,
    adjustments,
    adjustedMinutes,
    outstandingDebtMinutes,
    overrunPolicy,
    effectiveMinutes,
    allocatedMinutes,
    gapMinutes,
    status: allocationStatus({
      effectiveMinutes,
      allocatedMinutes,
      gapMinutes,
      underToleranceMinutes,
      overToleranceMinutes
    }),
    isUnavailable: effectiveMinutes === 0
  }
}

/**
 * Classifies a member's day (spec ALO-3).
 *
 * Order matters: `unavailable` outranks everything, because someone on leave is
 * not "empty" and must not be counted as under-allocated (E22 — CC-1 does not
 * apply to them).
 */
export function allocationStatus(input: {
  effectiveMinutes: Minutes
  allocatedMinutes: Minutes
  gapMinutes: Minutes
  underToleranceMinutes: Minutes
  overToleranceMinutes: Minutes
}): AllocationStatus {
  const { effectiveMinutes, allocatedMinutes, gapMinutes, underToleranceMinutes, overToleranceMinutes } =
    input

  if (effectiveMinutes === 0) return 'unavailable'
  if (allocatedMinutes === 0) return 'zero'
  if (Math.abs(gapMinutes) <= underToleranceMinutes && gapMinutes >= -overToleranceMinutes) {
    return 'full'
  }
  if (gapMinutes > underToleranceMinutes) return 'under'
  return 'over'
}

/**
 * Applies ALO-1's `partialDayFactor`.
 *
 * The factor is the shortened standard day over the project's normal one, and it
 * scales the member's *own* nominal — so on a half day a four-hour part-timer
 * gets two hours, not the project's four.
 */
function scaleForPartialDay(nominalMinutes: Minutes, resolution: WorkingDayResolution): Minutes {
  if (resolution.fullStandardMinutes <= 0) return nominalMinutes

  const factor = resolution.standardMinutes / resolution.fullStandardMinutes
  if (factor >= 1) return nominalMinutes

  return minutes(Math.round(nominalMinutes * factor))
}

function attendanceAdjustment(
  attendance: AttendanceStatus,
  working: Minutes,
  partialMinutes?: Minutes
): Minutes {
  switch (attendance) {
    case 'present':
      return ZERO_MINUTES
    case 'partial':
      // Remove whatever is *not* being worked.
      return clampToZero(subtractMinutes(working, partialMinutes ?? working))
    case 'absent_planned':
    case 'absent_unplanned':
      return working
  }
}

function attendanceLabel(attendance: AttendanceStatus): string {
  switch (attendance) {
    case 'absent_planned':
      return 'Absent (planned)'
    case 'absent_unplanned':
      return 'Absent (unplanned)'
    case 'partial':
      return 'Working a partial day'
    case 'present':
      return 'Present'
  }
}

/**
 * Picks the capacity record in force on a date (DAT-1).
 *
 * A historical stand-up must resolve capacity as it was on its own date, never
 * as it is now — otherwise changing someone's hours today silently rewrites
 * every past day's variance.
 */
export function selectCapacityAsOf<
  T extends { effectiveFrom: IsoDate; effectiveTo?: IsoDate; isActive?: boolean }
>(records: readonly T[], date: IsoDate): T | undefined {
  return records
    .filter((record) => record.isActive !== false)
    .filter((record) => record.effectiveFrom <= date)
    .filter((record) => record.effectiveTo === undefined || date < record.effectiveTo)
    .sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1))[0]
}
