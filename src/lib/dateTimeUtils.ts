/**
 * Date and time formatting utilities based on user preferences
 */

export interface DateTimePreferences {
  dateFormat: 'MM/DD/YYYY' | 'DD/MM/YYYY' | 'YYYY-MM-DD'
  timeFormat: '12h' | '24h'
  timezone: string
}

/**
 * Default date/time preferences
 */
export const DEFAULT_DATE_TIME_PREFERENCES: DateTimePreferences = {
  dateFormat: 'MM/DD/YYYY',
  timeFormat: '12h',
  timezone: 'UTC'
}

const normalizeDate = (input: Date | string): Date => {
  if (input instanceof Date) {
    return new Date(input.getTime())
  }
  return new Date(input)
}

/**
 * Format date based on user's preference
 */
export const formatDate = (date: Date | string, preferences: DateTimePreferences): string => {
  const dateObj = normalizeDate(date)
  if (!dateObj || isNaN(dateObj.getTime())) return ''

  try {
    // Use Intl.DateTimeFormat for proper timezone handling
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: preferences.timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    })

    const parts = formatter.formatToParts(dateObj)
    const year = parts.find(p => p.type === 'year')?.value || ''
    const month = parts.find(p => p.type === 'month')?.value || ''
    const day = parts.find(p => p.type === 'day')?.value || ''

    switch (preferences.dateFormat) {
      case 'DD/MM/YYYY':
        return `${day}/${month}/${year}`
      case 'YYYY-MM-DD':
        return `${year}-${month}-${day}`
      case 'MM/DD/YYYY':
      default:
        return `${month}/${day}/${year}`
    }
  } catch (error) {
    // Fallback to local timezone if timezone is invalid
    console.warn('Invalid timezone, falling back to local timezone:', preferences.timezone)
    const year = dateObj.getFullYear()
    const month = String(dateObj.getMonth() + 1).padStart(2, '0')
    const day = String(dateObj.getDate()).padStart(2, '0')

    switch (preferences.dateFormat) {
      case 'DD/MM/YYYY':
        return `${day}/${month}/${year}`
      case 'YYYY-MM-DD':
        return `${year}-${month}-${day}`
      case 'MM/DD/YYYY':
      default:
        return `${month}/${day}/${year}`
    }
  }
}

/**
 * Format time based on user's preference
 */
export const formatTime = (date: Date | string, preferences: DateTimePreferences): string => {
  const dateObj = normalizeDate(date)
  if (!dateObj || isNaN(dateObj.getTime())) return ''

  try {
    // Use Intl.DateTimeFormat for proper timezone handling
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: preferences.timezone,
      hour: 'numeric',
      minute: '2-digit',
      hour12: preferences.timeFormat === '12h'
    })

    return formatter.format(dateObj)
  } catch (error) {
    // Fallback to local timezone if timezone is invalid
    console.warn('Invalid timezone, falling back to local timezone:', preferences.timezone)
    const hours = dateObj.getHours()
    const minutes = String(dateObj.getMinutes()).padStart(2, '0')

    if (preferences.timeFormat === '24h') {
      return `${String(hours).padStart(2, '0')}:${minutes}`
    } else {
      // 12-hour format
      const hour12 = hours % 12 || 12
      const ampm = hours >= 12 ? 'PM' : 'AM'
      return `${hour12}:${minutes} ${ampm}`
    }
  }
}

/**
 * Format date and time together
 */
export const formatDateTimeSafe = (date: Date | string, preferences: DateTimePreferences): string => {
  return `${formatDate(date, preferences)} ${formatTime(date, preferences)}`
}

/**
 * Get placeholder text for time input fields based on format preference
 */
export const getTimePlaceholder = (preferences: DateTimePreferences): string => {
  return preferences.timeFormat === '24h' ? 'HH:MM (24h)' : 'H:MM AM/PM (12h)'
}

/**
 * Get placeholder text for date input fields based on format preference
 */
export const getDatePlaceholder = (preferences: DateTimePreferences): string => {
  switch (preferences.dateFormat) {
    case 'DD/MM/YYYY':
      return 'DD/MM/YYYY'
    case 'YYYY-MM-DD':
      return 'YYYY-MM-DD'
    case 'MM/DD/YYYY':
    default:
      return 'MM/DD/YYYY'
  }
}

// ============================================================================
// TIMEZONE CONVERSION UTILITIES (NO-OP TO PRESERVE LEGACY CALL SITES)
// ============================================================================

/**
 * Previously converted UTC to user timezone. Now simply normalizes to a Date instance
 * without performing any timezone math so we preserve the browser-local timestamps.
 */
export const utcToUserTimezone = (utcDate: Date | string): Date => {
  return normalizeDate(utcDate)
}

/**
 * Previously converted from user timezone back to UTC. Now behaves as a passthrough
 * since all timestamps are already stored in the user's local time.
 */
export const userTimezoneToUtc = (userDate: Date | string): Date => {
  return normalizeDate(userDate)
}

/**
 * Returns the current browser-local time. Timezone argument retained for API compatibility.
 */
export const getCurrentTimeInUserTimezone = (_timezone: string): Date => {
  return new Date()
}

/**
 * Formats a date string using Intl while honoring the requested timezone label
 * but without transforming the underlying timestamp.
 */
export const formatUtcInUserTimezone = (
  utcDate: Date | string,
  timezone: string,
  _formatStr: string = 'yyyy-MM-dd HH:mm:ss'
): string => {
  const date = normalizeDate(utcDate)

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  })

  return formatter.format(date)
}

/**
 * Format time duration in HH:MM:SS format (for timer display)
 * This doesn't need timezone conversion as it's just a duration
 */
export const formatDuration = (minutes: number): string => {
  const hours = Math.floor(minutes / 60)
  const mins = Math.floor(minutes % 60)
  const secs = Math.floor((minutes % 1) * 60)
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}

/**
 * Calculate duration between two UTC timestamps in user's timezone context
 * This is useful for displaying elapsed time that considers the user's timezone
 */
export const calculateDurationInUserTimezone = (
  startUtc: Date | string,
  endUtc: Date | string,
  _timezone: string
): number => {
  const start = normalizeDate(startUtc)
  const end = normalizeDate(endUtc)
  return (end.getTime() - start.getTime()) / (1000 * 60) // minutes
}

/**
 * Get the current UTC time (useful for API calls)
 */
export const getCurrentUtcTime = (): Date => {
  return new Date()
}

/**
 * Check if a timezone is valid
 */
export const isValidTimezone = (timezone: string): boolean => {
  try {
    Intl.DateTimeFormat('en-US', { timeZone: timezone }).format()
    return true
  } catch {
    return false
  }
}
