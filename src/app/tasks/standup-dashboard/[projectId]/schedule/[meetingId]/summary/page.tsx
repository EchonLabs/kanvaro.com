'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { MainLayout } from '@/components/layout/MainLayout'
import { PageContent } from '@/components/ui/PageContent'
import { Button } from '@/components/ui/Button'
import { useAuthContext } from '@/contexts/AuthContext'
import { useDateTime } from '@/components/providers/DateTimeProvider'
import { fetchStandupScheduleDetail } from '@/components/standup-dashboard/standup-dashboard-service'
import type { StandupScheduleDetail } from '@/components/standup-dashboard/standup-dashboard-types'
import { parseStandupSummary } from '@/components/standup-dashboard/standup-summary-parser'
import { getDelayedTasks } from '@/components/standup-dashboard/standup-delay-reason-utils'
import { formatLoggedHours } from '@/components/standup-dashboard/standup-timelog-utils'
import { ArrowLeft, CalendarDays, Clock3, Loader2, Sparkles, Users, CalendarCheck, AlertTriangle } from 'lucide-react'
import { formatToTitleCase } from '@/lib/utils'


const STATUS_LABEL: Record<string, string> = {
  scheduled: 'Scheduled', in_progress: 'In Progress', completed: 'Completed', missed: 'Missed'
}

export default function StandupSummaryPage() {
  const params = useParams()
  const router = useRouter()
  const { user, isAuthenticated, isLoading: authLoading } = useAuthContext()
  const { formatDate } = useDateTime()
  const projectId = params.projectId as string
  const meetingId = params.meetingId as string

  const [detail, setDetail] = useState<StandupScheduleDetail | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/login')
    }
  }, [authLoading, isAuthenticated, router])

  useEffect(() => {
    const abortController = new AbortController()

    const loadDetail = async () => {
      if (!user?.organization) { setLoading(false); return }
      try {
        const data = await fetchStandupScheduleDetail(projectId, meetingId, user.organization, abortController.signal)
        if (!abortController.signal.aborted) setDetail(data)
      } catch (error) {
        if (!abortController.signal.aborted) console.error(error)
      } finally {
        if (!abortController.signal.aborted) setLoading(false)
      }
    }

    loadDetail()
    return () => abortController.abort()
  }, [meetingId, projectId, user?.organization])

  const breadcrumbItems = [
    { label: 'Tasks', href: '/tasks' },
    { label: 'Standup Dashboard', href: '/tasks/standup-dashboard' },
    { label: `${detail?.project?.name || 'Project'} Standups`, href: `/tasks/standup-dashboard/${projectId}` },
    { label: `${detail?.meeting?.title || 'Standup'} Summary` }
  ]

  const parsedSummary = useMemo(() => parseStandupSummary(detail?.meeting.summary || null), [detail?.meeting.summary])
  const delayedTasks = useMemo(() => getDelayedTasks(detail?.projectTasks || [], detail?.timelogs || []), [detail?.projectTasks, detail?.timelogs])
  const totalLoggedMinutes = detail?.timelogs.reduce((sum, log) => sum + log.duration, 0) || 0

  if (loading || !detail) {
    return (
      <MainLayout breadcrumbItems={breadcrumbItems}>
        <PageContent>
          <div className="flex items-center justify-center gap-2.5 py-20 text-[13px] text-[var(--apple-secondary-label)]">
            <Loader2 className="h-5 w-5 animate-spin" strokeWidth={1.5} />
            Loading summary…
          </div>
        </PageContent>
      </MainLayout>
    )
  }

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
                onClick={() => router.push(`/tasks/standup-dashboard/${projectId}/schedule/${meetingId}`)}
              >
                <ArrowLeft className="h-4 w-4" strokeWidth={1.5} />
                Back to details
              </Button>

              <div className="flex items-center gap-3">
                <Sparkles className="h-8 w-8 flex-shrink-0" strokeWidth={1.5} style={{ color: 'var(--apple-card-gradient)' }} />
                <div>
                  <h1 className="text-[28px] sm:text-[30px] font-bold tracking-tight text-[var(--apple-label)]">{detail.meeting.title} Summary</h1>
                  <p className="text-[13px] text-[var(--apple-secondary-label)] mt-0.5">
                    {detail.project.name} · {formatDate(detail.meeting.date)}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-4 text-[13px] text-[var(--apple-secondary-label)]">
                <span className="flex items-center gap-1.5"><Users className="h-4 w-4" strokeWidth={1.5} />{detail.meeting.participants.length} participants</span>
                <span className="flex items-center gap-1.5"><Clock3 className="h-4 w-4" strokeWidth={1.5} />{detail.meeting.time}</span>
                <span className="flex items-center gap-1.5"><CalendarDays className="h-4 w-4" strokeWidth={1.5} />{detail.meeting.durationMinutes} mins</span>
                <span className="flex items-center gap-1.5 rounded-full bg-[var(--apple-tertiary-fill)] px-2.5 py-0.5 text-[11px] font-medium">
                  {STATUS_LABEL[detail.meeting.status] || formatToTitleCase(detail.meeting.status)}
                </span>
              </div>
            </div>
          </div>

          {/* Two-column layout */}
          <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">

            {/* Summary preview */}
            <div className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] overflow-hidden">
              {/* Card header */}
              <div className="flex items-center gap-3 border-b border-[var(--apple-separator)] bg-[var(--apple-quaternary-fill)] px-5 py-4">
                <Sparkles className="h-5 w-5 shrink-0 text-[var(--apple-chart-to)]" strokeWidth={1.5} />
                <div>
                  <p className="text-[15px] font-semibold">Summary Preview</p>
                  <p className="text-[11px] text-[var(--apple-secondary-label)] mt-0.5">
                    AI-generated overview of the completed standup.
                  </p>
                </div>
              </div>

              <div className="p-5 space-y-4">
                {parsedSummary ? (
                  <div className="space-y-4">
                    {/* Title block */}
                    <div className="rounded-[var(--apple-radius-md)] border border-[var(--apple-separator)] bg-[var(--apple-quaternary-fill)] p-4">
                      <p className="apple-section-label text-[var(--apple-secondary-label)]">Standup Summary</p>
                      <h2 className="mt-1 text-[20px] font-bold tracking-tight">{parsedSummary.title}</h2>
                      {parsedSummary.metaLines.length > 0 && (
                        <div className="mt-4 grid gap-2 sm:grid-cols-2">
                          {parsedSummary.metaLines.map((line) => {
                            const [label, ...rest] = line.split(':')
                            const value = rest.join(':').trim()
                            return (
                              <div key={line} className="rounded-[var(--apple-radius-sm)] border border-[var(--apple-separator)] bg-card px-3 py-2">
                                <p className="apple-section-label text-[var(--apple-secondary-label)]">{label.trim()}</p>
                                <p className="mt-0.5 text-[13px] font-medium">{value || '—'}</p>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>

                    {/* Sections */}
                    <div className="space-y-3">
                      {parsedSummary.sections.map((section) => (
                        <div
                          key={section.title}
                          className="rounded-[var(--apple-radius-md)] border border-[var(--apple-separator)] bg-[var(--apple-quaternary-fill)] p-4"
                        >
                          <div className="flex items-center justify-between gap-3 border-b border-[var(--apple-separator)] pb-2 mb-3">
                            <p className="apple-section-label text-[var(--apple-label)]">{section.title}</p>
                            <span className="text-[10px] text-[var(--apple-secondary-label)]">
                              {section.lines.length} item{section.lines.length === 1 ? '' : 's'}
                            </span>
                          </div>
                          <div className="space-y-2 text-[13px] leading-relaxed text-[var(--apple-secondary-label)]">
                            {section.lines.map((line, i) => (
                              <p key={`${section.title}-${i}`} className={i === 0 ? 'text-[var(--apple-label)] font-medium' : ''}>
                                {line}
                              </p>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-[var(--apple-radius-md)] border border-dashed border-[var(--apple-separator)] bg-[var(--apple-quaternary-fill)] px-6 py-10 text-center space-y-2">
                    <Sparkles className="h-6 w-6 text-amber-400 mx-auto opacity-50" strokeWidth={1.5} />
                    <p className="text-[13px] font-medium text-[var(--apple-secondary-label)]">No summary generated yet</p>
                    <p className="text-[11px] text-[var(--apple-tertiary-label)]">
                      This page still shows the current standup snapshot so you can review the meeting in context.
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Right sidebar */}
            <div className="space-y-4">

              {/* Snapshot card */}
              <div className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] overflow-hidden">
                <div className="border-b border-[var(--apple-separator)] bg-[var(--apple-quaternary-fill)] px-4 py-3">
                  <p className="text-[15px] font-semibold">Standup Snapshot</p>
                  <p className="text-[11px] text-[var(--apple-secondary-label)] mt-0.5">Current meeting context and progress indicators.</p>
                </div>
                <div className="p-4 space-y-2.5 text-[13px]">
                  {[
                    { label: 'Status',        value: <span className="rounded-full bg-[var(--apple-tertiary-fill)] px-2 py-0.5 text-[11px] font-medium capitalize">{formatToTitleCase(detail.meeting.status)}</span> },
                    { label: 'Participants',   value: <span className="font-apple-mono">{detail.meeting.participants.length}</span> },
                    { label: 'Logged time',    value: <span className="font-apple-mono">{formatLoggedHours(totalLoggedMinutes)}</span> },
                    { label: 'Delayed tasks',  value: <span className="font-apple-mono">{delayedTasks.length}</span> },
                  ].map(({ label, value }) => (
                    <div key={label} className="flex items-center justify-between gap-4">
                      <span className="text-[var(--apple-secondary-label)]">{label}</span>
                      {value}
                    </div>
                  ))}
                </div>
              </div>

              {/* Meeting notes */}
              <div className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] overflow-hidden">
                <div className="border-b border-[var(--apple-separator)] bg-[var(--apple-quaternary-fill)] px-4 py-3">
                  <p className="text-[15px] font-semibold">Meeting Notes</p>
                  <p className="text-[11px] text-[var(--apple-secondary-label)] mt-0.5">Helpful context from the standup record.</p>
                </div>
                <div className="p-4">
                  <p className="text-[13px] leading-relaxed">{detail.meeting.notes || 'No standup notes were recorded.'}</p>
                </div>
              </div>

              {/* Delayed tasks */}
              <div className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] overflow-hidden">
                <div className="border-b border-[var(--apple-separator)] bg-[var(--apple-quaternary-fill)] px-4 py-3">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-3.5 w-3.5 text-[var(--apple-system-red)]" strokeWidth={1.5} />
                    <p className="text-[15px] font-semibold">Delayed Tasks</p>
                  </div>
                  <p className="text-[11px] text-[var(--apple-secondary-label)] mt-0.5">Tasks that exceeded their estimates.</p>
                </div>
                <div className="p-4 space-y-3">
                  {delayedTasks.length > 0 ? (
                    delayedTasks.map((task) => (
                      <div key={task._id} className="rounded-[var(--apple-radius-sm)] border border-red-500/20 bg-red-500/5 p-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-[13px] font-semibold truncate">
                              {task.displayId ? `${task.displayId} · ` : ''}{task.title}
                            </p>
                            <p className="text-[11px] text-[var(--apple-secondary-label)] mt-0.5">
                              {task.loggedHours}h logged · {task.estimateHours}h estimated
                            </p>
                          </div>
                          <span className="shrink-0 rounded-full bg-red-500/10 border border-red-500/20 px-2 py-0.5 text-[10px] font-semibold text-[var(--apple-system-red)]">
                            overdue
                          </span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-[var(--apple-radius-md)] border border-dashed border-[var(--apple-separator)] bg-[var(--apple-quaternary-fill)] px-4 py-6 text-center text-[12px] text-[var(--apple-secondary-label)]">
                      No delayed tasks were detected.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </PageContent>
    </MainLayout>
  )
}
