/**
 * The timezones offered anywhere in the app: organisation settings, the setup
 * wizard, and each project's working calendar. One list so the three can never
 * drift apart again — a project could previously hold a zone the organisation
 * form could not even display.
 */
export const APP_TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Asia/Kolkata',
  'Australia/Sydney'
] as const

/**
 * The shared list, plus `current` when it is not already there. A saved value
 * outside the list (legacy data) must still render as the selected option
 * rather than leaving the select blank.
 */
export function timezoneOptions(current?: string | null): string[] {
  const list: string[] = [...APP_TIMEZONES]
  if (current && !list.includes(current)) list.push(current)
  return list
}
