'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useDebounce } from '@/hooks/useDebounce'
import { useAuth } from '@/hooks/useAuth'
import { useDateTime } from '@/components/providers/DateTimeProvider'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/Badge'
import { MainLayout } from '@/components/layout/MainLayout'
import {
  Calendar,
  Clock,
  Users,
  Plus,
  Search,
  List,
  Edit,
  Trash2,
  Eye,
  MoreVertical,
  X,
  RotateCcw,
  Target,
  Zap,
} from 'lucide-react'
import { AddSprintEventModal } from '@/components/sprint-events/AddSprintEventModal'
import { EditSprintEventModal } from '@/components/sprint-events/EditSprintEventModal'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/DropdownMenu'
import { useNotify } from '@/lib/notify'
import { useBreadcrumb } from '@/contexts/BreadcrumbContext'
import { ConfirmationModal } from '@/components/ui/ConfirmationModal'
import { usePermissions } from '@/lib/permissions/permission-context'
import { Permission } from '@/lib/permissions/permission-definitions'
import { PermissionGate } from '@/lib/permissions/permission-components'
import { focusSearchInput, formatToTitleCase, cn } from '@/lib/utils'
import {
  StatusBadge,
  PageHeader,
  TasksEmptyState,
  CardGridSkeleton,
  PaginationBar,
  MetaChip,
  FullPageLoader,
  ViewSwitcher,
} from '@/components/tasks/TasksShared'

interface SprintEvent {
  _id: string
  eventType: string
  title: string
  description?: string
  scheduledDate: string
  startTime?: string
  endTime?: string
  actualDate?: string
  duration: number
  status: string
  facilitator: {
    _id: string
    firstName: string
    lastName: string
    email: string
  }
  attendees: Array<{
    _id: string
    firstName: string
    lastName: string
    email: string
  }>
  outcomes?: {
    decisions: string[]
    actionItems: Array<{
      description: string
      assignedTo: string | {
        _id: string
        firstName: string
        lastName: string
        email: string
      }
      dueDate: string
      status: string
    }>
    notes: string
    velocity?: number
    capacity?: number
  }
  location?: string
  meetingLink?: string
  sprint: {
    _id: string
    name: string
    status: string
  }
  project: {
    _id: string
    name: string
  }
  attachments?: Array<{
    name: string
    url: string
    size: number
    type: string
  }>
}

interface Project {
  _id: string
  name: string
}

const EVENT_ICONS: Record<string, { icon: React.ReactNode; color: string; bg: string }> = {
  planning:      { icon: <Target className="h-5 w-5" strokeWidth={1.5} />,    color: 'text-blue-600 dark:text-blue-400',     bg: 'bg-blue-50 dark:bg-blue-950/30' },
  review:        { icon: <Eye className="h-5 w-5" strokeWidth={1.5} />,       color: 'text-amber-600 dark:text-amber-400',   bg: 'bg-amber-50 dark:bg-amber-950/30' },
  retrospective: { icon: <RotateCcw className="h-5 w-5" strokeWidth={1.5} />, color: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-50 dark:bg-purple-950/30' },
  standup:       { icon: <Users className="h-5 w-5" strokeWidth={1.5} />,     color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-950/30' },
  daily_standup: { icon: <Users className="h-5 w-5" strokeWidth={1.5} />,     color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-950/30' },
  grooming:      { icon: <List className="h-5 w-5" strokeWidth={1.5} />,      color: 'text-sky-600 dark:text-sky-400',       bg: 'bg-sky-50 dark:bg-sky-950/30' },
  demo:          { icon: <Zap className="h-5 w-5" strokeWidth={1.5} />,       color: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-50 dark:bg-orange-950/30' },
}
const defaultEventStyle = {
  icon: <Calendar className="h-5 w-5" strokeWidth={1.5} />,
  color: 'text-gray-600 dark:text-gray-400',
  bg: 'bg-gray-50 dark:bg-gray-900/40',
}

export default function SprintEventsPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, isLoading: authLoading, isAuthenticated } = useAuth()
  const { formatDate, formatTime } = useDateTime()
  const { setItems } = useBreadcrumb()
  const projectId = params.id as string
  const [events, setEvents] = useState<SprintEvent[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterType, setFilterType] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterProject, setFilterProject] = useState('all')
  const [filterSprint, setFilterSprint] = useState('all')
  const [projectQuery, setProjectQuery] = useState('')

  // Check if any filters are active
  const hasActiveFilters = searchTerm !== '' ||
                          filterType !== 'all' ||
                          filterStatus !== 'all' ||
                          filterProject !== 'all' ||
                          filterSprint !== 'all'

  // Reset all filters
  const resetFilters = () => {
    setSearchTerm('')
    setFilterType('all')
    setFilterStatus('all')
    setFilterProject('all')
    setFilterSprint('all')
    setProjectQuery('')
  }

  // Debounced search (300ms delay)
  const debouncedSearchTerm = useDebounce(searchTerm, 300)

  // Request cancellation
  const abortControllerRef = useRef<AbortController | null>(null)

  // Simple cache for API responses (2 minute TTL)
  const cacheRef = useRef<{
    events?: { data: SprintEvent[]; timestamp: number }
    projects?: { data: Project[]; timestamp: number }
  }>({})
  const CACHE_DURATION = 2 * 60 * 1000 // 2 minutes
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingEvent, setEditingEvent] = useState<SprintEvent | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [eventToDelete, setEventToDelete] = useState<SprintEvent | null>(null)
  const [isDeletingEvent, setIsDeletingEvent] = useState(false)
  const { success: notifySuccess, error: notifyError } = useNotify()
  const { hasPermission } = usePermissions()
  const projectFilterSearchRef = useRef<HTMLInputElement>(null)

  // Define fetch functions BEFORE useEffect that uses them
  const fetchProjects = useCallback(async (signal?: AbortSignal) => {
    // Check cache first
    const cached = cacheRef.current.projects
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      setProjects(cached.data)
      return
    }

    try {
      const response = await fetch('/api/projects', { signal })
      if (signal?.aborted) return

      if (response.ok) {
        const data = await response.json()
        // API returns { success: true, data: [...projects], pagination: {...} }
        const projectsData = data.data || []
        setProjects(projectsData)
        // Update cache
        cacheRef.current.projects = { data: projectsData, timestamp: Date.now() }
      } else {
        console.error('Failed to fetch projects:', response.status)
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return
      console.error('Error fetching projects:', error)
    }
  }, [])

  const fetchSprintEvents = useCallback(async (signal?: AbortSignal, forceRefresh = false) => {
    try {
      setLoading(true)
      const url = projectId ? `/api/sprint-events?projectId=${projectId}` : '/api/sprint-events'

      // Check cache first (unless force refresh is requested)
      const cacheKey = projectId || 'all'
      const cached = cacheRef.current.events
      if (!forceRefresh && cached && Date.now() - cached.timestamp < CACHE_DURATION) {
        setEvents(cached.data)
        setLoading(false)
        return
      }

      const response = await fetch(url, { signal })
      if (signal?.aborted) return

      if (response.ok) {
        const data = await response.json()
        setEvents(data)
        // Update cache
        cacheRef.current.events = { data, timestamp: Date.now() }
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return
      console.error('Error fetching sprint events:', error)
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/login')
      return
    }
  }, [authLoading, isAuthenticated, router])

  useEffect(() => {
    // Set breadcrumb
    setItems([
      { label: 'Sprint Events' }
    ])
  }, [setItems])

  useEffect(() => {
    if (!isAuthenticated) return

    // Cancel any pending requests
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }

    abortControllerRef.current = new AbortController()
    const signal = abortControllerRef.current.signal

    // Fetch data in parallel
    const fetchAllData = async () => {
      const promises: Promise<void>[] = [fetchSprintEvents(signal)]
      if (!projectId) {
        promises.push(fetchProjects(signal))
      }
      await Promise.all(promises)
    }

    fetchAllData()

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [projectId, isAuthenticated, fetchSprintEvents, fetchProjects])

  // Check for success/error messages from URL query parameters
  useEffect(() => {
    const successParam = searchParams?.get('success')
    const errorParam = searchParams?.get('error')

    if (successParam === 'created') {
      notifySuccess({ title: 'Sprint Event Created', message: 'Sprint Event created successfully' })
      router.replace('/sprint-events', { scroll: false })
    } else if (successParam === 'updated') {
      notifySuccess({ title: 'Sprint Event Updated', message: 'Sprint Event updated successfully' })
      router.replace('/sprint-events', { scroll: false })
    } else if (errorParam) {
      notifyError({ title: 'Error', message: decodeURIComponent(errorParam) })
      router.replace('/sprint-events', { scroll: false })
    }
  }, [searchParams, router])

  const handleEventAdded = () => {
    // Invalidate cache and force refresh
    cacheRef.current.events = undefined
    fetchSprintEvents(undefined, true)
    setShowAddModal(false)
  }

  const handleEventUpdated = () => {
    // Invalidate cache and force refresh
    cacheRef.current.events = undefined
    fetchSprintEvents(undefined, true)
    setEditingEvent(null)
  }

  const handleDeleteClick = (event: SprintEvent) => {
    setEventToDelete(event)
    setShowDeleteConfirm(true)
  }

  const handleDeleteConfirm = async () => {
    if (!eventToDelete) return

    try {
      setIsDeletingEvent(true)
      const response = await fetch(`/api/sprint-events/view-sprint-event/${eventToDelete._id}`, {
        method: 'DELETE'
      })
      if (response.ok) {
        // Invalidate cache and force refresh
        cacheRef.current.events = undefined
        await fetchSprintEvents(undefined, true)
        notifySuccess({ title: 'Sprint event deleted successfully' })
      } else {
        const errorData = await response.json()
        notifyError({ title: errorData.error || 'Failed to delete sprint event' })
      }
    } catch (error) {
      console.error('Error deleting sprint event:', error)
      notifyError({ title: 'Failed to delete sprint event' })
    } finally {
      setIsDeletingEvent(false)
      setShowDeleteConfirm(false)
      setEventToDelete(null)
    }
  }

  const handleDeleteCancel = () => {
    if (isDeletingEvent) return
    setShowDeleteConfirm(false)
    setEventToDelete(null)
  }

  const getEventTypeIcon = (eventType: string) => {
    switch (eventType) {
      case 'planning':
        return <Calendar className="h-4 w-4" strokeWidth={1.5} />
      case 'review':
        return <Eye className="h-4 w-4" strokeWidth={1.5} />
      case 'retrospective':
        return <Users className="h-4 w-4" strokeWidth={1.5} />
      case 'daily_standup':
        return <Clock className="h-4 w-4" strokeWidth={1.5} />
      case 'demo':
        return <Zap className="h-4 w-4" strokeWidth={1.5} />
      default:
        return <Calendar className="h-4 w-4" strokeWidth={1.5} />
    }
  }

  const formatDateTime = (date: string, startTime?: string, endTime?: string) => {
    const dateStr = formatDate(date)
    if (startTime && endTime) {
      return `${dateStr} • ${startTime} - ${endTime}`
    }
    return dateStr
  }

  // Optimized filtering with memoization and debouncing
  const filteredEvents = useMemo(() => {
    return events.filter(event => {
      const matchesSearch =
        !debouncedSearchTerm.trim() ||
        event.title.toLowerCase().includes(debouncedSearchTerm.toLowerCase()) ||
        event.description?.toLowerCase().includes(debouncedSearchTerm.toLowerCase())

      const matchesType = filterType === 'all' || event.eventType === filterType
      const matchesStatus = filterStatus === 'all' || event.status === filterStatus
      const matchesProject = filterProject === 'all' || event.project?._id === filterProject
      const matchesSprint = filterSprint === 'all' || event.sprint?._id === filterSprint


      return matchesSearch && matchesType && matchesStatus && matchesProject && matchesSprint
    })
  }, [events, debouncedSearchTerm, filterType, filterStatus, filterProject, filterSprint])

  // Pagination derived data
  const totalCount = filteredEvents.length
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))

  const paginatedEvents = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize
    return filteredEvents.slice(startIndex, startIndex + pageSize)
  }, [filteredEvents, currentPage, pageSize])

  // Reset page when filters/search change so we don't get empty pages
  useEffect(() => {
    setCurrentPage(1)
  }, [debouncedSearchTerm, filterType, filterStatus, filterProject])

  if (authLoading) {
    return (
      <MainLayout>
        <FullPageLoader label="Loading sprint events..." />
      </MainLayout>
    )
  }

  if (!isAuthenticated) {
    return (
      <MainLayout>
        <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
          <Calendar className="h-12 w-12 text-[var(--apple-tertiary-label)]" strokeWidth={1.5} />
          <h2 className="text-[22px] font-semibold text-[var(--apple-label)]">Authentication Required</h2>
          <p className="text-[15px] text-[var(--apple-secondary-label)]">Please log in to access sprint events.</p>
          <Button
            onClick={() => router.push('/login')}
            className="rounded-full bg-[var(--apple-system-blue)] text-white text-[15px] font-semibold px-4 h-9 hover:opacity-90 apple-transition"
          >
            Go to Login
          </Button>
        </div>
      </MainLayout>
    )
  }

  if (loading) {
    return (
      <MainLayout>
        <FullPageLoader label="Loading sprint events..." />
      </MainLayout>
    )
  }

  return (
    <MainLayout>
      <div className="space-y-6 overflow-x-hidden animate-in fade-in-0 duration-300">

        {/* Page Header */}
        <PageHeader
          title="Sprint Events"
          subtitle="Plan and track your sprint ceremonies"
          icon={Calendar}
          iconGradient="var(--apple-card-gradient)"
          iconGlow="var(--apple-chart-glow)"
          actions={
            <PermissionGate permission={Permission.SPRINT_EVENT_VIEW_ALL}>
              <Button
                onClick={() => setShowAddModal(true)}
                className="rounded-full bg-[var(--apple-system-blue)] text-white text-[15px] font-semibold px-4 h-9 hover:opacity-90 apple-transition"
              >
                <Plus className="h-4 w-4 mr-2" strokeWidth={1.5} />
                Add Event
              </Button>
            </PermissionGate>
          }
        />

        {/* ── Filter Toolbar ───────────────────────────────────────────────── */}

        {/* Row 1: Search (50%) + Type (25%) + Status (25%) — Desktop */}
        <div className="hidden sm:flex items-center gap-2">
            <div className="relative w-1/2">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--apple-tertiary-label)]" />
                <input
                    placeholder="Search events..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-9 h-10 rounded-full border border-[var(--apple-separator)] bg-[var(--apple-quaternary-fill)] text-[15px] placeholder:text-[var(--apple-tertiary-label)] focus:outline-none focus:border-[var(--apple-system-blue)] focus:ring-2 focus:ring-[var(--apple-system-blue)]/20 apple-transition text-[var(--apple-label)]"
                />
                {searchTerm && (
                    <button
                        type="button"
                        onClick={() => setSearchTerm('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--apple-tertiary-label)] hover:text-[var(--apple-label)] apple-transition"
                        aria-label="Clear search"
                    >
                        <X className="h-4 w-4" strokeWidth={1.5} />
                    </button>
                )}
            </div>

            <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="w-1/4 h-10 rounded-full border-[var(--apple-separator)] bg-[var(--apple-quaternary-fill)] text-[14px]">
                    <SelectValue placeholder="Event Type" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="planning">Planning</SelectItem>
                    <SelectItem value="review">Review</SelectItem>
                    <SelectItem value="retrospective">Retrospective</SelectItem>
                    <SelectItem value="daily_standup">Daily Standup</SelectItem>
                    <SelectItem value="demo">Demo</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                </SelectContent>
            </Select>

            <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-1/4 h-10 rounded-full border-[var(--apple-separator)] bg-[var(--apple-quaternary-fill)] text-[14px]">
                    <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="scheduled">Scheduled</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
            </Select>
        </div>

        {/* Row 1: Mobile layout (stack) */}
        <div className="flex sm:hidden flex-col gap-2">
            <div className="relative w-full">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--apple-tertiary-label)]" />
                <input
                    placeholder="Search events..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-9 h-10 rounded-full border border-[var(--apple-separator)] bg-[var(--apple-quaternary-fill)] text-[15px] placeholder:text-[var(--apple-tertiary-label)] focus:outline-none focus:border-[var(--apple-system-blue)] focus:ring-2 focus:ring-[var(--apple-system-blue)]/20 apple-transition text-[var(--apple-label)]"
                />
                {searchTerm && (
                    <button
                        type="button"
                        onClick={() => setSearchTerm('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--apple-tertiary-label)] hover:text-[var(--apple-label)] apple-transition"
                        aria-label="Clear search"
                    >
                        <X className="h-4 w-4" strokeWidth={1.5} />
                    </button>
                )}
            </div>
            <div className="flex gap-2">
                <Select value={filterType} onValueChange={setFilterType}>
                    <SelectTrigger className="w-1/2 h-10 rounded-full border-[var(--apple-separator)] bg-[var(--apple-quaternary-fill)] text-[14px]">
                        <SelectValue placeholder="Event Type" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Types</SelectItem>
                        <SelectItem value="planning">Planning</SelectItem>
                        <SelectItem value="review">Review</SelectItem>
                        <SelectItem value="retrospective">Retrospective</SelectItem>
                        <SelectItem value="daily_standup">Daily Standup</SelectItem>
                        <SelectItem value="demo">Demo</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                </Select>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                    <SelectTrigger className="w-1/2 h-10 rounded-full border-[var(--apple-separator)] bg-[var(--apple-quaternary-fill)] text-[14px]">
                        <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Statuses</SelectItem>
                        <SelectItem value="scheduled">Scheduled</SelectItem>
                        <SelectItem value="in_progress">In Progress</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
                        <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                </Select>
            </div>
        </div>

        {/* Row 2: Secondary Filters (Grid 20% each on Desktop, 2 cols on mobile) */}
        {!projectId && (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mt-2">
                <Select
                  value={filterProject}
                  onValueChange={setFilterProject}
                  onOpenChange={(open) => {
                    if (open) {
                      setProjectQuery('')
                      focusSearchInput(projectFilterSearchRef.current)
                    }
                  }}
                >
                  <SelectTrigger className="h-9 rounded-full border-[var(--apple-separator)] bg-background text-[13px]">
                    <SelectValue placeholder="All Projects" />
                  </SelectTrigger>
                  <SelectContent className="z-[10050] p-0">
                    <div className="p-2">
                      <Input
                        ref={projectFilterSearchRef}
                        value={projectQuery}
                        onChange={(e) => setProjectQuery(e.target.value)}
                        placeholder="Search projects..."
                        className="mb-2 h-8 text-[13px]"
                        onKeyDown={(e) => e.stopPropagation()}
                        autoFocus
                      />
                      <div className="max-h-56 overflow-y-auto">
                        <SelectItem value="all">All Projects</SelectItem>
                        {projects
                          .filter(p =>
                            !projectQuery.trim() ||
                            p.name.toLowerCase().includes(projectQuery.toLowerCase())
                          )
                          .map((project) => (
                            <SelectItem key={project._id} value={project._id}>
                              {project.name}
                            </SelectItem>
                          ))}
                        {projects.filter(p =>
                          !projectQuery.trim() ||
                          p.name.toLowerCase().includes(projectQuery.toLowerCase())
                        ).length === 0 && projectQuery.trim() && (
                          <div className="px-2 py-1 text-[13px] text-[var(--apple-secondary-label)]">No matching projects</div>
                        )}
                      </div>
                    </div>
                  </SelectContent>
                </Select>
            </div>
        )}

        {/* Row 3: Active Filters & Clear */}
        {(filterStatus !== 'all' || filterType !== 'all' || filterProject !== 'all' || filterSprint !== 'all' || searchTerm) && (
            <div className="flex flex-wrap items-center justify-between gap-2 mt-3 pt-3 border-t border-[var(--apple-separator)]">
                <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[12px] font-medium text-[var(--apple-secondary-label)] uppercase tracking-wider mr-1">
                        Active Filters:
                    </span>
                    {searchTerm && (
                        <Badge variant="secondary" className="bg-[var(--apple-system-blue)]/10 text-[var(--apple-system-blue)] border-0 text-[12px] font-medium px-2.5 py-0.5 rounded-full flex items-center gap-1">
                            Search: {searchTerm}
                            <button onClick={() => setSearchTerm('')} className="hover:opacity-70 ml-1"><X className="h-3 w-3" strokeWidth={1.5} /></button>
                        </Badge>
                    )}
                    {filterType !== 'all' && (
                        <Badge variant="secondary" className="bg-[var(--apple-system-blue)]/10 text-[var(--apple-system-blue)] border-0 text-[12px] font-medium px-2.5 py-0.5 rounded-full flex items-center gap-1">
                            Type: {formatToTitleCase(filterType)}
                            <button onClick={() => setFilterType('all')} className="hover:opacity-70 ml-1"><X className="h-3 w-3" strokeWidth={1.5} /></button>
                        </Badge>
                    )}
                    {filterStatus !== 'all' && (
                        <Badge variant="secondary" className="bg-[var(--apple-system-blue)]/10 text-[var(--apple-system-blue)] border-0 text-[12px] font-medium px-2.5 py-0.5 rounded-full flex items-center gap-1">
                            Status: {formatToTitleCase(filterStatus)}
                            <button onClick={() => setFilterStatus('all')} className="hover:opacity-70 ml-1"><X className="h-3 w-3" strokeWidth={1.5} /></button>
                        </Badge>
                    )}
                    {filterProject !== 'all' && (
                        <Badge variant="secondary" className="bg-[var(--apple-system-blue)]/10 text-[var(--apple-system-blue)] border-0 text-[12px] font-medium px-2.5 py-0.5 rounded-full flex items-center gap-1">
                            Project: {projects.find(p => p._id === filterProject)?.name || 'Selected'}
                            <button onClick={() => setFilterProject('all')} className="hover:opacity-70 ml-1"><X className="h-3 w-3" strokeWidth={1.5} /></button>
                        </Badge>
                    )}
                </div>
                <Button
                    variant="ghost"
                    onClick={resetFilters}
                    className="h-8 px-3 text-[13px] text-[var(--apple-secondary-label)] hover:text-[var(--apple-label)] hover:bg-[var(--apple-tertiary-fill)] rounded-full"
                >
                    Clear All
                </Button>
            </div>
        )}

        {/* Count + View Switcher */}
        <div className="flex items-center justify-between gap-3">
          <p className="text-[13px] text-[var(--apple-secondary-label)]">
            <span className="font-apple-mono font-medium text-[var(--apple-label)]">
              {totalCount}
            </span>{" "}
            event{totalCount !== 1 ? 's' : ''}
          </p>
          <ViewSwitcher
            value={viewMode}
            onChange={(v) => setViewMode(v as 'grid' | 'list')}
            options={['grid', 'list']}
          />
        </div>

        {/* Events Display */}
        {filteredEvents.length === 0 ? (
          <TasksEmptyState
            icon={<Calendar className="h-10 w-10" strokeWidth={1.5} />}
            title="No sprint events found"
            description={hasActiveFilters ? 'Try adjusting your filters to find what you are looking for.' : 'Schedule your first sprint ceremony.'}
            action={
              <PermissionGate permission={Permission.SPRINT_EVENT_VIEW_ALL}>
                <Button
                  onClick={() => setShowAddModal(true)}
                  className="rounded-full bg-[var(--apple-system-blue)] text-white text-[15px] font-semibold px-4 h-9 hover:opacity-90 apple-transition"
                >
                  <Plus className="h-4 w-4 mr-2" strokeWidth={1.5} />
                  Add Event
                </Button>
              </PermissionGate>
            }
          />
        ) : (
          <div className="space-y-4">
            {/* Grid View */}
            {viewMode === 'grid' && (
              <div className="grid gap-4 sm:gap-5 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                {paginatedEvents.map((event) => {
                  const style = EVENT_ICONS[event.eventType?.toLowerCase()] ?? defaultEventStyle
                  return (
                    <div
                      key={event._id}
                      className={cn(
                        'card-fade-in group rounded-[var(--apple-radius-xl)] border border-[var(--apple-separator)] bg-card overflow-hidden',
                        'shadow-[0_1px_4px_rgba(0,0,0,0.07)] dark:shadow-none',
                        'hover:shadow-[0_8px_28px_rgba(0,0,0,0.11)] dark:hover:shadow-[0_8px_28px_rgba(0,0,0,0.40)]',
                        'hover:-translate-y-0.5 apple-transition cursor-pointer'
                      )}
                      onClick={() => router.push(`/sprint-events/view-sprint-event/${event._id}`)}
                    >
                      {/* Theme-color accent strip */}
                      <div className="h-[3px] w-full flex-shrink-0" style={{ background: 'var(--apple-card-gradient)' }} />

                      <div className="p-5 space-y-4">
                        {/* Header: icon + title + status + menu */}
                        <div className="flex items-start gap-3">
                          <span className={cn('flex-shrink-0', style.color)}>
                            {style.icon}
                          </span>
                          <div className="flex-1 min-w-0">
                            <h3 className="text-[16px] font-semibold text-[var(--apple-label)] truncate leading-snug">{event.title}</h3>
                            <span className={cn('inline-flex items-center text-[11px] font-semibold px-1.5 py-0.5 rounded-md mt-0.5', style.bg, style.color)}>
                              {formatToTitleCase(event.eventType)}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <StatusBadge status={event.status} size="sm" />
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0 rounded-[var(--apple-radius-sm)] sm:opacity-0 sm:group-hover:opacity-100 apple-transition"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <MoreVertical className="h-4 w-4" strokeWidth={1.5} />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={(e) => {
                                  e.stopPropagation()
                                  router.push(`/sprint-events/view-sprint-event/${event._id}`)
                                }}>
                                  <Eye className="h-4 w-4 mr-2" strokeWidth={1.5} />
                                  View Event
                                </DropdownMenuItem>
                                {hasPermission(Permission.SPRINT_EVENT_VIEW_ALL) || (user && user.id === event.facilitator._id) ? (
                                  <>
                                    <DropdownMenuItem onClick={(e) => {
                                      e.stopPropagation()
                                      const currentEvent = events.find(ev => ev._id === event._id)
                                      setEditingEvent(currentEvent || event)
                                    }}>
                                      <Edit className="h-4 w-4 mr-2" strokeWidth={1.5} />
                                      Edit Event
                                    </DropdownMenuItem>
                                    {false && <>
                                      <DropdownMenuSeparator />
                                      <DropdownMenuItem
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          handleDeleteClick(event)
                                        }}
                                        className="text-destructive"
                                      >
                                        <Trash2 className="h-4 w-4 mr-2" strokeWidth={1.5} />
                                        Delete
                                      </DropdownMenuItem>
                                    </>}
                                  </>
                                ) : null}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>

                        {/* Description */}
                        {event.description && (
                          <p className="text-[13px] text-[var(--apple-secondary-label)] line-clamp-2">{event.description}</p>
                        )}

                        {/* Meta info */}
                        <div className="space-y-1.5">
                          <MetaChip icon={<Calendar className="h-3.5 w-3.5" strokeWidth={1.5} />} label={formatDate(event.scheduledDate)} />
                          {event.startTime && event.endTime && (
                            <MetaChip icon={<Clock className="h-3.5 w-3.5" strokeWidth={1.5} />} label={`${formatTime(event.startTime)} → ${formatTime(event.endTime)}`} />
                          )}
                          {event.duration > 0 && (
                            <MetaChip icon={<Clock className="h-3.5 w-3.5" strokeWidth={1.5} />} label={`${event.duration} min`} />
                          )}
                        </div>

                        {/* Sprint & Project tags */}
                        <div className="flex flex-wrap gap-1.5">
                          {event.sprint?.name && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-[var(--apple-separator)] text-[11px] text-[var(--apple-secondary-label)]">
                              {event.sprint.name}
                            </span>
                          )}
                          {event.project?.name && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-[var(--apple-separator)] text-[11px] text-[var(--apple-tertiary-label)]">
                              {event.project.name}
                            </span>
                          )}
                        </div>

                        {/* Attendees */}
                        {event.attendees?.length > 0 && (
                          <div className="flex items-center gap-1.5 text-[12px] text-[var(--apple-secondary-label)]">
                            <Users className="h-3.5 w-3.5 text-[var(--apple-tertiary-label)]" strokeWidth={1.5} />
                            <span>{event.attendees.length} attendee{event.attendees.length !== 1 ? 's' : ''}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* List View */}
            {viewMode === 'list' && (
              <div className="space-y-2">
                {paginatedEvents.map((event) => {
                  const style = EVENT_ICONS[event.eventType?.toLowerCase()] ?? defaultEventStyle
                  return (
                    <div
                      key={event._id}
                      className="card-fade-in group relative flex items-center gap-4 pl-5 pr-4 py-4 rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card apple-transition hover:shadow-[0_4px_16px_rgba(0,0,0,0.08)] dark:hover:shadow-[0_4px_16px_rgba(0,0,0,0.32)] hover:-translate-y-px cursor-pointer overflow-hidden"
                      onClick={() => router.push(`/sprint-events/view-sprint-event/${event._id}`)}
                    >
                      {/* Theme-color left accent strip */}
                      <div className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ background: 'var(--apple-card-gradient)' }} />
                      <span className={cn('flex-shrink-0', style.color)}>
                        {style.icon}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[15px] font-semibold text-[var(--apple-label)] truncate">{event.title}</span>
                          <StatusBadge status={event.status} size="sm" />
                        </div>
                        <div className="flex items-center gap-3 mt-1 flex-wrap">
                          <MetaChip icon={<Calendar className="h-3 w-3" strokeWidth={1.5} />} label={formatDate(event.scheduledDate)} />
                          {event.duration > 0 && (
                            <MetaChip icon={<Clock className="h-3 w-3" strokeWidth={1.5} />} label={`${event.duration}m`} />
                          )}
                          {event.sprint?.name && (
                            <MetaChip icon={<Zap className="h-3 w-3" strokeWidth={1.5} />} label={event.sprint.name} />
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {event.attendees?.length > 0 && (
                          <span className="text-[12px] text-[var(--apple-secondary-label)] hidden md:flex items-center gap-1">
                            <Users className="h-3.5 w-3.5" strokeWidth={1.5} /> {event.attendees.length}
                          </span>
                        )}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 rounded-[var(--apple-radius-sm)] sm:opacity-0 sm:group-hover:opacity-100 apple-transition"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <MoreVertical className="h-4 w-4" strokeWidth={1.5} />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={(e) => {
                              e.stopPropagation()
                              router.push(`/sprint-events/view-sprint-event/${event._id}`)
                            }}>
                              <Eye className="h-4 w-4 mr-2" strokeWidth={1.5} />
                              View Event
                            </DropdownMenuItem>
                            {hasPermission(Permission.SPRINT_EVENT_VIEW_ALL) || (user && user.id === event.facilitator._id) ? (
                              <>
                                <DropdownMenuItem onClick={(e) => {
                                  e.stopPropagation()
                                  const currentEvent = events.find(ev => ev._id === event._id)
                                  setEditingEvent(currentEvent || event)
                                }}>
                                  <Edit className="h-4 w-4 mr-2" strokeWidth={1.5} />
                                  Edit Event
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handleDeleteClick(event)
                                  }}
                                  className="text-destructive"
                                >
                                  <Trash2 className="h-4 w-4 mr-2" strokeWidth={1.5} />
                                  Delete
                                </DropdownMenuItem>
                              </>
                            ) : null}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Pagination */}
            {totalCount > pageSize && (
              <PaginationBar
                currentPage={currentPage}
                totalPages={totalPages}
                totalCount={totalCount}
                pageSize={pageSize}
                onPageChange={setCurrentPage}
                onPageSizeChange={(size) => {
                  setPageSize(size)
                  setCurrentPage(1)
                }}
                loading={loading}
              />
            )}
          </div>
        )}

        {/* Modals */}
        {showAddModal && (
          <AddSprintEventModal
            projectId={projectId || ''}
            onClose={() => setShowAddModal(false)}
            onSuccess={handleEventAdded}
          />
        )}

        {editingEvent && (
          <EditSprintEventModal
            event={editingEvent}
            onClose={() => setEditingEvent(null)}
            onSuccess={handleEventUpdated}
          />
        )}

        <ConfirmationModal
          isOpen={showDeleteConfirm}
          onClose={handleDeleteCancel}
          onConfirm={handleDeleteConfirm}
          title="Delete Sprint Event"
          description={
            eventToDelete
              ? `Are you sure you want to delete "${eventToDelete.title}"? This action cannot be undone.`
              : 'Are you sure you want to delete this sprint event?'
          }
          confirmText="Delete"
          cancelText="Cancel"
          variant="default"
          isLoading={isDeletingEvent}
        />
      </div>
    </MainLayout>
  )
}
