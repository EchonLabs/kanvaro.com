'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { MainLayout } from '@/components/layout/MainLayout'
import { PageContent } from '@/components/ui/PageContent'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { useAuthContext } from '@/contexts/AuthContext'
import { useDateTime } from '@/components/providers/DateTimeProvider'
import { fetchStandupScheduleDetail } from '@/components/standup-dashboard/standup-dashboard-service'
import type { StandupScheduleDetail } from '@/components/standup-dashboard/standup-dashboard-types'
import { parseStandupSummary } from '@/components/standup-dashboard/standup-summary-parser'
import { getDelayedTasks } from '@/components/standup-dashboard/standup-delay-reason-utils'
import { formatLoggedHours } from '@/components/standup-dashboard/standup-timelog-utils'
import { ArrowLeft, CalendarDays, Clock3, Loader2, Sparkles, Users } from 'lucide-react'
import { formatToTitleCase } from '@/lib/utils'

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
      if (!user?.organization) {
        setLoading(false)
        return
      }

      try {
        const data = await fetchStandupScheduleDetail(projectId, meetingId, user.organization, abortController.signal)
        if (!abortController.signal.aborted) {
          setDetail(data)
        }
      } catch (error) {
        if (!abortController.signal.aborted) {
          console.error(error)
        }
      } finally {
        if (!abortController.signal.aborted) {
          setLoading(false)
        }
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
          <Card>
            <CardContent className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              Loading summary...
            </CardContent>
          </Card>
        </PageContent>
      </MainLayout>
    )
  }

  return (
    <MainLayout breadcrumbItems={breadcrumbItems}>
      <PageContent>
        <div className="space-y-6 sm:space-y-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-2">
              <Button variant="ghost" size="sm" className="w-fit px-0 text-muted-foreground" onClick={() => router.push(`/tasks/standup-dashboard/${projectId}/schedule/${meetingId}`)}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to details
              </Button>
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{detail.meeting.title} Summary</h1>
                <Badge variant="outline" className="capitalize">{formatToTitleCase(detail.meeting.status)}</Badge>
              </div>
              <p className="max-w-3xl text-sm text-muted-foreground sm:text-base">
                {detail.project.name} • {formatDate(detail.meeting.date)}
              </p>
              <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                <span className="flex items-center gap-1.5"><Users className="h-4 w-4" />{detail.meeting.participants.length} participants</span>
                <span className="flex items-center gap-1.5"><Clock3 className="h-4 w-4" />{detail.meeting.time}</span>
                <span className="flex items-center gap-1.5"><CalendarDays className="h-4 w-4" />{detail.meeting.durationMinutes} mins</span>
              </div>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
            <Card className="border-border/80 shadow-xs">
              <CardHeader className="border-b bg-muted/20">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-amber-500" />
                  <CardTitle className="text-base sm:text-lg">Summary Preview</CardTitle>
                </div>
                <CardDescription>
                  A readable overview of the completed standup. If a generated summary exists, it is shown here in sectioned form.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 p-5">
                {parsedSummary ? (
                  <div className="space-y-4">
                    <div className="rounded-xl border border-border/70 bg-background/80 p-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">Standup Summary</p>
                      <h2 className="mt-1 text-xl font-bold tracking-tight text-foreground">{parsedSummary.title}</h2>
                      {parsedSummary.metaLines.length > 0 && (
                        <div className="mt-4 grid gap-2 sm:grid-cols-2">
                          {parsedSummary.metaLines.map((line) => {
                            const [label, ...rest] = line.split(':')
                            const value = rest.join(':').trim()
                            return (
                              <div key={line} className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-sm">
                                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{label.trim()}</div>
                                <div className="mt-0.5 text-foreground">{value || '—'}</div>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>

                    <div className="space-y-4">
                      {parsedSummary.sections.map((section) => (
                        <section key={section.title} className="rounded-xl border border-border/70 bg-background/70 p-4">
                          <div className="flex items-center justify-between gap-3 border-b border-border/60 pb-2">
                            <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-foreground">{section.title}</h3>
                            <span className="text-[11px] text-muted-foreground">{section.lines.length} item{section.lines.length === 1 ? '' : 's'}</span>
                          </div>
                          <div className="mt-3 space-y-2 text-sm leading-relaxed text-muted-foreground">
                            {section.lines.map((line, index) => (
                              <p key={`${section.title}-${index}`} className={index === 0 ? 'text-foreground' : ''}>
                                {line}
                              </p>
                            ))}
                          </div>
                        </section>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-border/70 bg-muted/10 p-6 text-sm text-muted-foreground">
                    No generated summary exists yet. This page still shows the current standup snapshot below so you can review the meeting in context.
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="space-y-4">
              <Card className="border-border/80 shadow-xs">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base sm:text-lg">Standup Snapshot</CardTitle>
                  <CardDescription>Current meeting context and progress indicators.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-muted-foreground">Status</span>
                    <Badge variant="outline" className="capitalize">{formatToTitleCase(detail.meeting.status)}</Badge>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-muted-foreground">Participants</span>
                    <span>{detail.meeting.participants.length}</span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-muted-foreground">Logged time</span>
                    <span>{formatLoggedHours(totalLoggedMinutes)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-muted-foreground">Delayed tasks</span>
                    <span>{delayedTasks.length}</span>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border/80 shadow-xs">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base sm:text-lg">Meeting Notes</CardTitle>
                  <CardDescription>Helpful context from the standup record.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2 text-sm text-foreground">
                  <p>{detail.meeting.notes || 'No standup notes were recorded.'}</p>
                </CardContent>
              </Card>

              <Card className="border-border/80 shadow-xs">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base sm:text-lg">Delayed Tasks</CardTitle>
                  <CardDescription>Tasks that exceeded their estimates for this standup day.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  {delayedTasks.length > 0 ? (
                    delayedTasks.map((task) => (
                      <div key={task._id} className="rounded-xl border border-red-500/20 bg-red-500/5 p-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-semibold text-foreground truncate">{task.displayId ? `${task.displayId} · ` : ''}{task.title}</p>
                            <p className="text-xs text-muted-foreground mt-1">{task.loggedHours}h logged against {task.estimateHours}h estimate</p>
                          </div>
                          <Badge className="bg-red-500/10 text-red-600 border-red-500/20">overdue</Badge>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-xl border border-dashed border-border/70 bg-muted/10 p-4 text-muted-foreground">
                      No delayed tasks were detected.
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </PageContent>
    </MainLayout>
  )
}
