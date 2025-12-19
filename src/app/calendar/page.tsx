'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { MainLayout } from '@/components/layout/MainLayout'
import { formatToTitleCase } from '@/lib/utils'
import { useTaskSync, useTaskState } from '@/hooks/useTaskSync'
import { useNotify } from '@/lib/notify'
import { useDateTime } from '@/components/providers/DateTimeProvider'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import {
  Plus,
  Search,
  Filter,
  MoreHorizontal,
  Calendar,
  Clock,
  CheckCircle,
  Pause,
  XCircle,
  Play,
  Loader2,
  User,
  Target,
  Zap,
  BarChart3,
  List,
  Kanban,
  Users,
  TrendingUp,
  Calendar as CalendarIcon,
  Star,
  Layers,
  ChevronLeft,
  ChevronRight,
  RotateCcw
} from 'lucide-react'

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

export default function CalendarPage() {
  const router = useRouter()
  const { formatDate } = useDateTime()
  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [priorityFilter, setPriorityFilter] = useState('all')
  const [viewMode, setViewMode] = useState<'month' | 'week' | 'day'>('month')
  const [currentDate, setCurrentDate] = useState(new Date())

  // Check if any filters are active
  const hasActiveFilters = searchQuery !== '' ||
                          typeFilter !== 'all' ||
                          statusFilter !== 'all' ||
                          priorityFilter !== 'all'

  // Reset all filters
  const resetFilters = () => {
    setSearchQuery('')
    setTypeFilter('all')
    setStatusFilter('all')
    setPriorityFilter('all')
  }

  // Use the task state management hook for calendar events
  const {
    tasks: events,
    setTasks: setEvents,
    isLoading: taskLoading,
    error: taskError,
    handleTaskUpdate,
    handleTaskCreate,
    handleTaskDelete
  } = useTaskState([])

  // Use the notification hook
  const { error: notifyError } = useNotify()

  // Use the task synchronization hook
  const {
    isConnected,
    startPolling,
    stopPolling,
    updateTaskOptimistically
  } = useTaskSync({
    onTaskUpdate: handleTaskUpdate,
    onTaskCreate: handleTaskCreate,
    onTaskDelete: handleTaskDelete
  })

  const fetchEvents = useCallback(async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/calendar')
      const data = await response.json()

      if (data.success) {
        setEvents(data.data)
        // Optional: Add success notification for initial load if desired
        // notifySuccess({ title: 'Calendar Loaded', message: 'Calendar events loaded successfully' })
      } else {
        notifyError({ title: 'Failed to Load Calendar', message: data.error || 'Failed to fetch calendar events' })
      }
    } catch (err) {
      notifyError({ title: 'Failed to Load Calendar', message: 'Failed to fetch calendar events' })
    } finally {
      setLoading(false)
    }
  }, [notifyError])

  // Check auth and fetch events only once on mount
  useEffect(() => {
    let mounted = true
    let hasFetched = false

    const checkAuth = async () => {
      // Prevent duplicate calls
      if (hasFetched) return
      
      try {
        const response = await fetch('/api/auth/me')
        
        if (!mounted || hasFetched) return

        if (response.ok) {
          setAuthError('')
          // Fetch events only once after auth check
          if (!hasFetched) {
            hasFetched = true
            await fetchEvents()
            // Start real-time synchronization after successful auth
            startPolling()
          }
        } else if (response.status === 401) {
          const refreshResponse = await fetch('/api/auth/refresh', {
            method: 'POST'
          })
          
          if (!mounted || hasFetched) return

          if (refreshResponse.ok) {
            setAuthError('')
            // Fetch events only once after refresh
            if (!hasFetched) {
              hasFetched = true
              await fetchEvents()
              // Start real-time synchronization after successful refresh
              startPolling()
            }
          } else {
            setAuthError('Session expired')
            stopPolling()
            setTimeout(() => {
              router.push('/login')
            }, 2000)
          }
        } else {
          stopPolling()
          router.push('/login')
        }
      } catch (error) {
        if (!mounted || hasFetched) return
        console.error('Auth check failed:', error)
        setAuthError('Authentication failed')
        stopPolling()
        setTimeout(() => {
          router.push('/login')
        }, 2000)
      }
    }

    checkAuth()

    return () => {
      mounted = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Only run once on mount - fetchEvents, startPolling, stopPolling, router are stable

  // Handle task errors from the task state hook
  useEffect(() => {
    if (taskError) {
      notifyError({ title: 'Task Synchronization Error', message: taskError })
    }
  }, [taskError, notifyError])

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'task': return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
      case 'sprint': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
      case 'milestone': return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200'
      case 'meeting': return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200'
      case 'deadline': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
    }
  }

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'low': return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
      case 'medium': return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
      case 'high': return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200'
      case 'critical': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'scheduled': return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
      case 'in_progress': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
      case 'completed': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
      case 'cancelled': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
    }
  }

  const filteredEvents = events.filter(event => {
    const matchesSearch = !searchQuery || 
      event.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      event.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      event.project.name.toLowerCase().includes(searchQuery.toLowerCase())
    
    const matchesType = typeFilter === 'all' || event.type === typeFilter
    const matchesStatus = statusFilter === 'all' || event.status === statusFilter
    const matchesPriority = priorityFilter === 'all' || event.priority === priorityFilter

    return matchesSearch && matchesType && matchesStatus && matchesPriority
  })

  const getEventsForDate = (date: Date) => {
    const dateStr = date.toISOString().split('T')[0]
    return filteredEvents.filter(event => {
      const eventDate = new Date(event.startDate).toISOString().split('T')[0]
      return eventDate === dateStr
    })
  }

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear()
    const month = date.getMonth()
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)
    const daysInMonth = lastDay.getDate()
    const startingDayOfWeek = firstDay.getDay()
    
    const days = []
    
    // Add empty cells for days before the first day of the month
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null)
    }
    
    // Add days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      days.push(new Date(year, month, day))
    }
    
    return days
  }

  const getDaysInWeek = (date: Date) => {
    const days = []
    const dayOfWeek = date.getDay()
    const startOfWeek = new Date(date)
    startOfWeek.setDate(date.getDate() - dayOfWeek)
    
    for (let i = 0; i < 7; i++) {
      const day = new Date(startOfWeek)
      day.setDate(startOfWeek.getDate() + i)
      days.push(day)
    }
    
    return days
  }

  const getDay = (date: Date) => {
    return [new Date(date)]
  }

  const navigate = (direction: 'prev' | 'next') => {
    setCurrentDate(prev => {
      const newDate = new Date(prev)
      if (viewMode === 'month') {
        if (direction === 'prev') {
          newDate.setMonth(newDate.getMonth() - 1)
        } else {
          newDate.setMonth(newDate.getMonth() + 1)
        }
      } else if (viewMode === 'week') {
        if (direction === 'prev') {
          newDate.setDate(newDate.getDate() - 7)
        } else {
          newDate.setDate(newDate.getDate() + 7)
        }
      } else if (viewMode === 'day') {
        if (direction === 'prev') {
          newDate.setDate(newDate.getDate() - 1)
        } else {
          newDate.setDate(newDate.getDate() + 1)
        }
      }
      return newDate
    })
  }

  const getViewTitle = () => {
    if (viewMode === 'month') {
      return currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    } else if (viewMode === 'week') {
      const weekStart = getDaysInWeek(currentDate)[0]
      const weekEnd = getDaysInWeek(currentDate)[6]
      return `${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
    } else {
      return currentDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    }
  }

  const goToToday = () => {
    setCurrentDate(new Date())
  }

  const handleEventClick = (event: CalendarEvent) => {
    // Route based on event type
    // Note: Events come from the task API, so they're all tasks with different type classifications
    // However, we route sprints to their dedicated page if it exists
    switch (event.type) {
      case 'sprint':
        // Sprints may have their own detail page
        router.push(`/sprints/${event._id}`)
        break
      case 'task':
      case 'deadline':
      case 'milestone':
      case 'meeting':
      default:
        // All other event types route to task detail page
        router.push(`/tasks/${event._id}`)
        break
    }
  }

  if (loading || taskLoading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
            <p className="text-muted-foreground">Loading calendar...</p>
          </div>
        </div>
      </MainLayout>
    )
  }

  if (authError) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <p className="text-destructive mb-4">{authError}</p>
            <p className="text-muted-foreground">Redirecting to login...</p>
          </div>
        </div>
      </MainLayout>
    )
  }

  return (
    <MainLayout>
      <div className="space-y-6 sm:space-y-8 lg:space-y-10">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-foreground">Calendar</h1>
            <p className="text-sm sm:text-base text-muted-foreground mt-1">Timeline and schedule management</p>
          </div>
          <div className="flex items-center space-x-2 w-full sm:w-auto">
            <Button
              variant="outline"
              onClick={() => router.push('/tasks/create')}
              className="w-full sm:w-auto text-sm sm:text-base"
            >
              <Plus className="h-4 w-4 mr-2" />
              <span className="sm:inline">New Task</span>
              <span className="sm:hidden">New</span>
            </Button>
          </div>
        </div>


        {/* Real-time connection status */}
        {isConnected && (
          <Alert className="mb-4">
            <div className="flex items-center">
              <div className="w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse"></div>
              <span className="text-sm">Real-time sync active</span>
            </div>
          </Alert>
        )}

        <Card>
          <CardHeader className="p-4 sm:p-6">
            <div className="space-y-3 sm:space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <CardTitle className="text-lg sm:text-xl">Calendar View</CardTitle>
                  <CardDescription className="text-xs sm:text-sm">
                    {filteredEvents.length} event{filteredEvents.length !== 1 ? 's' : ''} found
                  </CardDescription>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
                <div className="relative flex-1 sm:max-w-xs">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 pointer-events-none" />
                  <Input
                    placeholder="Search events..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 w-full text-sm sm:text-base"
                  />
                </div>
                <div className="flex flex-wrap gap-2 sm:gap-3">
                  <Select value={typeFilter} onValueChange={setTypeFilter}>
                    <SelectTrigger className="w-full sm:w-[140px] text-sm">
                      <SelectValue placeholder="Type" />
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
                    <SelectTrigger className="w-full sm:w-[140px] text-sm">
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
                  <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                    <SelectTrigger className="w-full sm:w-[140px] text-sm">
                      <SelectValue placeholder="Priority" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Priority</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="critical">Critical</SelectItem>
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
                            className="text-xs"
                            aria-label="Reset all filters"
                          >
                            <RotateCcw className="h-4 w-4 mr-1" />
                            Reset Filters
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
            </div>
          </CardHeader>
          <CardContent className="p-4 sm:p-6">
            <div className="space-y-4 sm:space-y-6">
              {/* Calendar Navigation */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-4">
                <div className="flex items-center justify-between w-full sm:w-auto gap-2 sm:gap-4">
                  <Button variant="outline" size="sm" onClick={() => navigate('prev')} className="flex-shrink-0">
                    <ChevronLeft className="h-4 w-4" />
                    <span className="sr-only">Previous</span>
                  </Button>
                  <h2 className="text-base sm:text-lg lg:text-xl font-semibold text-foreground text-center flex-1 sm:flex-none">
                    {getViewTitle()}
                  </h2>
                  <Button variant="outline" size="sm" onClick={() => navigate('next')} className="flex-shrink-0">
                    <ChevronRight className="h-4 w-4" />
                    <span className="sr-only">Next</span>
                  </Button>
                </div>
                <div className="flex items-center justify-center sm:justify-end gap-2 w-full sm:w-auto">
                  <Button variant="outline" size="sm" onClick={goToToday} className="text-xs sm:text-sm">
                    <Calendar className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5 sm:mr-2" />
                    Today
                  </Button>
                  <Select value={viewMode} onValueChange={(value) => setViewMode(value as 'month' | 'week' | 'day')}>
                    <SelectTrigger className="w-full sm:w-[120px] text-xs sm:text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="month">Month</SelectItem>
                      <SelectItem value="week">Week</SelectItem>
                      <SelectItem value="day">Day</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Calendar Grid - Month View */}
              {viewMode === 'month' && (
                <div className="overflow-x-auto -mx-4 sm:mx-0">
                  <div className="grid grid-cols-7 gap-1 min-w-[600px] sm:min-w-0">
                    {/* Day headers */}
                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                      <div key={day} className="p-1.5 sm:p-2 text-center text-xs sm:text-sm font-medium text-muted-foreground">
                        <span className="hidden sm:inline">{day}</span>
                        <span className="sm:hidden">{day.substring(0, 1)}</span>
                      </div>
                    ))}
                    
                    {/* Calendar days */}
                    {getDaysInMonth(currentDate).map((date, index) => {
                      if (!date) {
                        return <div key={index} className="p-1.5 sm:p-2 min-h-[60px] sm:min-h-[100px]"></div>
                      }
                      
                      const dayEvents = getEventsForDate(date)
                      const isToday = date.toDateString() === new Date().toDateString()
                      
                      return (
                        <div 
                          key={index} 
                          className={`p-1.5 sm:p-2 min-h-[60px] sm:min-h-[100px] border border-muted rounded-lg ${
                            isToday ? 'bg-primary/10 border-primary' : 'hover:bg-muted/50'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1 sm:mb-2">
                            <span className={`text-xs sm:text-sm font-medium ${
                              isToday ? 'text-primary' : 'text-foreground'
                            }`}>
                              {date.getDate()}
                            </span>
                            {dayEvents.length > 0 && (
                              <Badge variant="outline" className="text-[10px] sm:text-xs h-4 sm:h-5 px-1 sm:px-1.5">
                                {dayEvents.length}
                              </Badge>
                            )}
                          </div>
                          
                          <div className="space-y-0.5 sm:space-y-1">
                            {dayEvents.slice(0, 2).map(event => (
                              <div 
                                key={event._id}
                                className="text-[10px] sm:text-xs p-0.5 sm:p-1 rounded cursor-pointer hover:bg-muted transition-colors"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleEventClick(event)
                                }}
                                title={event.title}
                              >
                                <div className="flex items-center space-x-0.5 sm:space-x-1 min-w-0">
                                  <div className={`w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full flex-shrink-0 ${
                                    event.type === 'task' ? 'bg-blue-500' :
                                    event.type === 'sprint' ? 'bg-green-500' :
                                    event.type === 'milestone' ? 'bg-purple-500' :
                                    event.type === 'meeting' ? 'bg-orange-500' :
                                    'bg-red-500'
                                  }`} />
                                  <span className="truncate min-w-0">{event.title}</span>
                                </div>
                              </div>
                            ))}
                            {dayEvents.length > 2 && (
                              <div className="text-[10px] sm:text-xs text-muted-foreground px-0.5 sm:px-1">
                                +{dayEvents.length - 2} more
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Calendar Grid - Week View */}
              {viewMode === 'week' && (
                <div className="overflow-x-auto -mx-4 sm:mx-0">
                  <div className="grid grid-cols-7 gap-1 min-w-[700px] sm:min-w-0">
                    {/* Day headers */}
                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                      <div key={day} className="p-2 text-center text-xs sm:text-sm font-medium text-muted-foreground">
                        <span className="hidden sm:inline">{day}</span>
                        <span className="sm:hidden">{day.substring(0, 1)}</span>
                      </div>
                    ))}
                    
                    {/* Week days */}
                    {getDaysInWeek(currentDate).map((date, index) => {
                      const dayEvents = getEventsForDate(date)
                      const isToday = date.toDateString() === new Date().toDateString()
                      
                      return (
                        <div 
                          key={index} 
                          className={`p-2 sm:p-3 min-h-[300px] sm:min-h-[400px] border border-muted rounded-lg ${
                            isToday ? 'bg-primary/10 border-primary' : 'hover:bg-muted/50'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className={`text-xs sm:text-sm font-medium ${
                              isToday ? 'text-primary' : 'text-foreground'
                            }`}>
                              <span className="hidden sm:inline">{date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                              <span className="sm:hidden">{date.getDate()}</span>
                            </span>
                            {dayEvents.length > 0 && (
                              <Badge variant="outline" className="text-[10px] sm:text-xs">
                                {dayEvents.length}
                              </Badge>
                            )}
                          </div>
                          
                          <div className="space-y-1.5 sm:space-y-2">
                            {dayEvents.map(event => (
                              <div 
                                key={event._id}
                                className="text-[10px] sm:text-xs p-1.5 sm:p-2 rounded cursor-pointer hover:bg-muted border-l-2 transition-colors"
                                style={{
                                  borderLeftColor: event.type === 'task' ? '#3b82f6' :
                                  event.type === 'sprint' ? '#10b981' :
                                  event.type === 'milestone' ? '#8b5cf6' :
                                  event.type === 'meeting' ? '#f97316' :
                                  '#ef4444'
                                }}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleEventClick(event)
                                }}
                                title={event.title}
                              >
                                <div className="flex items-center space-x-1 mb-0.5 sm:mb-1 min-w-0">
                                  <div className={`w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full flex-shrink-0 ${
                                    event.type === 'task' ? 'bg-blue-500' :
                                    event.type === 'sprint' ? 'bg-green-500' :
                                    event.type === 'milestone' ? 'bg-purple-500' :
                                    event.type === 'meeting' ? 'bg-orange-500' :
                                    'bg-red-500'
                                  }`} />
                                  <span className="font-medium truncate min-w-0">{event.title}</span>
                                </div>
                                {event.description && (
                                  <p className="text-[10px] sm:text-xs text-muted-foreground line-clamp-2">{event.description}</p>
                                )}
                                {event.project && (
                                  <p 
                                    className="text-[10px] sm:text-xs text-muted-foreground mt-0.5 sm:mt-1 truncate" 
                                    title={event.project.name}
                                  >
                                    {event.project.name}
                                  </p>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Calendar Grid - Day View */}
              {viewMode === 'day' && (
                <div className="space-y-4">
                  <div className="border border-muted rounded-lg p-3 sm:p-4 lg:p-6 min-h-[400px] sm:min-h-[500px]">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-4 mb-4">
                      <h3 className="text-base sm:text-lg lg:text-xl font-semibold text-foreground">
                        <span className="hidden sm:inline">
                          {currentDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                        </span>
                        <span className="sm:hidden">
                          {currentDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                      </h3>
                      {getEventsForDate(currentDate).length > 0 && (
                        <Badge variant="outline" className="text-xs sm:text-sm">
                          {getEventsForDate(currentDate).length} event{getEventsForDate(currentDate).length !== 1 ? 's' : ''}
                        </Badge>
                      )}
                    </div>
                    
                    <div className="space-y-2 sm:space-y-3">
                      {getEventsForDate(currentDate).length > 0 ? (
                        getEventsForDate(currentDate).map(event => (
                          <div 
                            key={event._id}
                            className="p-3 sm:p-4 rounded-lg border border-muted cursor-pointer hover:bg-muted transition-colors"
                            onClick={() => handleEventClick(event)}
                          >
                            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 sm:gap-4 mb-2">
                              <div className="flex flex-wrap items-center gap-2 min-w-0 flex-1">
                                <div className={`w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full flex-shrink-0 ${
                                  event.type === 'task' ? 'bg-blue-500' :
                                  event.type === 'sprint' ? 'bg-green-500' :
                                  event.type === 'milestone' ? 'bg-purple-500' :
                                  event.type === 'meeting' ? 'bg-orange-500' :
                                  'bg-red-500'
                                }`} />
                                <h4 className="font-medium text-sm sm:text-base text-foreground truncate min-w-0">{event.title}</h4>
                                <Badge className={`${getTypeColor(event.type)} text-xs`}>
                                  {formatToTitleCase(event.type)}
                                </Badge>
                              </div>
                              <Badge className={`${getPriorityColor(event.priority)} text-xs flex-shrink-0`}>
                                {formatToTitleCase(event.priority)}
                              </Badge>
                            </div>
                            {event.description && (
                              <p className="text-xs sm:text-sm text-muted-foreground mb-2 line-clamp-2">{event.description}</p>
                            )}
                            <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-xs text-muted-foreground">
                              {event.project && (
                                <div className="flex items-center space-x-1.5 min-w-0">
                                  <Target className="h-3 w-3 flex-shrink-0" />
                                  <span className="truncate min-w-0" title={event.project.name}>
                                    {event.project.name}
                                  </span>
                                </div>
                              )}
                              {event.startDate && (
                                <div className="flex items-center space-x-1.5 whitespace-nowrap">
                                  <Clock className="h-3 w-3 flex-shrink-0" />
                                  <span>{new Date(event.startDate).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
                                </div>
                              )}
                              {event.assignedTo && (
                                <div className="flex items-center space-x-1.5 min-w-0">
                                  <User className="h-3 w-3 flex-shrink-0" />
                                  <span className="truncate">{event.assignedTo.firstName} {event.assignedTo.lastName}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="text-center py-8 sm:py-12 text-muted-foreground">
                          <Calendar className="h-8 w-8 sm:h-12 sm:w-12 mx-auto mb-3 sm:mb-4 opacity-50" />
                          <p className="text-sm sm:text-base">No events scheduled for this day</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  )
}
