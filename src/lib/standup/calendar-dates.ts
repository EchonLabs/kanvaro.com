/**
 * Pure calendar-date helpers for the stand-up module.
 *
 * Two distinct kinds of time exist here and must never be conflated (CAL-5):
 *
 * - **Calendar dates** are timezone-independent `YYYY-MM-DD` strings. "Is the
 *   18th a working day" has the same answer whichever machine asks.
 * - **Instants** are absolute points in time (`Date`), used for when a stand-up
 *   actually starts.
 *
 * The project's timezone is what maps between them, and it is authoritative for
 * deciding which calendar date a stand-up belongs to. A 09:15 stand-up in
 * Asia/Colombo is 03:45 UTC and belongs to the Colombo date, not the UTC one.
 *
 * CAL-6 forbids storing a fixed UTC offset: the instant is recomputed from
 * wall-clock time plus the IANA identifier every time, so DST transitions and
 * half-hour zones like +05:30 both fall out for free.
 */
import { formatInTimeZone, getTimezoneOffset, zonedTimeToUtc } from 'date-fns-tz'

/** A timezone-independent calendar date, `YYYY-MM-DD`. */
export type IsoDate = string

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const LOCAL_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/

export function isIsoDate(value: string): boolean {
  if (!ISO_DATE_PATTERN.test(value)) return false
  // Rejects impossible dates that still match the shape, e.g. 2026-02-31.
  const [year, month, day] = value.split('-').map(Number)
  const probe = new Date(Date.UTC(year, month - 1, day))
  return (
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day
  )
}

export function assertIsoDate(value: string, label = 'date'): IsoDate {
  if (!isIsoDate(value)) {
    throw new RangeError(`Expected ${label} as an ISO date (YYYY-MM-DD), received "${value}"`)
  }
  return value
}

/**
 * Day of week for a calendar date, 0 = Sunday … 6 = Saturday.
 *
 * Computed in UTC deliberately: the weekday of a calendar date is a property of
 * the date itself, not of any observer's timezone.
 */
export function dayOfWeek(date: IsoDate): number {
  const [year, month, day] = assertIsoDate(date).split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay()
}

/** Adds whole days to a calendar date, staying in the date domain. */
export function addDays(date: IsoDate, days: number): IsoDate {
  const [year, month, day] = assertIsoDate(date).split('-').map(Number)
  const shifted = new Date(Date.UTC(year, month - 1, day + days))
  return toIsoDate(shifted)
}

/** Formats a UTC-midnight `Date` back to `YYYY-MM-DD`. */
function toIsoDate(value: Date): IsoDate {
  const year = value.getUTCFullYear().toString().padStart(4, '0')
  const month = (value.getUTCMonth() + 1).toString().padStart(2, '0')
  const day = value.getUTCDate().toString().padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** Inclusive list of calendar dates from `from` to `to`. */
export function eachDateInRange(from: IsoDate, to: IsoDate): IsoDate[] {
  assertIsoDate(from, 'from')
  assertIsoDate(to, 'to')

  const dates: IsoDate[] = []
  let cursor = from
  // Lexicographic comparison is safe and exact for zero-padded ISO dates.
  while (cursor <= to) {
    dates.push(cursor)
    cursor = addDays(cursor, 1)
  }
  return dates
}

/** Inclusive containment test for a calendar-date range. */
export function isWithinRange(date: IsoDate, from: IsoDate, to: IsoDate): boolean {
  return date >= from && date <= to
}

/** `MM-DD`, used to match annually recurring overrides regardless of year. */
export function monthDay(date: IsoDate): string {
  return assertIsoDate(date).slice(5)
}

/**
 * The calendar date a given instant falls on, in the given timezone.
 *
 * This is how an incoming timestamp is attributed to a stand-up day. At 23:00
 * UTC on the 5th it is already the 6th in Colombo, and the Colombo answer is
 * the one that counts.
 */
export function toProjectDate(instant: Date, timezone: string): IsoDate {
  return formatInTimeZone(instant, timezone, 'yyyy-MM-dd')
}

/**
 * The UTC instant of a wall-clock time on a calendar date in a timezone.
 *
 * Recomputed from the IANA id rather than a stored offset (CAL-6), so a sprint
 * spanning a DST boundary keeps its 09:15 local start on both sides.
 */
export function toInstant(date: IsoDate, localTime: string, timezone: string): Date {
  assertIsoDate(date)
  if (!LOCAL_TIME_PATTERN.test(localTime)) {
    throw new RangeError(`Expected local time as HH:mm, received "${localTime}"`)
  }
  return zonedTimeToUtc(`${date}T${localTime}:00`, timezone)
}

/** Today's calendar date in the given timezone. */
export function todayInTimezone(timezone: string, now: Date = new Date()): IsoDate {
  return toProjectDate(now, timezone)
}

/**
 * Start and end instants of a calendar date in a timezone, as a half-open
 * interval `[from, to)`.
 *
 * This is what turns "hours logged on the 5th" into a query bound, and is why
 * `getLoggedMinutes` can stay timezone-agnostic.
 */
export function dayBoundsInTimezone(
  date: IsoDate,
  timezone: string
): { from: Date; to: Date } {
  return {
    from: toInstant(date, '00:00', timezone),
    to: toInstant(addDays(date, 1), '00:00', timezone)
  }
}

/** True when the IANA identifier is one this runtime recognises. */
export function isValidTimezone(timezone: string): boolean {
  try {
    // Throws RangeError for an unknown identifier.
    new Intl.DateTimeFormat('en-US', { timeZone: timezone })
    return true
  } catch {
    return false
  }
}

/**
 * Offset from UTC in minutes for a timezone at a given instant.
 *
 * Exposed for display ("project time is UTC+5:30") and for tests that assert
 * DST behaviour. Never persist the result — CAL-6 requires recomputation.
 */
export function offsetMinutesAt(timezone: string, instant: Date): number {
  // Deliberately not `utcToZonedTime`: that returns a Date whose *local*
  // rendering shows the target zone, so differencing it against the instant
  // leaks the host machine's own offset and yields a different answer on a
  // developer laptop than on a UTC server. getTimezoneOffset is absolute.
  return Math.round(getTimezoneOffset(timezone, instant) / 60000)
}
