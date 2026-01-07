'use client'

import React, { createContext, useContext, useState, useEffect } from 'react'
import {
  DateTimePreferences,
  DEFAULT_DATE_TIME_PREFERENCES,
  formatDate,
  formatTime,
  formatDateTimeSafe,
  getDatePlaceholder,
  getTimePlaceholder,
  utcToUserTimezone,
  userTimezoneToUtc,
  getCurrentTimeInUserTimezone,
  formatUtcInUserTimezone,
  formatDuration,
  calculateDurationInUserTimezone,
  getCurrentUtcTime,
  isValidTimezone
} from '@/lib/dateTimeUtils'
import { detectClientTimezone } from '@/lib/timezone'

interface DateTimeContextType {
  formatDate: (date: Date | string) => string
  formatTime: (date: Date | string) => string
  formatDateTimeSafe: (date: Date | string) => string
  getDatePlaceholder: () => string
  getTimePlaceholder: () => string
  preferences: DateTimePreferences
  setPreferences: (prefs: DateTimePreferences) => void
  // Timezone utilities
  utcToUserTimezone: (utcDate: Date | string) => Date
  userTimezoneToUtc: (userDate: Date | string) => Date
  getCurrentTimeInUserTimezone: () => Date
  formatUtcInUserTimezone: (utcDate: Date | string, formatStr?: string) => string
  formatDuration: (minutes: number) => string
  calculateDurationInUserTimezone: (startUtc: Date | string, endUtc: Date | string) => number
  getCurrentUtcTime: () => Date
  isValidTimezone: (timezone: string) => boolean
}

const DateTimeContext = createContext<DateTimeContextType | undefined>(undefined)

export function DateTimeProvider({ children }: { children: React.ReactNode }) {
  const [preferences, setPreferencesState] = useState<DateTimePreferences>(DEFAULT_DATE_TIME_PREFERENCES)
  const [isInitialized, setIsInitialized] = useState(false)

  // Load user preferences on initialization
  useEffect(() => {
    const loadUserPreferences = async () => {
      try {
        const response = await fetch('/api/auth/me')
        if (response.ok) {
          const userData = await response.json()
          const detectedTimezone = detectClientTimezone()
          const userPreferences = {
            dateFormat: userData.preferences?.dateFormat || DEFAULT_DATE_TIME_PREFERENCES.dateFormat,
            timeFormat: userData.preferences?.timeFormat || DEFAULT_DATE_TIME_PREFERENCES.timeFormat,
            timezone: detectedTimezone
          }
          setPreferencesState(userPreferences)
          if (typeof window !== 'undefined') {
            sessionStorage.setItem('user_date_preferences', JSON.stringify(userPreferences))
          }
        }
      } catch (error) {
        console.warn('Failed to load user date/time preferences:', error)
        // Clear sessionStorage on API failure to avoid stale data
        if (typeof window !== 'undefined') {
          sessionStorage.removeItem('user_date_preferences')
        }
      } finally {
        setIsInitialized(true)
      }
    }

    // Check sessionStorage first for immediate loading
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

    loadUserPreferences()
  }, [])

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
    preferences,
    setPreferences,
    // Timezone utilities
    utcToUserTimezone: (utcDate: Date | string) => utcToUserTimezone(utcDate, preferences.timezone),
    userTimezoneToUtc: (userDate: Date | string) => userTimezoneToUtc(userDate, preferences.timezone),
    getCurrentTimeInUserTimezone: () => getCurrentTimeInUserTimezone(preferences.timezone),
    formatUtcInUserTimezone: (utcDate: Date | string, formatStr?: string) => formatUtcInUserTimezone(utcDate, preferences.timezone, formatStr),
    formatDuration,
    calculateDurationInUserTimezone: (startUtc: Date | string, endUtc: Date | string) => calculateDurationInUserTimezone(startUtc, endUtc, preferences.timezone),
    getCurrentUtcTime,
    isValidTimezone
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
      preferences: fallbackPreferences,
      setPreferences: () => {
        console.warn('DateTimeProvider not available, cannot set preferences')
      },
      // Timezone utilities fallback
      utcToUserTimezone: (utcDate: Date | string) => utcToUserTimezone(utcDate, fallbackPreferences.timezone),
      userTimezoneToUtc: (userDate: Date | string) => userTimezoneToUtc(userDate, fallbackPreferences.timezone),
      getCurrentTimeInUserTimezone: () => getCurrentTimeInUserTimezone(fallbackPreferences.timezone),
      formatUtcInUserTimezone: (utcDate: Date | string, formatStr?: string) => formatUtcInUserTimezone(utcDate, fallbackPreferences.timezone, formatStr),
      formatDuration,
      calculateDurationInUserTimezone: (startUtc: Date | string, endUtc: Date | string) => calculateDurationInUserTimezone(startUtc, endUtc, fallbackPreferences.timezone),
      getCurrentUtcTime,
      isValidTimezone
    }
  }

  return context
}
