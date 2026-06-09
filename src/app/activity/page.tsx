'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { MainLayout } from '@/components/layout/MainLayout'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { GravatarAvatar } from '@/components/ui/GravatarAvatar'
import { useDateTime } from '@/components/providers/DateTimeProvider'
import { useAuthContext } from '@/contexts/AuthContext'
import { cn } from '@/lib/utils'
import { PageContent } from '@/components/ui/PageContent'
import {
  Search,
  RefreshCw,
  Activity,
  CheckCircle,
  Plus,
  Timer,
  Clock,
  Pause,
  Play,
  Edit,
  FolderPlus,
  FolderEdit,
  Zap,
  UserPlus,
  ArrowRightLeft,
  Save,
  X,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ActivityItem {
  id: string
  action: string
  entityType: string
  entityId: string | null
  entityName: string
  projectId: string | null
  projectName: string
  details: Record<string, any>
  user: { _id: string; firstName: string; lastName: string; email: string; avatar?: string } | null
  timestamp: string
}

interface ActivityFilters {
  entityType: string
  action: string
  project: string
  user: string
  dateRange: string
}

// ─── Action Config ────────────────────────────────────────────────────────────

const ACTION_CONFIG: Record<string, { icon: any; label: string; color: string; bg: string }> = {
  timer_started:          { icon: Play,          label: 'started timer',               color: '#34C759', bg: 'rgba(52,199,89,0.12)' },
  timer_stopped:          { icon: Timer,         label: 'stopped timer',               color: '#FF3B30', bg: 'rgba(255,59,48,0.12)' },
  timer_paused:           { icon: Pause,         label: 'paused timer',                color: '#FF9500', bg: 'rgba(255,149,0,0.12)' },
  timer_resumed:          { icon: Play,          label: 'resumed timer',               color: '#007AFF', bg: 'rgba(0,122,255,0.12)' },
  time_entry_saved:       { icon: Save,          label: 'logged time',                 color: '#AF52DE', bg: 'rgba(175,82,222,0.12)' },
  time_entry_updated:     { icon: Edit,          label: 'updated time entry',          color: '#BF5AF2', bg: 'rgba(191,90,242,0.12)' },
  time_entry_deleted:     { icon: X,             label: 'deleted time entry',          color: '#FF453A', bg: 'rgba(255,69,58,0.12)' },
  task_created:           { icon: Plus,          label: 'created task',                color: '#007AFF', bg: 'rgba(0,122,255,0.12)' },
  task_updated:           { icon: Edit,          label: 'updated task',                color: '#FF9500', bg: 'rgba(255,149,0,0.12)' },
  task_assigned:          { icon: UserPlus,      label: 'assigned task',               color: '#5E5CE6', bg: 'rgba(94,92,230,0.12)' },
  task_status_changed:    { icon: ArrowRightLeft,label: 'changed task status',         color: '#32ADE6', bg: 'rgba(50,173,230,0.12)' },
  project_created:        { icon: FolderPlus,    label: 'created project',             color: '#30D158', bg: 'rgba(48,209,88,0.12)' },
  project_updated:        { icon: FolderEdit,    label: 'updated project',             color: '#30B0C7', bg: 'rgba(48,176,199,0.12)' },
  project_member_added:   { icon: UserPlus,      label: 'added member to project',     color: '#34C759', bg: 'rgba(52,199,89,0.12)' },
  project_member_removed: { icon: X,             label: 'removed member from project', color: '#FF453A', bg: 'rgba(255,69,58,0.12)' },
  sprint_created:         { icon: Zap,           label: 'created sprint',              color: '#BF5AF2', bg: 'rgba(191,90,242,0.12)' },
  sprint_updated:         { icon: Edit,          label: 'updated sprint',              color: '#AF52DE', bg: 'rgba(175,82,222,0.12)' },
  sprint_started:         { icon: Play,          label: 'started sprint',              color: '#30D158', bg: 'rgba(48,209,88,0.12)' },
  sprint_completed:       { icon: CheckCircle,   label: 'completed sprint',            color: '#34C759', bg: 'rgba(52,199,89,0.12)' },
  sprint_task_added:      { icon: Plus,          label: 'added task to sprint',        color: '#007AFF', bg: 'rgba(0,122,255,0.12)' },
  sprint_task_removed:    { icon: X,             label: 'removed task from sprint',    color: '#FF453A', bg: 'rgba(255,69,58,0.12)' },
}

const ENTITY_TYPE_LABELS: Record<string, string> = {
  task: 'Task', project: 'Project', sprint: 'Sprint',
  time_entry: 'Time Entry', timer: 'Timer',
}

// ─── Entity type color chips ──────────────────────────────────────────────────

const ENTITY_TYPE_CONFIG: Record<string, { bg: string; text: string; border: string }> = {
  task:       { bg: 'bg-blue-50 dark:bg-blue-950/30',    text: 'text-blue-600 dark:text-blue-400',    border: 'border-blue-200 dark:border-blue-800' },
  project:    { bg: 'bg-emerald-50 dark:bg-emerald-950/30', text: 'text-emerald-600 dark:text-emerald-400', border: 'border-emerald-200 dark:border-emerald-800' },
  sprint:     { bg: 'bg-violet-50 dark:bg-violet-950/30', text: 'text-violet-600 dark:text-violet-400', border: 'border-violet-200 dark:border-violet-800' },
  time_entry: { bg: 'bg-purple-50 dark:bg-purple-950/30', text: 'text-purple-600 dark:text-purple-400', border: 'border-purple-200 dark:border-purple-800' },
  timer:      { bg: 'bg-amber-50 dark:bg-amber-950/30',  text: 'text-amber-600 dark:text-amber-400',  border: 'border-amber-200 dark:border-amber-800' },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDuration(minutes: number): string {
  if (!minutes || minutes <= 0) return '0m'
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  if (h > 0 && m > 0) return `${h}h ${m}m`
  if (h > 0) return `${h}h`
  return `${m}m`
}

function getActionConfig(action: string) {
  return ACTION_CONFIG[action] ?? { icon: Clock, label: action, color: '#8E8E93', bg: 'rgba(142,142,147,0.12)' }
}

function getActivityDescription(activity: ActivityItem): string {
  const details = activity.details || {}
  switch (activity.action) {
    case 'task_status_changed': return `from "${details.oldStatus}" to "${details.newStatus}"`
    case 'task_assigned': return details.assigneeName ? `to ${details.assigneeName}` : ''
    case 'timer_started': case 'timer_paused': case 'timer_resumed': {
      const t = details.taskTitle || activity.entityName
      return t ? `on "${t}"` : ''
    }
    case 'timer_stopped': {
      const parts: string[] = []
      const tn = details.taskTitle || activity.entityName
      if (tn) parts.push(`on "${tn}"`)
      if (details.duration) parts.push(`(${formatDuration(details.duration)})`)
      return parts.join(' ')
    }
    case 'time_entry_saved': {
      const parts: string[] = []
      const tn = details.taskTitle || activity.entityName
      if (tn) parts.push(`on "${tn}"`)
      if (details.duration) parts.push(`— ${formatDuration(details.duration)}`)
      return parts.join(' ')
    }
    case 'project_member_added': case 'project_member_removed':
      return details.memberName ? `— ${details.memberName}` : ''
    default: return ''
  }
}

// ─── Activity Row ─────────────────────────────────────────────────────────────

function ActivityRow({ activity, formatTimestamp }: { activity: ActivityItem; formatTimestamp: (t: string) => string }) {
  const config = getActionConfig(activity.action)
  const ActionIcon = config.icon
  const description = getActivityDescription(activity)
  const entityCfg = ENTITY_TYPE_CONFIG[activity.entityType] ?? ENTITY_TYPE_CONFIG.task
  const showEntity = activity.entityName && !['timer_started', 'timer_stopped', 'timer_paused', 'timer_resumed'].includes(activity.action)

  return (
    <div className={cn(
      'group flex items-start gap-4 px-5 py-4',
      'border-b border-[var(--apple-separator)] last:border-0',
      'apple-transition hover:bg-[var(--apple-quaternary-fill)]',
    )}>
      {/* Avatar + action badge */}
      <div className="relative flex-shrink-0 mt-0.5">
        {activity.user ? (
          <GravatarAvatar
            user={{ avatar: activity.user.avatar, firstName: activity.user.firstName, lastName: activity.user.lastName, email: activity.user.email }}
            size={36}
            className="h-9 w-9"
          />
        ) : (
          <div className="h-9 w-9 rounded-full bg-[var(--apple-tertiary-fill)] flex items-center justify-center">
            <Activity className="h-4 w-4 text-[var(--apple-tertiary-label)]" />
          </div>
        )}
        {/* Action icon badge */}
        <div
          className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full flex items-center justify-center border-[1.5px] border-card"
          style={{ background: config.bg, color: config.color }}
        >
          <ActionIcon className="h-2.5 w-2.5" />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Action sentence */}
        <div className="flex items-center flex-wrap gap-x-1 gap-y-0.5 mb-1 leading-snug">
          <span className="text-[14px] font-semibold text-[var(--apple-label)]">
            {activity.user ? `${activity.user.firstName} ${activity.user.lastName}` : 'System'}
          </span>
          <span className="text-[14px] font-medium" style={{ color: config.color }}>
            {config.label}
          </span>
          {description && (
            <span className="text-[14px] text-[var(--apple-secondary-label)]">{description}</span>
          )}
        </div>

        {/* Entity name */}
        {showEntity && (
          <p className="text-[13px] text-[var(--apple-secondary-label)] font-medium mb-1.5 truncate">
            {activity.details?.displayId ? `${activity.details.displayId} — ` : ''}
            {activity.entityName}
          </p>
        )}

        {/* Meta row */}
        <div className="flex items-center flex-wrap gap-2">
          <span className={cn('inline-flex items-center px-1.5 py-0.5 rounded-[5px] text-[11px] font-medium border capitalize', entityCfg.bg, entityCfg.text, entityCfg.border)}>
            {ENTITY_TYPE_LABELS[activity.entityType] || activity.entityType}
          </span>
          {activity.projectName && (
            <span className="text-[12px] text-[var(--apple-tertiary-label)] truncate max-w-[180px]">
              {activity.projectName}
            </span>
          )}
          <span className="text-[12px] text-[var(--apple-tertiary-label)]">•</span>
          <span className="text-[12px] text-[var(--apple-tertiary-label)] whitespace-nowrap">
            {formatTimestamp(activity.timestamp)}
          </span>
          {activity.details?.duration && (activity.action === 'timer_stopped' || activity.action === 'time_entry_saved') && (
            <>
              <span className="text-[12px] text-[var(--apple-tertiary-label)]">•</span>
              <span className="text-[12px] font-apple-mono font-semibold text-[var(--apple-secondary-label)] tabular-nums">
                {formatDuration(activity.details.duration)}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Timestamp (right-aligned on larger screens) */}
      <div className="hidden sm:block flex-shrink-0 text-[12px] text-[var(--apple-tertiary-label)] pt-0.5 whitespace-nowrap">
        {formatTimestamp(activity.timestamp)}
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ActivityPage() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuthContext()
  const [activities, setActivities] = useState<ActivityItem[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [projects, setProjects] = useState<Array<{ _id: string; name: string }>>([])
  const [projectsLoading, setProjectsLoading] = useState(false)
  const [projectFilterQuery, setProjectFilterQuery] = useState('')
  const [filters, setFilters] = useState<ActivityFilters>({ entityType: 'all', action: 'all', project: 'all', user: 'all', dateRange: 'all' })
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [totalActivities, setTotalActivities] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const { formatDate } = useDateTime()
  const [dataError, setDataError] = useState('')
  const router = useRouter()
  const projectSearchInputRef = useRef<HTMLInputElement | null>(null)

  const focusSearchInput = (el: HTMLInputElement | null) => {
    if (!el || el.disabled) return
    const doFocus = () => { el.focus({ preventScroll: true }); try { el.select?.() } catch {} }
    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(doFocus)
    } else { setTimeout(doFocus, 0) }
  }

  const formatTimestamp = (timestamp: string) => {
    const now = new Date()
    const t = new Date(timestamp)
    const diffMin = Math.floor((now.getTime() - t.getTime()) / (1000 * 60))
    if (diffMin < 1) return 'Just now'
    if (diffMin < 60) return `${diffMin}m ago`
    const diffH = Math.floor(diffMin / 60)
    if (diffH < 24) return `${diffH}h ago`
    const diffD = Math.floor(diffH / 24)
    if (diffD < 7) return `${diffD}d ago`
    return formatDate(t)
  }

  const loadActivities = useCallback(async ({ silent }: { silent?: boolean } = {}) => {
    if (!silent) setIsLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('page', String(currentPage))
      params.set('limit', String(pageSize))
      if (filters.entityType !== 'all') params.set('entityType', filters.entityType)
      if (filters.action !== 'all') params.set('action', filters.action)
      if (filters.project !== 'all') params.set('project', filters.project)
      if (filters.user !== 'all') params.set('user', filters.user)
      if (filters.dateRange !== 'all') params.set('dateRange', filters.dateRange)
      if (searchTerm) params.set('search', searchTerm)
      const response = await fetch(`/api/activity?${params.toString()}`)
      if (response.ok) {
        const data = await response.json()
        setActivities(data.activities || [])
        setTotalActivities(data.pagination?.total || 0)
        setTotalPages(data.pagination?.totalPages || 1)
        setDataError('')
      } else {
        setDataError('Failed to load activity data')
      }
    } catch {
      setDataError('Failed to load activity data')
    } finally {
      if (!silent) setIsLoading(false)
    }
  }, [currentPage, pageSize, filters, searchTerm])

  useEffect(() => {
    if (!authLoading && !isAuthenticated) router.push('/login')
  }, [authLoading, isAuthenticated, router])

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true)
    await loadActivities({ silent: true })
    setIsRefreshing(false)
  }, [loadActivities])

  useEffect(() => {
    if (!authLoading && isAuthenticated && user) loadActivities()
  }, [authLoading, isAuthenticated, user, loadActivities])

  useEffect(() => { setCurrentPage(1) }, [searchTerm, filters.entityType, filters.action, filters.project, filters.user, filters.dateRange])

  useEffect(() => {
    const loadProjects = async () => {
      try {
        setProjectsLoading(true)
        const res = await fetch('/api/projects?limit=1000&page=1')
        if (res.ok) {
          const data = await res.json()
          setProjects((data?.data || []).map((p: any) => ({ _id: p._id, name: p.name })))
        }
      } catch {
        console.error('Failed to load projects for activity filter')
      } finally {
        setProjectsLoading(false)
      }
    }
    loadProjects()
  }, [])

  const filteredProjectOptions = useMemo(() => {
    const q = projectFilterQuery.trim().toLowerCase()
    if (!q) return projects
    return projects.filter((p) => p.name.toLowerCase().includes(q))
  }, [projects, projectFilterQuery])

  const hasActiveFilters = useMemo(() => {
    if (searchTerm.trim()) return true
    return Object.values(filters).some((f) => f !== 'all')
  }, [searchTerm, filters])

  const clearFilters = () => {
    setSearchTerm('')
    setFilters({ entityType: 'all', action: 'all', project: 'all', user: 'all', dateRange: 'all' })
  }

  const pageFrom = totalActivities === 0 ? 0 : ((currentPage - 1) * pageSize) + 1
  const pageTo = totalActivities === 0 ? 0 : Math.min(currentPage * pageSize, totalActivities)

  // ─── Loading ────────────────────────────────────────────────────────────────

  if (authLoading || (isLoading && activities.length === 0)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-3">
          <Activity className="h-8 w-8 animate-pulse mx-auto text-[var(--apple-system-blue)]" />
          <p className="text-[15px] text-[var(--apple-secondary-label)]">Loading activity…</p>
        </div>
      </div>
    )
  }

  if (!user) return null

  return (
    <MainLayout>
      <PageContent>
        <div className="space-y-6">

          {/* ─── Page Header ───────────────────────────────────────────────── */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <h1 className="text-[28px] font-bold tracking-tight leading-tight text-[var(--apple-label)]">
                Team Activity
              </h1>
              <p className="text-[15px] text-[var(--apple-secondary-label)] mt-0.5">
                {totalActivities > 0
                  ? `${totalActivities.toLocaleString()} event${totalActivities !== 1 ? 's' : ''}`
                  : 'Track what your team is working on'}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="flex items-center gap-2 text-sm apple-transition w-full sm:w-auto"
            >
              <RefreshCw className={cn('h-4 w-4', isRefreshing && 'animate-spin')} />
              Refresh
            </Button>
          </div>

          {/* ─── Error banner ──────────────────────────────────────────────── */}
          {dataError && (
            <div className="rounded-[var(--apple-radius-md)] bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 px-4 py-3 flex items-center justify-between gap-3">
              <p className="text-[14px] text-red-700 dark:text-red-400">{dataError}</p>
              <Button variant="outline" size="sm" onClick={handleRefresh} className="flex-shrink-0 text-xs">
                Try Again
              </Button>
            </div>
          )}

          {/* ─── Filter Toolbar ────────────────────────────────────────────── */}
          <div className={cn(
            'rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card overflow-hidden',
            'shadow-[0_1px_4px_rgba(0,0,0,0.06)] dark:shadow-none',
          )}>
            <div className="px-5 py-3 border-b border-[var(--apple-separator)] bg-[var(--apple-tertiary-fill)] flex items-center justify-between">
              <span className="apple-section-label">Filters</span>
              {hasActiveFilters && (
                <button onClick={clearFilters} className="text-[12px] text-[var(--apple-system-blue)] font-medium hover:opacity-75 apple-transition flex items-center gap-1">
                  <X className="h-3 w-3" />
                  Clear all
                </button>
              )}
            </div>
            <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--apple-tertiary-label)] pointer-events-none" />
                <input
                  placeholder="Search activities…"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className={cn(
                    'w-full pl-9 pr-4 h-10 rounded-[var(--apple-radius-md)]',
                    'bg-[var(--apple-tertiary-fill)] border border-transparent',
                    'text-[14px] text-[var(--apple-label)] placeholder:text-[var(--apple-tertiary-label)]',
                    'focus:outline-none focus:ring-2 focus:ring-[var(--apple-system-blue)] focus:ring-offset-0',
                    'apple-transition',
                  )}
                />
              </div>

              {/* Entity type */}
              <Select value={filters.entityType} onValueChange={(v) => setFilters(p => ({ ...p, entityType: v }))}>
                <SelectTrigger className="h-10 text-sm"><SelectValue placeholder="All Types" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="task">Tasks</SelectItem>
                  <SelectItem value="project">Projects</SelectItem>
                  <SelectItem value="sprint">Sprints</SelectItem>
                  <SelectItem value="timer">Timer</SelectItem>
                  <SelectItem value="time_entry">Time Entries</SelectItem>
                </SelectContent>
              </Select>

              {/* Action */}
              <Select value={filters.action} onValueChange={(v) => setFilters(p => ({ ...p, action: v }))}>
                <SelectTrigger className="h-10 text-sm"><SelectValue placeholder="All Actions" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Actions</SelectItem>
                  <SelectItem value="task_created">Task Created</SelectItem>
                  <SelectItem value="task_updated">Task Updated</SelectItem>
                  <SelectItem value="task_assigned">Task Assigned</SelectItem>
                  <SelectItem value="task_status_changed">Status Changed</SelectItem>
                  <SelectItem value="project_created">Project Created</SelectItem>
                  <SelectItem value="project_updated">Project Updated</SelectItem>
                  <SelectItem value="project_member_added">Member Added</SelectItem>
                  <SelectItem value="project_member_removed">Member Removed</SelectItem>
                  <SelectItem value="sprint_created">Sprint Created</SelectItem>
                  <SelectItem value="sprint_started">Sprint Started</SelectItem>
                  <SelectItem value="sprint_completed">Sprint Completed</SelectItem>
                  <SelectItem value="timer_started">Timer Started</SelectItem>
                  <SelectItem value="timer_stopped">Timer Stopped</SelectItem>
                  <SelectItem value="time_entry_saved">Time Logged</SelectItem>
                </SelectContent>
              </Select>

              {/* Project */}
              <Select
                value={filters.project}
                onValueChange={(v) => setFilters(p => ({ ...p, project: v }))}
                onOpenChange={(open) => { if (open) focusSearchInput(projectSearchInputRef.current) }}
              >
                <SelectTrigger className="h-10 text-sm"><SelectValue placeholder="All Projects" /></SelectTrigger>
                <SelectContent className="z-[10050] p-0">
                  <div className="p-2">
                    <div className="relative mb-2">
                      <input
                        ref={projectSearchInputRef}
                        value={projectFilterQuery}
                        onChange={(e) => setProjectFilterQuery(e.target.value)}
                        placeholder="Search projects…"
                        className={cn(
                          'w-full pl-3 pr-8 h-9 rounded-[var(--apple-radius-sm)]',
                          'bg-[var(--apple-tertiary-fill)] border border-[var(--apple-separator)]',
                          'text-[13px] text-[var(--apple-label)] placeholder:text-[var(--apple-tertiary-label)]',
                          'focus:outline-none focus:ring-1 focus:ring-[var(--apple-system-blue)]',
                        )}
                        onKeyDown={(e) => e.stopPropagation()}
                        onMouseDown={(e) => e.stopPropagation()}
                      />
                      {projectFilterQuery && (
                        <button
                          type="button"
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setProjectFilterQuery(''); setFilters(p => ({ ...p, project: 'all' })) }}
                          className="absolute inset-y-0 right-2 flex items-center text-[var(--apple-tertiary-label)] hover:text-[var(--apple-label)]"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                    <div className="max-h-56 overflow-y-auto">
                      <SelectItem value="all">All Projects</SelectItem>
                      {projectsLoading ? (
                        <SelectItem value="loading" disabled>Loading…</SelectItem>
                      ) : filteredProjectOptions.length === 0 ? (
                        projectFilterQuery
                          ? <div className="px-2 py-1.5 text-[12px] text-[var(--apple-tertiary-label)]">No matching projects</div>
                          : <SelectItem value="none" disabled>No projects found</SelectItem>
                      ) : (
                        filteredProjectOptions.map((p) => (
                          <SelectItem key={p._id} value={p._id}>{p.name}</SelectItem>
                        ))
                      )}
                    </div>
                  </div>
                </SelectContent>
              </Select>

              {/* Date range */}
              <Select value={filters.dateRange} onValueChange={(v) => setFilters(p => ({ ...p, dateRange: v }))}>
                <SelectTrigger className="h-10 text-sm"><SelectValue placeholder="All Time" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Time</SelectItem>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="week">This Week</SelectItem>
                  <SelectItem value="month">This Month</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* ─── Activity Feed ─────────────────────────────────────────────── */}
          <div className={cn(
            'rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card overflow-hidden',
            'shadow-[0_1px_4px_rgba(0,0,0,0.07)] dark:shadow-none',
          )}>
            {/* Feed header */}
            <div className="px-5 py-3 border-b border-[var(--apple-separator)] bg-[var(--apple-tertiary-fill)] flex items-center justify-between">
              <span className="apple-section-label">Recent Activity</span>
              {totalActivities > 0 && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[var(--apple-system-blue)] text-white">
                  {totalActivities.toLocaleString()}
                </span>
              )}
            </div>

            {/* Loading overlay */}
            {isLoading && activities.length > 0 && (
              <div className="px-5 py-3 border-b border-[var(--apple-separator)] bg-[var(--apple-quaternary-fill)]">
                <div className="flex items-center gap-2 text-[13px] text-[var(--apple-secondary-label)]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--apple-system-blue)] animate-pulse" />
                  Updating…
                </div>
              </div>
            )}

            {/* Empty */}
            {totalActivities === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
                <div className="h-14 w-14 rounded-[var(--apple-radius-lg)] bg-[var(--apple-tertiary-fill)] flex items-center justify-center">
                  <Activity className="h-7 w-7 text-[var(--apple-tertiary-label)]" />
                </div>
                <div className="space-y-1">
                  <p className="text-[17px] font-semibold text-[var(--apple-label)]">No activities found</p>
                  <p className="text-[15px] text-[var(--apple-secondary-label)] max-w-[260px]">
                    {hasActiveFilters
                      ? 'Try adjusting your search or filters.'
                      : 'Team activity will appear here as members work on projects.'}
                  </p>
                </div>
                {hasActiveFilters && (
                  <Button variant="outline" size="sm" onClick={clearFilters} className="apple-transition">
                    Clear Filters
                  </Button>
                )}
              </div>
            ) : (
              <>
                <div>
                  {activities.map((activity) => (
                    <ActivityRow key={activity.id} activity={activity} formatTimestamp={formatTimestamp} />
                  ))}
                </div>

                {/* Pagination */}
                <div className="px-5 py-4 border-t border-[var(--apple-separator)] flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="flex items-center gap-3 text-[13px] text-[var(--apple-secondary-label)]">
                    <span>Per page:</span>
                    <Select value={pageSize.toString()} onValueChange={(v) => { setPageSize(parseInt(v, 10)); setCurrentPage(1) }}>
                      <SelectTrigger className="w-16 h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {[10, 20, 50, 100].map((n) => (
                          <SelectItem key={n} value={n.toString()}>{n}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <span>Showing {pageFrom}–{pageTo} of {totalActivities.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" disabled={currentPage === 1}
                      onClick={() => setCurrentPage(p => Math.max(p - 1, 1))} className="h-8 text-xs">
                      Previous
                    </Button>
                    <span className="text-[13px] text-[var(--apple-secondary-label)] px-1">
                      {currentPage} / {totalPages}
                    </span>
                    <Button variant="outline" size="sm" disabled={currentPage >= totalPages}
                      onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))} className="h-8 text-xs">
                      Next
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>

        </div>
      </PageContent>
    </MainLayout>
  )
}
