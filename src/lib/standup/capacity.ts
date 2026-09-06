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
    /**
     * A meeting this member attends — a sprint ceremony, or the stand-up
     * itself (DN-1). Never an allocation: a meeting has no task and no
     * estimate, so it must not reach the variance engine or the debt ledger.
     */
    | 'ceremony'
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

/**
 * The shape of a ceremony this function needs, structurally.
 *
 * Declared here rather than imported from `ceremonies.ts` on purpose: that
 * module reads the database, and this one must stay pure. `CeremonyDeduction`
 * is assignable to this, so the loader's output flows straight in.
 */
export interface CeremonyDeductionInput {
  /** Shown verbatim on the breakdown, so it must name the meeting (DN-7). */
  title: string
  minutes: Minutes
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
  /**
   * Meetings on this date that this member attends, already resolved by
   * `ceremonies.ts` (DN-1 … DN-7).
   *
   * Passing an empty list — or omitting it — is how
   * `ceremoniesConsumeCapacity: false` is expressed. This function has no
   * opinion about the setting; the caller decides whether to resolve them.
   */
  ceremonies?: CeremonyDeductionInput[]
  /** Holiday ids from `resolution.optionalHolidays` that this member observes (CAL-9). */
  observedOptionalHolidayIds?: string[]
  /** Outstanding estimate debt for the member on this sprint (VAR-6). */
  outstandingDebtMinutes?: Minutes
  overrunPolicy?: OverrunPolicy
  /** Sum of planned minutes already allocated, excluding rows excluded from capacity. */
  allocatedMinutes?: Minutes
  /**
   * Minutes that were planned for this member, have since been detached, and
   * nobody has picked up (RUN-7, §6.4 OB-13).
   *
   * Kept separate from `allocatedMinutes` because these hours are deliberately
   * *not* counted against the day — that is what detaching means — but they
   * have not gone anywhere either. Without them the RUN-7 flow reports zero
   * stranded minutes the instant it detaches, and the alert that carries the
   * reassign action could never fire on the one path that needs it most.
   *
   * The caller supplies only rows whose task has no live allocation, so hours
   * somebody has already taken over stop being stranded.
   */
  detachedMinutes?: Minutes
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
  /**
   * Hours still allocated to a member who has no capacity left to do them —
   * `allocatedMinutes` whenever `effectiveMinutes` is zero, otherwise zero.
   *
   * RUN-7 requires that marking somebody absent moves their allocations into
   * the carry-forward register, but `status` alone cannot report a failure to
   * do so: `unavailable` is decided before `allocatedMinutes` is even looked
   * at, so six stranded hours and an empty day render identically. This field
   * is what lets the board show the difference, and it stays correct whether
   * the capacity vanished through absence, a debt wipeout, or the date ceasing
   * to be a working day.
   */
  strandedMinutes: Minutes
}

const DEFAULT_TOLERANCE = minutes(15)

/**
 * The adjustment types that mean "this member is not here today", in the order
 * that decides which one speaks for a whole-day absence.
 *
 * Three separate stores can each remove a member's entire day — same-day
 * attendance (RUN-6), a dated leave range on their capacity record, and a
 * layer-4 member calendar exception (CAL-4) — and a fourth, an observed
 * full-day optional holiday (CAL-9), does the same. Left alone they stack, and
 * a member who lost one day reads as `−8h Approved leave`, `−8h Absent
 * (planned)`, `−8h Annual leave`. The arithmetic survives that, because
 * everything floors at zero; the breakdown does not, and the breakdown is the
 * entire reason this function returns an itemised list rather than a number.
 *
 * Attendance wins because it is the facilitator's judgement on the day itself,
 * and it must beat a range somebody typed a week earlier.
 */
const WHOLE_DAY_ABSENCE_PRECEDENCE = [
  'attendance',
  'leave',
  'member_exception',
  'optional_holiday'
] as const satisfies readonly CapacityAdjustment['type'][]

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
    ceremonies = [],
    observedOptionalHolidayIds = [],
    outstandingDebtMinutes = ZERO_MINUTES,
    overrunPolicy = 'absorb',
    allocatedMinutes = ZERO_MINUTES,
    detachedMinutes = ZERO_MINUTES,
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
      isUnavailable: true,
      // A date can stop being a working day after allocations were made on it —
      // a holiday loaded late, a calendar override — so this is not always zero.
      strandedMinutes: addMinutes(allocatedMinutes, detachedMinutes)
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

  // Step 4b — ceremonies and the stand-up itself (DN-1). Fixed overhead, so it
  // sits beside the non-project commitments rather than anywhere near the
  // allocation arithmetic: these hours are gone before planning starts.
  //
  // One adjustment per meeting, never an aggregate (DN-7) — "meetings −90m"
  // cannot answer the question the member drawer exists to answer.
  let ceremonyMinutes: Minutes = ZERO_MINUTES
  for (const ceremony of ceremonies) {
    const amount = minutes(ceremony.minutes)
    if (amount === 0) continue
    ceremonyMinutes = addMinutes(ceremonyMinutes, amount)
    adjustments.push({ type: 'ceremony', label: ceremony.title, minutes: amount })
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

  // Step 5c — collapse a whole-day absence to the single line that explains it.
  //
  // Only reached when one of the absence sources removes the entire working
  // day on its own. Everything else is dropped rather than listed beneath it:
  // a support rota and a sprint review are real deductions on a day the member
  // works, and noise on a day they are not there to attend either.
  const wholeDayAbsence = findWholeDayAbsence(adjustments, working)

  const finalAdjustments = wholeDayAbsence
    ? [
        // The partial-day factor is the context the collapsed line is measured
        // against, not a competing reason, so it survives: on a half day the
        // breakdown reads "Half day −4h, Absent (planned) −4h" and still
        // accounts for the whole distance from nominal.
        ...adjustments.filter((entry) => entry.type === 'partial_day'),
        { ...wholeDayAbsence, minutes: working }
      ]
    : adjustments

  const adjustedMinutes = wholeDayAbsence
    ? ZERO_MINUTES
    : clampToZero(
        subtractMinutes(
          working,
          addMinutes(
            leaveMinutes,
            attendanceMinutes,
            commitmentMinutes,
            ceremonyMinutes,
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
    adjustments: finalAdjustments,
    adjustedMinutes,
    outstandingDebtMinutes,
    overrunPolicy,
    effectiveMinutes,
    allocatedMinutes,
    gapMinutes,
    // Two independent ways for hours to be stranded, and both must show.
    // Detached hours (RUN-7) are stranded whatever the member's capacity: the
    // work is unplanned and unowned until somebody takes it. Allocated hours
    // are stranded only when there is no capacity left to do them — the
    // backstop for every route to a zero day that does *not* run detachment,
    // such as a leave range or a holiday loaded after the fact.
    strandedMinutes: addMinutes(
      detachedMinutes,
      effectiveMinutes === 0 ? allocatedMinutes : ZERO_MINUTES
    ),
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
 * Returns the one adjustment that accounts for a member being out all day, or
 * `undefined` when nobody source removed the whole day on its own.
 *
 * Totals per type before comparing, because leave ranges and member exceptions
 * both arrive as lists and two half-day entries are still a whole day out. A
 * source that removes *more* than the day still collapses to exactly the day —
 * the caller caps it — so the itemised list keeps summing to the distance from
 * nominal instead of overshooting it.
 */
function findWholeDayAbsence(
  adjustments: readonly CapacityAdjustment[],
  working: Minutes
): CapacityAdjustment | undefined {
  // A zero-length day has nothing to be absent from, and every total would
  // trivially clear the bar.
  if (working <= 0) return undefined

  for (const type of WHOLE_DAY_ABSENCE_PRECEDENCE) {
    const forType = adjustments.filter((entry) => entry.type === type)
    if (forType.length === 0) continue

    const total = forType.reduce<number>((sum, entry) => sum + entry.minutes, 0)
    // The first entry's label speaks for the type. With two exceptions on one
    // date only one reason can be shown, and the earlier one is the one the
    // resolution ordered first.
    if (total >= working) return forType[0]
  }

  return undefined
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
