'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { MainLayout } from '@/components/layout/MainLayout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { GravatarAvatar } from '@/components/ui/GravatarAvatar'
import { useDateTime } from '@/components/providers/DateTimeProvider'
import { useAuthContext } from '@/contexts/AuthContext'
import {
  ArrowLeft,
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
  X
} from 'lucide-react'
import { PageContent } from '@/components/ui/PageContent'

interface ActivityItem {
  id: string
  action: string
  entityType: string
  entityId: string | null
  entityName: string
  projectId: string | null
  projectName: string
  details: Record<string, any>
  user: {
    _id: string
    firstName: string
    lastName: string
    email: string
    avatar?: string
  } | null
  timestamp: string
}

interface ActivityFilters {
  entityType: string
  action: string
  project: string
  user: string
  dateRange: string
}

const ACTION_CONFIG: Record<string, { icon: any; label: string; color: string }> = {
  timer_started: { icon: Play, label: 'started timer', color: 'text-green-500' },
  timer_stopped: { icon: Timer, label: 'stopped timer', color: 'text-red-500' },
  timer_paused: { icon: Pause, label: 'paused timer', color: 'text-yellow-500' },
  timer_resumed: { icon: Play, label: 'resumed timer', color: 'text-blue-500' },
  time_entry_saved: { icon: Save, label: 'logged time', color: 'text-purple-500' },
  time_entry_updated: { icon: Edit, label: 'updated time entry', color: 'text-purple-400' },
  time_entry_deleted: { icon: X, label: 'deleted time entry', color: 'text-red-400' },
  task_created: { icon: Plus, label: 'created task', color: 'text-blue-500' },
  task_updated: { icon: Edit, label: 'updated task', color: 'text-orange-500' },
  task_assigned: { icon: UserPlus, label: 'assigned task', color: 'text-indigo-500' },
  task_status_changed: { icon: ArrowRightLeft, label: 'changed task status', color: 'text-cyan-500' },
  project_created: { icon: FolderPlus, label: 'created project', color: 'text-emerald-500' },
  project_updated: { icon: FolderEdit, label: 'updated project', color: 'text-teal-500' },
  project_member_added: { icon: UserPlus, label: 'added member to project', color: 'text-emerald-400' },
  project_member_removed: { icon: X, label: 'removed member from project', color: 'text-red-400' },
  sprint_created: { icon: Zap, label: 'created sprint', color: 'text-violet-500' },
  sprint_updated: { icon: Edit, label: 'updated sprint', color: 'text-violet-400' },
  sprint_started: { icon: Play, label: 'started sprint', color: 'text-green-600' },
  sprint_completed: { icon: CheckCircle, label: 'completed sprint', color: 'text-green-500' },
  sprint_task_added: { icon: Plus, label: 'added task to sprint', color: 'text-blue-400' },
  sprint_task_removed: { icon: X, label: 'removed task from sprint', color: 'text-red-400' },
}

const ENTITY_TYPE_LABELS: Record<string, string> = {
  task: 'Task',
  project: 'Project',
  sprint: 'Sprint',
  time_entry: 'Time Entry',
  timer: 'Timer',
}

function formatDuration(minutes: number): string {
  if (!minutes || minutes <= 0) return '0m'
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  if (h > 0 && m > 0) return `${h}h ${m}m`
  if (h > 0) return `${h}h`
  return `${m}m`
}

export default function ActivityPage() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuthContext()

  const [activities, setActivities] = useState<ActivityItem[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [projects, setProjects] = useState<Array<{ _id: string; name: string }>>([])
  const [projectsLoading, setProjectsLoading] = useState(false)
  const [projectFilterQuery, setProjectFilterQuery] = useState('')
  const [filters, setFilters] = useState<ActivityFilters>({
    entityType: 'all',
    action: 'all',
    project: 'all',
    user: 'all',
    dateRange: 'all'
  })
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [totalActivities, setTotalActivities] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const { formatDate } = useDateTime()
  const [dataError, setDataError] = useState('')
  const router = useRouter()

  // Helper function to focus filter search inputs
  const focusSearchInput = (el: HTMLInputElement | null) => {
    if (!el || el.disabled) return

    const doFocus = () => {
      el.focus({ preventScroll: true })
      try {
        el.select?.()
      } catch {
        // ignore
      }
    }

    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(doFocus)
    } else {
      setTimeout(doFocus, 0)
    }
  }

  // Filter search input ref
  const projectSearchInputRef = useRef<HTMLInputElement | null>(null)

  const getActionConfig = (action: string) => {
    return ACTION_CONFIG[action] || { icon: Clock, label: action, color: 'text-muted-foreground' }
  }

  const formatTimestamp = (timestamp: string) => {
    const now = new Date()
    const activityTime = new Date(timestamp)
    const diffInMinutes = Math.floor((now.getTime() - activityTime.getTime()) / (1000 * 60))


    if (diffInMinutes < 1) return 'Just now'
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`


    const diffInHours = Math.floor(diffInMinutes / 60)
    if (diffInHours < 24) return `${diffInHours}h ago`


    const diffInDays = Math.floor(diffInHours / 24)
    if (diffInDays < 7) return `${diffInDays}d ago`


    return formatDate(activityTime)
  }

  const getActivityDescription = (activity: ActivityItem): string => {
    const details = activity.details || {}

    switch (activity.action) {
      case 'task_status_changed':
        return `from "${details.oldStatus}" to "${details.newStatus}"`
      case 'task_assigned':
        return details.assigneeName ? `to ${details.assigneeName}` : ''
      case 'timer_started':
      case 'timer_paused':
      case 'timer_resumed': {
        const taskName = details.taskTitle || activity.entityName
        return taskName ? `on "${taskName}"` : ''
      }
      case 'timer_stopped': {
        const parts: string[] = []
        const stopTaskName = details.taskTitle || activity.entityName
        if (stopTaskName) parts.push(`on "${stopTaskName}"`)
        if (details.duration) parts.push(`(${formatDuration(details.duration)})`)
        return parts.join(' ')
      }
      case 'time_entry_saved': {
        const entryParts: string[] = []
        const entryTaskName = details.taskTitle || activity.entityName
        if (entryTaskName) entryParts.push(`on "${entryTaskName}"`)
        if (details.duration) entryParts.push(`— ${formatDuration(details.duration)}`)
        return entryParts.join(' ')
      }
      case 'project_member_added':
        return details.memberName ? `— ${details.memberName}` : ''
      case 'project_member_removed':
        return details.memberName ? `— ${details.memberName}` : ''
      case 'sprint_started':
      case 'sprint_completed':
        return ''
      default:
        return ''
    }
  }

  const loadActivities = useCallback(async ({ silent }: { silent?: boolean } = {}) => {
    const shouldShowLoader = !silent
    if (shouldShowLoader) setIsLoading(true)
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
    } catch (error) {
      console.error('Failed to load activity data:', error)
      setDataError('Failed to load activity data')
    } finally {
      if (shouldShowLoader) setIsLoading(false)
    }
  }, [currentPage, pageSize, filters, searchTerm])

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/login')
    }
  }, [authLoading, isAuthenticated, router])

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true)
    await loadActivities({ silent: true })
    setIsRefreshing(false)
  }, [loadActivities])

  // Load activities when auth is ready or filters change
  useEffect(() => {
    if (!authLoading && isAuthenticated && user) {
      loadActivities()
    }
  }, [authLoading, isAuthenticated, user, loadActivities])

  useEffect(() => {
    setCurrentPage(1)
  }, [
    searchTerm,
    filters.entityType,
    filters.action,
    filters.project,
    filters.user,
    filters.dateRange
  ])

  // Load projects for the Project filter dropdown
  useEffect(() => {
    const loadProjects = async () => {
      try {
        setProjectsLoading(true)
        const res = await fetch('/api/projects?limit=1000&page=1')
        if (res.ok) {
          const data = await res.json()
          const items = (data?.data || []).map((p: any) => ({ _id: p._id, name: p.name }))
          setProjects(items)
        }
      } catch (e) {
        console.error('Failed to load projects for activity filter:', e)
      } finally {
        setProjectsLoading(false)
      }
    }
    loadProjects()
  }, [])

  // Filtered project options based on search query
  const filteredProjectOptions = useMemo(() => {
    const query = projectFilterQuery.trim().toLowerCase()
    if (!query) return projects
    return projects.filter((project) => project.name.toLowerCase().includes(query))
  }, [projects, projectFilterQuery])

  const hasActiveFilters = useMemo(() => {
    if (searchTerm.trim()) return true
    return Object.values(filters).some((f) => f !== 'all')
  }, [searchTerm, filters])

  const pageStartIndex = totalActivities === 0 ? 0 : ((currentPage - 1) * pageSize) + 1
  const pageEndIndex = totalActivities === 0 ? 0 : Math.min(currentPage * pageSize, totalActivities)

  if (authLoading || (isLoading && activities.length === 0)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Activity className="h-8 w-8 animate-pulse mx-auto mb-4 text-primary" />
          <p className="text-muted-foreground">Loading activity...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <p className="text-muted-foreground">No user data available</p>
        </div>
      </div>
    )
  }

  return (
    <MainLayout>
      <PageContent>
        <div className="space-y-8">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => router.back()}
                className="gap-2"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
              <div>
                <h1 className="text-3xl font-bold">Team Activity</h1>
                <p className="text-muted-foreground">View all team activities and updates</p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="gap-2"
            >
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>

          {dataError && (
            <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
              <p className="text-destructive text-sm">{dataError}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                className="mt-2"
              >
                Try Again
              </Button>
            </div>
          )}

          {/* Filters */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Filters</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Search</label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search activities..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Type</label>
                  <Select value={filters.entityType} onValueChange={(value) => setFilters(prev => ({ ...prev, entityType: value }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Types</SelectItem>
                      <SelectItem value="task">Tasks</SelectItem>
                      <SelectItem value="project">Projects</SelectItem>
                      <SelectItem value="sprint">Sprints</SelectItem>
                      <SelectItem value="timer">Timer</SelectItem>
                      <SelectItem value="time_entry">Time Entries</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Action</label>
                  <Select value={filters.action} onValueChange={(value) => setFilters(prev => ({ ...prev, action: value }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
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
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Project</label>
                  <Select value={filters.project} onValueChange={(value) => setFilters(prev => ({ ...prev, project: value }))} onOpenChange={(open) => {
                    if (open) focusSearchInput(projectSearchInputRef.current)
                  }}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="z-[10050] p-0">
                      <div className="p-2">
                        <div className="relative mb-2">
                          <Input
                            ref={projectSearchInputRef}
                            value={projectFilterQuery}
                            onChange={(e) => setProjectFilterQuery(e.target.value)}
                            placeholder="Search projects"
                            className="pr-10"
                            onKeyDown={(e) => e.stopPropagation()}
                            onMouseDown={(e) => e.stopPropagation()}
                          />
                          {projectFilterQuery && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault()
                                e.stopPropagation()
                                setProjectFilterQuery('')
                                setFilters(prev => ({ ...prev, project: 'all' }))
                              }}
                              className="absolute inset-y-0 right-0 flex items-center px-2 text-muted-foreground hover:text-foreground"
                              aria-label="Clear project filter"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                        <div className="max-h-56 overflow-y-auto">
                          <SelectItem value="all">All Projects</SelectItem>
                          {projectsLoading ? (
                            <SelectItem value="loading" disabled>Loading projects...</SelectItem>
                          ) : filteredProjectOptions.length === 0 ? (
                            projectFilterQuery ? (
                              <div className="px-2 py-1 text-xs text-muted-foreground">No matching projects</div>
                            ) : (
                              <SelectItem value="none" disabled>No projects found</SelectItem>
                            )
                          ) : (
                            filteredProjectOptions.map((p) => (
                              <SelectItem key={p._id} value={p._id}>{p.name}</SelectItem>
                            ))
                          )}
                        </div>
                      </div>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Date Range</label>
                  <Select value={filters.dateRange} onValueChange={(value) => setFilters(prev => ({ ...prev, dateRange: value }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Time</SelectItem>
                      <SelectItem value="today">Today</SelectItem>
                      <SelectItem value="week">This Week</SelectItem>
                      <SelectItem value="month">This Month</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Activities List */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Recent Activities</CardTitle>
                <Badge variant="secondary">
                  {totalActivities} activities
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              {totalActivities === 0 ? (
                <div className="text-center py-12">
                  <div className="p-4 bg-muted/50 rounded-full w-16 h-16 mx-auto mb-4 flex items-center justify-center">
                    <Activity className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">No activities found</h3>
                  <p className="text-muted-foreground mb-6">
                    {hasActiveFilters
                      ? 'Try adjusting your search or filters'
                      : 'Team activity will appear here as members work on projects and tasks.'
                    }
                  </p>
                  {hasActiveFilters && (
                    <Button
                      variant="outline"
                      onClick={() => {
                        setSearchTerm('')
                        setFilters({
                          entityType: 'all',
                          action: 'all',
                          project: 'all',
                          user: 'all',
                          dateRange: 'all'
                        })
                      }}
                    >
                      Clear Filters
                    </Button>
                  )}
                </div>
              ) : (
                <>
                  <div className="space-y-4">
                    {activities.map((activity) => {
                      const config = getActionConfig(activity.action)
                      const ActionIcon = config.icon
                      const description = getActivityDescription(activity)

                      return (
                        <div
                          key={activity.id}
                          className="flex items-start gap-4 p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                        >
                          <div className="relative flex-shrink-0">
                            {activity.user ? (
                              <GravatarAvatar
                                user={{
                                  avatar: activity.user.avatar,
                                  firstName: activity.user.firstName,
                                  lastName: activity.user.lastName,
                                  email: activity.user.email
                                }}
                                size={40}
                                className="h-10 w-10"
                              />
                            ) : (
                              <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                                <Activity className="h-5 w-5 text-muted-foreground" />
                              </div>
                            )}
                            <div className={`absolute -bottom-1 -right-1 p-1 bg-background border border-border rounded-full ${config.color}`}>
                              <ActionIcon className="h-3 w-3" />
                            </div>
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center flex-wrap gap-x-1.5 gap-y-0.5 mb-1">
                              <span className="font-semibold text-foreground">
                                {activity.user ? `${activity.user.firstName} ${activity.user.lastName}` : 'System'}
                              </span>
                              <span className={`text-sm font-medium ${config.color}`}>
                                {config.label}
                              </span>
                              {description && (
                                <span className="text-sm text-muted-foreground">
                                  {description}
                                </span>
                              )}
                            </div>

                            {activity.entityName && !['timer_started', 'timer_stopped', 'timer_paused', 'timer_resumed'].includes(activity.action) && (
                              <p className="text-sm text-foreground/80 mb-1.5 font-medium truncate">
                                {activity.details?.displayId ? `${activity.details.displayId} — ` : ''}
                                {activity.entityName}
                              </p>
                            )}

                            <div className="flex items-center flex-wrap gap-2 text-xs text-muted-foreground">
                              <Badge variant="outline" className="text-xs capitalize">
                                {ENTITY_TYPE_LABELS[activity.entityType] || activity.entityType}
                              </Badge>
                              {activity.projectName && (
                                <span>{activity.projectName}</span>
                              )}
                              <span>•</span>
                              <span>{formatTimestamp(activity.timestamp)}</span>
                              {activity.details?.duration && (activity.action === 'timer_stopped' || activity.action === 'time_entry_saved') && (
                                <>
                                  <span>•</span>
                                  <span className="font-medium">{formatDuration(activity.details.duration)}</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  <div className="flex flex-col md:flex-row items-center justify-between gap-4 mt-6 pt-4 border-t">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span>Items per page:</span>
                      <Select
                        value={pageSize.toString()}
                        onValueChange={(value) => {
                          setPageSize(parseInt(value, 10))
                          setCurrentPage(1)
                        }}
                      >
                        <SelectTrigger className="w-24 h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="10">10</SelectItem>
                          <SelectItem value="20">20</SelectItem>
                          <SelectItem value="50">50</SelectItem>
                          <SelectItem value="100">100</SelectItem>
                        </SelectContent>
                      </Select>
                      <span>
                        Showing {pageStartIndex} to {pageEndIndex} of {totalActivities}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                        disabled={currentPage === 1}
                        variant="outline"
                        size="sm"
                      >
                        Previous
                      </Button>
                      <span className="text-sm text-muted-foreground px-2">
                        Page {currentPage} of {totalPages}
                      </span>
                      <Button
                        onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                        disabled={currentPage >= totalPages}
                        variant="outline"
                        size="sm"
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </PageContent>
    </MainLayout>
  )
}
