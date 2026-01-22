'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useDebounce } from '@/hooks/useDebounce'
import { useAuth } from '@/hooks/useAuth'
import { useDateTime } from '@/components/providers/DateTimeProvider'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { MainLayout } from '@/components/layout/MainLayout'
import { 
  Calendar, 
  Clock, 
  Users, 
  Plus,
  Search,
  CheckCircle,
  Play,
  Square,
  List,
  Edit,
  Trash2,
  Eye,
  MoreVertical,
  X,
  RotateCcw
} from 'lucide-react'
import { AddSprintEventModal } from '@/components/sprint-events/AddSprintEventModal'
import { EditSprintEventModal } from '@/components/sprint-events/EditSprintEventModal'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/DropdownMenu'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useNotify } from '@/lib/notify'
import { useBreadcrumb } from '@/contexts/BreadcrumbContext'
import { ConfirmationModal } from '@/components/ui/ConfirmationModal'
import { usePermissions } from '@/lib/permissions/permission-context'
import { Permission } from '@/lib/permissions/permission-definitions'

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
        return <Calendar className="h-4 w-4" />
      case 'review':
        return <CheckCircle className="h-4 w-4" />
      case 'retrospective':
        return <Users className="h-4 w-4" />
      case 'daily_standup':
        return <Clock className="h-4 w-4" />
      case 'demo':
        return <Play className="h-4 w-4" />
      default:
        return <Calendar className="h-4 w-4" />
    }
  }

  const getStatusBadge = (status: string) => {
    const variants = {
      'scheduled': 'secondary',
      'in_progress': 'default',
      'completed': 'outline',
      'cancelled': 'destructive'
    } as const
    
    const labels = {
      'scheduled': 'Scheduled',
      'in_progress': 'In Progress',
      'completed': 'Completed',
      'cancelled': 'Cancelled'
    } as const
    
    return (
      <Badge variant={variants[status as keyof typeof variants] || 'secondary'}>
        {labels[status as keyof typeof labels] || status}
      </Badge>
    )
  }

  const getEventTypeBadge = (eventType: string) => {
    const colors = {
      'planning': 'bg-blue-500',
      'review': 'bg-green-500',
      'retrospective': 'bg-purple-500',
      'daily_standup': 'bg-yellow-500',
      'demo': 'bg-orange-500',
      'other': 'bg-gray-500'
    }
    
    const labels = {
      'planning': 'Planning',
      'review': 'Review',
      'retrospective': 'Retrospective',
      'daily_standup': 'Daily Standup',
      'demo': 'Demo',
      'other': 'Other'
    }
    
    return (
      <Badge variant="outline" className={`${colors[eventType as keyof typeof colors] || 'bg-gray-500'} text-white border-0`}>
        {labels[eventType as keyof typeof labels] || eventType}
      </Badge>
    )
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
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </MainLayout>
    )
  }

  if (!isAuthenticated) {
    return (
      <MainLayout>
        <div className="text-center py-8">
          <Calendar className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-2xl font-semibold mb-2">Authentication Required</h2>
          <p className="text-muted-foreground mb-4">
            Please log in to access sprint events.
          </p>
          <Button onClick={() => router.push('/login')}>
            Go to Login
          </Button>
        </div>
      </MainLayout>
    )
  }

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </MainLayout>
    )
  }

  return (
    <MainLayout>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl sm:text-3xl font-bold truncate">Sprint Events</h1>
            <p className="text-sm sm:text-base text-muted-foreground">
              {projectId ? 'Manage agile events and ceremonies' : 'View all sprint events across your projects'}
            </p>
          </div>
          <Button onClick={() => setShowAddModal(true)} className="w-full sm:w-auto">
            <Plus className="h-4 w-4 mr-2" />
            <span className="hidden xs:inline">Create Event</span>
            <span className="xs:hidden">Create Event</span>
          </Button>
        </div>

        {/* Success/Error Messages */}

        {/* Filters */}
        <Card>
          <CardContent className="p-3 sm:p-4">
            <div className="space-y-4">
              {/* Search Input */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search events..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>

              {/* Filter Controls */}
              <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
                {!projectId && (
                  <Select 
                    value={filterProject} 
                    onValueChange={setFilterProject}
                    onOpenChange={(open) => { if (open) setProjectQuery('') }}
                  >
                    <SelectTrigger className="w-full sm:w-[180px]">
                      <SelectValue placeholder="All Projects" />
                    </SelectTrigger>
                    <SelectContent className="z-[10050] p-0">
                      <div className="p-2">
                        <Input
                          value={projectQuery}
                          onChange={(e) => setProjectQuery(e.target.value)}
                          placeholder="Type to search projects"
                          className="mb-2"
                          onKeyDown={(e) => e.stopPropagation()}
                        />
                        <div className="max-h-56 overflow-y-auto">
                          <SelectItem value="all">
                            All Projects
                          </SelectItem>
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
                            <div className="px-2 py-1 text-sm text-muted-foreground">No matching projects</div>
                          )}
                        </div>
                      </div>
                    </SelectContent>
                  </Select>
                )}
                <Select value={filterType} onValueChange={setFilterType}>
                  <SelectTrigger className="w-full sm:w-[150px]">
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
                  <SelectTrigger className="w-full sm:w-[150px]">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="scheduled">Scheduled</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
                {hasActiveFilters && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={resetFilters}
                          className="text-xs w-full sm:w-auto"
                          aria-label="Reset all filters"
                        >
                          <RotateCcw className="h-4 w-4 mr-1" />
                          <span className="hidden sm:inline">Reset Filters</span>
                          <span className="sm:hidden">Reset</span>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Reset filters</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Events Display */}
        {filteredEvents.length === 0 ? (
          <Card>
            <CardContent className="text-center py-8 sm:py-12 px-4 sm:px-6">
              <Calendar className="h-10 w-10 sm:h-12 sm:w-12 text-muted-foreground mx-auto mb-3 sm:mb-4" />
              <p className="text-sm sm:text-base text-muted-foreground mb-3 sm:mb-4">
                {hasActiveFilters ? 'No events match your filters' : 'No sprint events found'}
              </p>
              <Button onClick={() => setShowAddModal(true)} className="w-full sm:w-auto">
                <Plus className="h-4 w-4 mr-2" />
                {hasActiveFilters ? 'Create New Event' : 'Create First Event'}
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="pt-6">
              <Tabs value={viewMode} onValueChange={(value) => setViewMode(value as 'grid' | 'list')}>
                <TabsList className="grid w-full grid-cols-2 mb-6">
                  <TabsTrigger value="grid">Grid View</TabsTrigger>
                  <TabsTrigger value="list">List View</TabsTrigger>
                </TabsList>

                <TabsContent value="grid" className="space-y-4 sm:space-y-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                    {paginatedEvents.map((event) => (
                      <Card 
                        key={event._id} 
                        className="hover:shadow-md transition-shadow cursor-pointer"
                        onClick={() => router.push(`/sprint-events/view-sprint-event/${event._id}`)}
                      >
                        <CardContent className="p-4 sm:p-6">
                          <div className="space-y-3 sm:space-y-4">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center space-x-2 min-w-0 flex-1">
                                {getEventTypeIcon(event.eventType)}
                                <div className="flex-1 min-w-0">
                                  <h3 className="text-base sm:text-lg font-semibold truncate">{event.title}</h3>
                                  <p className="text-xs sm:text-sm text-muted-foreground truncate">
                                    {(() => {
                                      return (event.sprint?.name || 'Unavailable Sprint') + ' • ' + (event.project?.name || 'Unavailable Project')
                                    })()}
                                  </p>
                                </div>
                              </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                                    className="h-8 w-8 p-0 flex-shrink-0"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={(e) => {
                            e.stopPropagation()
                            router.push(`/sprint-events/view-sprint-event/${event._id}`)
                          }}>
                            <Eye className="h-4 w-4 mr-2" />
                            View Event
                          </DropdownMenuItem>
                          {hasPermission(Permission.SPRINT_EVENT_VIEW_ALL) || (user && user.id === event.facilitator._id) ? (
                            <>
                              <DropdownMenuItem onClick={(e) => {
                                e.stopPropagation()
                                        // Find the current event data by ID to ensure we have fresh data
                                        const currentEvent = events.find(ev => ev._id === event._id)
                                        setEditingEvent(currentEvent || event)
                              }}>
                                <Edit className="h-4 w-4 mr-2" />
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
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            </>
                          ) : null}
                        </DropdownMenuContent>
                      </DropdownMenu>
                            </div>

                            <div className="flex items-center gap-2 flex-wrap">
                              {getEventTypeBadge(event.eventType)}
                              {getStatusBadge(event.status)}
                            </div>

                            <div className="space-y-2">
                              <div className="flex items-start space-x-2 text-xs sm:text-sm">
                                <Calendar className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                                <span className="text-muted-foreground break-words">
                                  {formatDateTime(event.scheduledDate, event.startTime, event.endTime)}
                                </span>
                              </div>
                              <div className="flex items-center space-x-2 text-xs sm:text-sm">
                                <Users className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                                <span className="text-muted-foreground">
                                  {event.attendees.length} {event.attendees.length === 1 ? 'attendee' : 'attendees'}
                                </span>
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </TabsContent>

                <TabsContent value="list" className="space-y-4 sm:space-y-6">
                  <div className="flex flex-col gap-4 sm:gap-6">
                    {paginatedEvents.map((event) => (
              <Card 
                key={event._id} 
                className="hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => router.push(`/sprint-events/view-sprint-event/${event._id}`)}
              >
                <CardContent className="p-4 sm:p-6">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
                    <div className="flex items-start space-x-3 flex-1 min-w-0">
                      <div className="flex-shrink-0 mt-1">
                        {getEventTypeIcon(event.eventType)}
                      </div>
                        <div className="min-w-0 flex-1">
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-2">
                          <h3 className="text-base sm:text-lg font-semibold truncate">{event.title}</h3>
                          <div className="flex items-center gap-2 flex-wrap">
                            {getEventTypeBadge(event.eventType)}
                            {getStatusBadge(event.status)}
                          </div>
                        </div>
                        <div className="flex flex-col gap-1 text-xs sm:text-sm text-muted-foreground">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="truncate">
                              {event.sprint?.name || 'Unavailable Sprint'}
                            </span>
                            <span className="hidden sm:inline">•</span>
                            <span className="truncate">
                              {event.project?.name || 'Unavailable Project'}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <Calendar className="h-3 w-3 flex-shrink-0" />
                            <span className="truncate">
                              {formatDateTime(event.scheduledDate, event.startTime, event.endTime)}
                            </span>
                            <span className="hidden sm:inline">•</span>
                            <Users className="h-3 w-3 flex-shrink-0 sm:hidden" />
                            <span className="sm:hidden">•</span>
                            <span>
                              {event.attendees.length} {event.attendees.length === 1 ? 'attendee' : 'attendees'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-8 w-8 p-0"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={(e) => {
                          e.stopPropagation()
                          router.push(`/sprint-events/view-sprint-event/${event._id}`)
                        }}>
                          <Eye className="h-4 w-4 mr-2" />
                          View Event
                        </DropdownMenuItem>
                        {hasPermission(Permission.SPRINT_EVENT_VIEW_ALL) || (user && user.id === event.facilitator._id) ? (
                          <>
                            <DropdownMenuItem onClick={(e) => {
                              e.stopPropagation()
                              // Find the current event data by ID to ensure we have fresh data
                              const currentEvent = events.find(ev => ev._id === event._id)
                              setEditingEvent(currentEvent || event)
                            }}>
                              <Edit className="h-4 w-4 mr-2" />
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
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </>
                        ) : null}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardContent>
              </Card>
                    ))}
                  </div>
                </TabsContent>
              </Tabs>

              {/* Pagination Controls */}
              {totalCount > 0 && (
                <div className="flex flex-col gap-4 mt-6 pt-4 border-t">
                  {/* Page size selector and info */}
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 text-xs sm:text-sm text-muted-foreground">
                      <div className="flex items-center gap-2">
                    <span>Items per page:</span>
                    <Select
                      value={pageSize.toString()}
                      onValueChange={(value) => {
                        const newSize = parseInt(value)
                        setPageSize(newSize)
                        setCurrentPage(1)
                      }}
                    >
                          <SelectTrigger className="w-16 sm:w-20 h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="10">10</SelectItem>
                        <SelectItem value="20">20</SelectItem>
                        <SelectItem value="50">50</SelectItem>
                        <SelectItem value="100">100</SelectItem>
                      </SelectContent>
                    </Select>
                      </div>
                      <span className="text-center sm:text-left">
                      Showing {((currentPage - 1) * pageSize) + 1} to {Math.min(currentPage * pageSize, totalCount)} of {totalCount}
                    </span>
                  </div>

                    {/* Navigation buttons */}
                    <div className="flex items-center justify-center sm:justify-end gap-2">
                    <Button
                      onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                      disabled={currentPage === 1 || loading}
                      variant="outline"
                      size="sm"
                        className="min-w-[80px]"
                    >
                      Previous
                    </Button>
                      <span className="text-xs sm:text-sm text-muted-foreground px-2 min-w-fit">
                      Page {currentPage} of {totalPages}
                    </span>
                    <Button
                      onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                      disabled={currentPage >= totalPages || loading}
                      variant="outline"
                      size="sm"
                        className="min-w-[80px]"
                    >
                      Next
                    </Button>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
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
