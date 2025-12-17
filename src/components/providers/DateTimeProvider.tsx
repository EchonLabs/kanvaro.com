'use client'

import React, { createContext, useContext, useState, useEffect } from 'react'
import { DateTimePreferences, DEFAULT_DATE_TIME_PREFERENCES, formatDate, formatTime, formatDateTime, getDatePlaceholder, getTimePlaceholder } from '@/lib/dateTimeUtils'

interface DateTimeContextType {
  formatDate: (date: Date | string) => string
  formatTime: (date: Date | string) => string
  formatDateTime: (date: Date | string) => string
  getDatePlaceholder: () => string
  getTimePlaceholder: () => string
  preferences: DateTimePreferences
  setPreferences: (prefs: DateTimePreferences) => void
}

const DateTimeContext = createContext<DateTimeContextType | undefined>(undefined)

export function DateTimeProvider({ children }: { children: React.ReactNode }) {
  const [preferences, setPreferencesState] = useState<DateTimePreferences>(DEFAULT_DATE_TIME_PREFERENCES)
  const [isInitialized, setIsInitialized] = useState(false)

  // Initialize with defaults - preferences will be updated by profile page
  useEffect(() => {
    setIsInitialized(true)
  }, [])

  const setPreferences = (prefs: DateTimePreferences) => {
    setPreferencesState(prefs)
  }

  const value: DateTimeContextType = {
    formatDate: (date: Date | string) => formatDate(date, preferences),
    formatTime: (date: Date | string) => formatTime(date, preferences),
    formatDateTime: (date: Date | string) => formatDateTime(date, preferences),
    getDatePlaceholder: () => getDatePlaceholder(preferences),
    getTimePlaceholder: () => getTimePlaceholder(preferences),
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
    return {
      formatDate: (date: Date | string) => formatDate(date, DEFAULT_DATE_TIME_PREFERENCES),
      formatTime: (date: Date | string) => formatTime(date, DEFAULT_DATE_TIME_PREFERENCES),
      formatDateTime: (date: Date | string) => formatDateTime(date, DEFAULT_DATE_TIME_PREFERENCES),
      getDatePlaceholder: () => getDatePlaceholder(DEFAULT_DATE_TIME_PREFERENCES),
      getTimePlaceholder: () => getTimePlaceholder(DEFAULT_DATE_TIME_PREFERENCES),
      preferences: DEFAULT_DATE_TIME_PREFERENCES,
      setPreferences: () => {
        console.warn('DateTimeProvider not available, cannot set preferences')
      }
    }
  }

  return context
}
