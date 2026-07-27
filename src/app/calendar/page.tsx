'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { MainLayout } from '@/components/layout/MainLayout'
import { formatToTitleCase } from '@/lib/utils'
import { useTaskSync, useTaskState } from '@/hooks/useTaskSync'
import { useNotify } from '@/lib/notify'
import { useDateTime } from '@/components/providers/DateTimeProvider'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useAuthContext } from '@/contexts/AuthContext'
import { usePermissions } from '@/lib/permissions/permission-context'
import { Permission } from '@/lib/permissions/permission-definitions'
import { sanitizeTaskDescriptionHtml } from '@/lib/text/sanitize-task-description'
import {
  Plus,
  Search,
  Calendar,
  Clock,
  Target,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Loader2,
  User,
  CheckCircle2,
  Circle,
  Zap,
  Star,
  Users,
  Flag,
  CalendarDays,
  PlayCircle,
  Filter,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface CalendarEvent {
  _id: string
  title: string
  description: string
  type: 'task' | 'sprint' | 'milestone' | 'meeting' | 'deadline'
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled'
  priority: 'low' | 'medium' | 'high' | 'critical'
  startDate: string
  endDate?: string
  project: {
    _id: string
    name: string
  }
  assignedTo?: {
    firstName: string
    lastName: string
    email: string
  }
  createdBy: {
    firstName: string
    lastName: string
    email: string
  }
  labels: string[]
  createdAt: string
  updatedAt: string
}

// ─── Design Tokens ────────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<string, { color: string; bg: string; label: string; Icon: React.ElementType }> = {
  task:      { color: '#007AFF', bg: 'rgba(0,122,255,0.12)',   label: 'Task',      Icon: Target },
  sprint:    { color: '#34C759', bg: 'rgba(52,199,89,0.12)',   label: 'Sprint',    Icon: Zap },
  milestone: { color: '#AF52DE', bg: 'rgba(175,82,222,0.12)', label: 'Milestone', Icon: Star },
  meeting:   { color: '#FF9500', bg: 'rgba(255,149,0,0.12)',   label: 'Meeting',   Icon: Users },
  deadline:  { color: '#FF3B30', bg: 'rgba(255,59,48,0.12)',   label: 'Deadline',  Icon: Flag },
}

const PRIORITY_BADGE: Record<string, string> = {
  low:      'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  medium:   'bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400',
  high:     'bg-orange-50 text-orange-600 dark:bg-orange-950/40 dark:text-orange-400',
  critical: 'bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400',
}

const STATUS_BADGE: Record<string, string> = {
  scheduled:   'bg-sky-50 text-sky-600 dark:bg-sky-950/40 dark:text-sky-400',
  in_progress: 'bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400',
  completed:   'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400',
  cancelled:   'bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400',
}

// ─── Subcomponents ────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  Icon,
  color,
}: {
  label: string
  value: number
  Icon: React.ElementType
  color: string
}) {
  return (
    <div className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] dark:shadow-none p-4 flex items-center gap-3">
      <Icon className="w-6 h-6 flex-shrink-0" style={{ color }} strokeWidth={1.5} />
      <div className="min-w-0">
        <p className="text-[22px] font-bold tracking-tight font-apple-mono tabular-nums leading-none">{value}</p>
        <p className="text-[12px] text-[var(--apple-secondary-label)] mt-0.5">{label}</p>
      </div>
    </div>
  )
}

function EventPill({ event, onClick }: { event: CalendarEvent; onClick: () => void }) {
  const cfg = TYPE_CONFIG[event.type] ?? TYPE_CONFIG.task
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick() }}
      className="w-full text-left text-[11px] font-medium px-1.5 py-0.5 rounded-[5px] truncate apple-transition hover:opacity-80 leading-5"
      style={{ background: cfg.bg, color: cfg.color, borderLeft: `2.5px solid ${cfg.color}` }}
      title={event.title}
    >
      {event.title}
    </button>
  )
}

function EventCard({ event, onClick, detailed = false }: { event: CalendarEvent; onClick: () => void; detailed?: boolean }) {
  const cfg = TYPE_CONFIG[event.type] ?? TYPE_CONFIG.task
  const { Icon } = cfg
  return (
    <div
      className="group rounded-[var(--apple-radius-md)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] dark:shadow-none hover:shadow-[0_8px_28px_rgba(0,0,0,0.11)] dark:hover:shadow-[0_8px_28px_rgba(0,0,0,0.40)] hover:-translate-y-0.5 apple-transition cursor-pointer overflow-hidden"
      onClick={onClick}
      style={{ borderLeft: `3px solid ${cfg.color}` }}
    >
      <div className="p-3.5">
        <div className="flex items-start gap-2.5">
          <Icon className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: cfg.color }} strokeWidth={1.5} />
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-foreground truncate">{event.title}</p>
            {detailed && event.description && (
              <div
                className="text-[12px] text-[var(--apple-secondary-label)] mt-0.5 line-clamp-2 [&_p]:inline [&_p:empty]:hidden"
                dangerouslySetInnerHTML={{ __html: sanitizeTaskDescriptionHtml(event.description) || '' }}
              />
            )}
            <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
              <span
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium"
                style={{ background: cfg.bg, color: cfg.color }}
              >
                {cfg.label}
              </span>
              <span className={`inline-flex px-1.5 py-0.5 rounded-full text-[10px] font-medium ${PRIORITY_BADGE[event.priority] ?? ''}`}>
                {formatToTitleCase(event.priority)}
              </span>
              {event.status && (
                <span className={`inline-flex px-1.5 py-0.5 rounded-full text-[10px] font-medium ${STATUS_BADGE[event.status] ?? ''}`}>
                  {formatToTitleCase(event.status)}
                </span>
              )}
            </div>
            {detailed && (
              <div className="flex flex-wrap items-center gap-3 mt-2 text-[11px] text-[var(--apple-tertiary-label)]">
                {event.startDate && (
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" strokeWidth={1.5} />
                    {new Date(event.startDate).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
                {event.project && (
                  <span className="flex items-center gap-1 truncate">
                    <Target className="w-3 h-3 flex-shrink-0" strokeWidth={1.5} />
                    <span className="truncate">{event.project.name}</span>
                  </span>
                )}
                {event.assignedTo && (
                  <span className="flex items-center gap-1 truncate">
                    <User className="w-3 h-3 flex-shrink-0" strokeWidth={1.5} />
                    <span className="truncate">{event.assignedTo.firstName} {event.assignedTo.lastName}</span>
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function DayEventCard({ event, onClick }: { event: CalendarEvent; onClick: () => void }) {
  const cfg = TYPE_CONFIG[event.type] ?? TYPE_CONFIG.task
  const { Icon } = cfg
  return (
    <div
      className="group rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] dark:shadow-none hover:shadow-[0_8px_28px_rgba(0,0,0,0.11)] dark:hover:shadow-[0_8px_28px_rgba(0,0,0,0.40)] hover:-translate-y-0.5 apple-transition cursor-pointer overflow-hidden"
      onClick={onClick}
    >
      <div className="flex items-stretch">
        <div className="w-1 flex-shrink-0 rounded-l-[var(--apple-radius-lg)]" style={{ background: cfg.color }} />
        <div className="flex-1 p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <Icon className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: cfg.color }} strokeWidth={1.5} />
            <div className="flex-1 min-w-0">
              <h4 className="text-[15px] font-semibold text-foreground">{event.title}</h4>
              {event.description && (
                <div
                  className="text-[13px] text-[var(--apple-secondary-label)] mt-1 line-clamp-3 [&_p]:inline [&_p:empty]:hidden"
                  dangerouslySetInnerHTML={{ __html: sanitizeTaskDescriptionHtml(event.description) || '' }}
                />
              )}
              <div className="flex flex-wrap gap-1.5 mt-2.5">
                <span
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium"
                  style={{ background: cfg.bg, color: cfg.color }}
                >
                  <Icon className="w-3 h-3" strokeWidth={1.5} />
                  {cfg.label}
                </span>
                <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium ${PRIORITY_BADGE[event.priority] ?? ''}`}>
                  {formatToTitleCase(event.priority)}
                </span>
                {event.status && (
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium ${STATUS_BADGE[event.status] ?? ''}`}>
                    {formatToTitleCase(event.status)}
                  </span>
                )}
              </div>
              <div className="flex flex-col sm:flex-row flex-wrap gap-2 sm:gap-4 mt-3 pt-3 border-t border-[var(--apple-separator)] text-[12px] text-[var(--apple-secondary-label)]">
                {event.startDate && (
                  <span className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" strokeWidth={1.5} />
                    {new Date(event.startDate).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
                {event.project && (
                  <span className="flex items-center gap-1.5 min-w-0">
                    <Target className="w-3.5 h-3.5 flex-shrink-0" strokeWidth={1.5} />
                    <span className="truncate">{event.project.name}</span>
                  </span>
                )}
                {event.assignedTo && (
                  <span className="flex items-center gap-1.5 min-w-0">
                    <User className="w-3.5 h-3.5 flex-shrink-0" strokeWidth={1.5} />
                    <span className="truncate">{event.assignedTo.firstName} {event.assignedTo.lastName}</span>
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function EmptyCalendar({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <CalendarDays className="w-10 h-10 mb-4 text-[var(--apple-system-blue)]" strokeWidth={1.5} />
      <p className="text-[15px] font-semibold text-foreground mb-1">No Events Found</p>
      <p className="text-[13px] text-[var(--apple-secondary-label)] max-w-xs">{message}</p>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CalendarPage() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuthContext()
  const router = useRouter()
  const { hasPermission } = usePermissions()
  const canCreateTask = hasPermission(Permission.TASK_CREATE)
  const { formatDate } = useDateTime()
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [priorityFilter, setPriorityFilter] = useState('all')
  const [viewMode, setViewMode] = useState<'month' | 'week' | 'day'>('month')
  const [currentDate, setCurrentDate] = useState(new Date())
  const [showFilters, setShowFilters] = useState(false)

  const hasActiveFilters = searchQuery !== '' || typeFilter !== 'all' || statusFilter !== 'all' || priorityFilter !== 'all'

  const resetFilters = () => {
    setSearchQuery('')
    setTypeFilter('all')
    setStatusFilter('all')
    setPriorityFilter('all')
  }

  const {
    tasks: events,
    setTasks: setEvents,
    isLoading: taskLoading,
    error: taskError,
    handleTaskUpdate,
    handleTaskCreate,
    handleTaskDelete,
  } = useTaskState([])

  const { error: notifyError } = useNotify()

  const { isConnected, startPolling, stopPolling } = useTaskSync({
    onTaskUpdate: handleTaskUpdate,
    onTaskCreate: handleTaskCreate,
    onTaskDelete: handleTaskDelete,
  })

  const fetchEvents = useCallback(async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/calendar')
      const data = await response.json()
      if (data.success) {
        setEvents(data.data)
      } else {
        notifyError({ title: 'Failed to Load Calendar', message: data.error || 'Failed to fetch calendar events' })
      }
    } catch {
      notifyError({ title: 'Failed to Load Calendar', message: 'Failed to fetch calendar events' })
    } finally {
      setLoading(false)
    }
  }, [notifyError])

  useEffect(() => {
    if (!authLoading && isAuthenticated && user) {
      fetchEvents()
      startPolling()
    } else if (!authLoading && !isAuthenticated) {
      stopPolling()
      router.push('/login')
    }
    return () => { stopPolling() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, isAuthenticated])

  useEffect(() => {
    if (taskError) notifyError({ title: 'Task Synchronization Error', message: taskError })
  }, [taskError, notifyError])

  const filteredEvents = events.filter(event => {
    const q = searchQuery.toLowerCase()
    const matchesSearch = !q ||
      event.title.toLowerCase().includes(q) ||
      event.description?.toLowerCase().includes(q) ||
      event.project?.name?.toLowerCase().includes(q)
    return matchesSearch &&
      (typeFilter === 'all' || event.type === typeFilter) &&
      (statusFilter === 'all' || event.status === statusFilter) &&
      (priorityFilter === 'all' || event.priority === priorityFilter)
  })

  const getEventsForDate = (date: Date) => {
    return filteredEvents.filter(e => {
      const evDate = new Date(e.startDate)
      return evDate.getFullYear() === date.getFullYear() &&
        evDate.getMonth() === date.getMonth() &&
        evDate.getDate() === date.getDate()
    })
  }

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear()
    const month = date.getMonth()
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)
    const days: (Date | null)[] = []
    for (let i = 0; i < firstDay.getDay(); i++) days.push(null)
    for (let d = 1; d <= lastDay.getDate(); d++) days.push(new Date(year, month, d))
    return days
  }

  const getDaysInWeek = (date: Date) => {
    const days: Date[] = []
    const start = new Date(date)
    start.setDate(date.getDate() - date.getDay())
    for (let i = 0; i < 7; i++) {
      const d = new Date(start)
      d.setDate(start.getDate() + i)
      days.push(d)
    }
    return days
  }

  const navigate = (dir: 'prev' | 'next') => {
    setCurrentDate(prev => {
      const d = new Date(prev)
      const delta = dir === 'prev' ? -1 : 1
      if (viewMode === 'month') d.setMonth(d.getMonth() + delta)
      else if (viewMode === 'week') d.setDate(d.getDate() + delta * 7)
      else d.setDate(d.getDate() + delta)
      return d
    })
  }

  const getViewTitle = () => {
    if (viewMode === 'month') return currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    if (viewMode === 'week') {
      const days = getDaysInWeek(currentDate)
      return `${days[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${days[6].toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
    }
    return currentDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
  }

  const isToday = (date: Date) => {
    const t = new Date()
    return date.getFullYear() === t.getFullYear() &&
      date.getMonth() === t.getMonth() &&
      date.getDate() === t.getDate()
  }

  const handleEventClick = (event: CalendarEvent) => {
    if (event.type === 'sprint') router.push(`/sprints/${event._id}`)
    else router.push(`/tasks/${event._id}`)
  }

  // Stats
  const totalEvents = filteredEvents.length
  const scheduledCount = filteredEvents.filter(e => e.status === 'scheduled').length
  const inProgressCount = filteredEvents.filter(e => e.status === 'in_progress').length
  const completedCount = filteredEvents.filter(e => e.status === 'completed').length

  // ─── Loading ─────────────────────────────────────────────────────────────────

  if (loading || taskLoading) {
    return (
      <MainLayout>
        <div className="space-y-8">
          {/* Header skeleton */}
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-[var(--apple-radius-lg)] bg-[var(--apple-tertiary-fill)] animate-pulse flex-shrink-0" />
            <div className="space-y-2 flex-1">
              <div className="h-7 w-36 bg-[var(--apple-tertiary-fill)] animate-pulse rounded-lg" />
              <div className="h-4 w-56 bg-[var(--apple-tertiary-fill)] animate-pulse rounded-lg" />
            </div>
          </div>
          {/* Stats skeleton */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-[var(--apple-radius-sm)] bg-[var(--apple-tertiary-fill)] animate-pulse" />
                <div className="space-y-1.5">
                  <div className="h-5 w-10 bg-[var(--apple-tertiary-fill)] animate-pulse rounded" />
                  <div className="h-3 w-20 bg-[var(--apple-tertiary-fill)] animate-pulse rounded" />
                </div>
              </div>
            ))}
          </div>
          {/* Calendar skeleton */}
          <div className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] p-6">
            <div className="flex items-center justify-center py-24">
              <div className="text-center">
                <Loader2 className="h-8 w-8 animate-spin mx-auto mb-3 text-[var(--apple-system-blue)]" strokeWidth={1.5} />
                <p className="text-[13px] text-[var(--apple-secondary-label)]">Loading calendar…</p>
              </div>
            </div>
          </div>
        </div>
      </MainLayout>
    )
  }

  // ─── Main render ─────────────────────────────────────────────────────────────

  return (
    <MainLayout>
      <TooltipProvider>
        <div className="space-y-6 pb-8">

          {/* ── Page Header ─────────────────────────────────────────────────── */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Calendar className="h-8 w-8 flex-shrink-0 text-[var(--apple-chart-to)]" strokeWidth={1.5} />
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-[28px] sm:text-[30px] font-bold tracking-tight text-[var(--apple-label)]">Calendar</h1>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span
                        className={`w-2 h-2 rounded-full flex-shrink-0 ${isConnected ? 'bg-[var(--apple-system-green)]' : 'bg-[var(--apple-system-red)]'}`}
                        style={isConnected ? { animation: 'status-pulse 2s ease-in-out infinite' } : undefined}
                      />
                    </TooltipTrigger>
                    <TooltipContent>
                      {isConnected ? 'Real-time sync active' : 'Real-time sync inactive'}
                    </TooltipContent>
                  </Tooltip>
                </div>
                <p className="text-[13px] text-[var(--apple-secondary-label)] mt-0.5">Timeline and schedule management</p>
              </div>
            </div>
            {canCreateTask && (
              <Button
                onClick={() => router.push('/tasks/create-new-task')}
                className="w-full sm:w-auto h-10 px-4 text-[13px] font-medium rounded-full bg-[var(--apple-system-blue)] hover:bg-[var(--apple-system-blue)]/90 text-white border-0 flex-shrink-0"
              >
                <Plus className="w-4 h-4 mr-1.5" strokeWidth={1.5} />
                New Task
              </Button>
            )}
          </div>

          {/* ── Stats Bar ───────────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="card-fade-in card-fade-in-delay-1">
              <StatCard label="Total Events" value={totalEvents} Icon={CalendarDays} color="var(--apple-chart-to)" />
            </div>
            <div className="card-fade-in card-fade-in-delay-2">
              <StatCard label="Scheduled" value={scheduledCount} Icon={Circle} color="#30B0C7" />
            </div>
            <div className="card-fade-in card-fade-in-delay-3">
              <StatCard label="In Progress" value={inProgressCount} Icon={PlayCircle} color="#FF9500" />
            </div>
            <div className="card-fade-in card-fade-in-delay-4">
              <StatCard label="Completed" value={completedCount} Icon={CheckCircle2} color="#34C759" />
            </div>
          </div>

          {/* ── Filter Toolbar ──────────────────────────────────────────────── */}
          <div className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] dark:shadow-none p-3 sm:p-4 space-y-3">
            <div className="flex items-center gap-2">
              {/* Search */}
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--apple-tertiary-label)] pointer-events-none" strokeWidth={1.5} />
                <Input
                  placeholder="Search events, projects…"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="pl-9 h-9 text-[13px] rounded-[var(--apple-radius-sm)] border-[var(--apple-separator)] bg-[var(--apple-tertiary-fill)] focus:bg-background"
                />
              </div>
              {/* Filter toggle */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => setShowFilters(v => !v)}
                    className={`flex-shrink-0 h-9 w-9 rounded-[var(--apple-radius-sm)] border flex items-center justify-center apple-transition ${showFilters || hasActiveFilters ? 'border-[var(--apple-system-blue)] bg-[var(--apple-system-blue)]/10 text-[var(--apple-system-blue)]' : 'border-[var(--apple-separator)] bg-[var(--apple-tertiary-fill)] text-[var(--apple-secondary-label)] hover:text-foreground'}`}
                  >
                    <Filter className="w-4 h-4" strokeWidth={1.5} />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Filters</TooltipContent>
              </Tooltip>
              {/* Reset */}
              {hasActiveFilters && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={resetFilters}
                      className="flex-shrink-0 h-9 w-9 rounded-[var(--apple-radius-sm)] border border-[var(--apple-separator)] bg-[var(--apple-tertiary-fill)] text-[var(--apple-secondary-label)] hover:text-foreground flex items-center justify-center apple-transition"
                    >
                      <RotateCcw className="w-3.5 h-3.5" strokeWidth={1.5} />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Reset filters</TooltipContent>
                </Tooltip>
              )}
            </div>

            {/* Expanded filter row */}
            {showFilters && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger className="h-9 text-[13px] rounded-[var(--apple-radius-sm)] border-[var(--apple-separator)] bg-[var(--apple-tertiary-fill)]">
                    <SelectValue placeholder="All Types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="task">Tasks</SelectItem>
                    <SelectItem value="sprint">Sprints</SelectItem>
                    <SelectItem value="milestone">Milestones</SelectItem>
                    <SelectItem value="meeting">Meetings</SelectItem>
                    <SelectItem value="deadline">Deadlines</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="h-9 text-[13px] rounded-[var(--apple-radius-sm)] border-[var(--apple-separator)] bg-[var(--apple-tertiary-fill)]">
                    <SelectValue placeholder="All Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="scheduled">Scheduled</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                  <SelectTrigger className="h-9 text-[13px] rounded-[var(--apple-radius-sm)] border-[var(--apple-separator)] bg-[var(--apple-tertiary-fill)]">
                    <SelectValue placeholder="All Priority" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Priority</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Count row */}
            <div className="flex items-center justify-between pt-0.5">
              <p className="text-[12px] text-[var(--apple-secondary-label)]">
                {filteredEvents.length} event{filteredEvents.length !== 1 ? 's' : ''} {hasActiveFilters ? 'match filters' : 'total'}
              </p>
            </div>
          </div>

          {/* ── Calendar Panel ──────────────────────────────────────────────── */}
          <div className="rounded-[var(--apple-radius-xl)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] dark:shadow-none overflow-hidden">

            {/* Calendar header / nav */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 sm:px-5 py-3.5 border-b border-[var(--apple-separator)] bg-[var(--apple-tertiary-fill)]/50">
              {/* Date nav */}
              <div className="flex items-center gap-1">
                <button
                  onClick={() => navigate('prev')}
                  className="w-8 h-8 rounded-[var(--apple-radius-sm)] flex items-center justify-center text-[var(--apple-secondary-label)] hover:bg-[var(--apple-quaternary-fill)] hover:text-foreground apple-transition"
                >
                  <ChevronLeft className="w-4 h-4" strokeWidth={1.5} />
                </button>
                <span className="text-[15px] font-semibold text-foreground px-2 min-w-[200px] text-center">
                  {getViewTitle()}
                </span>
                <button
                  onClick={() => navigate('next')}
                  className="w-8 h-8 rounded-[var(--apple-radius-sm)] flex items-center justify-center text-[var(--apple-secondary-label)] hover:bg-[var(--apple-quaternary-fill)] hover:text-foreground apple-transition"
                >
                  <ChevronRight className="w-4 h-4" strokeWidth={1.5} />
                </button>
              </div>

              {/* Right controls */}
              <div className="flex items-center gap-2">
                {/* Today button */}
                {(() => {
                  const t = new Date()
                  const active =
                    viewMode === 'day' ? isToday(currentDate) :
                    viewMode === 'week' ? getDaysInWeek(currentDate).some(d => isToday(d)) :
                    currentDate.getMonth() === t.getMonth() && currentDate.getFullYear() === t.getFullYear()
                  return (
                    <button
                      onClick={() => setCurrentDate(new Date())}
                      className={`h-8 px-3 text-[12px] font-medium rounded-[var(--apple-radius-sm)] border apple-transition ${
                        active
                          ? 'border-[var(--apple-system-blue)] bg-[var(--apple-system-blue)] text-white'
                          : 'border-[var(--apple-separator)] bg-background text-foreground hover:bg-[var(--apple-quaternary-fill)]'
                      }`}
                    >
                      Today
                    </button>
                  )
                })()}

                {/* Segmented view mode control */}
                <div className="flex items-center p-0.5 rounded-[var(--apple-radius-sm)] bg-[var(--apple-tertiary-fill)] border border-[var(--apple-separator)]">
                  {(['month', 'week', 'day'] as const).map(mode => (
                    <button
                      key={mode}
                      onClick={() => setViewMode(mode)}
                      className={`px-3 h-7 text-[12px] font-medium rounded-[6px] apple-transition ${
                        viewMode === mode
                          ? 'bg-white dark:bg-zinc-700 text-foreground shadow-sm'
                          : 'text-[var(--apple-secondary-label)] hover:text-foreground'
                      }`}
                    >
                      {mode.charAt(0).toUpperCase() + mode.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* ── Month View ──────────────────────────────────────────────── */}
            {viewMode === 'month' && (
              <>
                {/* Desktop month grid */}
                <div className="hidden lg:block p-4">
                  {/* Day-of-week headers */}
                  <div className="grid grid-cols-7 mb-1">
                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                      <div key={d} className="py-2 text-center text-[11px] font-semibold tracking-[0.06em] uppercase text-[var(--apple-secondary-label)]">
                        {d}
                      </div>
                    ))}
                  </div>
                  {/* Day cells */}
                  <div className="grid grid-cols-7 gap-1">
                    {getDaysInMonth(currentDate).map((date, idx) => {
                      if (!date) return <div key={idx} className="min-h-[110px]" />
                      const dayEvents = getEventsForDate(date)
                      const today = isToday(date)
                      return (
                        <div
                          key={idx}
                          className={`min-h-[110px] rounded-[var(--apple-radius-md)] p-2 border apple-transition ${
                            today
                              ? 'border-[var(--apple-system-blue)]/40 bg-[var(--apple-system-blue)]/5'
                              : 'border-[var(--apple-separator)] hover:bg-[var(--apple-quaternary-fill)]'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1.5">
                            <span
                              className={`text-[13px] font-semibold leading-none flex-shrink-0 ${
                                today
                                  ? 'w-6 h-6 rounded-full bg-[var(--apple-system-blue)] text-white flex items-center justify-center text-[12px]'
                                  : 'text-[var(--apple-label)]'
                              }`}
                            >
                              {date.getDate()}
                            </span>
                            {dayEvents.length > 0 && (
                              <span className="text-[10px] font-medium text-[var(--apple-secondary-label)] tabular-nums">
                                {dayEvents.length}
                              </span>
                            )}
                          </div>
                          <div className="space-y-0.5">
                            {dayEvents.slice(0, 3).map(ev => (
                              <EventPill key={ev._id} event={ev} onClick={() => handleEventClick(ev)} />
                            ))}
                            {dayEvents.length > 3 && (
                              <p className="text-[10px] text-[var(--apple-secondary-label)] px-1">
                                +{dayEvents.length - 3} more
                              </p>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Mobile agenda view */}
                <div className="lg:hidden p-4">
                  {filteredEvents.length === 0 ? (
                    <EmptyCalendar message="No events match your current filters. Try adjusting the search or filter options." />
                  ) : (() => {
                    const grouped: Record<string, CalendarEvent[]> = {}
                    filteredEvents.forEach(ev => {
                      const key = new Date(ev.startDate).toLocaleDateString('en-US')
                      if (!grouped[key]) grouped[key] = []
                      grouped[key].push(ev)
                    })
                    return (
                      <div className="space-y-4">
                        {Object.entries(grouped)
                          .sort(([a], [b]) => new Date(a).getTime() - new Date(b).getTime())
                          .map(([dateStr, evs]) => {
                            const d = new Date(dateStr)
                            const today = isToday(d)
                            return (
                              <div key={dateStr}>
                                <div className={`flex items-center gap-2 mb-2 px-1`}>
                                  <div
                                    className={`w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-bold flex-shrink-0 ${today ? 'bg-[var(--apple-system-blue)] text-white' : 'bg-[var(--apple-tertiary-fill)] text-foreground'}`}
                                  >
                                    {d.getDate()}
                                  </div>
                                  <div>
                                    <p className={`text-[12px] font-semibold ${today ? 'text-[var(--apple-system-blue)]' : 'text-foreground'}`}>
                                      {d.toLocaleDateString('en-US', { weekday: 'long' })}
                                    </p>
                                    <p className="text-[11px] text-[var(--apple-secondary-label)]">
                                      {d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                                    </p>
                                  </div>
                                </div>
                                <div className="space-y-2 pl-9">
                                  {evs.map(ev => (
                                    <EventCard key={ev._id} event={ev} onClick={() => handleEventClick(ev)} detailed />
                                  ))}
                                </div>
                              </div>
                            )
                          })}
                      </div>
                    )
                  })()}
                </div>
              </>
            )}

            {/* ── Week View ───────────────────────────────────────────────── */}
            {viewMode === 'week' && (
              <>
                {/* Desktop week grid */}
                <div className="hidden lg:block p-4">
                  <div className="grid grid-cols-7 gap-2">
                    {getDaysInWeek(currentDate).map((date, idx) => {
                      const dayEvents = getEventsForDate(date)
                      const today = isToday(date)
                      return (
                        <div key={idx} className="flex flex-col">
                          {/* Day header */}
                          <div className={`text-center pb-2 mb-2 border-b ${today ? 'border-[var(--apple-system-blue)]/30' : 'border-[var(--apple-separator)]'}`}>
                            <p className={`text-[11px] font-semibold tracking-[0.06em] uppercase ${today ? 'text-[var(--apple-system-blue)]' : 'text-[var(--apple-secondary-label)]'}`}>
                              {date.toLocaleDateString('en-US', { weekday: 'short' })}
                            </p>
                            <div
                              className={`mx-auto mt-1 w-7 h-7 rounded-full flex items-center justify-center text-[13px] font-bold ${
                                today ? 'bg-[var(--apple-system-blue)] text-white' : 'text-foreground'
                              }`}
                            >
                              {date.getDate()}
                            </div>
                          </div>
                          {/* Events */}
                          <div className="space-y-1.5 min-h-[300px]">
                            {dayEvents.length === 0 ? (
                              <div className="h-full flex items-center justify-center">
                                <p className="text-[11px] text-[var(--apple-tertiary-label)]">—</p>
                              </div>
                            ) : (
                              dayEvents.map(ev => (
                                <EventCard key={ev._id} event={ev} onClick={() => handleEventClick(ev)} />
                              ))
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Mobile week list */}
                <div className="lg:hidden p-4">
                  {(() => {
                    const weekDays = getDaysInWeek(currentDate)
                    const hasAny = weekDays.some(d => getEventsForDate(d).length > 0)
                    if (!hasAny) {
                      return <EmptyCalendar message="No events scheduled for this week. Navigate to a different week or adjust your filters." />
                    }
                    return (
                      <div className="space-y-5">
                        {weekDays.map(date => {
                          const dayEvents = getEventsForDate(date)
                          const today = isToday(date)
                          return (
                            <div key={date.toISOString()}>
                              <div className="flex items-center gap-2 mb-2">
                                <div
                                  className={`w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-bold flex-shrink-0 ${today ? 'bg-[var(--apple-system-blue)] text-white' : 'bg-[var(--apple-tertiary-fill)] text-foreground'}`}
                                >
                                  {date.getDate()}
                                </div>
                                <p className={`text-[13px] font-semibold ${today ? 'text-[var(--apple-system-blue)]' : 'text-foreground'}`}>
                                  {date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
                                </p>
                              </div>
                              {dayEvents.length === 0 ? (
                                <p className="text-[12px] text-[var(--apple-tertiary-label)] pl-9 mb-1">No events</p>
                              ) : (
                                <div className="space-y-2 pl-9">
                                  {dayEvents.map(ev => (
                                    <EventCard key={ev._id} event={ev} onClick={() => handleEventClick(ev)} detailed />
                                  ))}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )
                  })()}
                </div>
              </>
            )}

            {/* ── Day View ────────────────────────────────────────────────── */}
            {viewMode === 'day' && (
              <div className="p-4 sm:p-5">
                {(() => {
                  const dayEvents = getEventsForDate(currentDate)
                  if (dayEvents.length === 0) {
                    return <EmptyCalendar message="Nothing scheduled for today. Try navigating to a different day or clearing your filters." />
                  }
                  return (
                    <div className="space-y-3">
                      {dayEvents.map(ev => (
                        <DayEventCard key={ev._id} event={ev} onClick={() => handleEventClick(ev)} />
                      ))}
                    </div>
                  )
                })()}
              </div>
            )}

          </div>

          {/* ── Legend ──────────────────────────────────────────────────────── */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-1">
            <p className="text-[11px] font-semibold tracking-[0.06em] uppercase text-[var(--apple-secondary-label)]">Event Types</p>
            {Object.entries(TYPE_CONFIG).map(([key, cfg]) => (
              <div key={key} className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: cfg.color }} />
                <span className="text-[12px] text-[var(--apple-secondary-label)]">{cfg.label}</span>
              </div>
            ))}
          </div>

        </div>
      </TooltipProvider>
    </MainLayout>
  )
}
