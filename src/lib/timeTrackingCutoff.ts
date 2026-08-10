// Helpers for the past-time cutoff rule applied to restricted (non-admin/HR) manual time logs.
// "10:30 AM" only means something precise once tied to a timezone, so all of this is evaluated
// in the organization's configured timezone rather than the server/browser's local time.

const FALLBACK_TIMEZONE = 'UTC'

function resolveTimezone(timezone: string | undefined | null): string {
  const tz = timezone || FALLBACK_TIMEZONE
  try {
    Intl.DateTimeFormat('en-US', { timeZone: tz }).format()
    return tz
  } catch {
    return FALLBACK_TIMEZONE
  }
}

/** Calendar date of `date` in `timezone`, as 'YYYY-MM-DD' (no time component). */
export function getOrgLocalDateString(date: Date, timezone: string): string {
  const tz = resolveTimezone(timezone)
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  })
  return formatter.format(date)
}

/** Time of day of `date` in `timezone`, as 24-hour 'HH:mm'. */
export function getOrgLocalTimeString(date: Date, timezone: string): string {
  const tz = resolveTimezone(timezone)
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  })
  return formatter.format(date)
}

/** Whole calendar days between two 'YYYY-MM-DD' strings (toDateStr - fromDateStr), DST-safe. */
export function calendarDayDiff(fromDateStr: string, toDateStr: string): number {
  const [fy, fm, fd] = fromDateStr.split('-').map(Number)
  const [ty, tm, td] = toDateStr.split('-').map(Number)
  const fromUtc = Date.UTC(fy, fm - 1, fd)
  const toUtc = Date.UTC(ty, tm - 1, td)
  return Math.round((toUtc - fromUtc) / (1000 * 60 * 60 * 24))
}

/**
 * Only the date sitting exactly at the pastTimeLimitDays boundary is affected by the cutoff:
 * once cutoffTime has passed today, that boundary day rolls out of the window, shrinking the
 * effective limit by one. Days strictly within the window stay available all day regardless.
 */
export function computeEffectivePastTimeLimitDays(
  pastTimeLimitDays: number,
  cutoffTime: string | undefined | null,
  nowTimeStr: string
): number {
  const cutoff = cutoffTime || '23:59'
  const pastCutoff = nowTimeStr >= cutoff
  return Math.max(0, pastCutoff ? pastTimeLimitDays - 1 : pastTimeLimitDays)
}
