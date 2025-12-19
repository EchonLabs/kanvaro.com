'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Progress } from '@/components/ui/Progress'
import { formatToTitleCase } from '@/lib/utils'
import { useDateTime } from '@/components/providers/DateTimeProvider'
import { 
  Calendar, 
  Clock, 
  Users, 
  Target,
  CheckCircle,
  AlertCircle,
  Play,
  Pause,
  Square,
  Plus
} from 'lucide-react'

interface SprintEvent {
  _id: string
  eventType: string
  title: string
  description?: string
  scheduledDate: string
  actualDate?: string
  duration: number
  status: string
  facilitator: {
    firstName: string
    lastName: string
  }
  attendees: Array<{
    firstName: string
    lastName: string
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
}

interface Sprint {
  _id: string
  name: string
  status: string
  startDate: string
  endDate: string
  actualStartDate?: string
  actualEndDate?: string
  goal?: string
  velocity?: number
  plannedVelocity?: number
  actualVelocity?: number
  capacity: number
  actualCapacity?: number
  stories: any[]
  tasks: any[]
}

interface SprintReportData {
  sprints: Sprint[]
  sprintEvents: SprintEvent[]
  summary: {
    totalSprints: number
    activeSprints: number
    completedSprints: number
    totalEvents: number
  }
}

interface SprintReportProps {
  projectId: string
}

export function SprintReport({ projectId }: SprintReportProps) {
  const [data, setData] = useState<SprintReportData | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedSprint, setSelectedSprint] = useState<string | null>(null)
  const { formatDate } = useDateTime()

  useEffect(() => {
    fetchSprintData()
  }, [projectId])

  const fetchSprintData = async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/reports?projectId=${projectId}&type=sprint`)
      if (response.ok) {
        const data = await response.json()
        setData(data)
      }
    } catch (error) {
      console.error('Error fetching sprint data:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground">No sprint data available</p>
      </div>
    )
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'planning':
        return <AlertCircle className="h-4 w-4 text-yellow-500" />
      case 'active':
        return <Play className="h-4 w-4 text-green-500" />
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-blue-500" />
      case 'cancelled':
        return <Square className="h-4 w-4 text-red-500" />
      default:
        return <Pause className="h-4 w-4 text-gray-500" />
    }
  }

  const getStatusBadge = (status: string) => {
    const variants = {
      'planning': 'secondary',
      'active': 'default',
      'completed': 'outline',
      'cancelled': 'destructive'
    } as const
    
    return (
      <Badge variant={variants[status as keyof typeof variants] || 'secondary'}>
        {status}
      </Badge>
    )
  }

  const getEventTypeIcon = (eventType: string) => {
    switch (eventType) {
      case 'planning':
        return <Target className="h-4 w-4" />
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

  const getEventStatusBadge = (status: string) => {
    const variants = {
      'scheduled': 'secondary',
      'in_progress': 'default',
      'completed': 'outline',
      'cancelled': 'destructive'
    } as const
    
    return (
      <Badge variant={variants[status as keyof typeof variants] || 'secondary'}>
        {status.replace('_', ' ')}
      </Badge>
    )
  }

  const filteredEvents = selectedSprint 
    ? data.sprintEvents.filter(event => (event as any).sprint === selectedSprint)
    : data.sprintEvents

  return (
    <div className="space-y-6">
      {/* Sprint Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Sprints</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.summary.totalSprints}</div>
            <p className="text-xs text-muted-foreground">sprints planned</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Active Sprints</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{data.summary.activeSprints}</div>
            <p className="text-xs text-muted-foreground">currently running</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Completed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{data.summary.completedSprints}</div>
            <p className="text-xs text-muted-foreground">sprints finished</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Events</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.summary.totalEvents}</div>
            <p className="text-xs text-muted-foreground">agile events</p>
          </CardContent>
        </Card>
      </div>

      {/* Sprint List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Calendar className="h-5 w-5" />
              <span>Sprints</span>
            </div>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-2" />
              New Sprint
            </Button>
          </CardTitle>
          <CardDescription>
            Sprint overview and management
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {data.sprints.map((sprint) => (
              <div key={sprint._id} className="border rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    {getStatusIcon(sprint.status)}
                    <span className="text-sm font-medium">{sprint.name}</span>
                    <Badge>{formatToTitleCase(sprint.status)}</Badge>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedSprint(selectedSprint === sprint._id ? null : sprint._id)}
                  >
                    {selectedSprint === sprint._id ? 'Hide Events' : 'View Events'}
                  </Button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">Sprint Duration</p>
                    <p className="text-sm">
                      {new Date(sprint.startDate).toLocaleDateString()} - {new Date(sprint.endDate).toLocaleDateString()}
                    </p>
                    {sprint.actualStartDate && sprint.actualEndDate && (
                      <p className="text-xs text-muted-foreground">
                        Actual: {new Date(sprint.actualStartDate).toLocaleDateString()} - {new Date(sprint.actualEndDate).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">Velocity & Capacity</p>
                    <div className="flex space-x-4 text-sm">
                      <span>Planned: {sprint.plannedVelocity || 0} pts</span>
                      <span>Actual: {sprint.actualVelocity || 0} pts</span>
                    </div>
                    <div className="flex space-x-4 text-sm">
                      <span>Capacity: {sprint.capacity}h</span>
                      <span>Used: {sprint.actualCapacity || 0}h</span>
                    </div>
                  </div>
                </div>

                {sprint.goal && (
                  <div className="p-3 bg-muted rounded">
                    <p className="text-xs text-muted-foreground">Sprint Goal</p>
                    <p className="text-sm">{sprint.goal}</p>
                  </div>
                )}

                {/* Sprint Events */}
                {selectedSprint === sprint._id && (
                  <div className="space-y-3">
                    <p className="text-sm font-medium">Sprint Events</p>
                    {filteredEvents
                      .filter(event => (event as any).sprint === sprint._id)
                      .map((event) => (
                        <div key={event._id} className="border rounded-lg p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-2">
                              {getEventTypeIcon(event.eventType)}
                              <span className="text-sm font-medium">{event.title}</span>
                              <Badge>{formatToTitleCase(event.status)}</Badge>
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {event.duration} min
                            </div>
                          </div>
                          
                          <div className="text-xs text-muted-foreground">
                            <p>
                              Scheduled: {new Date(event.scheduledDate).toLocaleString()}
                              {event.actualDate && (
                                <span> • Actual: {new Date(event.actualDate).toLocaleString()}</span>
                              )}
                            </p>
                            <p>
                              Facilitator: {event.facilitator.firstName} {event.facilitator.lastName}
                            </p>
                            <p>
                              Attendees: {event.attendees.length} people
                            </p>
                          </div>

                          {event.outcomes && (
                            <div className="space-y-2">
                              {event.outcomes.decisions && event.outcomes.decisions.length > 0 && (
                                <div>
                                  <p className="text-xs font-medium">Decisions:</p>
                                  <ul className="text-xs text-muted-foreground list-disc list-inside">
                                    {event.outcomes.decisions.map((decision, index) => (
                                      <li key={index}>{decision}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                              
                              {event.outcomes.actionItems && event.outcomes.actionItems.length > 0 && (
                                <div>
                                  <p className="text-xs font-medium">Action Items:</p>
                                  <ul className="text-xs text-muted-foreground list-disc list-inside">
                                    {event.outcomes.actionItems.map((item, index) => (
                                      <li key={index}>
                                        {item.description} (Due: {formatDate(item.dueDate)})
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                              
                              {event.outcomes.notes && (
                                <div>
                                  <p className="text-xs font-medium">Notes:</p>
                                  <p className="text-xs text-muted-foreground">{event.outcomes.notes}</p>
                                </div>
                              )}
                            </div>
                          )}

                          {event.location && (
                            <p className="text-xs text-muted-foreground">
                              Location: {event.location}
                            </p>
                          )}
                          
                          {event.meetingLink && (
                            <p className="text-xs text-muted-foreground">
                              Meeting Link: {event.meetingLink}
                            </p>
                          )}
                        </div>
                      ))
                    }
                  </div>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
