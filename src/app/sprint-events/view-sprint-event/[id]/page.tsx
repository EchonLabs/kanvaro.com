'use client'

import { useState, useEffect, type ReactNode } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { Permission } from '@/lib/permissions/permission-definitions'
import { usePermissions } from '@/lib/permissions/permission-context'
import { Button } from '@/components/ui/Button'
import { MainLayout } from '@/components/layout/MainLayout'
import {
  Calendar, Clock, Users, MapPin, Link as LinkIcon, Edit, Trash2,
  CheckCircle, Play, Square, ArrowLeft, FileText, Image as ImageIcon,
  ExternalLink, Target, Eye, RotateCcw, List, Zap, MoreVertical, User,
} from 'lucide-react'
import { useDateTime } from '@/components/providers/DateTimeProvider'
import { EditSprintEventModal } from '@/components/sprint-events/EditSprintEventModal'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/DropdownMenu'
import { cn, formatToTitleCase } from '@/lib/utils'
import { StatusBadge, FullPageLoader } from '@/components/tasks/TasksShared'

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
    avatar?: string
  }
  attendees: Array<{
    _id: string
    firstName: string
    lastName: string
    email: string
    avatar?: string
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

// ─── Event type styles ────────────────────────────────────────────────────────

const EVENT_STYLE: Record<string, { icon: ReactNode; color: string; bg: string }> = {
  planning:      { icon: <Target className="h-5 w-5" strokeWidth={1.5} />,    color: 'text-blue-600 dark:text-blue-400',       bg: 'bg-blue-50 dark:bg-blue-950/30' },
  review:        { icon: <Eye className="h-5 w-5" strokeWidth={1.5} />,       color: 'text-amber-600 dark:text-amber-400',     bg: 'bg-amber-50 dark:bg-amber-950/30' },
  retrospective: { icon: <RotateCcw className="h-5 w-5" strokeWidth={1.5} />, color: 'text-purple-600 dark:text-purple-400',   bg: 'bg-purple-50 dark:bg-purple-950/30' },
  daily_standup: { icon: <Users className="h-5 w-5" strokeWidth={1.5} />,     color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-950/30' },
  demo:          { icon: <Zap className="h-5 w-5" strokeWidth={1.5} />,       color: 'text-orange-600 dark:text-orange-400',   bg: 'bg-orange-50 dark:bg-orange-950/30' },
  other:         { icon: <List className="h-5 w-5" strokeWidth={1.5} />,      color: 'text-sky-600 dark:text-sky-400',         bg: 'bg-sky-50 dark:bg-sky-950/30' },
}
const defaultEventStyle = {
  icon: <Calendar className="h-5 w-5" strokeWidth={1.5} />,
  color: 'text-gray-600 dark:text-gray-400',
  bg: 'bg-gray-50 dark:bg-gray-900/40',
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

function UserAvatar({ firstName, lastName, avatar, size = 8 }: {
  firstName: string
  lastName: string
  avatar?: string
  size?: number
}) {
  const initials = `${firstName[0] ?? ''}${lastName[0] ?? ''}`.toUpperCase()
  const sizeClass = `h-${size} w-${size}`
  if (avatar) {
    return (
      <img
        src={avatar}
        alt={`${firstName} ${lastName}`}
        className={cn(sizeClass, 'rounded-full object-cover flex-shrink-0 select-none')}
      />
    )
  }
  return (
    <div className={cn(
      sizeClass,
      'rounded-full flex items-center justify-center flex-shrink-0 select-none',
      'bg-[var(--apple-tertiary-fill)] text-[var(--apple-secondary-label)] font-semibold',
    )} style={{ fontSize: size <= 8 ? '11px' : '13px' }}>
      {initials}
    </div>
  )
}

// ─── InfoRow ──────────────────────────────────────────────────────────────────

function InfoRow({ icon, label, value }: { icon?: ReactNode; label: string; value: ReactNode }) {
  return (
    <div className="flex items-start gap-4 px-5 py-3.5">
      <span className="flex-shrink-0 mt-0.5 text-[var(--apple-tertiary-label)] h-4 w-4 flex items-center justify-center">
        {icon}
      </span>
      <span className="text-[13px] text-[var(--apple-secondary-label)] w-24 flex-shrink-0 pt-px">{label}</span>
      <span className="text-[14px] text-[var(--apple-label)] flex-1 min-w-0 break-words">{value}</span>
    </div>
  )
}

// ─── Card shell ───────────────────────────────────────────────────────────────

function SectionCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn(
      'rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card',
      'shadow-[0_1px_4px_rgba(0,0,0,0.07)] dark:shadow-none overflow-hidden',
      className,
    )}>
      {children}
    </div>
  )
}

function SectionHeader({ label }: { label: string }) {
  return (
    <div className="px-5 pt-4 pb-3 border-b border-[var(--apple-separator)]">
      <span className="apple-section-label text-[var(--apple-tertiary-label)]">{label}</span>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SprintEventDetailsPage() {
  const params = useParams()
  const router = useRouter()
  const { user, isLoading: authLoading, isAuthenticated } = useAuth()
  const { hasPermission } = usePermissions()
  const eventId = params.id as string
  const [event, setEvent] = useState<SprintEvent | null>(null)
  const [loading, setLoading] = useState(true)
  const [editingEvent, setEditingEvent] = useState<SprintEvent | null>(null)
  const { formatDate, formatTime } = useDateTime()

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/login')
    }
  }, [authLoading, isAuthenticated, router])

  useEffect(() => {
    if (isAuthenticated && eventId) fetchEvent()
  }, [eventId, isAuthenticated])

  const fetchEvent = async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/sprint-events/view-sprint-event/${eventId}`)
      if (response.ok) {
        const data = await response.json()
        setEvent(data)
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

  const updateStatus = async (newStatus: string) => {
    try {
      const response = await fetch(`/api/sprint-events/view-sprint-event/${eventId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      if (response.ok) fetchEvent()
    } catch (error) {
      console.error('Error updating status:', error)
    }
  }

  const formatMeetingLink = (link: string) =>
    link.match(/^https?:\/\//i) ? link : `https://${link}`

  const formatDuration = (minutes: number) => {
    const h = Math.floor(minutes / 60)
    const m = minutes % 60
    if (h > 0 && m > 0) return `${h}h ${m}m`
    if (h > 0) return `${h} hour${h !== 1 ? 's' : ''}`
    return `${m} min`
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
  }

  // ── Loading / auth guards ──────────────────────────────────────────────────

  if (authLoading || loading) {
    return (
      <MainLayout>
        <FullPageLoader label="Loading event..." />
      </MainLayout>
    )
  }

  if (!isAuthenticated) {
    return (
      <MainLayout>
        <div className="text-center py-12 space-y-3">
          <Calendar className="h-10 w-10 text-[var(--apple-tertiary-label)] mx-auto" />
          <h2 className="text-[22px] font-semibold text-[var(--apple-label)]">Authentication Required</h2>
          <p className="text-[15px] text-[var(--apple-secondary-label)]">Please log in to access sprint events.</p>
          <Button onClick={() => router.push('/login')} className="rounded-full bg-[var(--apple-system-blue)] text-white px-5 h-9 hover:opacity-90 apple-transition">
            Go to Login
          </Button>
        </div>
      </MainLayout>
    )
  }

  if (!event) {
    return (
      <MainLayout>
        <div className="text-center py-12 space-y-3">
          <Calendar className="h-10 w-10 text-[var(--apple-tertiary-label)] mx-auto" />
          <h2 className="text-[22px] font-semibold text-[var(--apple-label)]">Event not found</h2>
          <Button onClick={() => router.push('/sprint-events')} className="rounded-full border border-[var(--apple-separator)] px-5 h-9 text-[14px] hover:bg-[var(--apple-tertiary-fill)] apple-transition">
            <ArrowLeft className="h-4 w-4 mr-1.5" />
            Back to Events
          </Button>
        </div>
      </MainLayout>
    )
  }

  const eventStyle = EVENT_STYLE[event.eventType?.toLowerCase()] ?? defaultEventStyle
  const canEdit = hasPermission(Permission.SPRINT_EVENT_VIEW_ALL) || (user && user.id === event.facilitator._id)

  const hasOutcomes =
    (event.outcomes?.decisions?.some(d => d.trim())) ||
    (event.outcomes?.actionItems?.some(i => i.description.trim())) ||
    (event.outcomes?.notes?.trim())

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <MainLayout>
      <div className="space-y-5 animate-in fade-in-0 duration-300 overflow-x-hidden min-h-full">

        {/* ── Page Header ───────────────────────────────────────────────────── */}

        {/* Back button row */}
        <div className="flex items-center justify-between gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push('/sprint-events')}
            className="rounded-full h-9 px-3 text-[13px] text-[var(--apple-secondary-label)] hover:text-[var(--apple-label)] hover:bg-[var(--apple-tertiary-fill)] apple-transition"
          >
            <ArrowLeft className="h-4 w-4 mr-1" strokeWidth={1.5} />
            Back
          </Button>

          {/* Actions — shown here on mobile so they don't stack below the title */}
          {canEdit && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditingEvent(event)}
                className="h-9 px-4 rounded-full border-[var(--apple-separator)] text-[13px] sm:text-[14px] text-[var(--apple-label)] hover:bg-[var(--apple-tertiary-fill)] apple-transition"
              >
                <Edit className="h-3.5 w-3.5 mr-1.5" strokeWidth={1.5} />
                Edit
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 px-4 rounded-full border-[var(--apple-separator)] text-[13px] sm:text-[14px] text-[var(--apple-label)] hover:bg-[var(--apple-tertiary-fill)] apple-transition"
                  >
                    Actions
                    <MoreVertical className="h-3.5 w-3.5 ml-1.5" strokeWidth={1.5} />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {event.status !== 'completed' && (
                    <DropdownMenuItem onClick={() => updateStatus('completed')}>
                      <CheckCircle className="h-4 w-4 mr-2" strokeWidth={1.5} />
                      Mark as Completed
                    </DropdownMenuItem>
                  )}
                  {event.status !== 'in_progress' && event.status !== 'completed' && (
                    <DropdownMenuItem onClick={() => updateStatus('in_progress')}>
                      <Play className="h-4 w-4 mr-2" strokeWidth={1.5} />
                      Mark as In Progress
                    </DropdownMenuItem>
                  )}
                  {event.status !== 'cancelled' && (
                    <DropdownMenuItem onClick={() => updateStatus('cancelled')}>
                      <Square className="h-4 w-4 mr-2" strokeWidth={1.5} />
                      Cancel Event
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>

        {/* Title row */}
        <div className="flex items-start gap-3 sm:gap-4">
          {/* Event type icon badge */}
          <div
            className="h-11 w-11 sm:h-12 sm:w-12 rounded-[var(--apple-radius-md)] flex items-center justify-center flex-shrink-0 text-white mt-0.5"
            style={{ background: 'var(--apple-card-gradient)', boxShadow: '0 2px 12px var(--apple-chart-glow)' }}
          >
            {eventStyle.icon}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-start gap-2.5 flex-wrap">
              <h1 className="text-[24px] sm:text-[28px] lg:text-[30px] font-bold tracking-tight text-[var(--apple-label)] leading-tight">
                {event.title}
              </h1>
              <StatusBadge status={event.status} />
            </div>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <span className={cn('inline-flex items-center text-[11px] font-semibold px-1.5 py-0.5 rounded-md', eventStyle.bg, eventStyle.color)}>
                {formatToTitleCase(event.eventType)}
              </span>
              <span className="text-[var(--apple-tertiary-label)] text-[12px]">·</span>
              <span className="text-[13px] sm:text-[14px] text-[var(--apple-secondary-label)]">{event.project?.name}</span>
              {event.sprint?.name && (
                <>
                  <span className="text-[var(--apple-tertiary-label)] text-[12px]">·</span>
                  <span className="text-[13px] sm:text-[14px] text-[var(--apple-secondary-label)]">{event.sprint.name}</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* ── Content grid ──────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

          {/* ── Main column ─────────────────────────────────────────────────── */}
          <div className="lg:col-span-2 space-y-5">

            {/* Event Details */}
            <SectionCard>
              <div className="h-[3px] w-full" style={{ background: 'var(--apple-card-gradient)' }} />
              <SectionHeader label="Event Details" />
              <div className="divide-y divide-[var(--apple-separator)]">
                <InfoRow icon={<Calendar className="h-4 w-4" strokeWidth={1.5} />} label="Date" value={formatDate(event.scheduledDate)} />
                <InfoRow
                  icon={<Clock className="h-4 w-4" strokeWidth={1.5} />}
                  label="Time"
                  value={
                    event.startTime && event.endTime
                      ? `${formatTime(event.startTime)} – ${formatTime(event.endTime)}`
                      : event.startTime
                        ? formatTime(event.startTime)
                        : '—'
                  }
                />
                <InfoRow icon={<Clock className="h-4 w-4" strokeWidth={1.5} />} label="Duration" value={formatDuration(event.duration)} />
                {event.location && (
                  <InfoRow icon={<MapPin className="h-4 w-4" strokeWidth={1.5} />} label="Location" value={event.location} />
                )}
                {event.meetingLink && (
                  <InfoRow
                    icon={<LinkIcon className="h-4 w-4" strokeWidth={1.5} />}
                    label="Meeting Link"
                    value={
                      <a
                        href={formatMeetingLink(event.meetingLink)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[var(--apple-system-blue)] hover:underline break-all"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {event.meetingLink}
                      </a>
                    }
                  />
                )}
                <InfoRow icon={<Target className="h-4 w-4" strokeWidth={1.5} />} label="Project" value={event.project.name} />
                {event.sprint?.name && (
                  <InfoRow icon={<Zap className="h-4 w-4" strokeWidth={1.5} />} label="Sprint" value={event.sprint.name} />
                )}
                <InfoRow
                  icon={<User className="h-4 w-4" strokeWidth={1.5} />}
                  label="Facilitator"
                  value={`${event.facilitator.firstName} ${event.facilitator.lastName}`}
                />
                <InfoRow
                  icon={<Calendar className="h-4 w-4" strokeWidth={1.5} />}
                  label="Created"
                  value={`${formatDate(event.createdAt)} at ${formatTime(event.createdAt)}`}
                />
              </div>
            </SectionCard>

            {/* Description */}
            {event.description && (
              <SectionCard>
                <SectionHeader label="Description / Notes" />
                <div className="px-5 py-4">
                  <p className="text-[15px] text-[var(--apple-label)] leading-relaxed whitespace-pre-wrap">
                    {event.description}
                  </p>
                </div>
              </SectionCard>
            )}

            {/* Outcomes */}
            {event.outcomes && hasOutcomes && (
              <SectionCard>
                <SectionHeader label="Event Outcomes" />
                <div className="px-5 py-4 space-y-6">

                  {/* Decisions */}
                  {event.outcomes.decisions?.filter(d => d.trim()).length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <CheckCircle className="h-4 w-4 text-[var(--apple-system-green)]" />
                        <span className="text-[13px] font-semibold text-[var(--apple-label)]">Decisions Made</span>
                      </div>
                      <ul className="space-y-2">
                        {event.outcomes.decisions.filter(d => d.trim()).map((decision, i) => (
                          <li key={i} className="flex items-start gap-2.5">
                            <span className="h-1.5 w-1.5 rounded-full bg-[var(--apple-system-green)] flex-shrink-0 mt-[7px]" />
                            <span className="text-[14px] text-[var(--apple-label)]">{decision}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Action Items */}
                  {event.outcomes.actionItems?.filter(i => i.description.trim()).length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <Target className="h-4 w-4 text-[var(--apple-system-blue)]" />
                        <span className="text-[13px] font-semibold text-[var(--apple-label)]">Action Items</span>
                      </div>
                      <div className="space-y-2.5">
                        {event.outcomes.actionItems.filter(i => i.description.trim()).map((item, i) => (
                          <div key={i} className="rounded-[var(--apple-radius-sm)] border border-[var(--apple-separator)] bg-[var(--apple-quaternary-fill)] px-4 py-3 space-y-2">
                            <p className="text-[14px] font-medium text-[var(--apple-label)]">{item.description}</p>
                            <div className="flex flex-wrap items-center gap-3 text-[12px] text-[var(--apple-secondary-label)]">
                              {item.assignedTo && (
                                <span className="flex items-center gap-1">
                                  <Users className="h-3 w-3" />
                                  {typeof item.assignedTo === 'object' && 'firstName' in item.assignedTo
                                    ? `${item.assignedTo.firstName} ${item.assignedTo.lastName}`.trim()
                                    : typeof item.assignedTo === 'string' && item.assignedTo.length > 0
                                    ? item.assignedTo : 'Unassigned'}
                                </span>
                              )}
                              {item.dueDate && (
                                <span className="flex items-center gap-1">
                                  <Calendar className="h-3 w-3" />
                                  Due {formatDate(item.dueDate)}
                                </span>
                              )}
                              {item.status && <StatusBadge status={item.status} size="sm" animated={false} />}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Notes */}
                  {event.outcomes.notes?.trim() && (
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <FileText className="h-4 w-4 text-[var(--apple-secondary-label)]" />
                        <span className="text-[13px] font-semibold text-[var(--apple-label)]">Notes</span>
                      </div>
                      <p className="text-[14px] text-[var(--apple-label)] leading-relaxed whitespace-pre-wrap">
                        {event.outcomes.notes}
                      </p>
                    </div>
                  )}
                </div>
              </SectionCard>
            )}

            {/* Attachments */}
            {event.attachments && event.attachments.length > 0 && (
              <SectionCard>
                <SectionHeader label="Attachments" />
                <div className="divide-y divide-[var(--apple-separator)]">
                  {event.attachments.map((attachment, i) => (
                    <div key={i} className="flex items-center gap-3 px-5 py-3.5">
                      <div className="h-9 w-9 rounded-[var(--apple-radius-sm)] bg-[var(--apple-tertiary-fill)] flex items-center justify-center flex-shrink-0">
                        {attachment.type === 'link' ? (
                          <LinkIcon className="h-4 w-4 text-[var(--apple-secondary-label)]" />
                        ) : attachment.type.startsWith('image/') ? (
                          <ImageIcon className="h-4 w-4 text-[var(--apple-secondary-label)]" />
                        ) : (
                          <FileText className="h-4 w-4 text-[var(--apple-secondary-label)]" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[14px] font-medium text-[var(--apple-label)] truncate">{attachment.name}</p>
                        {attachment.size > 0 && (
                          <p className="text-[12px] text-[var(--apple-secondary-label)]">{formatFileSize(attachment.size)}</p>
                        )}
                      </div>
                      <a href={attachment.url} target="_blank" rel="noopener noreferrer">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 rounded-[var(--apple-radius-sm)] hover:bg-[var(--apple-tertiary-fill)] apple-transition"
                        >
                          <ExternalLink className="h-4 w-4 text-[var(--apple-secondary-label)]" />
                        </Button>
                      </a>
                    </div>
                  ))}
                </div>
              </SectionCard>
            )}
          </div>

          {/* ── Sidebar ───────────────────────────────────────────────────────── */}
          <div className="space-y-5">

            {/* Participants */}
            {(() => {
              const otherAttendees = event.attendees.filter(a => a._id !== event.facilitator._id)
              return (
                <SectionCard>
                  <SectionHeader label={`Participants (${1 + otherAttendees.length})`} />
                  <div className="divide-y divide-[var(--apple-separator)]">

                    {/* Facilitator */}
                    <div className="px-4 sm:px-5 py-3.5">
                      <p className="apple-section-label text-[var(--apple-secondary-label)] mb-2.5">Facilitator</p>
                      <div className="flex items-center gap-2.5">
                        <UserAvatar
                          firstName={event.facilitator.firstName}
                          lastName={event.facilitator.lastName}
                          avatar={event.facilitator.avatar}
                        />
                        <div className="min-w-0">
                          <p className="text-[13px] font-semibold text-[var(--apple-label)] truncate">
                            {event.facilitator.firstName} {event.facilitator.lastName}
                          </p>
                          <p className="text-[11px] text-[var(--apple-secondary-label)] truncate">{event.facilitator.email}</p>
                        </div>
                      </div>
                    </div>

                    {/* Attendees (excluding facilitator) */}
                    {otherAttendees.length > 0 && (
                      <div className="px-4 sm:px-5 py-3.5">
                        <p className="apple-section-label text-[var(--apple-secondary-label)] mb-2.5">
                          Attendees ({otherAttendees.length})
                        </p>
                        <div className="space-y-2.5">
                          {otherAttendees.map((attendee) => (
                            <div key={attendee._id} className="flex items-center gap-2.5">
                              <UserAvatar
                                firstName={attendee.firstName}
                                lastName={attendee.lastName}
                                avatar={attendee.avatar}
                              />
                              <div className="min-w-0">
                                <p className="text-[13px] font-semibold text-[var(--apple-label)] truncate">
                                  {attendee.firstName} {attendee.lastName}
                                </p>
                                <p className="text-[11px] text-[var(--apple-secondary-label)] truncate">{attendee.email}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </SectionCard>
              )
            })()}
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
