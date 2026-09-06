/**
 * Working-day resolution — the question everything else in the module is
 * downstream of (spec §7).
 *
 * CAL-1 makes this the **single** place weekend and holiday logic may live. No
 * other feature may ask "is this a weekend"; it asks this.
 *
 * The four layers, each overriding the one above (§7.1):
 *
 *   1. Organisation working week      — which weekdays are workdays at all
 *   2. Subscribed holiday sets        — public/company holidays remove the day
 *   3. Project calendar overrides     — can remove a day *or* restore one
 *   4. Member exceptions              — never reach this function
 *
 * Layer 4's absence is structural, not an oversight. CAL-4 forbids member data
 * from making a date non-working for the project: a day where every single
 * member is on leave is still a working day and still gets a stand-up, so the
 * record of the gap exists. Member leave is read by `computeCapacity` instead.
 *
 * The resolver below is pure — it takes a pre-loaded {@link CalendarContext} —
 * so the precedence rules can be tested exhaustively without a database, and so
 * generating a 60-day sprint costs one query rather than sixty.
 */
import { dayOfWeek, isWithinRange, monthDay, type IsoDate } from './calendar-dates'
import { minutes, type Minutes } from './minutes'

/** Why a date resolved the way it did (CAL-2). */
export type WorkingDayReason =
  | 'working'
  | 'weekend'
  | 'org_holiday'
  | 'project_non_working'
  | 'outside_sprint'

/** A holiday as the resolver needs to see it. */
export interface HolidayRecord {
  id: string
  name: string
  type: 'public' | 'company' | 'optional'
  isFullDay: boolean
  minutesIfPartial?: number
}

/** A project calendar override as the resolver needs to see it. */
export interface CalendarOverrideRecord {
  id: string
  name: string
  effect: 'non_working' | 'observed_as_working'
  isPartialDay: boolean
  minutesIfPartial?: number
  recurringAnnually: boolean
  /**
   * When populated, the override is member-scoped and is therefore a **capacity
   * adjustment, not a calendar change** (CAL-4). The resolver ignores it
   * entirely; `computeCapacity` applies it.
   */
  appliesToMemberIds?: string[]
}

/**
 * Everything the resolver needs, loaded once for a whole date range.
 */
export interface CalendarContext {
  timezone: string
  /** 0 = Sunday … 6 = Saturday. */
  workingDaysOfWeek: number[]
  standardMinutesPerDay: Minutes
  /** Holidays from every subscribed set, keyed by ISO date. */
  holidaysByDate: Map<IsoDate, HolidayRecord[]>
  /** Project overrides with an exact date, keyed by that date. */
  overridesByDate: Map<IsoDate, CalendarOverrideRecord[]>
  /** Annually recurring project overrides, keyed by `MM-DD`. */
  recurringOverridesByMonthDay: Map<string, CalendarOverrideRecord[]>
}

/**
 * The structured result CAL-2 requires. Deliberately **not** a boolean: the UI
 * has to explain *why* a date is not a working day, and the capacity engine
 * needs the partial-day hours and the optional-holiday list.
 *
 * `standardMinutes` replaces the spec's illustrative `standardHours` — ALO-2
 * and DAT-2 mandate integer minutes, and hours exist only at the display
 * boundary.
 */
export interface WorkingDayResolution {
  date: IsoDate
  isWorkingDay: boolean
  reason: WorkingDayReason
  holidayId?: string
  holidayName?: string
  isPartialDay: boolean
  /** The standard day for this date — shortened when `isPartialDay`. */
  standardMinutes: Minutes
  /**
   * The project's normal full standard day, unaffected by this date.
   *
   * Carried so capacity can compute ALO-1's `partialDayFactor` as
   * `standardMinutes / fullStandardMinutes` and scale each member's own nominal
   * by it — a part-timer on a half day gets half of *their* day, not half of the
   * project's.
   */
  fullStandardMinutes: Minutes
  /**
   * Optional holidays falling on this date (CAL-9). The day stays a working day
   * and the stand-up still runs; these reduce capacity only for members who
   * observe them, and drive the advisory banner.
   */
  optionalHolidays: HolidayRecord[]
  /**
   * Layer 4 — overrides scoped to specific members (CAL-4, §15.2).
   *
   * These never change `isWorkingDay`: a day where every member is out is still
   * a working day and still gets a stand-up, so the record of the gap exists.
   * They are reported here so `computeCapacity` can apply them as a *capacity
   * adjustment* for the named members only. Without this the scoping would be
   * loaded, excluded from project-wide resolution, and then silently dropped.
   */
  memberExceptions: MemberCalendarException[]
  /** The project override that decided this date, when one did. */
  overrideId?: string
  overrideName?: string
}

/** A member-scoped calendar override applying to one date. */
export interface MemberCalendarException {
  id: string
  name: string
  /** Whole-day absence when false; otherwise the member works `minutesIfPartial`. */
  isPartialDay: boolean
  minutesIfPartial?: number
  /** The members this applies to. Never empty — project-wide is layer 3. */
  memberIds: string[]
}

export interface ResolveOptions {
  /**
   * When given, dates outside this inclusive range resolve as
   * `outside_sprint` without consulting any layer.
   */
  sprintRange?: { startDate: IsoDate; endDate: IsoDate }
}

/**
 * Resolves one calendar date against a pre-loaded context.
 *
 * Pure: same inputs always produce the same output, with no clock or database
 * access, which is what makes the precedence rules exhaustively testable.
 */
export function resolveWorkingDayFrom(
  date: IsoDate,
  context: CalendarContext,
  options: ResolveOptions = {}
): WorkingDayResolution {
  const base = {
    date,
    isPartialDay: false,
    standardMinutes: context.standardMinutesPerDay,
    fullStandardMinutes: context.standardMinutesPerDay,
    optionalHolidays: [] as HolidayRecord[],
    // Carried on every return path: a member exception is orthogonal to why the
    // date resolved as it did, and capacity needs it regardless.
    memberExceptions: findMemberExceptions(date, context)
  }

  if (
    options.sprintRange &&
    !isWithinRange(date, options.sprintRange.startDate, options.sprintRange.endDate)
  ) {
    return { ...base, isWorkingDay: false, reason: 'outside_sprint' }
  }

  const holidays = context.holidaysByDate.get(date) ?? []
  // CAL-9: optional holidays never remove the day, so they are separated out
  // before any decision is made and simply reported.
  const optionalHolidays = holidays.filter((holiday) => holiday.type === 'optional')
  const blockingHolidays = holidays.filter((holiday) => holiday.type !== 'optional')

  // Layer 3 is evaluated first because it outranks everything above it, and
  // CAL-3 requires it to work in both directions.
  const override = findApplicableOverride(date, context)

  if (override) {
    if (override.effect === 'non_working') {
      return {
        ...base,
        isWorkingDay: false,
        reason: 'project_non_working',
        optionalHolidays,
        overrideId: override.id,
        overrideName: override.name
      }
    }

    // `observed_as_working` restores the day even against a weekend or a listed
    // public holiday — that is the whole point of CAL-3.
    return {
      ...base,
      isWorkingDay: true,
      reason: 'working',
      optionalHolidays,
      overrideId: override.id,
      overrideName: override.name,
      ...partialDayFields(override.isPartialDay, override.minutesIfPartial, context)
    }
  }

  // Layer 1: is this weekday a working day for the organisation at all.
  if (!context.workingDaysOfWeek.includes(dayOfWeek(date))) {
    return { ...base, isWorkingDay: false, reason: 'weekend', optionalHolidays }
  }

  // Layer 2: a full-day public or company holiday removes the day.
  const fullDayHoliday = blockingHolidays.find((holiday) => holiday.isFullDay)
  if (fullDayHoliday) {
    return {
      ...base,
      isWorkingDay: false,
      reason: 'org_holiday',
      holidayId: fullDayHoliday.id,
      holidayName: fullDayHoliday.name,
      optionalHolidays
    }
  }

  // A partial holiday keeps the day but shortens it.
  const partialHoliday = blockingHolidays.find((holiday) => !holiday.isFullDay)
  if (partialHoliday) {
    return {
      ...base,
      isWorkingDay: true,
      reason: 'working',
      holidayId: partialHoliday.id,
      holidayName: partialHoliday.name,
      optionalHolidays,
      ...partialDayFields(true, partialHoliday.minutesIfPartial, context)
    }
  }

  return { ...base, isWorkingDay: true, reason: 'working', optionalHolidays }
}

/**
 * Resolves an inclusive range in one pass.
 *
 * Batched because generation for a 60-working-day sprint must complete inside
 * NFR-4's five seconds, which is not reachable one query per date.
 */
export function resolveWorkingDaysFrom(
  from: IsoDate,
  to: IsoDate,
  context: CalendarContext,
  options: ResolveOptions = {}
): WorkingDayResolution[] {
  const results: WorkingDayResolution[] = []
  let cursor = from
  while (cursor <= to) {
    results.push(resolveWorkingDayFrom(cursor, context, options))
    cursor = nextDate(cursor)
  }
  return results
}

/** Convenience: just the working dates from a resolved range. */
export function workingDatesFrom(resolutions: WorkingDayResolution[]): IsoDate[] {
  return resolutions.filter((resolution) => resolution.isWorkingDay).map((r) => r.date)
}

/**
 * Finds the project override that applies to a date.
 *
 * Exact-date overrides beat annually recurring ones, so a one-off "we *are*
 * working this Christmas" can countermand the standing rule. Member-scoped
 * overrides are skipped entirely (CAL-4).
 */
function findApplicableOverride(
  date: IsoDate,
  context: CalendarContext
): CalendarOverrideRecord | undefined {
  const projectWide = (override: CalendarOverrideRecord) =>
    !override.appliesToMemberIds || override.appliesToMemberIds.length === 0

  const exact = (context.overridesByDate.get(date) ?? []).find(projectWide)
  if (exact) return exact

  return (context.recurringOverridesByMonthDay.get(monthDay(date)) ?? []).find(projectWide)
}

/**
 * Collects layer-4 overrides for a date — the member-scoped ones
 * {@link findApplicableOverride} deliberately skips.
 *
 * Only `non_working` overrides become exceptions. A member-scoped
 * `observed_as_working` would be asking one person to work a day the project is
 * closed, which CAL-4 gives no meaning to: layer 4 may only *reduce* an
 * individual's capacity, never restore a day for them.
 */
function findMemberExceptions(
  date: IsoDate,
  context: CalendarContext
): MemberCalendarException[] {
  const memberScoped = (override: CalendarOverrideRecord) =>
    override.effect === 'non_working' &&
    !!override.appliesToMemberIds &&
    override.appliesToMemberIds.length > 0

  const exact = (context.overridesByDate.get(date) ?? []).filter(memberScoped)
  const recurring = (context.recurringOverridesByMonthDay.get(monthDay(date)) ?? []).filter(
    memberScoped
  )

  return exact.concat(recurring).map((override) => ({
    id: override.id,
    name: override.name,
    isPartialDay: override.isPartialDay,
    minutesIfPartial: override.minutesIfPartial,
    memberIds: override.appliesToMemberIds ?? []
  }))
}

function partialDayFields(
  isPartial: boolean,
  minutesIfPartial: number | undefined,
  context: CalendarContext
): { isPartialDay: boolean; standardMinutes: Minutes } {
  if (!isPartial || minutesIfPartial === undefined) {
    return { isPartialDay: false, standardMinutes: context.standardMinutesPerDay }
  }
  return { isPartialDay: true, standardMinutes: minutes(minutesIfPartial) }
}

/** Local copy of addDays(_, 1) to keep this module free of a circular import. */
function nextDate(date: IsoDate): IsoDate {
  const [year, month, day] = date.split('-').map(Number)
  const shifted = new Date(Date.UTC(year, month - 1, day + 1))
  return `${shifted.getUTCFullYear().toString().padStart(4, '0')}-${(shifted.getUTCMonth() + 1)
    .toString()
    .padStart(2, '0')}-${shifted.getUTCDate().toString().padStart(2, '0')}`
}
