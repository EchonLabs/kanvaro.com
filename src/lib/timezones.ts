/**
 * The timezones offered anywhere in the app: organisation settings, the setup
 * wizard, and each project's working calendar. `APP_TIMEZONES` is the curated
 * core; `timezoneOptions` expands it to the full IANA list where available. One list so the three can never
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
 * Every zone the runtime knows (the full IANA set), or the curated list plus a
 * few common extras where `Intl.supportedValuesOf` is unavailable. `UTC` is
 * always present — `supportedValuesOf` omits it.
 */
const FALLBACK_TIMEZONES = [
  ...APP_TIMEZONES,
  'Asia/Colombo',
  'Asia/Dubai',
  'Asia/Singapore'
]

let cachedTimezones: string[] | null = null

export function listTimezones(): string[] {
  if (cachedTimezones) return cachedTimezones
  let zones: string[] = []
  const supported = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] })
    .supportedValuesOf
  if (typeof supported === 'function') {
    try {
      zones = supported('timeZone')
    } catch {
      zones = []
    }
  }
  if (zones.length === 0) zones = [...FALLBACK_TIMEZONES]
  if (!zones.includes('UTC')) zones = ['UTC', ...zones]
  cachedTimezones = zones
  return zones
}

/**
 * The shared list, plus `current` when it is not already there. A saved value
 * outside the list (legacy data) must still render as the selected option
 * rather than leaving the select blank.
 */
export function timezoneOptions(current?: string | null): string[] {
  const list: string[] = [...listTimezones()]
  if (current && !list.includes(current)) list.push(current)
  return list
}
