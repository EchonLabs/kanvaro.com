'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Clock, Square, User, FolderOpen, Loader2, RefreshCw, Search } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ConfirmationModal } from '@/components/ui/ConfirmationModal'
import { usePermissions } from '@/lib/permissions/permission-context'
import { Permission } from '@/lib/permissions/permission-definitions'
import { useToast } from '@/components/ui/Toast'

interface ActiveTimer {
  _id: string
  user: {
    _id: string
    firstName: string
    lastName: string
    email: string
  }
  project: {
    _id: string
    name: string
  }
  task?: {
    _id: string
    title: string
  }
  description: string
  startTime: string
  createdAt?: string
  currentDuration: number
  isPaused: boolean
  isBillable: boolean
  hourlyRate?: number
  totalPausedDuration?: number
}

interface Member {
  _id: string
  firstName: string
  lastName: string
  email: string
}

interface Project {
  _id: string
  name: string
}

interface ActiveTimersWidgetProps {
  organizationId: string
}

interface TimerBaseline {
  baseMinutes: number
  tickStartMs: number | null
  isPaused: boolean
}

export function ActiveTimersWidget({ organizationId }: ActiveTimersWidgetProps) {
  const { hasPermission, loading: permissionsLoading } = usePermissions()
  const { showToast } = useToast()
  const [timers, setTimers] = useState<ActiveTimer[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('')
  const [selectedProjectId, setSelectedProjectId] = useState<string>('')
  const [employeeSearch, setEmployeeSearch] = useState<string>('')
  const [projectSearch, setProjectSearch] = useState<string>('')
  const [isLoading, setIsLoading] = useState(false)
  const [isStopping, setIsStopping] = useState<string | null>(null)
  const [stopConfirmTimerId, setStopConfirmTimerId] = useState<string | null>(null)
  const [displayTimes, setDisplayTimes] = useState<Record<string, string>>({})
  const timerBaselinesRef = useRef<Record<string, TimerBaseline>>({})

  const canViewAllTimers = hasPermission(Permission.TIME_TRACKING_VIEW_ALL_TIMER)

  // Format duration to HH:MM:SS
  const formatDuration = useCallback((minutes: number): string => {
    const hours = Math.floor(minutes / 60)
    const mins = Math.floor(minutes % 60)
    const secs = Math.floor((minutes % 1) * 60)
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }, [])

  const deriveTimerMinutes = useCallback((timer: ActiveTimer): number => {
    // If paused, use the currentDuration provided by the server which is already correct for the paused state
    if (timer.isPaused) {
      return Math.max(0, timer.currentDuration || 0)
    }

    const baselineIso = timer.createdAt || timer.startTime
    const baselineMs = baselineIso ? new Date(baselineIso).getTime() : NaN
    if (Number.isNaN(baselineMs)) {
      return Math.max(0, timer.currentDuration || 0)
    }

    const elapsedMinutes = (Date.now() - baselineMs) / 60000
    const pausedMinutes = timer.totalPausedDuration || 0
    const derivedMinutes = elapsedMinutes - pausedMinutes
    const fallbackMinutes = timer.currentDuration || 0
    return Math.max(0, Number.isFinite(derivedMinutes) ? derivedMinutes : fallbackMinutes)
  }, [])

  const updateDisplayTimesFromBaselines = useCallback(() => {
    const baselines = timerBaselinesRef.current

    if (!baselines || Object.keys(baselines).length === 0) {
      setDisplayTimes({})
      return
    }

    const updatedTimes: Record<string, string> = {}
    Object.entries(baselines).forEach(([timerId, baseline]) => {
      const elapsed = !baseline.isPaused && baseline.tickStartMs
        ? (Date.now() - baseline.tickStartMs) / 60000
        : 0
      const totalMinutes = Math.max(0, baseline.baseMinutes + elapsed)
      updatedTimes[timerId] = formatDuration(totalMinutes)
    })
    setDisplayTimes(updatedTimes)
  }, [formatDuration])

  const syncTimerBaselines = useCallback((timersList: ActiveTimer[]) => {
    if (!timersList.length) {
      timerBaselinesRef.current = {}
      setDisplayTimes({})
      return
    }

    const nextBaselines: Record<string, TimerBaseline> = {}
    const now = Date.now()

    timersList.forEach(timer => {
      const derivedMinutes = deriveTimerMinutes(timer)
      nextBaselines[timer._id] = {
        baseMinutes: derivedMinutes,
        tickStartMs: timer.isPaused ? null : now,
        isPaused: timer.isPaused
      }
    })

    timerBaselinesRef.current = nextBaselines
    updateDisplayTimesFromBaselines()
  }, [deriveTimerMinutes, updateDisplayTimesFromBaselines])

  // Tick display times locally for all timers
  useEffect(() => {
    if (!canViewAllTimers) {
      return
    }

    updateDisplayTimesFromBaselines()

    const interval = setInterval(() => {
      updateDisplayTimesFromBaselines()
    }, 1000)

    return () => clearInterval(interval)
  }, [canViewAllTimers, updateDisplayTimesFromBaselines])

  // Fetch members for filter
  const fetchMembers = useCallback(async () => {
    try {
      const response = await fetch('/api/members?limit=1000&status=active')
      const data = await response.json()
      if (data.success && Array.isArray(data.data?.members)) {
        setMembers(data.data.members)
      }
    } catch (error) {
      console.error('Failed to fetch members:', error)
    }
  }, [])

  // Fetch projects for filter
  const fetchProjects = useCallback(async () => {
    try {
      const response = await fetch('/api/projects?limit=1000')
      const data = await response.json()
      if (data.success && Array.isArray(data.data)) {
        setProjects(data.data)
      }
    } catch (error) {
      console.error('Failed to fetch projects:', error)
    }
  }, [])

  // Fetch active timers
  const fetchActiveTimers = useCallback(async () => {
    // Early return if no permission or still loading permissions
    if (!canViewAllTimers || permissionsLoading) {
      return
    }

    if (!organizationId) {
      return
    }

    setIsLoading(true)
    try {
      let url = `/api/time-tracking/timers/all`
      const params = new URLSearchParams()
      if (selectedEmployeeId) params.append('employeeId', selectedEmployeeId)
      if (selectedProjectId) params.append('projectId', selectedProjectId)
      if (params.toString()) url += `?${params.toString()}`

      const response = await fetch(url, {
        credentials: 'include'
      })
      const data = await response.json()

      if (response.ok && data.success) {
        const timersList = data.data?.timers || []
        setTimers(timersList)
        syncTimerBaselines(timersList)
      } else {
        // Silently handle errors - don't show toast if permission denied
        if (response.status !== 403) {
          console.error('ActiveTimersWidget: Failed to fetch active timers:', data.error)
        }
      }
    } catch (error) {
      // Silently handle errors - don't show toast
      console.error('ActiveTimersWidget: Error fetching active timers:', error)
    } finally {
      setIsLoading(false)
    }
  }, [canViewAllTimers, permissionsLoading, selectedEmployeeId, selectedProjectId, organizationId, syncTimerBaselines])

  // Show confirmation before stopping a timer
  const requestStopTimer = (timerId: string) => {
    setStopConfirmTimerId(timerId)
  }

  // Actually stop the timer after confirmation
  const handleStopTimer = async (timerId: string) => {
    setStopConfirmTimerId(null)
    setIsStopping(timerId)
    try {
      const response = await fetch('/api/time-tracking/timers/all', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ timerId })
      })

      const data = await response.json()

      if (response.ok) {
        showToast({
          type: 'success',
          title: 'Timer Stopped',
          message: 'The timer has been stopped successfully.',
        })
        // Refresh timers
        await fetchActiveTimers()
      } else {
        showToast({
          type: 'error',
          title: 'Error',
          message: data.error || 'Failed to stop timer',
        })
      }
    } catch (error) {
      console.error('Error stopping timer:', error)
      showToast({
        type: 'error',
        title: 'Error',
        message: 'Failed to stop timer',
      })
    } finally {
      setIsStopping(null)
    }
  }

  // Get the timer being confirmed for stop
  const timerToStop = stopConfirmTimerId ? timers.find(t => t._id === stopConfirmTimerId) : null

  // Initial load - only if user has permission
  useEffect(() => {
    if (canViewAllTimers && !permissionsLoading && organizationId) {
      fetchMembers()
      fetchProjects()
      fetchActiveTimers()
    }
  }, [canViewAllTimers, permissionsLoading, organizationId, fetchMembers, fetchProjects, fetchActiveTimers])

  // Auto-refresh every 30 seconds - only if user has permission
  useEffect(() => {
    if (!canViewAllTimers || permissionsLoading) return

    const interval = setInterval(() => {
      if (canViewAllTimers && organizationId) {
        fetchActiveTimers()
      }
    }, 30000)

    return () => clearInterval(interval)
  }, [canViewAllTimers, permissionsLoading, organizationId, fetchActiveTimers])

  // Don't render if permissions are still loading
  if (permissionsLoading) {
    return null
  }

  // Don't render if user doesn't have permission - silently hide widget
  if (!canViewAllTimers) {
    return null
  }

  // Filter members and projects based on search
  const filteredMembers = members.filter(member => {
    if (!employeeSearch) return true
    const searchLower = employeeSearch.toLowerCase()
    return (
      member.firstName.toLowerCase().includes(searchLower) ||
      member.lastName.toLowerCase().includes(searchLower) ||
      member.email.toLowerCase().includes(searchLower)
    )
  })

  const filteredProjects = projects.filter(project => {
    if (!projectSearch) return true
    const searchLower = projectSearch.toLowerCase()
    return project.name.toLowerCase().includes(searchLower)
  })

  const filteredTimers = timers.filter(timer => !timer.isPaused)

  return (
    <Card className="overflow-x-hidden">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-[var(--apple-secondary-label)]" />
            <CardTitle>Active Timers</CardTitle>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={fetchActiveTimers}
            disabled={isLoading}
            className="h-7 w-7 rounded-full"
          >
            <RefreshCw className={`h-3.5 w-3.5 text-[var(--apple-secondary-label)] ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/*
         * Filters — same line, no label.
         * Each SelectContent uses overflow-hidden so only the inner list div
         * creates a scrollbar, eliminating the double-scrollbar issue.
         * All onValueChange / onOpenChange filtering logic is untouched.
         */}
        {/*
         * ── Filters: same line, no label ─────────────────────────────────
         * SelectContent has overflow-hidden (from select.tsx base); the inner
         * max-h div is the ONLY scrollable element → one scrollbar, no double.
         */}
        <div className="flex gap-2">
          {/* Employee filter */}
          <Select
            value={selectedEmployeeId || 'all'}
            onValueChange={(value) => { setSelectedEmployeeId(value === 'all' ? '' : value); setEmployeeSearch('') }}
            onOpenChange={(open) => { if (!open) setEmployeeSearch('') }}
          >
            <SelectTrigger className="flex-1 h-8 text-sm min-w-0">
              <User className="h-3.5 w-3.5 text-[var(--apple-tertiary-label)] mr-1.5 flex-shrink-0" />
              <SelectValue placeholder="Employee" />
            </SelectTrigger>
            <SelectContent>
              {/* Pinned search — not inside any overflow container */}
              <div className="p-2 border-b border-[var(--apple-separator)]">
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-[var(--apple-tertiary-label)]" />
                  <Input
                    placeholder="Search…"
                    value={employeeSearch}
                    onChange={(e) => setEmployeeSearch(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                    className="h-7 pl-7 text-xs bg-white dark:bg-[#3A3A3C] border-[var(--apple-separator)] text-[var(--apple-label)] placeholder:text-[var(--apple-tertiary-label)]"
                  />
                </div>
              </div>
              {/* Single scrollable item list */}
              <div className="max-h-48 overflow-y-auto p-1">
                <SelectItem value="all">All Employees</SelectItem>
                {filteredMembers.length === 0 ? (
                  <div className="px-2 py-4 text-center text-xs text-[var(--apple-secondary-label)]">No employees found</div>
                ) : (
                  filteredMembers.map(member => (
                    <SelectItem key={member._id} value={member._id}>
                      {member.firstName} {member.lastName}
                    </SelectItem>
                  ))
                )}
              </div>
            </SelectContent>
          </Select>

          {/* Project filter */}
          <Select
            value={selectedProjectId || 'all'}
            onValueChange={(value) => { setSelectedProjectId(value === 'all' ? '' : value); setProjectSearch('') }}
            onOpenChange={(open) => { if (!open) setProjectSearch('') }}
          >
            <SelectTrigger className="flex-1 h-8 text-sm min-w-0">
              <FolderOpen className="h-3.5 w-3.5 text-[var(--apple-tertiary-label)] mr-1.5 flex-shrink-0" />
              <SelectValue placeholder="Project" />
            </SelectTrigger>
            <SelectContent>
              <div className="p-2 border-b border-[var(--apple-separator)]">
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-[var(--apple-tertiary-label)]" />
                  <Input
                    placeholder="Search…"
                    value={projectSearch}
                    onChange={(e) => setProjectSearch(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                    className="h-7 pl-7 text-xs bg-white dark:bg-[#3A3A3C] border-[var(--apple-separator)] text-[var(--apple-label)] placeholder:text-[var(--apple-tertiary-label)]"
                  />
                </div>
              </div>
              <div className="max-h-48 overflow-y-auto p-1">
                <SelectItem value="all">All Projects</SelectItem>
                {filteredProjects.length === 0 ? (
                  <div className="px-2 py-4 text-center text-xs text-[var(--apple-secondary-label)]">No projects found</div>
                ) : (
                  filteredProjects.map(project => (
                    <SelectItem key={project._id} value={project._id}>
                      {project.name}
                    </SelectItem>
                  ))
                )}
              </div>
            </SelectContent>
          </Select>
        </div>

        {/* Timers List */}
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-[var(--apple-secondary-label)]" />
          </div>
        ) : filteredTimers.length === 0 ? (
          <div className="text-center py-8 text-sm text-[var(--apple-secondary-label)]">
            No active timers
          </div>
        ) : (
          <div className="space-y-2 max-h-[360px] overflow-y-auto">
            {filteredTimers.map(timer => {
              const derivedMinutes = deriveTimerMinutes(timer)
              const displayTime = displayTimes[timer._id] || formatDuration(derivedMinutes)
              return (
                <div
                  key={timer._id}
                  className="rounded-[var(--apple-radius-md)] p-3 border border-[var(--apple-separator)] hover:bg-[var(--apple-quaternary-fill)] apple-transition space-y-1.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-1">
                        <User className="h-3 w-3 text-[var(--apple-tertiary-label)] flex-shrink-0" />
                        <span className="text-[15px] font-medium text-[var(--apple-label)] truncate">
                          {timer.user.firstName} {timer.user.lastName}
                        </span>
                        {timer.isPaused && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded-[var(--apple-radius-pill)] text-xs font-medium bg-[var(--apple-system-orange)]/15 text-[var(--apple-system-orange)]">
                            Paused
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 text-sm text-[var(--apple-secondary-label)]">
                        <FolderOpen className="h-3 w-3 flex-shrink-0" />
                        <span className="truncate">{timer.project.name}</span>
                      </div>
                      {timer.task && (
                        <div className="text-[13px] text-[var(--apple-secondary-label)] ml-4 truncate" title={timer.task.title}>
                          {timer.task.title}
                        </div>
                      )}
                      {timer.description && (
                        <div className="text-[13px] text-[var(--apple-tertiary-label)] ml-4 truncate" title={timer.description}>
                          {timer.description}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-2 flex-shrink-0">
                      <div className="inline-flex items-center text-[17px] font-timer tabular-nums text-[var(--apple-label)]">
                        {displayTime.split('').map((char, i) =>
                          /[0-9]/.test(char) ? (
                            <span key={`${i}-${char}`} className="number-digit-flip">{char}</span>
                          ) : (
                            <span key={`s${i}`} className="mx-[0.15em] opacity-50 select-none">:</span>
                          )
                        )}
                      </div>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => requestStopTimer(timer._id)}
                        disabled={isStopping === timer._id}
                        className="h-7 px-2 text-xs"
                      >
                        {isStopping === timer._id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <><Square className="h-3 w-3 mr-1" />Stop</>
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>

      {/* Stop Timer Confirmation Dialog */}
      <ConfirmationModal
        isOpen={!!stopConfirmTimerId}
        onClose={() => setStopConfirmTimerId(null)}
        onConfirm={() => stopConfirmTimerId && handleStopTimer(stopConfirmTimerId)}
        title="Stop Timer"
        description={
          <>
            Are you sure you want to stop this timer?
            {timerToStop && (
              <span className="block mt-2 font-medium text-[var(--apple-label)]">
                {timerToStop.user.firstName} {timerToStop.user.lastName} — {timerToStop.project.name}
                {timerToStop.task && ` • ${timerToStop.task.title}`}
              </span>
            )}
          </>
        }
        confirmText="Stop Timer"
        cancelText="Cancel"
        variant="destructive"
      />
    </Card>
  )
}

