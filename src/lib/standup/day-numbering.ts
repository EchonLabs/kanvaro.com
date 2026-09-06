/**
 * Sprint day numbering and stand-up shape (spec SCH-3, RUN-1, §5.2).
 *
 * CAL-14 is the reason this is a function rather than a stored value: day
 * numbers are *derived* from the working-day set and recomputed whenever that
 * set changes. Declaring a holiday mid-sprint renumbers everything after it.
 * Only a completed stand-up keeps a frozen copy, in `displayedDayNumber`.
 *
 * Pure — no database, no calendar resolution. The caller supplies the working
 * dates, which only `resolveWorkingDay()` is allowed to produce (CAL-1).
 */
import type { StandupShape } from '@/models/Standup'

import { assertIsoDate, type IsoDate } from './calendar-dates'

export interface DayNumbering {
  date: IsoDate
  /** 1-based ordinal among working days. */
  sprintDayNumber: number
  totalSprintDays: number
  shape: StandupShape
}

/**
 * The §5.2 shape for a position in the sprint.
 *
 * A one-day sprint is `day_one`, not `final_day`: day one's dominant panel is
 * the unassigned pool, and a sprint whose only day skipped assignment would
 * have nothing to close on the final-day panel anyway.
 */
export function shapeFor(index: number, total: number): StandupShape {
  if (index === 0) return 'day_one'
  if (index === total - 1) return 'final_day'
  return 'mid_sprint'
}

/**
 * Numbers a sprint's working days in date order.
 *
 * Sorts defensively and refuses duplicates — a duplicate would mean two
 * stand-ups claiming the same day number, which the unique `(sprint,
 * standupDate)` index exists to prevent and which would silently corrupt every
 * subsequent number.
 */
export function numberSprintDays(workingDates: IsoDate[]): DayNumbering[] {
  const seen = new Set<IsoDate>()
  for (const date of workingDates) {
    assertIsoDate(date, 'workingDate')
    if (seen.has(date)) {
      throw new Error(`Duplicate working date in sprint day numbering: ${date}`)
    }
    seen.add(date)
  }

  const ordered = workingDates.slice().sort()
  const total = ordered.length

  return ordered.map((date, index) => ({
    date,
    sprintDayNumber: index + 1,
    totalSprintDays: total,
    shape: shapeFor(index, total)
  }))
}
