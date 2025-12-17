/**
 * Date and time formatting utilities based on user preferences
 */

export interface DateTimePreferences {
  dateFormat: 'MM/DD/YYYY' | 'DD/MM/YYYY' | 'YYYY-MM-DD'
  timeFormat: '12h' | '24h'
}

/**
 * Default date/time preferences
 */
export const DEFAULT_DATE_TIME_PREFERENCES: DateTimePreferences = {
  dateFormat: 'MM/DD/YYYY',
  timeFormat: '12h'
}

/**
 * Format date based on user's preference
 */
export const formatDate = (date: Date | string, preferences: DateTimePreferences): string => {
  const dateObj = typeof date === 'string' ? new Date(date) : date
  if (!dateObj || isNaN(dateObj.getTime())) return ''

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

/**
 * Format time based on user's preference
 */
export const formatTime = (date: Date | string, preferences: DateTimePreferences): string => {
  const dateObj = typeof date === 'string' ? new Date(date) : date
  if (!dateObj || isNaN(dateObj.getTime())) return ''

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

/**
 * Format date and time together
 */
export const formatDateTime = (date: Date | string, preferences: DateTimePreferences): string => {
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
