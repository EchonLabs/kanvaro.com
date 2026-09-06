/**
 * Database-backed entry points for working-day resolution.
 *
 * This module owns loading; `working-day.ts` owns the rules. Keeping them apart
 * means the precedence logic stays pure and exhaustively testable, and a whole
 * sprint resolves from one set of queries instead of one per date (NFR-4).
 *
 * CAL-1: every feature that needs to know whether a date is a working day calls
 * {@link resolveWorkingDay} or {@link resolveWorkingDays} here. Nothing else may
 * implement weekend or holiday logic.
 */
import { Holiday } from '@/models/Holiday'
import { HolidaySet } from '@/models/HolidaySet'
import { WorkingCalendar, type IWorkingCalendar } from '@/models/WorkingCalendar'

import { assertIsoDate, monthDay, type IsoDate } from './calendar-dates'
import { minutes, type Minutes } from './minutes'
import {
  resolveWorkingDayFrom,
  resolveWorkingDaysFrom,
  type CalendarContext,
  type CalendarOverrideRecord,
  type HolidayRecord,
  type ResolveOptions,
  type WorkingDayResolution
} from './working-day'

/** Fallbacks when an organisation has never configured a calendar. */
const DEFAULT_WORKING_DAYS = [1, 2, 3, 4, 5]
const DEFAULT_STANDARD_MINUTES = 480
const DEFAULT_TIMEZONE = 'UTC'

/**
 * Loads everything needed to resolve a date range for a project.
 *
 * The range is used to bound the holiday query. Annually recurring overrides are
 * indexed by `MM-DD` so they apply in any year without being duplicated per
 * year in the database.
 */
export async function loadCalendarContext(
  projectId: string,
  from: IsoDate,
  to: IsoDate
): Promise<CalendarContext> {
  assertIsoDate(from, 'from')
  assertIsoDate(to, 'to')

  const projectCalendar = (await WorkingCalendar.findOne({
    project: projectId,
    scope: 'project'
  }).lean()) as IWorkingCalendar | null

  // Layer 1 comes from the organisation unless the project has taken its own
  // copy (the "Override for this project" action on the calendar screen).
  const organizationCalendar = projectCalendar
    ? null
    : ((await WorkingCalendar.findOne({ scope: 'organization' }).lean()) as IWorkingCalendar | null)

  const effective = projectCalendar ?? organizationCalendar

  const subscribedSetIds = effective?.subscribedHolidaySets ?? []

  const holidays = subscribedSetIds.length
    ? await Holiday.find({
        holidaySet: { $in: subscribedSetIds },
        // Revoked rows are kept for history but must not affect resolution
        // (DO-3). Legacy rows written before the field existed have no
        // `status`, so absence counts as active.
        status: { $ne: 'revoked' },
        date: { $gte: from, $lte: to }
      }).lean()
    : []

  const holidaysByDate = new Map<IsoDate, HolidayRecord[]>()
  for (const holiday of holidays as any[]) {
    const record: HolidayRecord = {
      id: holiday._id.toString(),
      name: holiday.name,
      type: holiday.type,
      isFullDay: holiday.isFullDay !== false,
      minutesIfPartial: holiday.minutesIfPartial
    }
    const existing = holidaysByDate.get(holiday.date)
    if (existing) existing.push(record)
    else holidaysByDate.set(holiday.date, [record])
  }

  const overridesByDate = new Map<IsoDate, CalendarOverrideRecord[]>()
  const recurringOverridesByMonthDay = new Map<string, CalendarOverrideRecord[]>()

  for (const override of projectCalendar?.overrides ?? []) {
    const record: CalendarOverrideRecord = {
      id: override._id?.toString() ?? '',
      name: override.name,
      effect: override.effect,
      isPartialDay: override.isPartialDay === true,
      minutesIfPartial: override.minutesIfPartial,
      recurringAnnually: override.recurringAnnually === true,
      appliesToMemberIds: (override.appliesToMemberIds ?? []).map((id) => id.toString())
    }

    if (record.recurringAnnually) {
      const key = monthDay(override.date)
      const existing = recurringOverridesByMonthDay.get(key)
      if (existing) existing.push(record)
      else recurringOverridesByMonthDay.set(key, [record])
    } else {
      const existing = overridesByDate.get(override.date)
      if (existing) existing.push(record)
      else overridesByDate.set(override.date, [record])
    }
  }

  return {
    timezone: effective?.timezone ?? DEFAULT_TIMEZONE,
    workingDaysOfWeek: effective?.workingDaysOfWeek?.length
      ? effective.workingDaysOfWeek
      : DEFAULT_WORKING_DAYS,
    standardMinutesPerDay: minutes(effective?.standardMinutesPerDay ?? DEFAULT_STANDARD_MINUTES),
    holidaysByDate,
    overridesByDate,
    recurringOverridesByMonthDay
  }
}

/**
 * The single resolution function CAL-1 mandates.
 *
 * For more than a couple of dates use {@link resolveWorkingDays} instead — this
 * loads a context per call.
 */
export async function resolveWorkingDay(
  projectId: string,
  date: IsoDate,
  options: ResolveOptions = {}
): Promise<WorkingDayResolution> {
  const context = await loadCalendarContext(projectId, date, date)
  return resolveWorkingDayFrom(date, context, options)
}

/** Batched resolution — one set of queries for the whole range. */
export async function resolveWorkingDays(
  projectId: string,
  from: IsoDate,
  to: IsoDate,
  options: ResolveOptions = {}
): Promise<WorkingDayResolution[]> {
  const context = await loadCalendarContext(projectId, from, to)
  return resolveWorkingDaysFrom(from, to, context, options)
}

/**
 * The span of dates a set of holiday sets actually has data for.
 *
 * Holiday sets are perpetual and topped up each year as gazettes are published,
 * so a set can simply run out. Callers use this to warn when a sprint extends
 * past the loaded range rather than silently treating an unloaded year as all
 * working days — a gap that would otherwise generate stand-ups on public
 * holidays with no signal at all.
 */
export async function getHolidayCoverage(
  holidaySetIds: string[]
): Promise<{ from: IsoDate; to: IsoDate; count: number } | null> {
  if (holidaySetIds.length === 0) return null

  const [result] = await Holiday.aggregate([
    // Revoked rows must not extend claimed coverage — otherwise the calendar
    // says it covers dates with no data behind them.
    { $match: { holidaySet: { $in: holidaySetIds.map(toObjectId) }, status: { $ne: 'revoked' } } },
    {
      $group: {
        _id: null,
        from: { $min: '$date' },
        to: { $max: '$date' },
        count: { $sum: 1 }
      }
    }
  ])

  if (!result) return null
  return { from: result.from, to: result.to, count: result.count }
}

/**
 * Warns when a date range is not fully covered by loaded holiday data.
 *
 * Returns `null` when coverage is complete, so a truthy result is always
 * something worth showing the user.
 */
export async function checkHolidayCoverage(
  projectId: string,
  from: IsoDate,
  to: IsoDate
): Promise<{ message: string; setName: string; coveredTo?: IsoDate } | null> {
  const calendar = (await WorkingCalendar.findOne({
    project: projectId,
    scope: 'project'
  }).lean()) as IWorkingCalendar | null

  const setIds = (calendar?.subscribedHolidaySets ?? []).map((id) => id.toString())
  if (setIds.length === 0) return null

  // Checked per set, not across all of them. A max() over the union would let a
  // set that has run out hide behind one that has not — and the set that ran out
  // is exactly the one about to put a stand-up on a public holiday.
  const sets = (await HolidaySet.find({ _id: { $in: setIds }, isActive: { $ne: false } })
    .select('name')
    .lean()) as unknown as Array<{ _id: unknown; name: string }>

  let worst: { message: string; setName: string; coveredTo?: IsoDate } | null = null

  for (const set of sets) {
    const coverage = await getHolidayCoverage([String(set._id)])

    if (!coverage) {
      // Nothing loaded at all beats any partial gap: every date is being treated
      // as a working day.
      return {
        message: `No holidays have been loaded for ${set.name} yet.`,
        setName: set.name
      }
    }

    if (to > coverage.to && (!worst?.coveredTo || coverage.to < worst.coveredTo)) {
      worst = {
        message:
          `Holiday data for ${set.name} only runs to ${coverage.to}. Dates after that are ` +
          'treated as working days. Import the next gazette to cover them.',
        setName: set.name,
        coveredTo: coverage.to
      }
    }
  }

  return worst
}

function toObjectId(id: string) {
  // Imported lazily to keep this module usable in unit tests that mock models.
  const mongoose = require('mongoose')
  return new mongoose.Types.ObjectId(id)
}

export type { CalendarContext, WorkingDayResolution }
export type { Minutes }
