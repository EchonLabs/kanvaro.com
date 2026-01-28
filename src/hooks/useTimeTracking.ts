'use client'

import { useState, useEffect, useCallback } from 'react'

interface TimeTrackingSettings {
  allowTimeTracking: boolean
  allowManualTimeSubmission: boolean
  requireApproval: boolean
  allowBillableTime: boolean
  defaultHourlyRate?: number
  maxDailyHours: number
  maxWeeklyHours: number
  maxSessionHours: number
  allowOvertime: boolean
 // requireDescription: boolean
  requireCategory: boolean
  allowFutureTime: boolean
  allowPastTime: boolean
  pastTimeLimitDays: number
  timeLogEditMode?: 'days' | 'dayOfMonth'
  timeLogEditDays?: number
  timeLogEditDayOfMonth?: number
  roundingRules: {
    enabled: boolean
    increment: number
    roundUp: boolean
  }
  notifications: {
    onTimerStart: boolean
    onTimerStop: boolean
    onOvertime: boolean
    onApprovalNeeded: boolean
    onTimeSubmitted: boolean
  }
}

interface ActiveTimer {
  _id: string
  project: { _id: string; name: string }
  task?: { _id: string; title: string }
  description: string
  startTime: string
  currentDuration: number
  isPaused: boolean
  isBillable: boolean
  hourlyRate?: number
  maxSessionHours: number
}

interface TimeEntry {
  _id: string
  description: string
  startTime: string
  endTime?: string
  duration: number
  isBillable: boolean
  hourlyRate?: number
  status: string
  category?: string
  tags: string[]
  notes?: string
  isApproved: boolean
  isReject: boolean
  project: { _id: string; name: string }
  task?: { _id: string; title: string }
}

export function useTimeTracking(userId: string, organizationId: string) {
  const [activeTimer, setActiveTimer] = useState<ActiveTimer | null>(null)
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([])
  const [settings, setSettings] = useState<TimeTrackingSettings | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  // Load active timer
  const loadActiveTimer = useCallback(async () => {
    try {
      const response = await fetch(`/api/time-tracking/timer?userId=${userId}&organizationId=${organizationId}`)
      const data = await response.json()
      
      if (response.ok) {
        setActiveTimer(data.activeTimer)
      }
    } catch (error) {
      console.error('Error loading active timer:', error)
    }
  }, [userId, organizationId])

  // Load time entries
  const loadTimeEntries = useCallback(async (filters: any = {}) => {
    setIsLoading(true)
    setError('')

    try {
      const params = new URLSearchParams({
        userId,
        organizationId,
        ...filters
      })

      const response = await fetch(`/api/time-tracking/entries?${params}`)
      const data = await response.json()

      if (response.ok) {
        setTimeEntries(data.timeEntries)
      } else {
        setError(data.error || 'Failed to load time entries')
      }
    } catch (error) {
      setError('Failed to load time entries')
    } finally {
      setIsLoading(false)
    }
  }, [userId, organizationId])

  // Load time tracking settings
  const loadSettings = useCallback(async () => {
    try {
      const response = await fetch(`/api/organization/settings`)
      const data = await response.json()
      
      if (response.ok) {
        setSettings(data.settings.timeTracking)
      }
    } catch (error) {
      console.error('Error loading time tracking settings:', error)
    }
  }, [])

  // Start timer
  const startTimer = useCallback(async (timerData: {
    projectId: string
    taskId?: string
    description: string
    category?: string
    tags?: string[]
    isBillable?: boolean
    hourlyRate?: number
  }) => {
    setIsLoading(true)
    setError('')

    try {
      const response = await fetch('/api/time-tracking/timer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          organizationId,
          ...timerData
        })
      })

      const data = await response.json()

      if (response.ok) {
        setActiveTimer(data.activeTimer)
        return data.activeTimer
      } else {
        setError(data.error || 'Failed to start timer')
        return null
      }
    } catch (error) {
      setError('Failed to start timer')
      return null
    } finally {
      setIsLoading(false)
    }
  }, [userId, organizationId])

  // Pause timer
  const pauseTimer = useCallback(async () => {
    setIsLoading(true)
    setError('')

    try {
      const response = await fetch('/api/time-tracking/timer', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          organizationId,
          action: 'pause'
        })
      })

      const data = await response.json()

      if (response.ok) {
        setActiveTimer(data.activeTimer)
        return data.activeTimer
      } else {
        setError(data.error || 'Failed to pause timer')
        return null
      }
    } catch (error) {
      setError('Failed to pause timer')
      return null
    } finally {
      setIsLoading(false)
    }
  }, [userId, organizationId])

  // Resume timer
  const resumeTimer = useCallback(async () => {
    setIsLoading(true)
    setError('')

    try {
      const response = await fetch('/api/time-tracking/timer', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          organizationId,
          action: 'resume'
        })
      })

      const data = await response.json()

      if (response.ok) {
        setActiveTimer(data.activeTimer)
        return data.activeTimer
      } else {
        setError(data.error || 'Failed to resume timer')
        return null
      }
    } catch (error) {
      setError('Failed to resume timer')
      return null
    } finally {
      setIsLoading(false)
    }
  }, [userId, organizationId])

  // Stop timer
  const stopTimer = useCallback(async (timerData?: {
    description?: string
    category?: string
    tags?: string[]
  }) => {
    setIsLoading(true)
    setError('')

    try {
      const response = await fetch('/api/time-tracking/timer', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          organizationId,
          action: 'stop',
          ...timerData
        })
      })

      const data = await response.json()

      if (response.ok) {
        setActiveTimer(null)
        // Refresh time entries
        loadTimeEntries()
        return data.timeEntry
      } else {
        setError(data.error || 'Failed to stop timer')
        return null
      }
    } catch (error) {
      setError('Failed to stop timer')
      return null
    } finally {
      setIsLoading(false)
    }
  }, [userId, organizationId, loadTimeEntries])

  // Update timer
  const updateTimer = useCallback(async (timerData: {
    description?: string
    category?: string
    tags?: string[]
  }) => {
    setIsLoading(true)
    setError('')

    try {
      const response = await fetch('/api/time-tracking/timer', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          organizationId,
          action: 'update',
          ...timerData
        })
      })

      const data = await response.json()

      if (response.ok) {
        setActiveTimer(data.activeTimer)
        return data.activeTimer
      } else {
        setError(data.error || 'Failed to update timer')
        return null
      }
    } catch (error) {
      setError('Failed to update timer')
      return null
    } finally {
      setIsLoading(false)
    }
  }, [userId, organizationId])

  // Create manual time entry
  const createTimeEntry = useCallback(async (entryData: {
    projectId: string
    taskId?: string
    description: string
    startTime: string
    endTime?: string
    duration?: number
    isBillable?: boolean
    hourlyRate?: number
    category?: string
    tags?: string[]
    notes?: string
  }) => {
    setIsLoading(true)
    setError('')

    try {
      const response = await fetch('/api/time-tracking/entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          organizationId,
          ...entryData
        })
      })

      const data = await response.json()

      if (response.ok) {
        // Refresh time entries
        loadTimeEntries()
        return data.timeEntry
      } else {
        setError(data.error || 'Failed to create time entry')
        return null
      }
    } catch (error) {
      setError('Failed to create time entry')
      return null
    } finally {
      setIsLoading(false)
    }
  }, [userId, organizationId, loadTimeEntries])

  // Delete time entry
  const deleteTimeEntry = useCallback(async (entryId: string) => {
    setIsLoading(true)
    setError('')

    try {
      const response = await fetch(`/api/time-tracking/entries/${entryId}`, {
        method: 'DELETE'
      })

      if (response.ok) {
        // Refresh time entries
        loadTimeEntries()
        return true
      } else {
        const data = await response.json()
        setError(data.error || 'Failed to delete time entry')
        return false
      }
    } catch (error) {
      setError('Failed to delete time entry')
      return false
    } finally {
      setIsLoading(false)
    }
  }, [loadTimeEntries])

  // Approve/reject time entries
  const approveTimeEntries = useCallback(async (entryIds: string[], action: 'approve' | 'reject') => {
    setIsLoading(true)
    setError('')

    try {
      const response = await fetch('/api/time-tracking/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          timeEntryIds: entryIds,
          approvedBy: userId,
          action
        })
      })

      if (response.ok) {
        // Refresh time entries
        loadTimeEntries()
        return true
      } else {
        const data = await response.json()
        setError(data.error || `Failed to ${action} time entries`)
        return false
      }
    } catch (error) {
      setError(`Failed to ${action} time entries`)
      return false
    } finally {
      setIsLoading(false)
    }
  }, [userId, loadTimeEntries])

  // Load data on mount
  useEffect(() => {
    loadActiveTimer()
    loadSettings()
  }, [loadActiveTimer, loadSettings])

  return {
    activeTimer,
    timeEntries,
    settings,
    isLoading,
    error,
    loadActiveTimer,
    loadTimeEntries,
    loadSettings,
    startTimer,
    pauseTimer,
    resumeTimer,
    stopTimer,
    updateTimer,
    createTimeEntry,
    deleteTimeEntry,
    approveTimeEntries
  }
}
