'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Clock, Play, Pause, Square, TrendingUp, AlertTriangle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/Dialog'
import { useToast } from '@/components/ui/Toast'
import { Timer } from '@/components/time-tracking/Timer'
import { useOrganization } from '@/hooks/useOrganization'
import { useDateTime } from '@/components/providers/DateTimeProvider'
import { applyRoundingRules } from '@/lib/utils'

interface TimeTrackingWidgetProps {
  userId: string
  organizationId: string
  timeStats?: {
    today: { duration: number; cost: number }
    week: { duration: number; cost: number }
    month: { duration: number; cost: number }
    totalDuration: number
    totalCost: number
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
}

interface TimeStats {
  todayDuration: number
  weekDuration: number
  monthDuration: number
  todayCost: number
  weekCost: number
  monthCost: number
}

export function TimeTrackingWidget({ userId, organizationId, timeStats: propTimeStats }: TimeTrackingWidgetProps) {
  const router = useRouter()
  const { organization } = useOrganization()
  const { formatDuration: formatDurationUtil } = useDateTime()
  const { showToast } = useToast()
  const [activeTimer, setActiveTimer] = useState<ActiveTimer | null>(null)
  const [timeStats, setTimeStats] = useState<TimeStats | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [displayTime, setDisplayTime] = useState('00:00:00')
  const [showStopConfirm, setShowStopConfirm] = useState(false)
  const [runningTimerMinutes, setRunningTimerMinutes] = useState<number>(0)
  // Local ticking baseline when running
  const baseMinutesRef = useRef<number>(0)
  const tickStartMsRef = useRef<number | null>(null)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const autoStopNotifiedRef = useRef(false)

  const truncateWords = (text: string, maxWords: number) => {
    const trimmed = (text || '').trim()
    if (!trimmed) return ''
    const words = trimmed.split(/\s+/)
    if (words.length <= maxWords) return trimmed
    return `${words.slice(0, maxWords).join(' ')}…`
  }

  const loadTimeStats = useCallback(async () => {
    try {
      const today = new Date()
      const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate())
      const startOfWeek = new Date(startOfDay)
      startOfWeek.setDate(startOfDay.getDate() - startOfDay.getDay())
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)

      const [todayResponse, weekResponse, monthResponse] = await Promise.all([
        fetch(`/api/time-tracking/entries?userId=${userId}&organizationId=${organizationId}&startDate=${startOfDay.toISOString()}&endDate=${today.toISOString()}`),
        fetch(`/api/time-tracking/entries?userId=${userId}&organizationId=${organizationId}&startDate=${startOfWeek.toISOString()}&endDate=${today.toISOString()}`),
        fetch(`/api/time-tracking/entries?userId=${userId}&organizationId=${organizationId}&startDate=${startOfMonth.toISOString()}&endDate=${today.toISOString()}`)
      ])

      const [todayData, weekData, monthData] = await Promise.all([
        todayResponse.json(),
        weekResponse.json(),
        monthResponse.json()
      ])

      if (todayResponse.ok && weekResponse.ok && monthResponse.ok) {
        setTimeStats({
          todayDuration: todayData.totals.totalDuration,
          weekDuration: weekData.totals.totalDuration,
          monthDuration: monthData.totals.totalDuration,
          todayCost: todayData.totals.totalCost,
          weekCost: weekData.totals.totalCost,
          monthCost: monthData.totals.totalCost
        })
      }
    } catch (error) {
      console.error('Error loading time stats:', error)
    }
  }, [userId, organizationId])

  const loadActiveTimer = useCallback(async () => {
    try {
      const response = await fetch(`/api/time-tracking/timer?userId=${userId}&organizationId=${organizationId}`)
      const data = await response.json()

      if (response.ok) {
        // Server-enforced auto-stop response (max session/daily reached)
        if (data?.activeTimer === null && data?.autoStopped && !autoStopNotifiedRef.current) {
          autoStopNotifiedRef.current = true
          setActiveTimer(null)
          showToast({
            type: 'warning',
            title: 'Timer Auto-Stopped',
            message: data.message || 'Timer automatically stopped. Maximum limit reached.',
            duration: 8000
          })
          // Refresh stats shortly after to include the saved entry
          setTimeout(() => {
            loadTimeStats()
          }, 500)
          return
        }

        // Normal active timer
        if (data?.activeTimer) {
          autoStopNotifiedRef.current = false
        }
        setActiveTimer(data.activeTimer)
      }
    } catch (error) {
      console.error('Error loading active timer:', error)
    }
  }, [userId, organizationId, showToast, loadTimeStats])

  useEffect(() => {
    loadActiveTimer()
    if (propTimeStats) {
      setTimeStats({
        todayDuration: propTimeStats.today.duration,
        weekDuration: propTimeStats.week.duration,
        monthDuration: propTimeStats.month.duration,
        todayCost: propTimeStats.today.cost,
        weekCost: propTimeStats.week.cost,
        monthCost: propTimeStats.month.cost
      })
    } else {
      loadTimeStats()
    }

    // Refresh active timer every 30 seconds to sync with server
    const refreshInterval = setInterval(() => {
      loadActiveTimer()
    }, 30000)

    return () => {
      clearInterval(refreshInterval)
    }
  }, [loadActiveTimer, loadTimeStats, propTimeStats])

  // Format duration for active timer - NO rounding (shows actual elapsed time)
  // Uses timezone-aware duration formatting
  const formatActiveTimerDuration = (minutes: number) => {
    return formatDurationUtil(minutes)
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
      setRunningTimerMinutes(0)
      baseMinutesRef.current = 0
      tickStartMsRef.current = null
      return
    }

    // Initialize baseline from server
    baseMinutesRef.current = activeTimer.currentDuration || 0
    setDisplayTime(formatActiveTimerDuration(baseMinutesRef.current))
    setRunningTimerMinutes(baseMinutesRef.current)

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
      setDisplayTime(formatActiveTimerDuration(runningMinutes))
      setRunningTimerMinutes(runningMinutes)
    }, 1000)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [activeTimer])

  // Format duration for saved time entries - WITH rounding
  const formatDuration = (minutes: number) => {
    // Apply rounding rules if enabled for saved entries
    let displayMinutes = minutes
    const roundingRules = organization?.settings?.timeTracking?.roundingRules
    if (roundingRules?.enabled) {
      displayMinutes = applyRoundingRules(minutes, {
        enabled: roundingRules.enabled,
        increment: roundingRules.increment || 15,
        roundUp: roundingRules.roundUp ?? true
      })
    }

    const totalSeconds = Math.floor(displayMinutes * 60)
    const hours = Math.floor(totalSeconds / 3600)
    const mins = Math.floor((totalSeconds % 3600) / 60)
    const secs = totalSeconds % 60

    if (hours > 0) {
      return `${hours}h ${mins}m ${secs}s`
    } else if (mins > 0) {
      return `${mins}m ${secs}s`
    } else {
      return `${secs}s`
    }
  }

  const formatCurrency = (amount: number) => {
    const orgCurrency = organization?.currency || 'USD'
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: orgCurrency
    }).format(amount)
  }

  const handleTimerUpdate = (timer: ActiveTimer | null) => {
    setActiveTimer(timer)
    if (!timer) {
      // Timer was stopped, wait a moment for backend to save the entry, then refresh stats
      setTimeout(() => {
        loadTimeStats()
      }, 500)
    }
  }

  const updateTimerAction = async (action: 'pause' | 'resume' | 'stop') => {
    try {
      setIsLoading(true)
      const response = await fetch('/api/time-tracking/timer', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, organizationId, action })
      })
      const data = await response.json()
      if (!response.ok) {
        setError(data.error || 'Failed to update timer')
        return
      }
      if (action === 'stop') {
        handleTimerUpdate(null)
        const hasTimeLogged = data.hasTimeLogged && data.duration > 0
        showToast({
          type: hasTimeLogged ? 'success' : 'info',
          title: 'Timer Stopped',
          message:
            data.message ||
            (hasTimeLogged
              ? 'Timer stopped successfully.'
              : 'Timer stopped. No time was logged.'),
          duration: 5000
        })
      } else {
        setActiveTimer(data.activeTimer)
      }
    } catch (e) {
      setError('Failed to update timer')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* ─── Active Timer Card ─── */}
      {activeTimer && (
        <Card className="overflow-x-hidden border-[var(--apple-system-blue)]/20">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-[15px] font-semibold text-[var(--apple-label)]">Active Timer</span>
              </div>
              {/* "• Live" indicator */}
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[var(--apple-radius-pill)] bg-[var(--apple-system-green)]/15 text-[var(--apple-system-green)] text-[13px] font-medium">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--apple-system-green)] animate-pulse" />
                Live
              </span>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Large monospace clock */}
            <div className="text-center py-2">
              <span className="inline-flex items-center text-[36px] font-timer tabular-nums text-[var(--apple-label)] leading-none">
                {displayTime.split('').map((char, i) =>
                  /[0-9]/.test(char) ? (
                    <span key={`${i}-${char}`} className="number-digit-flip">{char}</span>
                  ) : (
                    <span key={`s${i}`} className="mx-[0.18em] opacity-50 select-none">:</span>
                  )
                )}
              </span>
            </div>

            {/* Project / Task / Memo */}
            <div className="space-y-1 border-t border-[var(--apple-separator)] pt-3">
              <div className="flex gap-3">
                <span className="text-sm text-[var(--apple-tertiary-label)] w-14 flex-shrink-0">Project</span>
                <span className="text-sm font-medium text-[var(--apple-label)] truncate">
                  {activeTimer.project?.name || <span className="italic text-[var(--apple-tertiary-label)]">Unknown</span>}
                </span>
              </div>
              {activeTimer.task && (
                <div className="flex gap-3">
                  <span className="text-sm text-[var(--apple-tertiary-label)] w-14 flex-shrink-0">Task</span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="text-sm font-medium text-[var(--apple-label)] truncate cursor-default">
                        {activeTimer.task.title}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent><p className="max-w-xs">{activeTimer.task.title}</p></TooltipContent>
                  </Tooltip>
                </div>
              )}
              {activeTimer.description && (
                <div className="flex gap-3">
                  <span className="text-sm text-[var(--apple-tertiary-label)] w-14 flex-shrink-0">Memo</span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="text-sm text-[var(--apple-secondary-label)] truncate cursor-default">
                        {truncateWords(activeTimer.description, 5)}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent><p className="max-w-xs">{activeTimer.description}</p></TooltipContent>
                  </Tooltip>
                </div>
              )}
            </div>

            {/* Status badges */}
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-[var(--apple-radius-pill)] text-[13px] font-medium ${
                activeTimer.isPaused
                  ? 'bg-[var(--apple-system-orange)]/15 text-[var(--apple-system-orange)]'
                  : 'bg-[var(--apple-system-green)]/15 text-[var(--apple-system-green)]'
              }`}>
                {activeTimer.isPaused ? 'Paused' : 'Running'}
              </span>
              {activeTimer.isBillable && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-[var(--apple-radius-pill)] text-[13px] font-medium bg-[var(--apple-system-blue)]/15 text-[var(--apple-system-blue)]">
                  Billable
                </span>
              )}
            </div>

            {/* 3 action buttons */}
            <div className="grid grid-cols-3 gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={isLoading}
                onClick={() => updateTimerAction(activeTimer.isPaused ? 'resume' : 'pause')}
                className="text-xs"
              >
                {activeTimer.isPaused ? <><Play className="h-3 w-3 mr-1" strokeWidth={1.5} />Resume</> : <><Pause className="h-3 w-3 mr-1" strokeWidth={1.5} />Pause</>}
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={isLoading}
                onClick={() => setShowStopConfirm(true)}
                className="text-xs"
              >
                <Square className="h-3 w-3 mr-1" strokeWidth={1.5} />Stop
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  const pid = activeTimer.project?._id ? `projectId=${encodeURIComponent(activeTimer.project._id)}` : ''
                  const pname = activeTimer.project?.name ? `projectName=${encodeURIComponent(activeTimer.project.name)}` : ''
                  const tid = activeTimer.task?._id ? `taskId=${encodeURIComponent(activeTimer.task._id)}` : ''
                  const tname = activeTimer.task?.title ? `taskName=${encodeURIComponent(activeTimer.task.title)}` : ''
                  const qs = [pid, pname, tid, tname].filter(Boolean).join('&')
                  router.push(qs ? `/time-tracking/timer?${qs}` : '/time-tracking/timer')
                }}
                className="text-xs"
              >
                <Clock className="h-3 w-3 mr-1" strokeWidth={1.5} />Info
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stop Timer Confirmation Dialog — logic unchanged */}
      <Dialog open={showStopConfirm} onOpenChange={setShowStopConfirm}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-[var(--apple-system-red)]" strokeWidth={1.5} />
              Stop Timer
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to stop the active timer?
              {activeTimer && (
                <span className="block mt-2 text-[var(--apple-label)] font-medium">
                  {activeTimer.project?.name || 'Unknown project'}
                  {activeTimer.task && ` • ${activeTimer.task.title}`}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowStopConfirm(false)}>Cancel</Button>
            <Button variant="destructive" onClick={() => { setShowStopConfirm(false); updateTimerAction('stop') }}>
              <Square className="h-4 w-4 mr-2" strokeWidth={1.5} />Stop Timer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Time Tracking Overview Card ─── */}
      <Card className="overflow-x-hidden">
        <CardHeader>
          <CardTitle>Time Tracking</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {error && (
            <Alert variant="destructive">
              <AlertDescription className="text-xs">{error}</AlertDescription>
            </Alert>
          )}

          {/* Today / Week / Month stats — compact single row */}
          {timeStats && (
            <div className="grid grid-cols-3 divide-x divide-[var(--apple-separator)] rounded-[var(--apple-radius-md)] bg-[var(--apple-quaternary-fill)] overflow-hidden">
              <div className="text-center px-2 py-2">
                <div className="text-sm font-bold font-apple-mono text-[var(--apple-label)] leading-tight tabular-nums">
                  {formatDuration(timeStats.todayDuration + (activeTimer ? runningTimerMinutes : 0))}
                </div>
                <div className="apple-section-label mt-0.5">Today</div>
              </div>
              <div className="text-center px-2 py-2">
                <div className="text-sm font-bold font-apple-mono text-[var(--apple-system-blue)] leading-tight tabular-nums">
                  {formatDuration(timeStats.weekDuration)}
                </div>
                <div className="apple-section-label mt-0.5">Week</div>
              </div>
              <div className="text-center px-2 py-2">
                <div className="text-sm font-bold font-apple-mono text-[var(--apple-system-green)] leading-tight tabular-nums">
                  {formatDuration(timeStats.monthDuration)}
                </div>
                <div className="apple-section-label mt-0.5">Month</div>
              </div>
            </div>
          )}

          {/* Cost row — only if there's billing data */}
          {timeStats && (timeStats.todayCost > 0 || timeStats.weekCost > 0 || timeStats.monthCost > 0) && (
            <div className="grid grid-cols-3 divide-x divide-[var(--apple-separator)] rounded-[var(--apple-radius-md)] bg-[var(--apple-quaternary-fill)] overflow-hidden">
              {[
                { val: timeStats.todayCost, label: 'Today' },
                { val: timeStats.weekCost,  label: 'Week' },
                { val: timeStats.monthCost, label: 'Month' },
              ].map(({ val, label }) => (
                <div key={label} className="text-center px-2 py-2">
                  <div className="text-xs font-semibold font-apple-mono text-[var(--apple-system-green)]">{formatCurrency(val)}</div>
                  <div className="apple-section-label mt-0.5">{label}</div>
                </div>
              ))}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex flex-col gap-2 pt-1">
            <Button size="sm" onClick={() => router.push('/time-tracking')} className="w-full">
              <Play className="h-3.5 w-3.5 mr-1.5" strokeWidth={1.5} />
              Time Tracking Details
            </Button>
            <Button size="sm" variant="outline" onClick={() => router.push('/time-tracking/logs')} className="w-full">
              <TrendingUp className="h-3.5 w-3.5 mr-1.5" strokeWidth={1.5} />
              View Logs
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
