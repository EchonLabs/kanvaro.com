/**
 * Bridges a proposed calendar change to its consequences.
 *
 * Resolves the affected date range twice — as the calendar is now, and as it
 * would be after the change — then runs the CAL-12/13 disposition table over the
 * difference. UI-1 requires this to be available *before* anything is saved.
 *
 * Existing stand-ups are looked up through {@link loadExistingStandups}, which
 * returns an empty map until the `Standup` model lands in Phase 3. That keeps
 * the analyser honest today (a calendar change genuinely affects nothing yet)
 * and means Phase 3 only has to fill in one function.
 */
import mongoose from 'mongoose'

import { addDays, eachDateInRange, monthDay, type IsoDate } from './calendar-dates'
import { loadCalendarContext } from './calendar-service'
import {
  analyseCalendarImpact,
  describeImpact,
  type CalendarImpactItem,
  type ExistingStandup
} from './calendar-impact'
import {
  resolveWorkingDayFrom,
  type CalendarContext,
  type CalendarOverrideRecord
} from './working-day'

export interface ProposedOverride {
  date: IsoDate
  effect: 'non_working' | 'observed_as_working'
  recurringAnnually?: boolean
}

export interface ProposedWorkingWeek {
  workingDaysOfWeek: number[]
}

export interface PreviewResult {
  items: CalendarImpactItem[]
  summary: string
  blockedCount: number
  hasApplicableChanges: boolean
}

/**
 * Previews adding a single project override.
 */
export async function previewCalendarChange(
  projectId: string,
  proposed: ProposedOverride
): Promise<PreviewResult> {
  const context = await loadCalendarContext(projectId, proposed.date, proposed.date)

  const beforeResolution = resolveWorkingDayFrom(proposed.date, context)
  const afterResolution = resolveWorkingDayFrom(proposed.date, withProposedOverride(context, proposed))

  return buildPreview(
    projectId,
    new Map([[proposed.date, beforeResolution.isWorkingDay]]),
    new Map([[proposed.date, afterResolution.isWorkingDay]])
  )
}

/**
 * Previews changing the working week, which can affect every date in a range.
 *
 * The range is bounded by the caller (typically the current and next sprint)
 * because a working-week change is otherwise unbounded in time.
 */
export async function previewWorkingWeekChange(
  projectId: string,
  proposed: ProposedWorkingWeek,
  range: { from: IsoDate; to: IsoDate }
): Promise<PreviewResult> {
  const context = await loadCalendarContext(projectId, range.from, range.to)
  const proposedContext: CalendarContext = {
    ...context,
    workingDaysOfWeek: proposed.workingDaysOfWeek
  }

  const before = new Map<IsoDate, boolean>()
  const after = new Map<IsoDate, boolean>()

  for (const date of eachDateInRange(range.from, range.to)) {
    before.set(date, resolveWorkingDayFrom(date, context).isWorkingDay)
    after.set(date, resolveWorkingDayFrom(date, proposedContext).isWorkingDay)
  }

  return buildPreview(projectId, before, after)
}

/**
 * Previews removing an existing override, which is the inverse operation and
 * equally capable of creating or destroying stand-ups.
 */
export async function previewOverrideRemoval(
  projectId: string,
  overrideId: string,
  date: IsoDate
): Promise<PreviewResult> {
  const context = await loadCalendarContext(projectId, date, date)

  const withoutOverride: CalendarContext = {
    ...context,
    overridesByDate: filterOverrides(context.overridesByDate, overrideId),
    recurringOverridesByMonthDay: filterOverrides(
      context.recurringOverridesByMonthDay,
      overrideId
    )
  }

  return buildPreview(
    projectId,
    new Map([[date, resolveWorkingDayFrom(date, context).isWorkingDay]]),
    new Map([[date, resolveWorkingDayFrom(date, withoutOverride).isWorkingDay]])
  )
}

async function buildPreview(
  projectId: string,
  before: Map<IsoDate, boolean>,
  after: Map<IsoDate, boolean>
): Promise<PreviewResult> {
  const dates = Array.from(before.keys())
  const existing = await loadExistingStandups(projectId, dates)

  const summary = analyseCalendarImpact({ before, after, existing })

  return {
    items: summary.items,
    summary: describeImpact(summary),
    blockedCount: summary.blocked.length,
    hasApplicableChanges: summary.hasApplicableChanges
  }
}

/**
 * Loads stand-ups on the given dates.
 *
 * The `Standup` model arrives in Phase 3. Until then this returns an empty map,
 * which is factually correct — no stand-ups exist to be affected — rather than
 * pretending. The model lookup is guarded so that the moment Phase 3 registers
 * the model, previews start reporting real dispositions with no other change.
 */
async function loadExistingStandups(
  projectId: string,
  dates: IsoDate[]
): Promise<Map<IsoDate, ExistingStandup>> {
  const model = mongoose.models.Standup
  if (!model || dates.length === 0) return new Map()

  const standups = await model
    .find({ project: projectId, standupDate: { $in: dates } })
    .select('standupDate status')
    .lean()

  return new Map(
    (standups as any[]).map((standup) => [
      standup.standupDate as IsoDate,
      { date: standup.standupDate, status: standup.status } as ExistingStandup
    ])
  )
}

/** Adds a not-yet-saved override to a context so it can be resolved against. */
function withProposedOverride(
  context: CalendarContext,
  proposed: ProposedOverride
): CalendarContext {
  const record: CalendarOverrideRecord = {
    id: '__proposed__',
    name: 'Proposed change',
    effect: proposed.effect,
    isPartialDay: false,
    recurringAnnually: proposed.recurringAnnually === true,
    appliesToMemberIds: []
  }

  if (record.recurringAnnually) {
    const map = new Map(context.recurringOverridesByMonthDay)
    map.set(monthDay(proposed.date), [record])
    return { ...context, recurringOverridesByMonthDay: map }
  }

  const map = new Map(context.overridesByDate)
  // Placed first so it wins over anything already on the date.
  map.set(proposed.date, [record, ...(context.overridesByDate.get(proposed.date) ?? [])])
  return { ...context, overridesByDate: map }
}

function filterOverrides(
  source: Map<string, CalendarOverrideRecord[]>,
  excludeId: string
): Map<string, CalendarOverrideRecord[]> {
  const result = new Map<string, CalendarOverrideRecord[]>()
  source.forEach((records, key) => {
    result.set(
      key,
      records.filter((record) => record.id !== excludeId)
    )
  })
  return result
}

/** Convenience for the schedule screen: the next N working days. */
export function nextWorkingDates(
  context: CalendarContext,
  from: IsoDate,
  count: number
): IsoDate[] {
  const dates: IsoDate[] = []
  let cursor = from
  let guard = 0

  while (dates.length < count && guard < count * 10) {
    if (resolveWorkingDayFrom(cursor, context).isWorkingDay) dates.push(cursor)
    cursor = addDays(cursor, 1)
    guard += 1
  }

  return dates
}
