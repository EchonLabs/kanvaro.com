'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { MainLayout } from '@/components/layout/MainLayout'
import { 
  Calendar, 
  Clock, 
  Users, 
  MapPin,
  Link as LinkIcon,
  Edit,
  Trash2,
  CheckCircle,
  Play,
  Square,
  ArrowLeft,
  FileText,
  Image as ImageIcon,
  ExternalLink,
  Target
} from 'lucide-react'
import { useDateTime } from '@/components/providers/DateTimeProvider'
import { EditSprintEventModal } from '@/components/sprint-events/EditSprintEventModal'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/DropdownMenu'

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
  createdAt: string
  updatedAt: string
}

export default function SprintEventDetailsPage() {
  const params = useParams()
  const router = useRouter()
  const { user, isLoading: authLoading, isAuthenticated } = useAuth()
  const eventId = params.id as string
  const [event, setEvent] = useState<SprintEvent | null>(null)
  const [fullProject, setFullProject] = useState<{ _id: string; name: string } | null>(null)
const [fullSprint, setFullSprint] = useState<{ _id: string; name: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [editingEvent, setEditingEvent] = useState<SprintEvent | null>(null)
  const { formatDate, formatTime } = useDateTime()

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/login')
      return
    }
  }, [authLoading, isAuthenticated, router])

  useEffect(() => {
    if (isAuthenticated && eventId) {
      fetchEvent()
    }
  }, [eventId, isAuthenticated])

  const fetchEvent = async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/sprint-events/view-sprint-event/${eventId}`)
      if (response.ok) {
        const data = await response.json()
        setEvent(data)
          // Fetch full project
      const projectRes = await fetch(`/api/projects/${data?.project?._id}`)
      const projectData = projectRes.ok ? await projectRes.json() : null
      setFullProject(projectData)

      // Fetch full sprint
      const sprintRes = await fetch(`/api/sprints/${data?.sprint?._id}`)
      const sprintData = sprintRes.ok ? await sprintRes.json() : null
      setFullSprint(sprintData)
      }
    } catch (error) {
      console.error('Error fetching sprint event:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleEventUpdated = () => {
    fetchEvent()
    setEditingEvent(null)
  }

  const handleEventDeleted = async () => {
    if (!confirm('Are you sure you want to delete this event?')) {
      return
    }
    try {
      const response = await fetch(`/api/sprint-events/view-sprint-event/${eventId}`, {
        method: 'DELETE'
      })
      if (response.ok) {
        router.push('/sprint-events')
      }
    } catch (error) {
      console.error('Error deleting sprint event:', error)
    }
  }

  const updateStatus = async (newStatus: string) => {
    try {
      const response = await fetch(`/api/sprint-events/view-sprint-event/${eventId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: newStatus })
      })
      if (response.ok) {
        fetchEvent()
      }
    } catch (error) {
      console.error('Error updating status:', error)
    }
  }

  const formatMeetingLink = (link: string) => {
    // If the link already has a protocol, return it as is
    if (link.match(/^https?:\/\//i)) {
      return link
    }
    // Otherwise, prepend https://
    return `https://${link}`
  }

  const getEventTypeIcon = (eventType: string) => {
    switch (eventType) {
      case 'planning':
        return <Target className="h-5 w-5" />
      case 'review':
        return <CheckCircle className="h-5 w-5" />
      case 'retrospective':
        return <Users className="h-5 w-5" />
      case 'daily_standup':
        return <Clock className="h-5 w-5" />
      case 'demo':
        return <Play className="h-5 w-5" />
      default:
        return <Calendar className="h-5 w-5" />
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
      <Badge 
        variant={variants[status as keyof typeof variants] || 'secondary'} 
        className="pointer-events-none"
      >
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
      <Badge 
        variant="outline" 
        className={`${colors[eventType as keyof typeof colors] || 'bg-gray-500'} text-white border-0 pointer-events-none`}
      >
        {labels[eventType as keyof typeof labels] || eventType}
      </Badge>
    )
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
  }

  if (authLoading || loading) {
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

  if (!event) {
    return (
      <MainLayout>
        <div className="text-center py-8">
          <Calendar className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-2xl font-semibold mb-2">Event Not Found</h2>
          <p className="text-muted-foreground mb-4">
            The sprint event you're looking for doesn't exist.
          </p>
          <Button onClick={() => router.push('/sprint-events')}>
            Back to Events
          </Button>
        </div>
      </MainLayout>
    )
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-4">
            <Button variant="ghost" size="sm" onClick={() => router.push('/sprint-events')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <div>
              <h1 className="text-3xl font-bold">{event.title}</h1>
              <p className="text-muted-foreground">
                {event.project?.name} • {event.sprint?.name}
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Button variant="outline" onClick={() => setEditingEvent(event)}>
              <Edit className="h-4 w-4 mr-2" />
              Edit
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">
                  Actions
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {event.status !== 'completed' && (
                  <DropdownMenuItem onClick={() => updateStatus('completed')}>
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Mark as Completed
                  </DropdownMenuItem>
                )}
                {event.status !== 'in_progress' && event.status !== 'completed' && (
                  <DropdownMenuItem onClick={() => updateStatus('in_progress')}>
                    <Play className="h-4 w-4 mr-2" />
                    Mark as In Progress
                  </DropdownMenuItem>
                )}
                {event.status !== 'cancelled' && (
                  <DropdownMenuItem onClick={() => updateStatus('cancelled')}>
                    <Square className="h-4 w-4 mr-2" />
                    Cancel Event
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem 
                  onClick={handleEventDeleted}
                  className="text-destructive"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Event
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 flex flex-col gap-6">
            {/* Event Summary */}
            <Card>
              <CardHeader>
                <CardTitle>Event Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-2">
                  {getEventTypeIcon(event.eventType)}
                  {getEventTypeBadge(event.eventType)}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Project</p>
                    <p className="font-medium">{event.project.name}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Sprint</p>
                    <p className="font-medium">{event.sprint?.name}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Created By</p>
                    <p className="font-medium">
                      {event.facilitator.firstName} {event.facilitator.lastName}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Created Date(Time)</p>
                    <p className="font-medium">
                      {formatDate(event.createdAt)} ({formatTime(event.createdAt)})
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Schedule */}
            <Card>
              <CardHeader>
                <CardTitle>Schedule</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Date</p>
                    <p className="font-medium">
                      {formatDate(event.scheduledDate)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Time</p>
                    <p className="font-medium">
                      {event.startTime && event.endTime 
                        ? `${event.startTime} → ${event.endTime}`
                        : event.startTime 
                        ? `${event.startTime} (${event.duration} min)`
                        : `${event.duration} minutes`
                      }
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Status</p>
                    {getStatusBadge(event.status)}
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Duration</p>
                    <p className="font-medium">{event.duration} minutes</p>
                  </div>
                </div>
                {event.location && (
                  <div className="flex items-center space-x-2">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <span>{event.location}</span>
                  </div>
                )}
                {event.meetingLink && (
                  <div className="flex items-center space-x-2">
                    <LinkIcon className="h-4 w-4 text-muted-foreground" />
                    <a 
                      href={formatMeetingLink(event.meetingLink)} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:text-blue-800 hover:underline font-medium"
                    >
                      {event.meetingLink}
                    </a>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Description / Notes */}
            {event.description && (
              <Card>
                <CardHeader>
                  <CardTitle>Description / Notes</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="prose max-w-none">
                    <p className="whitespace-pre-wrap">{event.description}</p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Event Outcomes */}
            {event.outcomes && (
              <Card>
                <CardHeader>
                  <CardTitle>Event Outcomes</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Decisions Made */}
                  {event.outcomes.decisions && event.outcomes.decisions.length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                        <CheckCircle className="h-4 w-4" />
                        Decisions Made
                      </h4>
                      <ul className="space-y-2">
                        {event.outcomes.decisions.map((decision, index) => (
                          decision.trim() && (
                            <li key={index} className="flex items-start gap-2">
                              <span className="text-muted-foreground mt-1">•</span>
                              <span className="flex-1">{decision}</span>
                            </li>
                          )
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Action Items */}
                  {event.outcomes.actionItems && event.outcomes.actionItems.length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                        <Target className="h-4 w-4" />
                        Action Items
                      </h4>
                      <div className="space-y-3">
                        {event.outcomes.actionItems.map((item, index) => (
                          item.description.trim() && (
                            <div key={index} className="border rounded-md p-3 space-y-2">
                              <p className="font-medium">{item.description}</p>
                              <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                                {item.assignedTo && (
                                  <div className="flex items-center gap-1">
                                    <Users className="h-3 w-3" />
                                    <span>
                                      {typeof item.assignedTo === 'object' && item.assignedTo !== null && 'firstName' in item.assignedTo
                                        ? `${item.assignedTo.firstName} ${item.assignedTo.lastName}`.trim()
                                        : typeof item.assignedTo === 'string' && item.assignedTo.length > 0
                                        ? item.assignedTo
                                        : 'Unassigned'}
                                    </span>
                                  </div>
                                )}
                                {item.dueDate && (
                                  <div className="flex items-center gap-1">
                                    <Calendar className="h-3 w-3" />
                                    <span>Due {formatDate(item.dueDate)}</span>
                                  </div>
                                )}
                                {item.status && (
                                  <Badge variant={item.status === 'completed' ? 'outline' : 'secondary'}>
                                    {item.status === 'completed' ? 'Completed' : item.status === 'in_progress' ? 'In Progress' : 'Pending'}
                                  </Badge>
                                )}
                              </div>
                            </div>
                          )
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Notes */}
                  {event.outcomes.notes && event.outcomes.notes.trim() && (
                    <div>
                      <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                        <FileText className="h-4 w-4" />
                        Notes
                      </h4>
                      <div className="prose max-w-none">
                        <p className="whitespace-pre-wrap text-sm">{event.outcomes.notes}</p>
                      </div>
                    </div>
                  )}

                  {/* Show message if no outcomes */}
                  {(!event.outcomes.decisions || event.outcomes.decisions.length === 0) &&
                   (!event.outcomes.actionItems || event.outcomes.actionItems.length === 0) &&
                   (!event.outcomes.notes || !event.outcomes.notes.trim()) && (
                    <p className="text-sm text-muted-foreground">No outcomes recorded yet.</p>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Attachments */}
            {event.attachments && event.attachments.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Attachments</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {event.attachments.map((attachment, index) => (
                      <div key={index} className="flex items-center justify-between p-3 border rounded-md">
                        <div className="flex items-center space-x-3 flex-1 min-w-0">
                          {attachment.type === 'link' ? (
                            <LinkIcon className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                          ) : attachment.type.startsWith('image/') ? (
                            <ImageIcon className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                          ) : (
                            <FileText className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{attachment.name}</p>
                            {attachment.size > 0 && (
                              <p className="text-sm text-muted-foreground">
                                {formatFileSize(attachment.size)}
                              </p>
                            )}
                          </div>
                        </div>
                        <a
                          href={attachment.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ml-2"
                        >
                          <Button variant="ghost" size="sm">
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                        </a>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Sidebar */}
          <div className="flex flex-col gap-6">
            {/* Participants */}
            <Card>
              <CardHeader>
                <CardTitle>Participants</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Facilitator</p>
                    <div className="flex items-center space-x-2">
                      <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                        <span className="text-xs font-medium">
                          {event.facilitator.firstName[0]}{event.facilitator.lastName[0]}
                        </span>
                      </div>
                      <div>
                        <p className="text-sm font-medium">
                          {event.facilitator.firstName} {event.facilitator.lastName}
                        </p>
                        <p className="text-xs text-muted-foreground">{event.facilitator.email}</p>
                      </div>
                    </div>
                  </div>
                  {event.attendees.length > 0 && (
                    <div>
                      <p className="text-sm text-muted-foreground mb-2">Attendees ({event.attendees.length})</p>
                      <div className="space-y-2">
                        {event.attendees.map((attendee) => (
                          <div key={attendee._id} className="flex items-center space-x-2">
                            <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                              <span className="text-xs font-medium">
                                {attendee.firstName[0]}{attendee.lastName[0]}
                              </span>
                            </div>
                            <div>
                              <p className="text-sm font-medium">
                                {attendee.firstName} {attendee.lastName}
                              </p>
                              <p className="text-xs text-muted-foreground">{attendee.email}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Edit Modal */}
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

