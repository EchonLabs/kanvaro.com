/**
 * NFR-20. "Dates and times must render in the viewing user's locale and
 * timezone, always with the project timezone shown alongside on the
 * stand-up screen." When the two timezones coincide, showing the same clock
 * time twice would be noise, not information, so the second time is omitted.
 */
import { formatInTimeZone } from 'date-fns-tz'

/**
 * No `locale` parameter, deliberately. It was accepted and never used, and no
 * call site passed one. Wiring it honestly is not a one-liner:
 * `formatInTimeZone`'s options take a date-fns `Locale` *object*, not the BCP-47
 * string tag the rest of this module passes around (`formatMinutesAsHours`'s
 * `{ locale }`), so it would need a tag→Locale registry and a locale-aware time
 * pattern in place of the fixed `'HH:mm'`. NFR-21's 12-hour/24-hour question is
 * a real one, but it belongs with that registry — an ignored parameter only
 * makes the gap look closed.
 */
export function formatDualTimezone(input: {
  instant: Date
  viewerTimeZone: string
  projectTimeZone: string
}): string {
  const viewerTime = formatInTimeZone(input.instant, input.viewerTimeZone, 'HH:mm')

  if (input.viewerTimeZone === input.projectTimeZone) {
    return viewerTime
  }

  const projectTime = formatInTimeZone(input.instant, input.projectTimeZone, 'HH:mm')
  return `${viewerTime} (project time: ${projectTime})`
}
