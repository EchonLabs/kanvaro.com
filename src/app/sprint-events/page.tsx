'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
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
  MoreVertical
} from 'lucide-react'
import { AddSprintEventModal } from '@/components/sprint-events/AddSprintEventModal'
import { EditSprintEventModal } from '@/components/sprint-events/EditSprintEventModal'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/DropdownMenu'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { format } from 'date-fns'

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
    firstName: string
    lastName: string
    email: string
  }
  attendees: Array<{
    firstName: string
    lastName: string
    email: string
  }>
  outcomes?: {
    decisions: string[]
    actionItems: Array<{
      description: string
      assignedTo: string
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
  const { user, isLoading: authLoading, isAuthenticated } = useAuth()
  const projectId = params.id as string
  const [events, setEvents] = useState<SprintEvent[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterType, setFilterType] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterProject, setFilterProject] = useState('all')
  const [projectQuery, setProjectQuery] = useState('')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingEvent, setEditingEvent] = useState<SprintEvent | null>(null)

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/login')
      return
    }
  }, [authLoading, isAuthenticated, router])

  useEffect(() => {
    if (isAuthenticated) {
      fetchSprintEvents()
      if (!projectId) {
        fetchProjects()
      }
    }
  }, [projectId, isAuthenticated])

  const fetchProjects = async () => {
    try {
      const response = await fetch('/api/projects')
      if (response.ok) {
        const data = await response.json()
        setProjects(data.projects || [])
      }
    } catch (error) {
      console.error('Error fetching projects:', error)
    }
  }

  const fetchSprintEvents = async () => {
    try {
      setLoading(true)
      const url = projectId ? `/api/sprint-events?projectId=${projectId}` : '/api/sprint-events'
      const response = await fetch(url)
      if (response.ok) {
        const data = await response.json()
        setEvents(data)
      }
    } catch (error) {
      console.error('Error fetching sprint events:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleEventAdded = () => {
    fetchSprintEvents()
    setShowAddModal(false)
  }

  const handleEventUpdated = () => {
    fetchSprintEvents()
    setEditingEvent(null)
  }

  const handleEventDeleted = async (eventId: string) => {
    if (!confirm('Are you sure you want to delete this event?')) {
      return
    }
    try {
      const response = await fetch(`/api/sprint-events/${eventId}`, {
        method: 'DELETE'
      })
      if (response.ok) {
        fetchSprintEvents()
      }
    } catch (error) {
      console.error('Error deleting sprint event:', error)
    }
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
    const dateObj = new Date(date)
    const dateStr = format(dateObj, 'MMM dd, yyyy')
    if (startTime && endTime) {
      return `${dateStr} • ${startTime} - ${endTime}`
    }
    return dateStr
  }

  const filteredEvents = events.filter(event => {
    const matchesSearch = event.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         event.description?.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesType = filterType === 'all' || event.eventType === filterType
    const matchesStatus = filterStatus === 'all' || event.status === filterStatus
    const matchesProject = filterProject === 'all' || event.project._id === filterProject
    
    return matchesSearch && matchesType && matchesStatus && matchesProject
  })

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
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Sprint Events</h1>
            <p className="text-muted-foreground">
              {projectId ? 'Manage agile events and ceremonies' : 'View all sprint events across your projects'}
            </p>
          </div>
          <Button onClick={() => setShowAddModal(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Create Event
          </Button>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search events..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
              <div className="flex gap-2 flex-wrap">
                {!projectId && (
                  <Select 
                    value={filterProject} 
                    onValueChange={setFilterProject}
                    onOpenChange={(open) => { if (open) setProjectQuery('') }}
                  >
                    <SelectTrigger className="w-[180px]">
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
                  <SelectTrigger className="w-[150px]">
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
                  <SelectTrigger className="w-[150px]">
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
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Events Display */}
        {filteredEvents.length === 0 ? (
          <Card>
            <CardContent className="text-center py-12">
              <Calendar className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground mb-4">No sprint events found</p>
              <Button onClick={() => setShowAddModal(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Create First Event
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

                <TabsContent value="grid" className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredEvents.map((event) => (
                      <Card key={event._id} className="hover:shadow-md transition-shadow">
                        <CardContent className="p-6">
                          <div className="space-y-4">
                            <div className="flex items-start justify-between">
                              <div className="flex items-center space-x-2">
                                {getEventTypeIcon(event.eventType)}
                                <div className="flex-1 min-w-0">
                                  <h3 className="text-lg font-semibold truncate">{event.title}</h3>
                                  <p className="text-sm text-muted-foreground truncate">
                                    {event.sprint.name} • {event.project.name}
                                  </p>
                                </div>
                              </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => router.push(`/sprint-events/${event._id}`)}>
                            <Eye className="h-4 w-4 mr-2" />
                            View Event
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setEditingEvent(event)}>
                            <Edit className="h-4 w-4 mr-2" />
                            Edit Event
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem 
                            onClick={() => handleEventDeleted(event._id)}
                            className="text-destructive"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                            </div>

                            <div className="flex items-center gap-2 flex-wrap">
                              {getEventTypeBadge(event.eventType)}
                              {getStatusBadge(event.status)}
                            </div>

                            <div className="space-y-2">
                              <div className="flex items-center space-x-2 text-sm">
                                <Calendar className="h-4 w-4 text-muted-foreground" />
                                <span className="text-muted-foreground">
                                  {formatDateTime(event.scheduledDate, event.startTime, event.endTime)}
                                </span>
                              </div>
                              <div className="flex items-center space-x-2 text-sm">
                                <Users className="h-4 w-4 text-muted-foreground" />
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

                <TabsContent value="list" className="space-y-4">
                  <div className="space-y-4">
                    {filteredEvents.map((event) => (
              <Card key={event._id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4 flex-1 min-w-0">
                      <div className="flex items-center space-x-2">
                        {getEventTypeIcon(event.eventType)}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="text-lg font-semibold truncate">{event.title}</h3>
                            {getEventTypeBadge(event.eventType)}
                            {getStatusBadge(event.status)}
                          </div>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                            <span>{event.sprint.name}</span>
                            <span>•</span>
                            <span>{event.project.name}</span>
                            <span>•</span>
                            <span>{formatDateTime(event.scheduledDate, event.startTime, event.endTime)}</span>
                            <span>•</span>
                            <span>{event.attendees.length} {event.attendees.length === 1 ? 'attendee' : 'attendees'}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => router.push(`/sprint-events/${event._id}`)}>
                          <Eye className="h-4 w-4 mr-2" />
                          View Event
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setEditingEvent(event)}>
                          <Edit className="h-4 w-4 mr-2" />
                          Edit Event
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem 
                          onClick={() => handleEventDeleted(event._id)}
                          className="text-destructive"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardContent>
              </Card>
                    ))}
                  </div>
                </TabsContent>
              </Tabs>
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
      </div>
    </MainLayout>
  )
}
