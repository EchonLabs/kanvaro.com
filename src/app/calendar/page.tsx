'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { MainLayout } from '@/components/layout/MainLayout'
import { useTaskSync, useTaskState } from '@/hooks/useTaskSync'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { 
  Plus, 
  Search, 
  Filter, 
  MoreHorizontal, 
  Calendar, 
  Clock,
  CheckCircle,
  AlertTriangle,
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
  ChevronRight
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
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [authError, setAuthError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [priorityFilter, setPriorityFilter] = useState('all')
  const [viewMode, setViewMode] = useState<'month' | 'week' | 'day'>('month')
  const [currentDate, setCurrentDate] = useState(new Date())

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

  const checkAuth = useCallback(async () => {
    try {
      const response = await fetch('/api/auth/me')
      
      if (response.ok) {
        setAuthError('')
        await fetchEvents()
        // Start real-time synchronization after successful auth
        startPolling()
      } else if (response.status === 401) {
        const refreshResponse = await fetch('/api/auth/refresh', {
          method: 'POST'
        })
        
        if (refreshResponse.ok) {
          setAuthError('')
          await fetchEvents()
          // Start real-time synchronization after successful refresh
          startPolling()
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
      console.error('Auth check failed:', error)
      setAuthError('Authentication failed')
      stopPolling()
      setTimeout(() => {
        router.push('/login')
      }, 2000)
    }
  }, [router, startPolling, stopPolling])

  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  const fetchEvents = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/calendar')
      const data = await response.json()

      if (data.success) {
        setEvents(data.data)
      } else {
        setError(data.error || 'Failed to fetch calendar events')
      }
    } catch (err) {
      setError('Failed to fetch calendar events')
    } finally {
      setLoading(false)
    }
  }

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
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Calendar</h1>
            <p className="text-muted-foreground">Timeline and schedule management</p>
          </div>
          <div className="flex items-center space-x-2">
            <Button variant="outline" onClick={() => router.push('/tasks/create')}>
              <Plus className="h-4 w-4 mr-2" />
              New Task
            </Button>
          </div>
        </div>

        {(error || taskError) && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error || taskError}</AlertDescription>
          </Alert>
        )}

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
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Calendar View</CardTitle>
                <CardDescription>
                  {filteredEvents.length} event{filteredEvents.length !== 1 ? 's' : ''} found
                </CardDescription>
              </div>
              <div className="flex items-center space-x-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <Input
                    placeholder="Search events..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 w-64"
                  />
                </div>
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger className="w-32">
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
                  <SelectTrigger className="w-32">
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
                  <SelectTrigger className="w-32">
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
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {/* Calendar Navigation */}
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <Button variant="outline" onClick={() => navigate('prev')}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <h2 className="text-xl font-semibold text-foreground">
                    {getViewTitle()}
                  </h2>
                  <Button variant="outline" onClick={() => navigate('next')}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex items-center space-x-2">
                  <Button variant="outline" onClick={goToToday}>
                    <Calendar className="h-4 w-4 mr-2" />
                    Today
                  </Button>
                  <Select value={viewMode} onValueChange={(value) => setViewMode(value as 'month' | 'week' | 'day')}>
                    <SelectTrigger className="w-32">
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
                <div className="grid grid-cols-7 gap-1">
                  {/* Day headers */}
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                    <div key={day} className="p-2 text-center text-sm font-medium text-muted-foreground">
                      {day}
                    </div>
                  ))}
                  
                  {/* Calendar days */}
                  {getDaysInMonth(currentDate).map((date, index) => {
                    if (!date) {
                      return <div key={index} className="p-2 min-h-[100px]"></div>
                    }
                    
                    const dayEvents = getEventsForDate(date)
                    const isToday = date.toDateString() === new Date().toDateString()
                    
                    return (
                      <div 
                        key={index} 
                        className={`p-2 min-h-[100px] border border-muted rounded-lg ${
                          isToday ? 'bg-primary/10 border-primary' : 'hover:bg-muted/50'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className={`text-sm font-medium ${
                            isToday ? 'text-primary' : 'text-foreground'
                          }`}>
                            {date.getDate()}
                          </span>
                          {dayEvents.length > 0 && (
                            <Badge variant="outline" className="text-xs">
                              {dayEvents.length}
                            </Badge>
                          )}
                        </div>
                        
                        <div className="space-y-1">
                          {dayEvents.slice(0, 3).map(event => (
                            <div 
                              key={event._id}
                              className="text-xs p-1 rounded cursor-pointer hover:bg-muted"
                              onClick={() => handleEventClick(event)}
                            >
                              <div className="flex items-center space-x-1">
                                <div className={`w-2 h-2 rounded-full ${
                                  event.type === 'task' ? 'bg-blue-500' :
                                  event.type === 'sprint' ? 'bg-green-500' :
                                  event.type === 'milestone' ? 'bg-purple-500' :
                                  event.type === 'meeting' ? 'bg-orange-500' :
                                  'bg-red-500'
                                }`} />
                                <span className="truncate">{event.title}</span>
                              </div>
                            </div>
                          ))}
                          {dayEvents.length > 3 && (
                            <div className="text-xs text-muted-foreground">
                              +{dayEvents.length - 3} more
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Calendar Grid - Week View */}
              {viewMode === 'week' && (
                <div className="grid grid-cols-7 gap-1">
                  {/* Day headers */}
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                    <div key={day} className="p-2 text-center text-sm font-medium text-muted-foreground">
                      {day}
                    </div>
                  ))}
                  
                  {/* Week days */}
                  {getDaysInWeek(currentDate).map((date, index) => {
                    const dayEvents = getEventsForDate(date)
                    const isToday = date.toDateString() === new Date().toDateString()
                    
                    return (
                      <div 
                        key={index} 
                        className={`p-2 min-h-[400px] border border-muted rounded-lg ${
                          isToday ? 'bg-primary/10 border-primary' : 'hover:bg-muted/50'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className={`text-sm font-medium ${
                            isToday ? 'text-primary' : 'text-foreground'
                          }`}>
                            {date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </span>
                          {dayEvents.length > 0 && (
                            <Badge variant="outline" className="text-xs">
                              {dayEvents.length}
                            </Badge>
                          )}
                        </div>
                        
                        <div className="space-y-2">
                          {dayEvents.map(event => (
                            <div 
                              key={event._id}
                              className="text-xs p-2 rounded cursor-pointer hover:bg-muted border-l-2"
                              style={{
                                borderLeftColor: event.type === 'task' ? '#3b82f6' :
                                event.type === 'sprint' ? '#10b981' :
                                event.type === 'milestone' ? '#8b5cf6' :
                                event.type === 'meeting' ? '#f97316' :
                                '#ef4444'
                              }}
                              onClick={() => handleEventClick(event)}
                            >
                              <div className="flex items-center space-x-1 mb-1">
                                <div className={`w-2 h-2 rounded-full ${
                                  event.type === 'task' ? 'bg-blue-500' :
                                  event.type === 'sprint' ? 'bg-green-500' :
                                  event.type === 'milestone' ? 'bg-purple-500' :
                                  event.type === 'meeting' ? 'bg-orange-500' :
                                  'bg-red-500'
                                }`} />
                                <span className="font-medium truncate">{event.title}</span>
                              </div>
                              {event.description && (
                                <p className="text-xs text-muted-foreground line-clamp-2">{event.description}</p>
                              )}
                              {event.project && (
                                <p 
                                  className="text-xs text-muted-foreground mt-1 truncate" 
                                  title={event.project.name && event.project.name.length > 10 ? event.project.name : undefined}
                                >
                                  {event.project.name && event.project.name.length > 10 ? `${event.project.name.slice(0, 10)}…` : event.project.name}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Calendar Grid - Day View */}
              {viewMode === 'day' && (
                <div className="space-y-4">
                  <div className="border border-muted rounded-lg p-4 min-h-[500px]">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold text-foreground">
                        {currentDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                      </h3>
                      {getEventsForDate(currentDate).length > 0 && (
                        <Badge variant="outline" className="text-sm">
                          {getEventsForDate(currentDate).length} event{getEventsForDate(currentDate).length !== 1 ? 's' : ''}
                        </Badge>
                      )}
                    </div>
                    
                    <div className="space-y-3">
                      {getEventsForDate(currentDate).length > 0 ? (
                        getEventsForDate(currentDate).map(event => (
                          <div 
                            key={event._id}
                            className="p-4 rounded-lg border border-muted cursor-pointer hover:bg-muted transition-colors"
                            onClick={() => handleEventClick(event)}
                          >
                            <div className="flex items-start justify-between mb-2">
                              <div className="flex items-center space-x-2">
                                <div className={`w-3 h-3 rounded-full ${
                                  event.type === 'task' ? 'bg-blue-500' :
                                  event.type === 'sprint' ? 'bg-green-500' :
                                  event.type === 'milestone' ? 'bg-purple-500' :
                                  event.type === 'meeting' ? 'bg-orange-500' :
                                  'bg-red-500'
                                }`} />
                                <h4 className="font-medium text-foreground">{event.title}</h4>
                                <Badge className={getTypeColor(event.type)}>
                                  {event.type}
                                </Badge>
                              </div>
                              <Badge className={getPriorityColor(event.priority)}>
                                {event.priority}
                              </Badge>
                            </div>
                            {event.description && (
                              <p className="text-sm text-muted-foreground mb-2">{event.description}</p>
                            )}
                            <div className="flex items-center space-x-4 text-xs text-muted-foreground">
                              {event.project && (
                                <div className="flex items-center space-x-1">
                                  <Target className="h-3 w-3" />
                                  <span className="truncate" title={event.project.name}>
                                    {event.project.name}
                                  </span>
                                </div>
                              )}
                              {event.startDate && (
                                <div className="flex items-center space-x-1">
                                  <Clock className="h-3 w-3" />
                                  <span>{new Date(event.startDate).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
                                </div>
                              )}
                              {event.assignedTo && (
                                <div className="flex items-center space-x-1">
                                  <User className="h-3 w-3" />
                                  <span>{event.assignedTo.firstName} {event.assignedTo.lastName}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="text-center py-12 text-muted-foreground">
                          <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
                          <p>No events scheduled for this day</p>
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
