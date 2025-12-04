'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { formatToTitleCase } from '@/lib/utils'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Clock,
  User,
  Target,
  Loader2,
  Plus,
  AlertTriangle,
  Users,
  Video,
  Repeat
} from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

interface Task {
  _id: string
  title: string
  description: string
  status: 'todo' | 'in_progress' | 'review' | 'testing' | 'done' | 'cancelled'
  priority: 'low' | 'medium' | 'high' | 'critical'
  type: 'bug' | 'feature' | 'improvement' | 'task' | 'subtask'
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
  storyPoints?: number
  dueDate?: string
  estimatedHours?: number
  actualHours?: number
  labels: string[]
  createdAt: string
  updatedAt: string
}

interface SprintEvent {
  _id: string
  title: string
  description?: string
  eventType: 'planning' | 'review' | 'retrospective' | 'daily_standup' | 'demo' | 'other'
  scheduledDate: string
  startTime?: string
  endTime?: string
  duration: number
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled'
  facilitator?: {
    firstName: string
    lastName: string
    email: string
  }
  attendees?: Array<{
    firstName: string
    lastName: string
    email: string
  }>
  location?: string
  meetingLink?: string
  isRecurringSeries?: boolean
  sprint?: {
    _id: string
    name: string
  }
}

interface CalendarViewProps {
  projectId: string
  onCreateTask: () => void
}

export default function CalendarView({ projectId, onCreateTask }: CalendarViewProps) {
  const router = useRouter()
  const [tasks, setTasks] = useState<Task[]>([])
  const [sprintEvents, setSprintEvents] = useState<SprintEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [currentDate, setCurrentDate] = useState(new Date())
  const [view, setView] = useState<'month' | 'week' | 'day'>('month')

  useEffect(() => {
    fetchData()
  }, [projectId])

  const fetchData = async () => {
    try {
      setLoading(true)
      setError('')
      
      // Fetch both tasks and sprint events in parallel
      const [tasksResponse, eventsResponse] = await Promise.all([
        fetch(projectId === 'all' ? '/api/tasks' : `/api/tasks?project=${projectId}`),
        fetch(projectId === 'all' ? '/api/sprint-events' : `/api/sprint-events?projectId=${projectId}`)
      ])
      
      const tasksData = await tasksResponse.json()
      const eventsData = await eventsResponse.json()

      if (tasksData.success) {
        setTasks(tasksData.data)
      } else {
        setError(tasksData.error || 'Failed to fetch tasks')
      }
      
      // Sprint events API returns array directly
      if (Array.isArray(eventsData)) {
        setSprintEvents(eventsData)
      } else if (eventsData.data) {
        setSprintEvents(eventsData.data)
      }
    } catch (err) {
      setError('Failed to fetch data')
    } finally {
      setLoading(false)
    }
  }

  const fetchTasks = async () => {
    fetchData()
  }

  const refreshTasks = () => {
    fetchData()
  }

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'low': return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-800'
      case 'medium': return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 hover:bg-blue-200 dark:hover:bg-blue-800'
      case 'high': return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200 hover:bg-orange-200 dark:hover:bg-orange-800'
      case 'critical': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 hover:bg-red-200 dark:hover:bg-red-800'
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-800'
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'todo': return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-800'
      case 'in_progress': return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 hover:bg-blue-200 dark:hover:bg-blue-800'
      case 'review': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200 hover:bg-yellow-200 dark:hover:bg-yellow-800'
      case 'testing': return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200 hover:bg-purple-200 dark:hover:bg-purple-800'
      case 'done': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 hover:bg-green-200 dark:hover:bg-green-800'
      case 'cancelled': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 hover:bg-red-200 dark:hover:bg-red-800'
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-800'
    }
  }

  const getTasksForDate = (date: Date) => {
    return tasks.filter(task => {
      if (!task.dueDate) return false
      const taskDate = new Date(task.dueDate)
      return taskDate.toDateString() === date.toDateString()
    })
  }

  const getEventsForDate = (date: Date) => {
    return sprintEvents.filter(event => {
      const eventDate = new Date(event.scheduledDate)
      return eventDate.toDateString() === date.toDateString()
    })
  }

  const getEventTypeColor = (eventType: string) => {
    switch (eventType) {
      case 'planning': return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
      case 'review': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
      case 'retrospective': return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200'
      case 'daily_standup': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
      case 'demo': return 'bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200'
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
    }
  }

  const getEventStatusColor = (status: string) => {
    switch (status) {
      case 'scheduled': return 'border-l-blue-500'
      case 'in_progress': return 'border-l-yellow-500'
      case 'completed': return 'border-l-green-500'
      case 'cancelled': return 'border-l-red-500'
      default: return 'border-l-gray-500'
    }
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

  const getWeekDays = (date: Date) => {
    const startOfWeek = new Date(date)
    startOfWeek.setDate(date.getDate() - date.getDay())

    const days = []
    for (let i = 0; i < 7; i++) {
      const day = new Date(startOfWeek)
      day.setDate(startOfWeek.getDate() + i)
      days.push(day)
    }
    return days
  }

  const getDayHours = () => {
    const hours = []
    for (let i = 0; i < 24; i++) {
      hours.push(i)
    }
    return hours
  }

  const navigateMonth = (direction: 'prev' | 'next') => {
    setCurrentDate(prev => {
      const newDate = new Date(prev)
      if (direction === 'prev') {
        newDate.setMonth(prev.getMonth() - 1)
      } else {
        newDate.setMonth(prev.getMonth() + 1)
      }
      return newDate
    })
  }

  const navigateWeek = (direction: 'prev' | 'next') => {
    setCurrentDate(prev => {
      const newDate = new Date(prev)
      if (direction === 'prev') {
        newDate.setDate(prev.getDate() - 7)
      } else {
        newDate.setDate(prev.getDate() + 7)
      }
      return newDate
    })
  }

  const navigateDay = (direction: 'prev' | 'next') => {
    setCurrentDate(prev => {
      const newDate = new Date(prev)
      if (direction === 'prev') {
        newDate.setDate(prev.getDate() - 1)
      } else {
        newDate.setDate(prev.getDate() + 1)
      }
      return newDate
    })
  }

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long'
    })
  }

  const formatWeekDate = (date: Date) => {
    const startOfWeek = new Date(date)
    startOfWeek.setDate(date.getDate() - date.getDay())
    const endOfWeek = new Date(startOfWeek)
    endOfWeek.setDate(startOfWeek.getDate() + 6)

    return `${startOfWeek.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${endOfWeek.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
  }

  const formatDayDate = (date: Date) => {
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  const isToday = (date: Date) => {
    const today = new Date()
    return date.toDateString() === today.toDateString()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-muted-foreground">Loading calendar...</p>
        </div>
      </div>
    )
  }

  return (
    <TooltipProvider>
      <div className="space-y-8 sm:space-y-10">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-xl sm:text-2xl font-semibold text-foreground">Calendar View</h3>
            <p className="text-sm sm:text-base text-muted-foreground mt-1">
              View tasks by their due dates
            </p>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 flex-wrap w-full sm:w-auto">
            <div className="flex items-center gap-1 w-full sm:w-auto">
              <Button
                variant={view === 'month' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setView('month')}
                className="flex-1 sm:flex-initial"
              >
                Month
              </Button>
              <Button
                variant={view === 'week' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setView('week')}
                className="flex-1 sm:flex-initial"
              >
                Week
              </Button>
              <Button
                variant={view === 'day' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setView('day')}
                className="flex-1 sm:flex-initial"
              >
                Day
              </Button>
            </div>
            <Button variant="outline" size="sm" onClick={refreshTasks} className="w-full sm:w-auto">
              <CalendarIcon className="h-4 w-4 mr-2" />
              Refresh
            </Button>
            <Button onClick={onCreateTask} className="w-full sm:w-auto">
              <Plus className="h-4 w-4 mr-2" />
              Add Task
            </Button>
          </div>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {view === 'month' && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>{formatDate(currentDate)}</CardTitle>
                <div className="flex items-center space-x-2">
                  <Button variant="outline" size="sm" onClick={() => navigateMonth('prev')}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setCurrentDate(new Date())}>
                    Today
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => navigateMonth('next')}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-7 gap-1">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                  <div key={day} className="p-2 text-center text-sm font-medium text-muted-foreground">
                    {day}
                  </div>
                ))}
                {getDaysInMonth(currentDate).map((date, index) => {
                  const dayTasks = date ? getTasksForDate(date) : []
                  const dayEvents = date ? getEventsForDate(date) : []
                  const totalItems = dayTasks.length + dayEvents.length
                  
                  return (
                  <div
                    key={index}
                    className={`min-h-[100px] p-2 border border-border ${date ? 'bg-background' : 'bg-muted/30'
                      } ${isToday(date || new Date()) ? 'bg-primary/10 border-primary/20' : ''}`}
                  >
                    {date && (
                      <>
                        <div className="flex items-center justify-between mb-1">
                          <span className={`text-sm font-medium ${isToday(date) ? 'text-primary' : 'text-foreground'
                            }`}>
                            {date.getDate()}
                          </span>
                          {totalItems > 0 && (
                            <Badge variant="secondary" className="text-xs">
                              {totalItems}
                            </Badge>
                          )}
                        </div>
                        <div className="space-y-1">
                          {/* Sprint Events */}
                          {dayEvents.slice(0, 2).map(event => (
                            <Tooltip key={event._id}>
                              <TooltipTrigger asChild>
                                <div
                                  className={`text-xs p-1 rounded bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-900/30 dark:to-indigo-900/30 border border-purple-200 dark:border-purple-800 shadow-sm cursor-pointer hover:shadow-md transition-shadow ${getEventStatusColor(event.status)} border-l-2`}
                                  onClick={() => router.push(`/sprint-events/${event._id}`)}
                                >
                                  <div className="font-medium truncate flex items-center gap-1">
                                    <Video className="h-3 w-3 text-purple-600 dark:text-purple-400" />
                                    {event.title}
                                    {event.isRecurringSeries && <Repeat className="h-2.5 w-2.5 text-muted-foreground" />}
                                  </div>
                                  <div className="text-[10px] text-muted-foreground">
                                    {event.startTime || 'All day'} • {formatToTitleCase(event.eventType.replace('_', ' '))}
                                  </div>
                                </div>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="font-medium">{event.title}</p>
                                <p className="text-xs">{formatToTitleCase(event.eventType.replace('_', ' '))}</p>
                                {event.startTime && <p className="text-xs">{event.startTime} - {event.endTime || 'TBD'}</p>}
                                {event.attendees && <p className="text-xs">{event.attendees.length} attendee(s)</p>}
                              </TooltipContent>
                            </Tooltip>
                          ))}
                          {/* Tasks */}
                          {dayTasks.slice(0, dayEvents.length > 0 ? 1 : 3).map(task => (
                            <Tooltip key={task._id}>
                              <TooltipTrigger asChild>
                                <div
                                  className="text-xs p-1 rounded bg-card border shadow-sm cursor-pointer hover:shadow-md transition-shadow"
                                  onClick={() => router.push(`/tasks/${task._id}`)}
                                >
                                  <div className="font-medium truncate">{task.title}</div>
                                  <div className="flex items-center space-x-1">
                                    <Badge className={`text-xs ${getPriorityColor(task.priority)}`}>
                                      {formatToTitleCase(task.priority)}
                                    </Badge>
                                    <Badge className={`text-xs ${getStatusColor(task.status)}`}>
                                      {formatToTitleCase(task.status)}
                                    </Badge>
                                  </div>
                                </div>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>{task.title}</p>
                              </TooltipContent>
                            </Tooltip>
                          ))}
                          {totalItems > 3 && (
                            <div className="text-xs text-muted-foreground">
                              +{totalItems - (dayEvents.length > 0 ? dayEvents.slice(0, 2).length + dayTasks.slice(0, 1).length : dayTasks.slice(0, 3).length)} more
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )})}
              </div>
            </CardContent>
          </Card>
        )}

        {view === 'week' && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>{formatWeekDate(currentDate)}</CardTitle>
                <div className="flex items-center space-x-2">
                  <Button variant="outline" size="sm" onClick={() => navigateWeek('prev')}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setCurrentDate(new Date())}>
                    Today
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => navigateWeek('next')}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-7 gap-1">
                {getWeekDays(currentDate).map((date, index) => {
                  const dayTasks = getTasksForDate(date)
                  const dayEvents = getEventsForDate(date)
                  const totalItems = dayTasks.length + dayEvents.length
                  
                  return (
                  <div key={index} className="min-h-[200px] p-2 border border-border">
                    <div className="flex items-center justify-between mb-2">
                      <span className={`text-sm font-medium ${isToday(date) ? 'text-primary' : 'text-foreground'
                        }`}>
                        {date.toLocaleDateString('en-US', { weekday: 'short' })}
                      </span>
                      <div className="flex items-center gap-1">
                        {totalItems > 0 && (
                          <Badge variant="secondary" className="text-xs">
                            {totalItems}
                          </Badge>
                        )}
                        <span className={`text-sm ${isToday(date) ? 'text-primary font-medium' : 'text-muted-foreground'
                          }`}>
                          {date.getDate()}
                        </span>
                      </div>
                    </div>
                    <div className="space-y-1">
                      {/* Sprint Events */}
                      {dayEvents.map(event => (
                        <Tooltip key={event._id}>
                          <TooltipTrigger asChild>
                            <div
                              className={`text-xs p-2 rounded bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-900/30 dark:to-indigo-900/30 border border-purple-200 dark:border-purple-800 shadow-sm cursor-pointer hover:shadow-md transition-shadow ${getEventStatusColor(event.status)} border-l-2`}
                              onClick={() => router.push(`/sprint-events/${event._id}`)}
                            >
                              <div className="font-medium truncate flex items-center gap-1">
                                <Video className="h-3 w-3 text-purple-600 dark:text-purple-400" />
                                {event.title}
                                {event.isRecurringSeries && <Repeat className="h-2.5 w-2.5 text-muted-foreground" />}
                              </div>
                              <div className="flex items-center gap-2 mt-1">
                                <span className="text-[10px] text-muted-foreground">
                                  {event.startTime || 'All day'}
                                </span>
                                <Badge className={`text-[10px] ${getEventTypeColor(event.eventType)}`}>
                                  {formatToTitleCase(event.eventType.replace('_', ' '))}
                                </Badge>
                              </div>
                              {event.attendees && event.attendees.length > 0 && (
                                <div className="flex items-center gap-1 mt-1 text-[10px] text-muted-foreground">
                                  <Users className="h-2.5 w-2.5" />
                                  {event.attendees.length} attendee(s)
                                </div>
                              )}
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="font-medium">{event.title}</p>
                            <p className="text-xs">{formatToTitleCase(event.eventType.replace('_', ' '))}</p>
                            {event.startTime && <p className="text-xs">{event.startTime} - {event.endTime || 'TBD'}</p>}
                          </TooltipContent>
                        </Tooltip>
                      ))}
                      {/* Tasks */}
                      {dayTasks.map(task => (
                        <Tooltip key={task._id}>
                          <TooltipTrigger asChild>
                            <div
                              className="text-xs p-2 rounded bg-card border shadow-sm cursor-pointer hover:shadow-md transition-shadow"
                              onClick={() => router.push(`/tasks/${task._id}`)}
                            >
                              <div className="font-medium truncate">{task.title}</div>
                              <div className="flex items-center space-x-1 mt-1">
                                <Badge className={`text-xs ${getPriorityColor(task.priority)}`}>
                                  {formatToTitleCase(task.priority)}
                                </Badge>
                                <Badge className={`text-xs ${getStatusColor(task.status)}`}>
                                  {formatToTitleCase(task.status)}
                                </Badge>
                              </div>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{task.title}</p>
                          </TooltipContent>
                        </Tooltip>
                      ))}
                    </div>
                  </div>
                )})}
              </div>
            </CardContent>
          </Card>
        )}

        {view === 'day' && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>{formatDayDate(currentDate)}</CardTitle>
                <div className="flex items-center space-x-2">
                  <Button variant="outline" size="sm" onClick={() => navigateDay('prev')}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setCurrentDate(new Date())}>
                    Today
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => navigateDay('next')}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-4">
                {getDayHours().map(hour => {
                  const hourTasks = getTasksForDate(currentDate).filter(task => {
                    if (!task.dueDate) return false
                    const taskDate = new Date(task.dueDate)
                    const taskHour = taskDate.getHours()
                    return taskHour === hour
                  })
                  
                  const hourEvents = getEventsForDate(currentDate).filter(event => {
                    if (!event.startTime) return hour === 9 // Default to 9 AM for all-day events
                    const [eventHour] = event.startTime.split(':').map(Number)
                    return eventHour === hour
                  })
                  
                  return (
                  <div key={hour} className="flex items-start space-x-4 p-3 border border-border rounded-lg">
                    <div className="w-16 text-sm text-muted-foreground">
                      {hour === 0 ? '12:00 AM' : hour < 12 ? `${hour}:00 AM` : hour === 12 ? '12:00 PM' : `${hour - 12}:00 PM`}
                    </div>
                    <div className="flex-1 space-y-2">
                      {/* Sprint Events for this hour */}
                      {hourEvents.map(event => (
                        <div
                          key={event._id}
                          className={`p-3 rounded bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-900/30 dark:to-indigo-900/30 border border-purple-200 dark:border-purple-800 shadow-sm cursor-pointer hover:shadow-md transition-shadow ${getEventStatusColor(event.status)} border-l-4`}
                          onClick={() => router.push(`/sprint-events/${event._id}`)}
                        >
                          <div className="flex items-center gap-2">
                            <Video className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                            <span className="font-medium">{event.title}</span>
                            {event.isRecurringSeries && <Repeat className="h-3 w-3 text-muted-foreground" />}
                            <Badge className={`text-xs ${getEventTypeColor(event.eventType)}`}>
                              {formatToTitleCase(event.eventType.replace('_', ' '))}
                            </Badge>
                          </div>
                          {event.description && (
                            <div className="text-sm text-muted-foreground mt-1">{event.description}</div>
                          )}
                          <div className="flex items-center flex-wrap gap-3 mt-2 text-sm text-muted-foreground">
                            <div className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              <span>{event.startTime || 'All day'}{event.endTime ? ` - ${event.endTime}` : ''}</span>
                            </div>
                            {event.duration && (
                              <span>({event.duration} min)</span>
                            )}
                            {event.attendees && event.attendees.length > 0 && (
                              <div className="flex items-center gap-1">
                                <Users className="h-3 w-3" />
                                <span>{event.attendees.length} attendee(s)</span>
                              </div>
                            )}
                            {event.location && (
                              <div className="flex items-center gap-1">
                                <Target className="h-3 w-3" />
                                <span>{event.location}</span>
                              </div>
                            )}
                            {event.facilitator && (
                              <div className="flex items-center gap-1">
                                <User className="h-3 w-3" />
                                <span>{event.facilitator.firstName} {event.facilitator.lastName}</span>
                              </div>
                            )}
                          </div>
                          {event.meetingLink && (
                            <a 
                              href={event.meetingLink} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 mt-2 text-xs text-purple-600 dark:text-purple-400 hover:underline"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Video className="h-3 w-3" />
                              Join Meeting
                            </a>
                          )}
                        </div>
                      ))}
                      {/* Tasks for this hour */}
                      {hourTasks.map(task => (
                        <div
                          key={task._id}
                          className="p-3 rounded bg-card border shadow-sm cursor-pointer hover:shadow-md transition-shadow"
                          onClick={() => router.push(`/tasks/${task._id}`)}
                        >
                          <div className="font-medium">{task.title}</div>
                          <div className="text-sm text-muted-foreground mt-1">{task.description}</div>
                          <div className="flex items-center space-x-2 mt-2">
                            <Badge className={`text-xs ${getPriorityColor(task.priority)}`}>
                              {formatToTitleCase(task.priority)}
                            </Badge>
                            <Badge className={`text-xs ${getStatusColor(task.status)}`}>
                              {formatToTitleCase(task.status)}
                            </Badge>
                            {task.assignedTo && (
                              <div className="flex items-center space-x-1 text-xs text-muted-foreground">
                                <User className="h-3 w-3" />
                                <span>{task.assignedTo.firstName} {task.assignedTo.lastName}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )})}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </TooltipProvider>
  )
}
