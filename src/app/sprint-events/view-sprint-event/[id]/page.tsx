'use client'

import { useState, useEffect, type ReactNode } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { Permission } from '@/lib/permissions/permission-definitions'
import { usePermissions } from '@/lib/permissions/permission-context'
import { Button } from '@/components/ui/Button'
import { MainLayout } from '@/components/layout/MainLayout'
import {
  Calendar, Clock, Users, MapPin, Link as LinkIcon, Edit,
  CheckCircle, Play, Square, ArrowLeft, FileText, Image as ImageIcon,
  ExternalLink, Target, Eye, RotateCcw, List, Zap, MoreVertical, User,
  Loader2, XCircle,
} from 'lucide-react'
import { useDateTime } from '@/components/providers/DateTimeProvider'
import { EditSprintEventModal } from '@/components/sprint-events/EditSprintEventModal'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/DropdownMenu'
import { formatToTitleCase } from '@/lib/utils'

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

type ChipConfig = { bg: string; text: string; dot: string; border: string }

// ─── Chip color maps (mapped to real SprintEvent schema enum values) ──────────

const EVENT_TYPE_BADGE: Record<string, ChipConfig> = {
  planning:      { bg: 'bg-blue-50 dark:bg-blue-950/30',       text: 'text-blue-600 dark:text-blue-400',       dot: 'bg-blue-500',    border: 'border-blue-200 dark:border-blue-800' },
  review:        { bg: 'bg-amber-50 dark:bg-amber-950/30',     text: 'text-amber-600 dark:text-amber-400',     dot: 'bg-amber-500',   border: 'border-amber-200 dark:border-amber-800' },
  retrospective: { bg: 'bg-purple-50 dark:bg-purple-950/30',   text: 'text-purple-600 dark:text-purple-400',   dot: 'bg-purple-500',  border: 'border-purple-200 dark:border-purple-800' },
  daily_standup: { bg: 'bg-emerald-50 dark:bg-emerald-950/30', text: 'text-emerald-600 dark:text-emerald-400', dot: 'bg-emerald-500', border: 'border-emerald-200 dark:border-emerald-800' },
  demo:          { bg: 'bg-orange-50 dark:bg-orange-950/30',   text: 'text-orange-600 dark:text-orange-400',   dot: 'bg-orange-500',  border: 'border-orange-200 dark:border-orange-800' },
  other:         { bg: 'bg-sky-50 dark:bg-sky-950/30',         text: 'text-sky-600 dark:text-sky-400',         dot: 'bg-sky-500',     border: 'border-sky-200 dark:border-sky-800' },
}

const STATUS_BADGE: Record<string, ChipConfig> = {
  scheduled:   { bg: 'bg-slate-50 dark:bg-slate-950/30',     text: 'text-slate-600 dark:text-slate-400',     dot: 'bg-slate-400',   border: 'border-slate-200 dark:border-slate-800' },
  in_progress: { bg: 'bg-blue-50 dark:bg-blue-950/30',       text: 'text-blue-600 dark:text-blue-400',       dot: 'bg-blue-500',    border: 'border-blue-200 dark:border-blue-800' },
  completed:   { bg: 'bg-emerald-50 dark:bg-emerald-950/30', text: 'text-emerald-600 dark:text-emerald-400', dot: 'bg-emerald-500', border: 'border-emerald-200 dark:border-emerald-800' },
  cancelled:   { bg: 'bg-red-50 dark:bg-red-950/30',         text: 'text-red-600 dark:text-red-400',         dot: 'bg-red-500',     border: 'border-red-200 dark:border-red-800' },
}

const ACTION_ITEM_STATUS_BADGE: Record<string, ChipConfig> = {
  pending:     { bg: 'bg-gray-50 dark:bg-gray-900/40',       text: 'text-gray-500 dark:text-gray-400',       dot: 'bg-gray-400',    border: 'border-gray-200 dark:border-gray-700' },
  in_progress: { bg: 'bg-blue-50 dark:bg-blue-950/30',       text: 'text-blue-600 dark:text-blue-400',       dot: 'bg-blue-500',    border: 'border-blue-200 dark:border-blue-800' },
  completed:   { bg: 'bg-emerald-50 dark:bg-emerald-950/30', text: 'text-emerald-600 dark:text-emerald-400', dot: 'bg-emerald-500', border: 'border-emerald-200 dark:border-emerald-800' },
}

const renderStatusChip = (cfg: Record<string, ChipConfig>, key: string, label: string) => {
  const c = cfg[key] ?? { bg: 'bg-gray-50', text: 'text-gray-500', dot: 'bg-gray-400', border: 'border-gray-200' }
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[12px] font-medium ${c.bg} ${c.text} ${c.border}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />
      {label}
    </span>
  )
}

const getEventIcon = (eventType: string) => {
  switch (eventType) {
    case 'planning': return <Target className="h-8 w-8" strokeWidth={1.5} />
    case 'review': return <Eye className="h-8 w-8" strokeWidth={1.5} />
    case 'retrospective': return <RotateCcw className="h-8 w-8" strokeWidth={1.5} />
    case 'daily_standup': return <Users className="h-8 w-8" strokeWidth={1.5} />
    case 'demo': return <Zap className="h-8 w-8" strokeWidth={1.5} />
    case 'other': return <List className="h-8 w-8" strokeWidth={1.5} />
    default: return <Calendar className="h-8 w-8" strokeWidth={1.5} />
  }
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

function UserAvatar({ firstName, lastName, avatar }: {
  firstName: string
  lastName: string
  avatar?: string
}) {
  const initials = `${firstName[0] ?? ''}${lastName[0] ?? ''}`.toUpperCase()
  if (avatar) {
    return (
      <img
        src={avatar}
        alt={`${firstName} ${lastName}`}
        className="h-9 w-9 rounded-full object-cover flex-shrink-0 select-none"
      />
    )
  }
  return (
    <div
      className="h-9 w-9 rounded-full flex items-center justify-center flex-shrink-0 text-white font-semibold text-[13px] select-none"
      style={{ background: 'var(--apple-card-gradient)', boxShadow: '0 1px 4px var(--apple-chart-glow)' }}
    >
      {initials}
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
        <div className="flex items-center justify-center h-64">
          <div className="text-center space-y-3">
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-[var(--apple-system-blue)]" />
            <p className="text-[15px] text-[var(--apple-secondary-label)]">Loading event…</p>
          </div>
        </div>
      </MainLayout>
    )
  }

  if (!isAuthenticated) {
    return (
      <MainLayout>
        <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
          <XCircle className="h-12 w-12 text-[var(--apple-system-red)]" />
          <h2 className="text-[22px] font-semibold text-[var(--apple-label)]">Authentication Required</h2>
          <p className="text-[15px] text-[var(--apple-secondary-label)]">Please log in to access sprint events.</p>
          <Button
            onClick={() => router.push('/login')}
            className="rounded-full bg-[var(--apple-system-blue)] text-white text-[15px] font-semibold px-5 h-9 hover:opacity-90 apple-transition"
          >
            Go to Login
          </Button>
        </div>
      </MainLayout>
    )
  }

  if (!event) {
    return (
      <MainLayout>
        <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
          <XCircle className="h-12 w-12 text-[var(--apple-system-red)]" />
          <h2 className="text-[22px] font-semibold text-[var(--apple-label)]">Event not found</h2>
          <Button
            onClick={() => router.push('/sprint-events')}
            className="rounded-full bg-[var(--apple-system-blue)] text-white text-[15px] font-semibold px-5 h-9 hover:opacity-90 apple-transition"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Events
          </Button>
        </div>
      </MainLayout>
    )
  }

  const canEdit = hasPermission(Permission.SPRINT_EVENT_VIEW_ALL) || (user && user.id === event.facilitator._id)

  const hasOutcomes =
    (event.outcomes?.decisions?.some(d => d.trim())) ||
    (event.outcomes?.actionItems?.some(i => i.description.trim())) ||
    (event.outcomes?.notes?.trim())

  const otherAttendees = event.attendees.filter(a => a._id !== event.facilitator._id)

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <MainLayout>
      <div className="space-y-6 overflow-x-hidden animate-in fade-in-0 duration-300">

        {/* ── Page Header ─────────────────────────────────────────────────────── */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => router.back()}
              className="inline-flex items-center gap-1.5 text-[14px] text-[var(--apple-secondary-label)] hover:text-[var(--apple-system-blue)] apple-transition font-medium"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
            {/* Title row: icon > type chip > title — all inline */}
            <div className="flex-1 min-w-0 flex items-center gap-3 flex-wrap">
              <span className="flex-shrink-0" style={{ color: 'var(--apple-card-gradient)' }}>
                {getEventIcon(event.eventType)}
              </span>
              {renderStatusChip(EVENT_TYPE_BADGE, event.eventType, formatToTitleCase(event.eventType))}
              <h1 className="text-[22px] sm:text-[26px] font-bold tracking-tight text-[var(--apple-label)] leading-tight min-w-0">{event.title}</h1>
            </div>

            {/* Action buttons — status actions row + edit row */}
            {canEdit && (
              <div className="flex flex-col gap-2 flex-shrink-0">
                <div className="flex items-center gap-2 justify-end">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="inline-flex items-center gap-1.5 rounded-full border border-[var(--apple-separator)] bg-[var(--apple-quaternary-fill)] text-[var(--apple-label)] text-[13px] font-medium px-4 h-9 hover:bg-[var(--apple-tertiary-fill)] apple-transition">
                        Actions
                        <MoreVertical className="h-3.5 w-3.5" strokeWidth={1.5} />
                      </button>
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

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setEditingEvent(event)}
                    className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 rounded-full text-white text-[13px] font-semibold px-4 h-9 hover:opacity-90 apple-transition disabled:opacity-40"
                    style={{ background: 'var(--apple-card-gradient)' }}
                  >
                    <Edit className="h-3.5 w-3.5" />
                    Edit
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Main Grid ───────────────────────────────────────────────────────── */}
        <div className="grid gap-6 lg:grid-cols-3">

          {/* Left column — main content */}
          <div className="lg:col-span-2 space-y-5">

            {/* Description / Notes */}
            <div className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] dark:shadow-none overflow-hidden">
              <div className="px-5 py-4 border-b border-[var(--apple-separator)]">
                <h2 className="text-[15px] font-semibold text-[var(--apple-label)]">Description</h2>
              </div>
              <div className="px-5 py-4">
                {event.description ? (() => {
                  const isHtml = /<(p|br|div|ul|ol|li|strong|em|u|h[1-6]|img|a)(\s|>|\/)/i.test(event.description)
                  return isHtml
                    ? <div className="max-w-none" dangerouslySetInnerHTML={{ __html: event.description }} />
                    : <div className="text-[15px] text-[var(--apple-label)] whitespace-pre-wrap leading-relaxed">{event.description}</div>
                })() : (
                  <p className="text-[15px] text-[var(--apple-tertiary-label)]">No description provided.</p>
                )}
              </div>
            </div>

            {/* Related entities */}
            {event.sprint?._id && (
              <div
                role="button"
                tabIndex={0}
                className="text-left rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card p-4 hover:shadow-[0_4px_16px_rgba(0,0,0,0.09)] hover:-translate-y-0.5 apple-transition cursor-pointer max-w-full sm:max-w-xs"
                onClick={() => router.push(`/sprints/${event.sprint._id}`)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    router.push(`/sprints/${event.sprint._id}`)
                  }
                }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <Target className="h-4 w-4 text-[var(--apple-system-blue)]" />
                  <span className="apple-section-label text-[var(--apple-tertiary-label)]">Sprint</span>
                </div>
                <p className="text-[14px] font-semibold text-[var(--apple-label)] truncate">{event.sprint.name || '—'}</p>
                {event.sprint.status && <p className="text-[12px] text-[var(--apple-secondary-label)] mt-0.5">{formatToTitleCase(event.sprint.status)}</p>}
              </div>
            )}

            {/* Outcomes */}
            {event.outcomes && hasOutcomes && (
              <div className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] dark:shadow-none overflow-hidden">
                <div className="px-5 py-4 border-b border-[var(--apple-separator)]">
                  <h2 className="text-[15px] font-semibold text-[var(--apple-label)]">Event Outcomes</h2>
                </div>
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
                              {item.status && renderStatusChip(ACTION_ITEM_STATUS_BADGE, item.status, formatToTitleCase(item.status))}
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
              </div>
            )}

            {/* Attachments */}
            {event.attachments && event.attachments.length > 0 && (
              <div className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] dark:shadow-none overflow-hidden">
                <div className="px-5 py-4 border-b border-[var(--apple-separator)]">
                  <h2 className="text-[15px] font-semibold text-[var(--apple-label)]">Attachments</h2>
                </div>
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
              </div>
            )}
          </div>

          {/* ── Right Sidebar ──────────────────────────────────────────────────── */}
          <div className="space-y-5">

            {/* Details */}
            <div className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] dark:shadow-none overflow-hidden">
              <div className="px-5 py-4 border-b border-[var(--apple-separator)]">
                <h2 className="text-[13px] font-semibold tracking-[0.06em] uppercase text-[var(--apple-tertiary-label)]">Details</h2>
              </div>
              <div className="px-5 py-1 divide-y divide-[var(--apple-separator)]">
                {/* Type */}
                <div className="flex items-center justify-between py-3">
                  <span className="text-[13px] text-[var(--apple-secondary-label)]">Type</span>
                  {renderStatusChip(EVENT_TYPE_BADGE, event.eventType, formatToTitleCase(event.eventType))}
                </div>
                {/* Status */}
                <div className="flex items-center justify-between py-3">
                  <span className="text-[13px] text-[var(--apple-secondary-label)]">Status</span>
                  {renderStatusChip(STATUS_BADGE, event.status, formatToTitleCase(event.status))}
                </div>
                {/* Date */}
                <div className="flex items-center justify-between py-3">
                  <span className="text-[13px] text-[var(--apple-secondary-label)]">Date</span>
                  <div className="flex items-center gap-1.5 text-[13px] font-medium text-[var(--apple-label)]">
                    <Calendar className="h-3.5 w-3.5 text-[var(--apple-tertiary-label)]" />
                    {formatDate(event.scheduledDate)}
                  </div>
                </div>
                {/* Time */}
                <div className="flex items-center justify-between py-3">
                  <span className="text-[13px] text-[var(--apple-secondary-label)]">Time</span>
                  <span className="text-[13px] font-medium text-[var(--apple-label)]">
                    {event.startTime && event.endTime
                      ? `${formatTime(event.startTime)} – ${formatTime(event.endTime)}`
                      : event.startTime
                        ? formatTime(event.startTime)
                        : '—'}
                  </span>
                </div>
                {/* Duration */}
                <div className="flex items-center justify-between py-3">
                  <span className="text-[13px] text-[var(--apple-secondary-label)]">Duration</span>
                  <span className="text-[13px] font-apple-mono font-medium text-[var(--apple-label)]">{formatDuration(event.duration)}</span>
                </div>
                {/* Location */}
                {event.location && (
                  <div className="flex items-center justify-between py-3">
                    <span className="text-[13px] text-[var(--apple-secondary-label)]">Location</span>
                    <span className="text-[13px] font-medium text-[var(--apple-label)] truncate max-w-[160px]" title={event.location}>{event.location}</span>
                  </div>
                )}
                {/* Meeting Link */}
                {event.meetingLink && (
                  <div className="flex items-center justify-between py-3 gap-3">
                    <span className="text-[13px] text-[var(--apple-secondary-label)] flex-shrink-0">Meeting Link</span>
                    <a
                      href={formatMeetingLink(event.meetingLink)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[13px] font-medium text-[var(--apple-system-blue)] hover:underline truncate max-w-[160px]"
                      title={event.meetingLink}
                    >
                      {event.meetingLink}
                    </a>
                  </div>
                )}
                {/* Project */}
                <div className="flex items-center justify-between py-3">
                  <span className="text-[13px] text-[var(--apple-secondary-label)]">Project</span>
                  <span className="text-[13px] font-medium text-[var(--apple-label)] truncate max-w-[160px]" title={event.project?.name}>{event.project?.name || '—'}</span>
                </div>
                {/* Sprint */}
                {event.sprint?.name && (
                  <div className="flex items-center justify-between py-3">
                    <span className="text-[13px] text-[var(--apple-secondary-label)]">Sprint</span>
                    <span className="text-[13px] font-medium text-[var(--apple-label)] truncate max-w-[160px]" title={event.sprint.name}>{event.sprint.name}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Participants */}
            <div className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] dark:shadow-none overflow-hidden">
              <div className="px-5 py-4 border-b border-[var(--apple-separator)]">
                <h2 className="text-[13px] font-semibold tracking-[0.06em] uppercase text-[var(--apple-tertiary-label)]">
                  Participants ({1 + otherAttendees.length})
                </h2>
              </div>
              <div className="divide-y divide-[var(--apple-separator)]">

                {/* Facilitator */}
                <div className="px-5 py-3.5">
                  <p className="text-[11px] font-semibold tracking-[0.06em] uppercase text-[var(--apple-tertiary-label)] mb-2.5">Facilitator</p>
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
                  <div className="px-5 py-3.5">
                    <p className="text-[11px] font-semibold tracking-[0.06em] uppercase text-[var(--apple-tertiary-label)] mb-2.5">
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
            </div>

            {/* Metadata */}
            <div className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] dark:shadow-none overflow-hidden">
              <div className="px-5 py-4 border-b border-[var(--apple-separator)]">
                <h2 className="text-[13px] font-semibold tracking-[0.06em] uppercase text-[var(--apple-tertiary-label)]">Metadata</h2>
              </div>
              <div className="px-5 py-1 divide-y divide-[var(--apple-separator)]">
                <div className="flex items-center justify-between py-3">
                  <span className="text-[13px] text-[var(--apple-secondary-label)]">Facilitated by</span>
                  <span className="text-[13px] font-medium text-[var(--apple-label)]">{event.facilitator.firstName} {event.facilitator.lastName}</span>
                </div>
                <div className="flex items-center justify-between py-3">
                  <span className="text-[13px] text-[var(--apple-secondary-label)]">Created</span>
                  <span className="text-[13px] text-[var(--apple-label)]">{formatDate(event.createdAt)}</span>
                </div>
                <div className="flex items-center justify-between py-3">
                  <span className="text-[13px] text-[var(--apple-secondary-label)]">Updated</span>
                  <span className="text-[13px] text-[var(--apple-label)]">{formatDate(event.updatedAt)}</span>
                </div>
              </div>
            </div>
          </div>
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
    </MainLayout>
  )
}
