'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Play, Pause, Square, Clock } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/Badge'
import { Alert, AlertDescription } from '@/components/ui/alert'

interface TimerProps {
  userId: string
  organizationId: string
  projectId?: string
  taskId?: string
  description?: string
  isBillable?: boolean
  requireDescription?: boolean
  allowOvertime?: boolean
  onTimerUpdate?: (timer: any) => void
}

interface ActiveTimer {
  _id: string
  project: { _id: string; name: string }
  task?: { _id: string; title: string }
  description: string
  startTime: string
  currentDuration: number
  isPaused: boolean
  category?: string
  tags: string[]
  isBillable: boolean
  hourlyRate?: number
  maxSessionHours: number
}

export function Timer({
  userId,
  organizationId,
  projectId,
  taskId,
  description = '',
  isBillable,
  requireDescription = true,
  allowOvertime = true,
  onTimerUpdate
}: TimerProps) {
  const [activeTimer, setActiveTimer] = useState<ActiveTimer | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [displayTime, setDisplayTime] = useState('00:00:00')
  // Local ticking baseline when running
  const baseMinutesRef = useRef<number>(0)
  const tickStartMsRef = useRef<number | null>(null)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  // Track active timer state
  useEffect(() => {
    if (activeTimer) {
      console.log('Timer: Active timer loaded', activeTimer._id)
    } else {
      console.log('Timer: No active timer')
    }
  }, [activeTimer])

  // Early return if required props are missing
  if (!userId || !organizationId) {
    return (
      <div className="text-center py-4">
        <p className="text-muted-foreground">Loading user data...</p>
      </div>
    )
  }

  // Format time display - NO rounding for real-time timer display
  // Rounding is only applied when saving the time entry
  const formatTime = (minutes: number) => {
    const hours = Math.floor(minutes / 60)
    const mins = Math.floor(minutes % 60)
    const secs = Math.floor((minutes % 1) * 60)
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  // Update display time based on server currentDuration; tick only when not paused
  useEffect(() => {
    // Clear any previous interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }

    if (!activeTimer) {
      setDisplayTime('00:00:00')
      baseMinutesRef.current = 0
      tickStartMsRef.current = null
      return
    }

    // Initialize baseline from server
    baseMinutesRef.current = activeTimer.currentDuration || 0
    setDisplayTime(formatTime(baseMinutesRef.current))

    if (activeTimer.isPaused) {
      // Do not tick while paused
      tickStartMsRef.current = null
      return
    }

    // Start ticking while running
    tickStartMsRef.current = Date.now()
    intervalRef.current = setInterval(() => {
      const elapsed = (Date.now() - (tickStartMsRef.current as number)) / 60000
      const runningMinutes = Math.max(0, baseMinutesRef.current + elapsed)
      setDisplayTime(formatTime(runningMinutes))

      // Auto-stop when reaching max session
      if (!allowOvertime && runningMinutes >= activeTimer.maxSessionHours * 60) {
        console.log('Timer: Auto-stopping - reached max session hours')
        handleStopTimer()
      }
    }, 1000)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [activeTimer, allowOvertime])

  const loadActiveTimer = useCallback(async () => {
    if (!userId || !organizationId) {
      return
    }

    try {
      const response = await fetch(`/api/time-tracking/timer?userId=${userId}&organizationId=${organizationId}`)
      const data = await response.json()

      if (response.ok) {
        setActiveTimer(data.activeTimer)
      } else {
        console.error('Failed to load active timer:', data?.error)
      }
    } catch (error) {
      console.error('Error loading active timer:', error)
    }
  }, [userId, organizationId])

  // Load active timer on mount
  useEffect(() => {
    if (userId && organizationId) {
      loadActiveTimer()
    }
  }, [userId, organizationId, loadActiveTimer])

  const handleStartTimer = async () => {
    if (!userId) {
      setError('User ID is missing - please refresh the page')
      return
    }

    setIsLoading(true)
    setError('')

    try {
      const response = await fetch('/api/time-tracking/timer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, organizationId, projectId, taskId, description, isBillable })
      })

      const data = await response.json()

      if (response.ok) {
        setActiveTimer(data.activeTimer)
        onTimerUpdate?.(data.activeTimer)
      } else {
        console.error('Failed to start timer:', data?.error)
        setError(data.error || 'Failed to start timer')
      }
    } catch (error) {
      console.error('Error starting timer:', error)
      setError('Failed to start timer')
    } finally {
      setIsLoading(false)
    }
  }

  const handlePauseTimer = async () => {
    setIsLoading(true)
    setError('')

    try {
      const response = await fetch('/api/time-tracking/timer', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, organizationId, action: 'pause' })
      })

      const data = await response.json()

      if (response.ok) {
        setActiveTimer(data.activeTimer)
        onTimerUpdate?.(data.activeTimer)
      } else {
        console.error('Failed to pause timer:', data?.error)
        setError(data.error || 'Failed to pause timer')
      }
    } catch (error) {
      console.error('Error pausing timer:', error)
      setError('Failed to pause timer')
    } finally {
      setIsLoading(false)
    }
  }

  const handleResumeTimer = async () => {
    setIsLoading(true)
    setError('')

    try {
      const response = await fetch('/api/time-tracking/timer', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, organizationId, action: 'resume' })
      })

      const data = await response.json()

      if (response.ok) {
        setActiveTimer(data.activeTimer)
        onTimerUpdate?.(data.activeTimer)
      } else {
        console.error('Failed to resume timer:', data?.error)
        setError(data.error || 'Failed to resume timer')
      }
    } catch (error) {
      console.error('Error resuming timer:', error)
      setError('Failed to resume timer')
    } finally {
      setIsLoading(false)
    }
  }

  const handleStopTimer = async () => {
    setIsLoading(true)
    setError('')

    try {
      const response = await fetch('/api/time-tracking/timer', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, organizationId, action: 'stop', description })
      })

      const data = await response.json()

      if (response.ok) {
        const hasTimeLogged = data.hasTimeLogged && data.duration > 0
        setActiveTimer(null)
        setDisplayTime('00:00:00')
        // Pass timeEntry info through callback so parent can decide whether to show notifications
        if (hasTimeLogged && data.timeEntry) {
          onTimerUpdate?.({ timeEntry: data.timeEntry, hasTimeLogged: true, duration: data.duration })
        } else {
          onTimerUpdate?.(null)
        }
      } else {
        console.error('Failed to stop timer:', data?.error)
        setError(data.error || 'Failed to stop timer')
      }
    } catch (error) {
      console.error('Error stopping timer:', error)
      setError('Failed to stop timer')
    } finally {
      setIsLoading(false)
    }
  }

  const handleUpdateTimer = async () => {
    if (!activeTimer) return

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
          description
        })
      })

      const data = await response.json()

      if (response.ok) {
        setActiveTimer(data.activeTimer)
        onTimerUpdate?.(data.activeTimer)
      } else {
        setError(data.error || 'Failed to update timer')
      }
    } catch (error) {
      setError('Failed to update timer')
    } finally {
      setIsLoading(false)
    }
  }

  if (activeTimer) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Active Timer
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="text-center">
            <div className="text-4xl font-mono font-bold text-primary">
              {displayTime}
            </div>
          </div>

          <div className="space-y-2">
            <div>
              <Label className="text-sm font-medium">Project</Label>
              <p className="text-sm text-muted-foreground">{activeTimer.project.name}</p>
            </div>
            {activeTimer.task && (
              <div>
                <Label className="text-sm font-medium">Task</Label>
                <p className="text-sm text-muted-foreground">{activeTimer.task.title}</p>
              </div>
            )}
            <div>
              <Label className="text-sm font-medium">Description</Label>
              <p className="text-sm text-muted-foreground">{activeTimer.description}</p>
            </div>
          </div>

          <div className="flex gap-2">
            {activeTimer.isPaused ? (
              <Button onClick={handleResumeTimer} disabled={isLoading} className="flex-1">
                <Play className="h-4 w-4 mr-2" />
                Resume
              </Button>
            ) : (
              <Button onClick={handlePauseTimer} disabled={isLoading} className="flex-1">
                <Pause className="h-4 w-4 mr-2" />
                Pause
              </Button>
            )}
            <Button onClick={handleStopTimer} disabled={isLoading} variant="destructive">
              <Square className="h-4 w-4 mr-2" />
              Stop
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Button
        onClick={handleStartTimer}
        disabled={
          isLoading || 
          !projectId || 
          !taskId || 
          (requireDescription && !description.trim())
        }
        className="w-full"
      >
        <Play className="h-4 w-4 mr-2" />
        Start Timer
      </Button>
    </div>
  )
}
