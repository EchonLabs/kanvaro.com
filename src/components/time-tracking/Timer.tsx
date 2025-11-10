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

export function Timer({ userId, organizationId, projectId, taskId, description = '', onTimerUpdate }: TimerProps) {
  const [activeTimer, setActiveTimer] = useState<ActiveTimer | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [displayTime, setDisplayTime] = useState('00:00:00')
  // Local ticking baseline when running
  const baseMinutesRef = useRef<number>(0)
  const tickStartMsRef = useRef<number | null>(null)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  // Debug logging

  // Log whenever activeTimer changes to capture its ID and state
  useEffect(() => {
    if (activeTimer) {
      console.log('Timer/state: activeTimer set', {
        _id: (activeTimer as any)._id,
        isPaused: activeTimer.isPaused,
        projectId: activeTimer.project?._id,
        taskId: activeTimer.task?._id,
      })
    } else {
      console.log('Timer/state: activeTimer cleared (null)')
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

  // Format time display
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
      if (runningMinutes >= activeTimer.maxSessionHours * 60) {
        console.log('Timer/auto-stop: reached max session, stopping', {
          runningMinutes,
          maxSessionMinutes: activeTimer.maxSessionHours * 60
        })
        handleStopTimer()
      }
    }, 1000)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [activeTimer])

  const loadActiveTimer = useCallback(async () => {
    if (!userId || !organizationId) {
      return
    }

    try {
      const url = `/api/time-tracking/timer?userId=${userId}&organizationId=${organizationId}`
      console.log('Timer/loadActiveTimer: GET', url)
      const response = await fetch(url)
      console.log('Timer/loadActiveTimer: status', response.status)
      const data = await response.json()
      console.log('Timer/loadActiveTimer: data', data)
      
      if (response.ok) {
        console.log('Timer/loadActiveTimer: activeTimer id', data?.activeTimer?._id)
        setActiveTimer(data.activeTimer)
      } else {
        console.error('Timer/loadActiveTimer: failed', data?.error)
      }
    } catch (error) {
      console.error('Timer/loadActiveTimer: exception', error)
    }
  }, [userId, organizationId])

  // Load active timer on mount
  useEffect(() => {
    if (userId && organizationId) {
      loadActiveTimer()
    }
  }, [userId, organizationId, loadActiveTimer])

  const handleStartTimer = async () => {
    if (!description.trim()) {
      setError('Description is required')
      return
    }

    if (!userId) {
      setError('User ID is missing - please refresh the page')
      return
    }

    setIsLoading(true)
    setError('')

    try {
      const payload = { userId, organizationId, projectId, taskId, description }
      console.log('Timer/start: request payload', payload)

      const response = await fetch('/api/time-tracking/timer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      console.log('Timer/start: response status', response.status)
      const data = await response.json()
      console.log('Timer/start: response data', data)

      if (response.ok) {
        console.log('Timer/start: success, activeTimer', data?.activeTimer)
        console.log('Timer/start: activeTimer id', data?.activeTimer?._id)
        setActiveTimer(data.activeTimer)
        onTimerUpdate?.(data.activeTimer)
      } else {
        console.error('Timer/start: failed', data?.error)
        setError(data.error || 'Failed to start timer')
      }
    } catch (error) {
      console.error('Timer/start: exception', error)
      setError('Failed to start timer')
    } finally {
      console.log('Timer/start: finished')
      setIsLoading(false)
    }
  }

  const handlePauseTimer = async () => {
    setIsLoading(true)
    setError('')

    try {
      const payload = { userId, organizationId, action: 'pause' }
      console.log('Timer/pause: request payload', payload)
      const response = await fetch('/api/time-tracking/timer', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      console.log('Timer/pause: response status', response.status)
      const data = await response.json()
      console.log('Timer/pause: response data', data)

      if (response.ok) {
        console.log('Timer/pause: activeTimer id', data?.activeTimer?._id)
        setActiveTimer(data.activeTimer)
        onTimerUpdate?.(data.activeTimer)
      } else {
        console.error('Timer/pause: failed', data?.error)
        setError(data.error || 'Failed to pause timer')
      }
    } catch (error) {
      console.error('Timer/pause: exception', error)
      setError('Failed to pause timer')
    } finally {
      console.log('Timer/pause: finished')
      setIsLoading(false)
    }
  }

  const handleResumeTimer = async () => {
    setIsLoading(true)
    setError('')

    try {
      const payload = { userId, organizationId, action: 'resume' }
      console.log('Timer/resume: request payload', payload)
      const response = await fetch('/api/time-tracking/timer', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      console.log('Timer/resume: response status', response.status)
      const data = await response.json()
      console.log('Timer/resume: response data', data)

      if (response.ok) {
        setActiveTimer(data.activeTimer)
        onTimerUpdate?.(data.activeTimer)
      } else {
        console.error('Timer/resume: failed', data?.error)
        setError(data.error || 'Failed to resume timer')
      }
    } catch (error) {
      console.error('Timer/resume: exception', error)
      setError('Failed to resume timer')
    } finally {
      console.log('Timer/resume: finished')
      setIsLoading(false)
    }
  }

  const handleStopTimer = async () => {
    setIsLoading(true)
    setError('')

    try {
      const payload = { userId, organizationId, action: 'stop', description }
      console.log('Timer/stop: request payload', payload)
      const response = await fetch('/api/time-tracking/timer', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      console.log('Timer/stop: response status', response.status)
      const data = await response.json()
      console.log('Timer/stop: response data', data)

      if (response.ok) {
        console.log('Timer/stop: clearing activeTimer (previous id)', (activeTimer as any)?._id)
        setActiveTimer(null)
        setDisplayTime('00:00:00')
        onTimerUpdate?.(null)
      } else {
        console.error('Timer/stop: failed', data?.error)
        setError(data.error || 'Failed to stop timer')
      }
    } catch (error) {
      console.error('Timer/stop: exception', error)
      setError('Failed to stop timer')
    } finally {
      console.log('Timer/stop: finished')
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

      <Button onClick={handleStartTimer} disabled={isLoading || !description.trim()} className="w-full">
        <Play className="h-4 w-4 mr-2" />
        Start Timer
      </Button>
    </div>
  )
}
