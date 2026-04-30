'use client'

import React, { createContext, useContext, useState, useEffect } from 'react'
import { useAuthContext } from '@/contexts/AuthContext'
import {
  DateTimePreferences,
  DEFAULT_DATE_TIME_PREFERENCES,
  formatDate,
  formatTime,
  formatDateTimeSafe,
  getDatePlaceholder,
  getTimePlaceholder,
  formatDuration
} from '@/lib/dateTimeUtils'
import { detectClientTimezone } from '@/lib/timezone'

interface DateTimeContextType {
  formatDate: (date: Date | string) => string
  formatTime: (date: Date | string) => string
  formatDateTimeSafe: (date: Date | string) => string
  getDatePlaceholder: () => string
  getTimePlaceholder: () => string
  formatDuration: (minutes: number) => string
  preferences: DateTimePreferences
  setPreferences: (prefs: DateTimePreferences) => void
}

const DateTimeContext = createContext<DateTimeContextType | undefined>(undefined)

export function DateTimeProvider({ children }: { children: React.ReactNode }) {
  const [preferences, setPreferencesState] = useState<DateTimePreferences>(DEFAULT_DATE_TIME_PREFERENCES)
  const [isInitialized, setIsInitialized] = useState(false)

  let authUser: any = null
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const ctx = useAuthContext()
    authUser = ctx.user
  } catch {
    // AuthProvider may not be available yet
  }

  // Load user preferences from auth context
  useEffect(() => {
    if (authUser) {
      const detectedTimezone = detectClientTimezone()
      const userPreferences = {
        dateFormat: authUser.preferences?.dateFormat || DEFAULT_DATE_TIME_PREFERENCES.dateFormat,
        timeFormat: authUser.preferences?.timeFormat || DEFAULT_DATE_TIME_PREFERENCES.timeFormat,
        timezone: detectedTimezone
      }
      setPreferencesState(userPreferences)
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('user_date_preferences', JSON.stringify(userPreferences))
      }
      setIsInitialized(true)
    } else {
      // Check sessionStorage for immediate loading
      if (typeof window !== 'undefined') {
        const stored = sessionStorage.getItem('user_date_preferences')
        if (stored) {
          try {
            const parsed = JSON.parse(stored)
            setPreferencesState(parsed)
          } catch (e) {
            console.warn('Failed to parse stored preferences:', e)
          }
        }
      }
      setIsInitialized(true)
    }
  }, [authUser])

  const setPreferences = (prefs: DateTimePreferences) => {
    setPreferencesState(prefs)
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('user_date_preferences', JSON.stringify(prefs))
    }
  }

  const value: DateTimeContextType = {
    formatDate: (date: Date | string) => formatDate(date, preferences),
    formatTime: (date: Date | string) => formatTime(date, preferences),
    formatDateTimeSafe: (date: Date | string) => formatDateTimeSafe(date, preferences),
    getDatePlaceholder: () => getDatePlaceholder(preferences),
    getTimePlaceholder: () => getTimePlaceholder(preferences),
    formatDuration,
    preferences,
    setPreferences
  }

  return (
    <DateTimeContext.Provider value={value}>
      {children}
    </DateTimeContext.Provider>
  )
}

export function useDateTime() {
  const context = useContext(DateTimeContext)

  // Provide fallback with default preferences if context is not available
  if (context === undefined) {
    // Try to detect browser timezone for fallback
    let fallbackTimezone = DEFAULT_DATE_TIME_PREFERENCES.timezone
    if (typeof window !== 'undefined') {
      try {
        fallbackTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone
      } catch (error) {
        // Keep default timezone
      }
    }

    const fallbackPreferences = {
      ...DEFAULT_DATE_TIME_PREFERENCES,
      timezone: fallbackTimezone
    }

    return {
      formatDate: (date: Date | string) => formatDate(date, fallbackPreferences),
      formatTime: (date: Date | string) => formatTime(date, fallbackPreferences),
      formatDateTimeSafe: (date: Date | string) => formatDateTimeSafe(date, fallbackPreferences),
      getDatePlaceholder: () => getDatePlaceholder(fallbackPreferences),
      getTimePlaceholder: () => getTimePlaceholder(fallbackPreferences),
      formatDuration,
      preferences: fallbackPreferences,
      setPreferences: () => {
        console.warn('DateTimeProvider not available, cannot set preferences')
      }
    }
  }

  return context
}
