/**
 * NFR-20. "Dates and times must render in the viewing user's locale and
 * timezone, always with the project timezone shown alongside on the
 * stand-up screen." When the two timezones coincide, showing the same clock
 * time twice would be noise, not information, so the second time is omitted.
 */
import { formatInTimeZone } from 'date-fns-tz'

export function formatDualTimezone(input: {
  instant: Date
  viewerTimeZone: string
  projectTimeZone: string
  locale?: string
}): string {
  const viewerTime = formatInTimeZone(input.instant, input.viewerTimeZone, 'HH:mm')

  if (input.viewerTimeZone === input.projectTimeZone) {
    return viewerTime
  }

  const projectTime = formatInTimeZone(input.instant, input.projectTimeZone, 'HH:mm')
  return `${viewerTime} (project time: ${projectTime})`
}
