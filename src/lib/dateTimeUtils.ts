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

/**
 * Format date based on user's preference
 */
export const formatDate = (date: Date | string, preferences: DateTimePreferences): string => {
  const dateObj = typeof date === 'string' ? new Date(date) : date
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
  const dateObj = typeof date === 'string' ? new Date(date) : date
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
