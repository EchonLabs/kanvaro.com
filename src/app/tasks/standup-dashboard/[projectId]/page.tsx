'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { MainLayout } from '@/components/layout/MainLayout'
import { PageContent } from '@/components/ui/PageContent'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Progress } from '@/components/ui/Progress'
import { useAuthContext } from '@/contexts/AuthContext'
import { usePermissions } from '@/lib/permissions/permission-context'
import { Permission } from '@/lib/permissions/permission-definitions'
import { useBreadcrumb } from '@/contexts/BreadcrumbContext'
import { useDateTime } from '@/components/providers/DateTimeProvider'
import { formatToTitleCase } from '@/lib/utils'
import { Activity, ArrowLeft, CalendarDays, Clock3, Loader2, RefreshCw, Users } from 'lucide-react'
import { fetchStandupProjectDetail } from '@/components/standup-dashboard/standup-dashboard-service'
import { StandupTimeline } from '@/components/standup-dashboard/StandupTimeline'
import { GravatarAvatar } from '@/components/ui/GravatarAvatar'
import { useNotify } from '@/lib/notify'
 
import type { StandupProjectSummary } from '@/components/standup-dashboard/standup-dashboard-types'

export default function StandupProjectPage() {
  const params = useParams()
  const router = useRouter()
  const { isAuthenticated, isLoading: authLoading } = useAuthContext()
  const { hasPermission, canManageProject } = usePermissions()
  const { setItems } = useBreadcrumb()
  const { formatDate, formatDateTimeSafe } = useDateTime()
  const projectId = params.projectId as string
  const [project, setProject] = useState<StandupProjectSummary | null>(null)
  const [liveSprint, setLiveSprint] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [standupDateFilter, setStandupDateFilter] = useState('')

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

  useEffect(() => {
    if (project) {
      setItems([
        { label: 'Standup Dashboard', href: '/tasks/standup-dashboard' },
        { label: project.name }
      ])
    }
  }, [project, setItems])

  const canManageStandup = hasPermission(Permission.PROJECT_MANAGE_TEAM) && canManageProject(projectId)
  const filteredMeetings = project?.meetings.filter((meeting) => {
    if (!standupDateFilter) return true
    return meeting.date.slice(0, 10) === standupDateFilter
  }) ?? []

  if (loading) {
    return (
      <MainLayout>
        <PageContent>
          <Card>
            <CardContent className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading standup project...
            </CardContent>
          </Card>
        </PageContent>
      </MainLayout>
    )
  }

  if (!project) {
    return (
      <MainLayout>
        <PageContent>
          <Card>
            <CardContent className="py-16 text-center space-y-3">
              <p className="font-medium">Standup project not found</p>
              <Button variant="outline" onClick={() => router.push('/tasks/standup-dashboard')}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Standup Dashboard
              </Button>
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
              <Button variant="ghost" size="sm" className="w-fit px-0 text-muted-foreground" onClick={() => router.push('/tasks/standup-dashboard')}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{project.name}</h1>
                <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">{formatToTitleCase(project.status)}</Badge>
              </div>
              <p className="max-w-3xl text-sm text-muted-foreground sm:text-base">{project.summary}</p>
              <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                <span className="flex items-center gap-1.5"><Users className="h-4 w-4" />{project.teamMembers.length} team members</span>
                {project.sprintName ? <span className="flex items-center gap-1.5"><Activity className="h-4 w-4" />{project.sprintName}</span> : null}
                <span className="flex items-center gap-1.5"><Clock3 className="h-4 w-4" />Last standup {formatDateTimeSafe(project.lastStandupAt)}</span>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => router.push(`/tasks/standup-dashboard/${projectId}/schedule/create`)} disabled={!canManageStandup}>
                <CalendarDays className="mr-2 h-4 w-4" />
                Create Standup Schedule
              </Button>
            </div>
          </div>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div>
                <CardTitle className="text-base sm:text-lg">Project Progress</CardTitle>
                <CardDescription>Standup coverage and team momentum for the current sprint window.</CardDescription>
              </div>
              <Badge variant="outline">{project.progressPercent}%</Badge>
            </CardHeader>
            <CardContent>
              <Progress value={project.progressPercent} className="h-2" />
            </CardContent>
          </Card>

          {error && (
            <Card>
              <CardContent className="py-4 text-center text-sm text-muted-foreground">
                {error}. Showing the available fallback standup data.
              </CardContent>
            </Card>
          )}

          <section className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
              <h2 className="text-lg font-semibold">Upcoming Standup Meetings</h2>
              <p className="text-sm text-muted-foreground">Scheduled meetings.</p>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <div className="space-y-2 sm:w-56">
                  <label htmlFor="standup-date-filter" className="text-sm font-medium">Filter by date</label>
                  <input
                    id="standup-date-filter"
                    type="date"
                    value={standupDateFilter}
                    onChange={(event) => setStandupDateFilter(event.target.value)}
                    className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  />
                </div>
                <Button variant="outline" onClick={() => setStandupDateFilter('')} className="sm:mb-0">
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Refresh
                </Button>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filteredMeetings.map((meeting) => (
                <Card key={meeting._id}>
                  <CardHeader className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <CardTitle className="text-base">{meeting.title}</CardTitle>
                        <CardDescription>{meeting.notes}</CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <div className="flex items-center justify-between gap-4"><span className="text-muted-foreground">Date</span><span>{formatDate(meeting.date)}</span></div>
                    <div className="flex items-center justify-between gap-4"><span className="text-muted-foreground">Time</span><span>{meeting.time}</span></div>
                    <div className="flex items-center justify-between gap-4"><span className="text-muted-foreground">Duration</span><span>{meeting.durationMinutes} mins</span></div>
                    <div>
                      <div className="mb-2 text-muted-foreground">Participants</div>
                      <div className="flex -space-x-2 overflow-hidden">
                        {meeting.participants.map((participant) => (
                          <GravatarAvatar key={participant._id} user={participant} size={28} className="h-7 w-7 border-2 border-background" />
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>

          

          

          {liveSprint && (
            <section className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold">Live Sprint Details</h2>
                <p className="text-sm text-muted-foreground">The current sprint returned from the live sprint API.</p>
              </div>

              <Card>
                <CardContent className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5 text-sm">
                  <div className="space-y-1">
                    <p className="text-muted-foreground">Sprint name</p>
                    <p className="font-medium">{liveSprint.name || project.sprintName || 'Sprint'}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-muted-foreground">Status</p>
                    <p className="font-medium capitalize">{liveSprint.status || 'scheduled'}</p>
                  </div>
                  {liveSprint.startDate && (
                    <div className="space-y-1">
                      <p className="text-muted-foreground">Start date</p>
                      <p className="font-medium">{formatDate(liveSprint.startDate)}</p>
                    </div>
                  )}
                  {liveSprint.endDate && (
                    <div className="space-y-1">
                      <p className="text-muted-foreground">End date</p>
                      <p className="font-medium">{formatDate(liveSprint.endDate)}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </section>
          )}

          

          <StandupTimeline items={project.timeline} />
        </div>
      </PageContent>

    </MainLayout>
  )
}