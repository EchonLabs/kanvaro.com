'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { MainLayout } from '@/components/layout/MainLayout'
import { PageContent } from '@/components/ui/PageContent'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { useAuthContext } from '@/contexts/AuthContext'
import { useBreadcrumb } from '@/contexts/BreadcrumbContext'
import { useDateTime } from '@/components/providers/DateTimeProvider'
import { usePermissions } from '@/lib/permissions/permission-context'
import { Permission } from '@/lib/permissions/permission-definitions'
import { fetchStandupScheduleDetail } from '@/components/standup-dashboard/standup-dashboard-service'
import type { StandupScheduleDetail, StandupMeetingStatus } from '@/components/standup-dashboard/standup-dashboard-types'
import { StandupSummaryDialog } from '@/components/standup-dashboard/StandupSummaryDialog'
import { deleteStandupSchedule, updateStandupSchedule } from '@/components/standup-dashboard/standup-schedule-storage'
import { useNotify } from '@/lib/notify'
import { StandupTaskNotesList } from '@/components/standup-dashboard/StandupTaskNotesList'
import { StandupTimelogList } from '@/components/standup-dashboard/StandupTimelogList'
import { ArrowLeft, CalendarDays, Clock3, Loader2, Trash2, Users } from 'lucide-react'

const statusLabels: Record<StandupMeetingStatus, string> = {
  scheduled: 'Scheduled',
  in_progress: 'In Progress',
  completed: 'Completed',
  missed: 'Missed'
}

export default function StandupScheduleDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { user, isAuthenticated, isLoading: authLoading } = useAuthContext()
  const { hasPermission, canManageProject } = usePermissions()
  const { setItems } = useBreadcrumb()
  const { formatDate } = useDateTime()
  const { success: notifySuccess, error: notifyError } = useNotify()
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

      setLoading(true)
      try {
        const data = await fetchStandupScheduleDetail(projectId, meetingId, user.organization, abortController.signal)
        if (!abortController.signal.aborted) {
          setDetail(data)
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

  useEffect(() => {
    if (detail?.project) {
      setItems([
        { label: 'Standup Dashboard', href: '/tasks/standup-dashboard' },
        { label: detail.project.name, href: `/tasks/standup-dashboard/${projectId}` },
        { label: detail.meeting.title }
      ])
    }
  }, [detail, projectId, setItems])

  const canManageStandup = hasPermission(Permission.PROJECT_MANAGE_TEAM) && canManageProject(projectId)

  const handleDeleteSchedule = async () => {
    if (!user?.organization) {
      notifyError({ title: 'Unable to delete standup' })
      return
    }

    if (!window.confirm('Delete this standup schedule? It will be archived from the dashboard.')) {
      return
    }

    try {
      await deleteStandupSchedule(projectId, meetingId)
      notifySuccess({ title: 'Standup deleted', message: 'The standup schedule was archived.' })
      router.push(`/tasks/standup-dashboard/${projectId}`)
    } catch {
      notifyError({ title: 'Unable to delete standup' })
    }
  }

  const overallSummary = useMemo(() => {
    if (!detail) return ''
    const completedTasks = detail.timelogs.filter((log) => log.status === 'completed').length
    if (completedTasks === 0) return 'No logged work was completed for this meeting date yet.'
    if (completedTasks >= detail.timelogs.length && detail.timelogs.length > 0) {
      return 'All logged work for the meeting date was completed.'
    }
    return `${completedTasks} logged tasks were completed on the meeting date.`
  }, [detail])

  if (loading || !detail) {
    return (
      <MainLayout>
        <PageContent>
          <Card>
            <CardContent className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading standup details...
            </CardContent>
          </Card>
        </PageContent>
      </MainLayout>
    )
  }

  return (
    <MainLayout>
      <PageContent>
        <div className="space-y-6 sm:space-y-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-2">
              <Button variant="ghost" size="sm" className="w-fit px-0 text-muted-foreground" onClick={() => router.push(`/tasks/standup-dashboard/${projectId}`)}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to project
              </Button>
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{detail.meeting.title}</h1>
                <Badge variant="outline" className="capitalize">{statusLabels[detail.meeting.status]}</Badge>
              </div>
              <p className="max-w-3xl text-sm text-muted-foreground sm:text-base">{detail.project.name} • {formatDate(detail.meeting.date)}</p>
              <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                <span className="flex items-center gap-1.5"><Users className="h-4 w-4" />{detail.meeting.participants.length} participants</span>
                <span className="flex items-center gap-1.5"><Clock3 className="h-4 w-4" />{detail.meeting.time}</span>
                <span className="flex items-center gap-1.5"><CalendarDays className="h-4 w-4" />{detail.meeting.durationMinutes} mins</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="h-fit">{detail.timelogs.length} timelogs</Badge>
              {canManageStandup ? <Badge variant="outline" className="h-fit">PM view</Badge> : null}
              {detail.meeting.status !== 'completed' && canManageStandup ? (
                <Button variant="outline" onClick={async () => {
                  if (!user?.organization) {
                    notifyError({ title: 'Unable to complete standup' })
                    return
                  }

                  try {
                    await updateStandupSchedule(projectId, meetingId, { status: 'completed', actualDate: new Date().toISOString() })
                    const data = await fetchStandupScheduleDetail(projectId, meetingId, user.organization)
                    setDetail(data)
                    notifySuccess({ title: 'Standup completed', message: 'Standup marked as completed.' })
                  } catch {
                    notifyError({ title: 'Unable to complete standup' })
                  }
                }}>Mark Complete</Button>
              ) : null}
              {canManageStandup ? (
                <Button variant="destructive" onClick={handleDeleteSchedule}>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </Button>
              ) : null}
              {detail.meeting.status === 'completed' ? <StandupSummaryDialog projectId={projectId} meetingId={meetingId} detail={detail} onGenerated={(summary) => setDetail((current) => current ? { ...current, meeting: { ...current.meeting, summary } } : current)} /> : null}
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base sm:text-lg">Day Summary</CardTitle>
              <CardDescription>Overall status for this standup date.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p>{overallSummary}</p>
              <p className="text-muted-foreground">{detail.meeting.notes || 'No standup notes were recorded.'}</p>
              {detail.meeting.summary ? <p className="rounded-lg border border-dashed border-border/60 bg-muted/30 p-3 text-muted-foreground">{detail.meeting.summary}</p> : null}
            </CardContent>
          </Card>

          <section className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold">Member Outcomes</h2>
              <p className="text-sm text-muted-foreground">What happened for each team member on this day.</p>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {detail.memberSummaries.map((member) => (
                <Card key={member._id}>
                  <CardHeader className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <CardTitle className="text-base">{member.firstName} {member.lastName}</CardTitle>
                        <CardDescription>{member.role}</CardDescription>
                      </div>
                      <Badge variant="outline" className="capitalize">{member.status.replace('_', ' ')}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <div className="grid grid-cols-2 gap-3 text-center">
                      <div className="rounded-lg bg-muted/50 p-3">
                        <p className="text-xs text-muted-foreground">Tasks</p>
                        <p className="text-lg font-semibold">{member.assignedTasks.length}</p>
                      </div>
                      <div className="rounded-lg bg-muted/50 p-3">
                        <p className="text-xs text-muted-foreground">Logged</p>
                        <p className="text-lg font-semibold">{Math.round(member.timeLoggedMinutes / 60 * 10) / 10}h</p>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <p className="text-muted-foreground">Current outcome</p>
                      <p>{member.blockedTasks > 0 ? 'Some work was blocked and may need follow-up.' : member.completedTasks > 0 ? 'Tasks were completed or advanced during this standup window.' : 'No task progress was recorded yet.'}</p>
                    </div>

                    <div className="space-y-2">
                      <p className="text-muted-foreground">Assigned tasks</p>
                      {member.assignedTasks.length > 0 ? (
                        <div className="space-y-2">
                          {member.assignedTasks.map((task) => (
                            <div key={task.taskId} className="rounded-lg border p-3 text-xs">
                              <p className="font-medium">{task.taskTitle}</p>
                              <p className="text-muted-foreground">{task.status || 'assigned'}</p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">No assignments captured for this member.</p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>

          <StandupTimelogList timelogs={detail.timelogs} members={detail.project.teamMembers} />

          <StandupTaskNotesList memberSummaries={detail.memberSummaries} />

          {detail.memberSummaries[0] && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base sm:text-lg">Member Snapshot</CardTitle>
                <CardDescription>{detail.memberSummaries[0].firstName} {detail.memberSummaries[0].lastName}</CardDescription>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                <p>{detail.memberSummaries[0].completedTasks > 0 ? 'This member completed work during the standup window.' : 'This member still needs follow-up on the selected day.'}</p>
              </CardContent>
            </Card>
          )}
        </div>
      </PageContent>
    </MainLayout>
  )
}