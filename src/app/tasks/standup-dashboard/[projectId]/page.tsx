'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { MainLayout } from '@/components/layout/MainLayout'
import { PageContent } from '@/components/ui/PageContent'
import { Button } from '@/components/ui/Button'
import { useAuthContext } from '@/contexts/AuthContext'
import { usePermissions } from '@/lib/permissions/permission-context'
import { Permission } from '@/lib/permissions/permission-definitions'
import { useDateTime } from '@/components/providers/DateTimeProvider'
import { formatToTitleCase } from '@/lib/utils'
import {
  Activity, ArrowLeft, CalendarDays, CalendarCheck, Clock3, Eye, Loader2,
  RefreshCw, Trash2, Users
} from 'lucide-react'
import { fetchStandupProjectDetail } from '@/components/standup-dashboard/standup-dashboard-service'
import { deleteStandupSchedule } from '@/components/standup-dashboard/standup-schedule-storage'
import { StandupTimeline } from '@/components/standup-dashboard/StandupTimeline'
import { GravatarAvatar } from '@/components/ui/GravatarAvatar'
import { ConfirmationModal } from '@/components/ui/ConfirmationModal'
import { getStandupDateKey } from '@/components/standup-dashboard/standup-date-utils'
import type { StandupProjectSummary } from '@/components/standup-dashboard/standup-dashboard-types'

const HEADER_GRADIENT = 'linear-gradient(135deg, #007AFF 0%, #5AC8FA 100%)'
const HEADER_GLOW = 'rgba(0, 122, 255, 0.25)'

const STATUS_CONFIG: Record<string, { bg: string; text: string; dot: string; border: string; label: string }> = {
  active:    { bg: 'bg-emerald-50 dark:bg-emerald-950/30', text: 'text-emerald-600 dark:text-emerald-400', dot: 'bg-emerald-500', border: 'border-emerald-200 dark:border-emerald-800', label: 'Active' },
  planning:  { bg: 'bg-blue-50 dark:bg-blue-950/30',       text: 'text-blue-600 dark:text-blue-400',       dot: 'bg-blue-500',   border: 'border-blue-200 dark:border-blue-800',   label: 'Planning' },
  on_hold:   { bg: 'bg-amber-50 dark:bg-amber-950/30',     text: 'text-amber-600 dark:text-amber-400',     dot: 'bg-amber-500',  border: 'border-amber-200 dark:border-amber-800', label: 'On Hold' },
  completed: { bg: 'bg-gray-50 dark:bg-gray-900/40',       text: 'text-gray-500 dark:text-gray-400',       dot: 'bg-gray-400',   border: 'border-gray-200 dark:border-gray-700',   label: 'Completed' },
}

const MEETING_STATUS_CONFIG: Record<string, { bg: string; text: string; dot: string; border: string; label: string }> = {
  scheduled:   { bg: 'bg-blue-50 dark:bg-blue-950/30',   text: 'text-blue-600 dark:text-blue-400',   dot: 'bg-blue-500',   border: 'border-blue-200 dark:border-blue-800',   label: 'Scheduled' },
  in_progress: { bg: 'bg-emerald-50 dark:bg-emerald-950/30', text: 'text-emerald-600 dark:text-emerald-400', dot: 'bg-emerald-500', border: 'border-emerald-200 dark:border-emerald-800', label: 'In Progress' },
  completed:   { bg: 'bg-gray-50 dark:bg-gray-900/40',   text: 'text-gray-500 dark:text-gray-400',   dot: 'bg-gray-400',   border: 'border-gray-200 dark:border-gray-700',   label: 'Completed' },
  missed:      { bg: 'bg-red-50 dark:bg-red-950/30',     text: 'text-red-600 dark:text-red-400',     dot: 'bg-red-500',    border: 'border-red-200 dark:border-red-800',     label: 'Missed' },
}

export default function StandupProjectPage() {
  const params = useParams()
  const router = useRouter()
  const { isAuthenticated, isLoading: authLoading } = useAuthContext()
  const { hasPermission, canManageProject } = usePermissions()
  const { formatDate, formatDateTimeSafe } = useDateTime()
  const projectId = params.projectId as string
  const [project, setProject] = useState<StandupProjectSummary | null>(null)
  const [liveSprint, setLiveSprint] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [standupDateFilter, setStandupDateFilter] = useState('')
  const [deleteMeetingId, setDeleteMeetingId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/login')
    }
  }, [authLoading, isAuthenticated, router])

  useEffect(() => {
    const abortController = new AbortController()

    const loadProject = async () => {
      setLoading(true)
      setError('')
      try {
        const data = await fetchStandupProjectDetail(projectId, abortController.signal)
        if (!abortController.signal.aborted) {
          setProject(data.summary)
          setLiveSprint(data.sprint || null)
        }
      } catch (fetchError) {
        if (!abortController.signal.aborted) {
          setError('Failed to load standup project details')
        }
      } finally {
        if (!abortController.signal.aborted) {
          setLoading(false)
        }
      }
    }

    loadProject()
    return () => abortController.abort()
  }, [projectId])

  const breadcrumbItems = [
    { label: 'Tasks', href: '/tasks' },
    { label: 'Standup Dashboard', href: '/tasks/standup-dashboard' },
    { label: project ? `${project.name} Standup` : 'Project Standup' }
  ]

  const canManageStandup = hasPermission(Permission.PROJECT_MANAGE_TEAM) && canManageProject(projectId)

  const handleDeleteMeeting = (meetingId: string) => {
    if (!project) return
    setDeleteMeetingId(meetingId)
  }

  const handleConfirmDeleteMeeting = async () => {
    if (!project || !deleteMeetingId) return
    try {
      setDeleting(true)
      await deleteStandupSchedule(projectId, deleteMeetingId)
      setProject((current) => {
        if (!current) return current
        return {
          ...current,
          meetings: current.meetings.filter((m) => m._id !== deleteMeetingId),
          timeline: current.timeline.filter((item) => !item._id.startsWith(`${deleteMeetingId}-`))
        }
      })
    } catch {
      setError('Unable to delete standup schedule')
    } finally {
      setDeleting(false)
      setDeleteMeetingId(null)
    }
  }

  const mergedMeetings = [...(project?.meetings || [])].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  )
  const upcomingMeetings = mergedMeetings
    .filter((m) => m.status !== 'completed' && m.status !== 'missed')
    .filter((m) => {
      if (!standupDateFilter) return true
      return getStandupDateKey(m.scheduledDate || m.date) === standupDateFilter
    })
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
  const pastMeetings = mergedMeetings
    .filter((m) => m.status === 'completed' || m.status === 'missed')
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  if (loading) {
    return (
      <MainLayout breadcrumbItems={breadcrumbItems}>
        <PageContent>
          <div className="flex items-center justify-center gap-2.5 py-20 text-[13px] text-[var(--apple-secondary-label)]">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading standup project…
          </div>
        </PageContent>
      </MainLayout>
    )
  }

  if (!project) {
    return (
      <MainLayout breadcrumbItems={breadcrumbItems}>
        <PageContent>
          <div className="rounded-[var(--apple-radius-xl)] border border-[var(--apple-separator)] bg-card p-12 text-center space-y-4">
            <p className="text-[15px] font-semibold">Standup project not found</p>
            <Button variant="outline" onClick={() => router.push('/tasks/standup-dashboard')}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Standup Dashboard
            </Button>
          </div>
        </PageContent>
      </MainLayout>
    )
  }

  const statusCfg = STATUS_CONFIG[project.status] ?? STATUS_CONFIG.active

  const totalMeetings = project.meetings?.length || 0
  const completedMeetings = project.meetings?.filter((m) => m.status === 'completed').length || 0

  return (
    <MainLayout breadcrumbItems={breadcrumbItems}>
      <PageContent>
        <div className="space-y-6 sm:space-y-8">

          {/* Page header */}
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-3">
              <Button
                variant="ghost"
                size="sm"
                className="w-fit gap-1.5 px-0 text-[var(--apple-secondary-label)] hover:text-[var(--apple-label)]"
                onClick={() => router.push('/tasks/standup-dashboard')}
              >
                <ArrowLeft className="h-4 w-4" />
                Standup Dashboard
              </Button>

              <div className="flex items-center gap-4">
                <div
                  className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[var(--apple-radius-md)] shadow-lg"
                  style={{ background: HEADER_GRADIENT, boxShadow: `0 8px 24px ${HEADER_GLOW}` }}
                >
                  <CalendarCheck className="h-7 w-7 text-white" />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2.5">
                    <h1 className="text-[28px] sm:text-[30px] font-bold tracking-tight">{project.name}</h1>
                    <div
                      className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusCfg.bg} ${statusCfg.text} ${statusCfg.border}`}
                      style={{ animation: 'badge-border-pulse 3s ease-in-out infinite' }}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${statusCfg.dot}`} style={{ animation: 'status-pulse 2s ease-in-out infinite' }} />
                      {statusCfg.label}
                    </div>
                  </div>
                  <p className="text-[13px] text-[var(--apple-secondary-label)] mt-0.5">{project.summary}</p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-4 text-[13px] text-[var(--apple-secondary-label)]">
                <span className="flex items-center gap-1.5"><Users className="h-4 w-4" />{project.teamMembers.length} team members</span>
                {project.sprintName && <span className="flex items-center gap-1.5"><Activity className="h-4 w-4" />{project.sprintName}</span>}
                <span className="flex items-center gap-1.5"><Clock3 className="h-4 w-4" />Last standup {formatDateTimeSafe(project.lastStandupAt)}</span>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => router.push(`/tasks/standup-dashboard/${projectId}/schedule/create`)}
                disabled={!canManageStandup}
                style={{ background: HEADER_GRADIENT }}
                className="text-white hover:opacity-90"
              >
                <CalendarDays className="mr-2 h-4 w-4" />
                Create Standup
              </Button>
            </div>
          </div>

          {/* Stats bar */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: 'Team Members',  value: project.teamMembers.length, icon: Users,        color: '#007AFF' },
              { label: 'Total Meetings',value: totalMeetings,              icon: CalendarCheck, color: '#AF52DE' },
              { label: 'Upcoming',      value: upcomingMeetings.length,    icon: CalendarDays,  color: '#FF9500' },
              { label: 'Completed',     value: completedMeetings,          icon: Activity,      color: '#34C759' },
            ].map(({ label, value, icon: Icon, color }) => (
              <div key={label} className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] p-4 space-y-1">
                <div className="flex items-center justify-between">
                  <p className="apple-section-label text-[var(--apple-secondary-label)]">{label}</p>
                  <Icon className="h-4 w-4" style={{ color }} />
                </div>
                <p className="text-[24px] font-bold tracking-tight font-apple-mono tabular-nums" style={{ color }}>{value}</p>
              </div>
            ))}
          </div>

          {/* Progress card */}
          <div className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] p-5 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[15px] font-semibold">Project Progress</p>
                <p className="text-[12px] text-[var(--apple-secondary-label)] mt-0.5">Standup coverage and team momentum for the current sprint window.</p>
              </div>
              <span className="text-[22px] font-bold font-apple-mono tabular-nums" style={{ color: '#007AFF' }}>
                {project.progressPercent}%
              </span>
            </div>
            <div className="relative h-[6px] overflow-hidden rounded-full bg-[var(--apple-tertiary-fill)]">
              {project.progressPercent > 2 && (
                <div
                  className="absolute inset-y-0 left-0 overflow-hidden rounded-full"
                  style={{
                    width: `${project.progressPercent}%`,
                    background: HEADER_GRADIENT,
                    boxShadow: `0 0 8px ${HEADER_GLOW}`,
                  }}
                >
                  <span className="progress-shimmer absolute inset-0" />
                </div>
              )}
            </div>
          </div>

          {error && (
            <div className="rounded-[var(--apple-radius-lg)] border border-red-500/20 bg-red-500/5 px-4 py-3 text-[13px] text-[var(--apple-system-red)]">
              {error}
            </div>
          )}

          {/* Upcoming meetings */}
          <section className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="apple-section-label text-[var(--apple-secondary-label)] mb-1">Schedule</p>
                <h2 className="text-[20px] font-bold tracking-tight">Upcoming Standup Meetings</h2>
                <p className="text-[13px] text-[var(--apple-secondary-label)] mt-0.5">Scheduled meetings for this project.</p>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <div className="space-y-1 sm:w-52">
                  <label htmlFor="standup-date-filter" className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--apple-secondary-label)]">
                    Filter by date
                  </label>
                  <input
                    id="standup-date-filter"
                    type="date"
                    value={standupDateFilter}
                    onChange={(e) => setStandupDateFilter(e.target.value)}
                    className="h-9 w-full rounded-[var(--apple-radius-sm)] border border-[var(--apple-separator)] bg-[var(--apple-quaternary-fill)] px-3 py-2 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-[var(--apple-system-blue)] focus-visible:ring-offset-2"
                  />
                </div>
                <Button variant="outline" size="sm" onClick={() => setStandupDateFilter('')} className="apple-transition">
                  <RefreshCw className="mr-2 h-3.5 w-3.5" />
                  Clear
                </Button>
              </div>
            </div>

            {upcomingMeetings.length === 0 ? (
              <div className="rounded-[var(--apple-radius-xl)] border border-dashed border-[var(--apple-separator)] bg-[var(--apple-quaternary-fill)] px-6 py-10 text-center text-[13px] text-[var(--apple-secondary-label)]">
                No upcoming standup meetings found.
              </div>
            ) : (
              <div className="view-transition-container grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {upcomingMeetings.map((meeting) => (
                  <MeetingCard
                    key={meeting._id}
                    meeting={meeting}
                    projectId={projectId}
                    canManage={canManageStandup}
                    formatDate={formatDate}
                    onView={() => router.push(`/tasks/standup-dashboard/${projectId}/schedule/${meeting._id}`)}
                    onDelete={() => handleDeleteMeeting(meeting._id)}
                  />
                ))}
              </div>
            )}
          </section>

          {/* Past meetings */}
          <section className="space-y-4">
            <div>
              <p className="apple-section-label text-[var(--apple-secondary-label)] mb-1">History</p>
              <h2 className="text-[20px] font-bold tracking-tight">Past Standup Meetings</h2>
              <p className="text-[13px] text-[var(--apple-secondary-label)] mt-0.5">Completed or missed meetings from this project.</p>
            </div>

            {pastMeetings.length === 0 ? (
              <div className="rounded-[var(--apple-radius-xl)] border border-dashed border-[var(--apple-separator)] bg-[var(--apple-quaternary-fill)] px-6 py-10 text-center text-[13px] text-[var(--apple-secondary-label)]">
                No past standup meetings yet.
              </div>
            ) : (
              <div className="view-transition-container grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {pastMeetings.map((meeting) => (
                  <MeetingCard
                    key={meeting._id}
                    meeting={meeting}
                    projectId={projectId}
                    canManage={canManageStandup}
                    formatDate={formatDate}
                    onView={() => router.push(`/tasks/standup-dashboard/${projectId}/schedule/${meeting._id}`)}
                    onDelete={() => handleDeleteMeeting(meeting._id)}
                    showStatus
                  />
                ))}
              </div>
            )}
          </section>

          {/* Live sprint */}
          {liveSprint && (
            <section className="space-y-4">
              <div>
                <p className="apple-section-label text-[var(--apple-secondary-label)] mb-1">Sprint</p>
                <h2 className="text-[20px] font-bold tracking-tight">Live Sprint Details</h2>
                <p className="text-[13px] text-[var(--apple-secondary-label)] mt-0.5">Current sprint data from the live sprint API.</p>
              </div>
              <div className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] p-5">
                <div className="grid gap-4 sm:grid-cols-2 text-[13px]">
                  <div className="space-y-0.5">
                    <p className="text-[var(--apple-secondary-label)]">Sprint name</p>
                    <p className="font-semibold">{liveSprint.name || project.sprintName || 'Sprint'}</p>
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-[var(--apple-secondary-label)]">Status</p>
                    <p className="font-semibold capitalize">{liveSprint.status || 'scheduled'}</p>
                  </div>
                  {liveSprint.startDate && (
                    <div className="space-y-0.5">
                      <p className="text-[var(--apple-secondary-label)]">Start date</p>
                      <p className="font-semibold">{formatDate(liveSprint.startDate)}</p>
                    </div>
                  )}
                  {liveSprint.endDate && (
                    <div className="space-y-0.5">
                      <p className="text-[var(--apple-secondary-label)]">End date</p>
                      <p className="font-semibold">{formatDate(liveSprint.endDate)}</p>
                    </div>
                  )}
                </div>
              </div>
            </section>
          )}

          {/* Timeline */}
          <StandupTimeline items={project.timeline} />
        </div>
      </PageContent>

      <ConfirmationModal
        isOpen={Boolean(deleteMeetingId)}
        onClose={() => !deleting && setDeleteMeetingId(null)}
        onConfirm={handleConfirmDeleteMeeting}
        title="Delete Standup Schedule"
        description="Are you sure you want to delete this standup schedule? This action permanently removes it from upcoming and past standup views."
        confirmText="Yes, Delete"
        cancelText="Cancel"
        variant="destructive"
        isLoading={deleting}
      />
    </MainLayout>
  )
}

/* ─── Meeting card sub-component ─── */
interface MeetingCardProps {
  meeting: any
  projectId: string
  canManage: boolean
  formatDate: (d: any) => string
  onView: () => void
  onDelete: () => void
  showStatus?: boolean
}

function MeetingCard({ meeting, canManage, formatDate, onView, onDelete, showStatus }: MeetingCardProps) {
  const statusCfg = MEETING_STATUS_CONFIG[meeting.status] ?? MEETING_STATUS_CONFIG.scheduled

  return (
    <div className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] apple-transition hover:shadow-[0_8px_28px_rgba(0,0,0,0.09)] dark:hover:shadow-[0_8px_28px_rgba(0,0,0,0.35)] overflow-hidden">
      {/* Top accent */}
      <div className="h-0.5 w-full bg-[var(--apple-separator)]" />

      <div className="p-4 space-y-3">
        {/* Title + status */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold truncate">{meeting.title}</p>
            {meeting.notes && (
              <p className="mt-0.5 text-[12px] text-[var(--apple-secondary-label)] line-clamp-1">{meeting.notes}</p>
            )}
          </div>
          {showStatus && (
            <div
              className={`flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold shrink-0 ${statusCfg.bg} ${statusCfg.text} ${statusCfg.border}`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${statusCfg.dot}`} />
              {statusCfg.label}
            </div>
          )}
        </div>

        {/* Meta */}
        <div className="space-y-1.5 text-[12px]">
          <div className="flex items-center justify-between">
            <span className="text-[var(--apple-secondary-label)]">Date</span>
            <span className="font-medium">{formatDate(meeting.date)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[var(--apple-secondary-label)]">Time</span>
            <span className="font-medium">{meeting.time}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[var(--apple-secondary-label)]">Duration</span>
            <span className="font-medium font-apple-mono">{meeting.durationMinutes} min</span>
          </div>
        </div>

        {/* Participants */}
        {meeting.participants?.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-[12px] text-[var(--apple-secondary-label)]">Participants</span>
            <div className="flex -space-x-2">
              {meeting.participants.slice(0, 5).map((p: any) => (
                <GravatarAvatar key={p._id} user={p} size={26} className="h-6.5 w-6.5 border-2 border-card rounded-full" />
              ))}
              {meeting.participants.length > 5 && (
                <div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-card bg-[var(--apple-tertiary-fill)] text-[10px] font-semibold text-[var(--apple-secondary-label)]">
                  +{meeting.participants.length - 5}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 pt-1">
          <Button variant="outline" size="sm" onClick={onView} className="h-8 text-[12px] apple-transition">
            <Eye className="mr-1.5 h-3.5 w-3.5" />
            View Details
          </Button>
          {canManage && (
            <Button variant="destructive" size="sm" onClick={onDelete} className="h-8 text-[12px] apple-transition">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
