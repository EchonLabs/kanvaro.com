'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Play, Pause, Square, Clock, FolderOpen, Target, FileText, Loader2, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/Badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ConfirmationModal } from '@/components/ui/ConfirmationModal'
import { useToast } from '@/components/ui/Toast'
import { useDateTime } from '@/components/providers/DateTimeProvider'
import { cn } from '@/lib/utils'

interface TimerProps {
  userId: string
  organizationId: string
  projectId?: string
  taskId?: string
  description?: string
  isBillable?: boolean
  // requireDescription?: boolean
  allowOvertime?: boolean
  maxDailyHours?: number
  dailyHoursLogged?: number
  onTimerUpdate?: (timer: any) => void
  onAutoStop?: (reason: string) => void
}

interface ActiveTimer {
  _id: string
  project: { _id: string; name: string }
  task?: { _id: string; title: string; displayId?: string }
  description: string
  startTime: string
  currentDuration: number
  isPaused: boolean
  category?: string
  tags: string[]
  isBillable: boolean
  hourlyRate?: number
  maxSessionHours: number
  remainingDailyMinutes?: number | null
}

export function Timer({
  userId,
  organizationId,
  projectId,
  taskId,
  description = '',
  isBillable,
  // requireDescription = true,
  allowOvertime = true,
  maxDailyHours,
  dailyHoursLogged = 0,
  onTimerUpdate,
  onAutoStop
}: TimerProps) {
  const { formatDuration, preferences } = useDateTime()
  const { showToast } = useToast()
  const [activeTimer, setActiveTimer] = useState<ActiveTimer | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [displayTime, setDisplayTime] = useState('00:00:00')
  const [showStopConfirmation, setShowStopConfirmation] = useState(false)
  // Local ticking baseline when running
  const baseMinutesRef = useRef<number>(0)
  const tickStartMsRef = useRef<number | null>(null)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  // Guard to prevent multiple concurrent stop requests
  const stoppingRef = useRef(false)
  // If auto-stop triggers, the parent (via onAutoStop) should own the toast
  const autoStopRequestedRef = useRef(false)
  // Prevent repeating auto-stop snackbar if loadActiveTimer runs again
  const autoStopNotifiedRef = useRef(false)

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
  // Uses timezone-aware duration formatting
  const formatTime = (minutes: number) => {
    return formatDuration(minutes)
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

      // Auto-stop when reaching max session hours (when overtime is NOT allowed)
      if (!allowOvertime && activeTimer.maxSessionHours && runningMinutes >= activeTimer.maxSessionHours * 60) {
        console.log('Timer: Auto-stopping - reached max session hours')
        // Clear interval immediately to prevent double-fire from daily limit check
        if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null }
        const maxHours = activeTimer.maxSessionHours
        autoStopRequestedRef.current = true
        onAutoStop?.(`Timer stopped automatically. Maximum session limit of ${maxHours} ${maxHours === 1 ? 'hour' : 'hours'} reached.`)
        handleStopTimer()
        return
      }

      // Auto-stop when reaching remaining daily hours limit
      if (!allowOvertime && activeTimer.remainingDailyMinutes != null && activeTimer.remainingDailyMinutes > 0 && runningMinutes >= activeTimer.remainingDailyMinutes) {
        console.log('Timer: Auto-stopping - reached daily hours limit')
        // Clear interval immediately to prevent repeat fire
        if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null }
        autoStopRequestedRef.current = true
        onAutoStop?.(`Timer stopped automatically. Daily hours limit of ${maxDailyHours || 'N/A'} hours reached.`)
        handleStopTimer()
        return
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
        // If server enforced an auto-stop (e.g., max session/daily reached), show snackbar
        if (data?.activeTimer === null && data?.autoStopped && !autoStopNotifiedRef.current) {
          autoStopNotifiedRef.current = true

          setActiveTimer(null)
          setDisplayTime('00:00:00')

          const message: string =
            typeof data?.message === 'string' && data.message.trim()
              ? data.message
              : 'Timer automatically stopped. Maximum limit reached.'

          if (onAutoStop) {
            onAutoStop(message)
          } else {
            showToast({
              type: 'warning',
              title: 'Timer Auto-Stopped',
              message,
              duration: 8000
            })
          }

          // Let parent refresh logs / UI similarly to a normal stop
          const hasTimeLogged = !!data?.hasTimeLogged && (data?.duration ?? 0) > 0
          if (hasTimeLogged && data?.timeEntry) {
            onTimerUpdate?.({ timeEntry: data.timeEntry, hasTimeLogged: true, duration: data.duration })
          } else {
            onTimerUpdate?.(null)
          }

          return
        }

        // Normal active timer state
        autoStopNotifiedRef.current = false
        setActiveTimer(data.activeTimer)
        // Log timezone info for debugging
        if (data.userTimezone) {
          console.log('Timer: User timezone loaded:', data.userTimezone)
        }
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
    // Prevent multiple concurrent stop requests (from auto-stop + manual click)
    if (stoppingRef.current) return
    stoppingRef.current = true
    setIsLoading(true)
    setError('')
    setShowStopConfirmation(false)

    try {
      const response = await fetch('/api/time-tracking/timer', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, organizationId, action: 'stop', description })
      })

      const data = await response.json()

      if (response.ok) {
        const hasTimeLogged = data.hasTimeLogged && data.duration > 0
        const shouldShowToast = !autoStopRequestedRef.current
        autoStopRequestedRef.current = false

        setActiveTimer(null)
        setDisplayTime('00:00:00')

        if (shouldShowToast) {
          showToast({
            type: hasTimeLogged ? 'success' : 'info',
            title: 'Timer Stopped',
            message:
              data.message ||
              (hasTimeLogged
                ? `Timer stopped. ${formatTime(data.duration)} logged.`
                : `Timer stopped. ${formatTime(data.duration || 0)}`),
            duration: 5000
          })
        }

        // Pass timeEntry info through callback so parent can decide whether to show notifications
        if (hasTimeLogged && data.timeEntry) {
          onTimerUpdate?.({ timeEntry: data.timeEntry, hasTimeLogged: true, duration: data.duration, status: 'stopped' })
        } else {
          onTimerUpdate?.({ status: 'stopped' })
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
      stoppingRef.current = false
    }
  }

  const handleConfirmStop = () => {
    handleStopTimer()
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
      <div className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] dark:shadow-none overflow-hidden">
        {/* Card header */}
        <div className="px-5 py-4 border-b border-[var(--apple-separator)] flex items-center gap-2">
          <div
            className="h-7 w-7 rounded-[var(--apple-radius-sm)] flex items-center justify-center flex-shrink-0"
            style={{ background: activeTimer.isPaused ? 'linear-gradient(135deg,#FF9500 0%,#FFD60A 100%)' : 'linear-gradient(135deg,#34C759 0%,#30D158 100%)' }}
          >
            <Clock className="h-3.5 w-3.5 text-white" />
          </div>
          <span className="text-[15px] font-semibold text-[var(--apple-label)]">Active Timer</span>
          <span
            className={cn(
              'ml-auto inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border',
              activeTimer.isPaused
                ? 'bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800'
                : 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800'
            )}
            style={{ animation: 'badge-border-pulse 3s ease-in-out infinite' }}
          >
            <span
              className={cn('h-1.5 w-1.5 rounded-full', activeTimer.isPaused ? 'bg-amber-500' : 'bg-emerald-500')}
              style={!activeTimer.isPaused ? { animation: 'status-pulse 2s ease-in-out infinite' } : undefined}
            />
            {activeTimer.isPaused ? 'Paused' : 'Running'}
          </span>
        </div>

        <div className="p-5 space-y-5">
          {error && (
            <div className="flex items-start gap-2.5 rounded-[var(--apple-radius-md)] bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 p-3">
              <AlertTriangle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-[13px] text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}

          {/* Clock display */}
          <div className="flex flex-col items-center py-6">
            <span className="inline-flex items-baseline text-[52px] font-bold font-apple-mono tabular-nums tracking-[-0.02em] text-[var(--apple-label)]">
              {displayTime.split('').map((char, i) =>
                /[0-9]/.test(char) ? (
                  <span key={`${i}-${char}`} className="number-digit-flip">
                    {char}
                  </span>
                ) : (
                  <span key={`s${i}`}>{char}</span>
                )
              )}
            </span>
            {activeTimer.isBillable && (
              <span className="mt-2 inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                Billable
              </span>
            )}
          </div>

          {/* Details row */}
          <div className="rounded-[var(--apple-radius-md)] bg-[var(--apple-tertiary-fill)] p-4 space-y-2.5">
            <div className="flex items-center gap-2.5 text-[14px]">
              <FolderOpen className="h-4 w-4 text-[var(--apple-secondary-label)] flex-shrink-0" />
              <span className="text-[var(--apple-tertiary-label)] font-medium min-w-[4rem]">Project</span>
              <span className="text-[var(--apple-label)] font-medium truncate">{activeTimer.project.name}</span>
            </div>
            {activeTimer.task && (
              <div className="flex items-center gap-2.5 text-[14px]">
                <Target className="h-4 w-4 text-[var(--apple-secondary-label)] flex-shrink-0" />
                <span className="text-[var(--apple-tertiary-label)] font-medium min-w-[4rem]">Task</span>
                <div className="flex items-center gap-2 min-w-0">
                  {activeTimer.task.displayId && (
                    <span className="text-[11px] font-apple-mono bg-[var(--apple-quaternary-fill)] px-1.5 py-0.5 rounded flex-shrink-0">
                      {activeTimer.task.displayId}
                    </span>
                  )}
                  <span className="text-[var(--apple-label)] truncate">{activeTimer.task.title}</span>
                </div>
              </div>
            )}
            {activeTimer.description && (
              <div className="flex items-start gap-2.5 text-[14px]">
                <FileText className="h-4 w-4 text-[var(--apple-secondary-label)] flex-shrink-0 mt-0.5" />
                <span className="text-[var(--apple-tertiary-label)] font-medium min-w-[4rem]">Memo</span>
                <span className="text-[var(--apple-label)] line-clamp-2">{activeTimer.description}</span>
              </div>
            )}
          </div>

          {/* Controls */}
          <div className="flex gap-3">
            {activeTimer.isPaused ? (
              <button
                onClick={handleResumeTimer}
                disabled={isLoading}
                className="flex-1 h-10 rounded-[var(--apple-radius-md)] text-[15px] font-semibold text-white apple-transition disabled:opacity-50 flex items-center justify-center gap-2"
                style={{ background: 'linear-gradient(135deg,#34C759 0%,#30D158 100%)', boxShadow: '0 2px 8px rgba(52,199,89,0.30)' }}
              >
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                Resume
              </button>
            ) : (
              <button
                onClick={handlePauseTimer}
                disabled={isLoading}
                className="flex-1 h-10 rounded-[var(--apple-radius-md)] text-[15px] font-semibold text-white apple-transition disabled:opacity-50 flex items-center justify-center gap-2"
                style={{ background: 'linear-gradient(135deg,#FF9500 0%,#FFD60A 100%)', boxShadow: '0 2px 8px rgba(255,149,0,0.30)' }}
              >
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pause className="h-4 w-4" />}
                Pause
              </button>
            )}
            <button
              onClick={() => setShowStopConfirmation(true)}
              disabled={isLoading}
              className="flex-1 h-10 rounded-[var(--apple-radius-md)] text-[15px] font-semibold text-white apple-transition disabled:opacity-50 flex items-center justify-center gap-2"
              style={{ background: 'linear-gradient(135deg,#FF3B30 0%,#FF453A 100%)', boxShadow: '0 2px 8px rgba(255,59,48,0.30)' }}
            >
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-4 w-4" />}
              Stop
            </button>
          </div>

          <ConfirmationModal
            isOpen={showStopConfirmation}
            onClose={() => setShowStopConfirmation(false)}
            onConfirm={handleConfirmStop}
            title="Stop Timer"
            description={
              <>
                Are you sure you want to stop the active timer?
                <span className="block mt-2 text-foreground font-medium">
                  {activeTimer.project?.name || 'Unknown project'}
                  {activeTimer.task && ` • ${activeTimer.task.displayId ? `${activeTimer.task.displayId} - ` : ''}${activeTimer.task.title}`}
                </span>
              </>
            }
            confirmText="Stop Timer"
            confirmIcon={<Square className="h-4 w-4" />}
            cancelText="Cancel"
            variant="destructive"
            isLoading={isLoading}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-start gap-2.5 rounded-[var(--apple-radius-md)] bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 p-3">
          <AlertTriangle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-[13px] text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      {!allowOvertime && maxDailyHours && dailyHoursLogged >= maxDailyHours && (
        <div className="flex items-start gap-2.5 rounded-[var(--apple-radius-md)] bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3">
          <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
          <p className="text-[13px] text-amber-600 dark:text-amber-400">
            Daily time limit reached ({dailyHoursLogged.toFixed(1)}h / {maxDailyHours}h). You cannot start a new timer until tomorrow.
          </p>
        </div>
      )}

      <button
        onClick={handleStartTimer}
        disabled={
          isLoading ||
          !projectId ||
          !taskId ||
          (!description.trim()) ||
          (!allowOvertime && !!maxDailyHours && dailyHoursLogged >= maxDailyHours)
        }
        className="w-full h-11 rounded-[var(--apple-radius-md)] text-[16px] font-semibold text-white apple-transition disabled:opacity-50 flex items-center justify-center gap-2"
        style={{ background: 'linear-gradient(135deg,#007AFF 0%,#5AC8FA 100%)', boxShadow: '0 2px 8px rgba(0,122,255,0.30)' }}
      >
        {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Play className="h-5 w-5" />}
        {isLoading ? 'Starting…' : 'Start Timer'}
      </button>
    </div>
  )
}
