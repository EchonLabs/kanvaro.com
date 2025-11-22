'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Clock, Play, Pause, Square, TrendingUp, DollarSign } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Timer } from '@/components/time-tracking/Timer'
import { useOrganization } from '@/hooks/useOrganization'
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
  const [activeTimer, setActiveTimer] = useState<ActiveTimer | null>(null)
  const [timeStats, setTimeStats] = useState<TimeStats | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

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

  const loadTimeStats = useCallback(async () => {
    try {
      const today = new Date()
      const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate())
      const startOfWeek = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)
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
  }, [loadActiveTimer, loadTimeStats, propTimeStats])

  // Format duration for active timer - NO rounding (shows actual elapsed time)
  const formatActiveTimerDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60)
    const mins = Math.floor(minutes % 60)
    return `${hours}h ${mins}m`
  }

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
    
    const hours = Math.floor(displayMinutes / 60)
    const mins = Math.floor(displayMinutes % 60)
    return `${hours}h ${mins}m`
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount)
  }

  const handleTimerUpdate = (timer: ActiveTimer | null) => {
    setActiveTimer(timer)
    if (!timer) {
      // Timer was stopped, refresh stats
      loadTimeStats()
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
      } else {
        setActiveTimer(data.activeTimer)
      }
    } catch (e) {
      setError('Failed to update timer')
    } finally {
      setIsLoading(false)
    }
  }

  if (activeTimer) {
    return (
      <Card className="overflow-x-hidden">
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Clock className="h-4 w-4 sm:h-5 sm:w-5 flex-shrink-0" />
            <span className="truncate">Active Timer</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 sm:space-y-4 p-4 sm:p-6 pt-0">
          <div className="text-center">
            <div className="text-2xl sm:text-3xl font-mono font-bold text-primary break-words">
              {formatActiveTimerDuration(activeTimer.currentDuration)}
            </div>
            {activeTimer.hourlyRate && (
              <div className="text-xs sm:text-sm text-muted-foreground mt-1">
                <DollarSign className="h-3 w-3 sm:h-4 sm:w-4 inline mr-1" />
                <span className="break-words">{formatCurrency((activeTimer.hourlyRate * activeTimer.currentDuration) / 60)}</span>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <div className="text-xs sm:text-sm break-words">
              <span className="font-medium">Project:</span>{' '}
              {activeTimer.project?.name ? (
                <span
                  className={activeTimer.project.name.length > 20 ? 'truncate' : ''}
                  title={activeTimer.project.name.length > 20 ? activeTimer.project.name : undefined}
                >
                  {activeTimer.project.name.length > 20
                    ? `${activeTimer.project.name.slice(0, 20)}…`
                    : activeTimer.project.name}
                </span>
              ) : (
                <span className="italic text-muted-foreground">Unknown project</span>
              )}
            </div>
            {activeTimer.task && (
              <div className="text-xs sm:text-sm break-words">
                <span className="font-medium">Task:</span> <span className="truncate">{activeTimer.task.title}</span>
              </div>
            )}
            <div className="text-xs sm:text-sm break-words">
              <span className="font-medium">Description:</span> <span className="truncate">{activeTimer.description}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={activeTimer.isPaused ? 'secondary' : 'default'} className="text-xs flex-shrink-0">
                {activeTimer.isPaused ? 'Paused' : 'Running'}
              </Badge>
              {activeTimer.isBillable && (
                <Badge variant="outline" className="text-xs flex-shrink-0">Billable</Badge>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={isLoading}
              onClick={() => updateTimerAction(activeTimer.isPaused ? 'resume' : 'pause')}
              className="w-full text-xs sm:text-sm whitespace-nowrap"
            >
              {activeTimer.isPaused ? (
                <>
                  <Play className="h-3 w-3 sm:h-4 sm:w-4 mr-2" />
                  Resume
                </>
              ) : (
                <>
                  <Pause className="h-3 w-3 sm:h-4 sm:w-4 mr-2" />
                  Pause
                </>
              )}
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={isLoading}
              onClick={() => updateTimerAction('stop')}
              className="w-full text-xs sm:text-sm whitespace-nowrap"
            >
              <Square className="h-3 w-3 sm:h-4 sm:w-4 mr-2" />
              Stop
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const pid = activeTimer.project && activeTimer.project._id ? `projectId=${encodeURIComponent(activeTimer.project._id)}` : ''
                const pname = activeTimer.project && activeTimer.project.name ? `projectName=${encodeURIComponent(activeTimer.project.name)}` : ''
                const tid = activeTimer.task && activeTimer.task._id ? `taskId=${encodeURIComponent(activeTimer.task._id)}` : ''
                const tname = activeTimer.task && activeTimer.task.title ? `taskName=${encodeURIComponent(activeTimer.task.title)}` : ''
                const qs = [pid, pname, tid, tname].filter(Boolean).join('&')
                router.push(qs ? `/time-tracking/timer?${qs}` : '/time-tracking/timer')
              }}
              className="w-full text-xs sm:text-sm whitespace-nowrap"
            >
              <Clock className="h-3 w-3 sm:h-4 sm:w-4 mr-2" />
              Manage<span className="hidden sm:inline"> Timer</span>
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="overflow-x-hidden">
      <CardHeader className="p-4 sm:p-6">
        <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
          <Clock className="h-4 w-4 sm:h-5 sm:w-5 flex-shrink-0" />
          <span className="truncate">Time Tracking</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 sm:space-y-4 p-4 sm:p-6 pt-0">
        {error && (
          <Alert variant="destructive">
            <AlertDescription className="text-xs sm:text-sm break-words">{error}</AlertDescription>
          </Alert>
        )}

        {timeStats && (
          <div className="grid grid-cols-3 gap-2 sm:gap-4 text-center">
            <div>
              <div className="text-lg sm:text-2xl font-bold text-primary break-words">
                {formatDuration(timeStats.todayDuration)}
              </div>
              <div className="text-xs text-muted-foreground mt-1">Today</div>
            </div>
            <div>
              <div className="text-lg sm:text-2xl font-bold text-blue-600 break-words">
                {formatDuration(timeStats.weekDuration)}
              </div>
              <div className="text-xs text-muted-foreground mt-1">This Week</div>
            </div>
            <div>
              <div className="text-lg sm:text-2xl font-bold text-green-600 break-words">
                {formatDuration(timeStats.monthDuration)}
              </div>
              <div className="text-xs text-muted-foreground mt-1">This Month</div>
            </div>
          </div>
        )}

        {timeStats && (timeStats.todayCost > 0 || timeStats.weekCost > 0 || timeStats.monthCost > 0) && (
          <div className="grid grid-cols-3 gap-2 sm:gap-4 text-center">
            <div>
              <div className="text-sm sm:text-lg font-semibold text-green-600 break-words">
                {formatCurrency(timeStats.todayCost)}
              </div>
              <div className="text-xs text-muted-foreground mt-1">Today</div>
            </div>
            <div>
              <div className="text-sm sm:text-lg font-semibold text-green-600 break-words">
                {formatCurrency(timeStats.weekCost)}
              </div>
              <div className="text-xs text-muted-foreground mt-1">This Week</div>
            </div>
            <div>
              <div className="text-sm sm:text-lg font-semibold text-green-600 break-words">
                {formatCurrency(timeStats.monthCost)}
              </div>
              <div className="text-xs text-muted-foreground mt-1">This Month</div>
            </div>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-2">
          <Button
            size="sm"
            onClick={() => router.push('/time-tracking')}
            className="flex-1 text-xs sm:text-sm"
          >
            <Play className="h-3 w-3 sm:h-4 sm:w-4 mr-2" />
            Start Timer
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => router.push('/time-tracking/logs')}
            className="flex-1 sm:flex-initial text-xs sm:text-sm"
          >
            <TrendingUp className="h-3 w-3 sm:h-4 sm:w-4 mr-2" />
            View Logs
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
