'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { MainLayout } from '@/components/layout/MainLayout'
import { PageContent } from '@/components/ui/PageContent'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/Popover'
import { Checkbox } from '@/components/ui/Checkbox'
import { Badge } from '@/components/ui/Badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useAuthContext } from '@/contexts/AuthContext'
import { usePermissions } from '@/lib/permissions/permission-context'
import { Permission } from '@/lib/permissions/permission-definitions'
import { useBreadcrumb } from '@/contexts/BreadcrumbContext'
import { useDateTime } from '@/components/providers/DateTimeProvider'
import { fetchStandupProjectDetail } from '@/components/standup-dashboard/standup-dashboard-service'
import type { StandupMember, StandupProjectSummary } from '@/components/standup-dashboard/standup-dashboard-types'
import { ArrowLeft, CalendarIcon, Loader2 } from 'lucide-react'
import { useNotify } from '@/lib/notify'
import { createStandupParticipantList, saveStoredStandupSchedule } from '@/components/standup-dashboard/standup-schedule-storage'

export default function CreateStandupSchedulePage() {
  const params = useParams()
  const router = useRouter()
  const { isAuthenticated, isLoading: authLoading } = useAuthContext()
  const { hasPermission, canManageProject } = usePermissions()
  const { setItems } = useBreadcrumb()
  const { formatDate } = useDateTime()
  const { success: notifySuccess, error: notifyError } = useNotify()
  const projectId = params.projectId as string

  const [project, setProject] = useState<StandupProjectSummary | null>(null)
  const [projectTasks, setProjectTasks] = useState<Array<{ _id: string; title: string; status?: string; priority?: string; displayId?: string }>>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date())
  const [formState, setFormState] = useState({
    title: 'Daily Standup',
    time: '09:00',
    durationMinutes: '15',
    notes: '',
    attendeeIds: [] as string[]
  })
  const [taskAssignments, setTaskAssignments] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/login')
    }
  }, [authLoading, isAuthenticated, router])

  useEffect(() => {
    const abortController = new AbortController()

    const loadProject = async () => {
      setLoading(true)
      try {
        const data = await fetchStandupProjectDetail(projectId, abortController.signal)
        if (!abortController.signal.aborted) {
          setProject(data.summary)
          setProjectTasks((data.projectTasks || []).map((task) => ({
            _id: task._id,
            title: task.title || 'Untitled task',
            status: task.status,
            priority: task.priority,
            displayId: task.displayId
          })))
          setFormState((current) => ({
            ...current,
            attendeeIds: data.summary.teamMembers.slice(0, 4).map((member) => member._id)
          }))
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
        { label: project.name, href: `/tasks/standup-dashboard/${projectId}` },
        { label: 'Create Schedule' }
      ])
    }
  }, [project, projectId, setItems])

  const selectedCount = useMemo(() => formState.attendeeIds.length, [formState.attendeeIds])
  const canManageStandup = hasPermission(Permission.PROJECT_MANAGE_TEAM) && canManageProject(projectId)
  const selectedMembers = useMemo(() => {
    if (!project) return [] as StandupMember[]
    return createStandupParticipantList(project.teamMembers, formState.attendeeIds)
  }, [formState.attendeeIds, project])

  const handleToggleAttendee = (memberId: string) => {
    setFormState((current) => ({
      ...current,
      attendeeIds: current.attendeeIds.includes(memberId)
        ? current.attendeeIds.filter((id) => id !== memberId)
        : [...current.attendeeIds, memberId]
    }))
  }

  const handleSaveTaskAssignment = (memberId: string, taskId: string) => {
    setTaskAssignments((current) => ({
      ...current,
      [memberId]: taskId
    }))
  }

  const handleSubmit = async () => {
    if (!selectedDate) {
      notifyError({ title: 'Choose a standup date before saving.' })
      return
    }

    if (!project) {
      notifyError({ title: 'Project data is not available yet.' })
      return
    }

    setSubmitting(true)
    try {
      const scheduleId = `standup-${Date.now()}`
      const selectedParticipants = project.teamMembers.filter((member) => formState.attendeeIds.includes(member._id))
      const assignments = selectedParticipants
        .map((member) => {
          const taskId = taskAssignments[member._id]
          const task = projectTasks.find((item) => item._id === taskId)
          if (!task) return null
          return {
            memberId: member._id,
            memberName: `${member.firstName} ${member.lastName}`.trim(),
            taskId: task._id,
            taskTitle: task.title,
            status: task.status,
            durationMinutes: Number(formState.durationMinutes)
          }
        })
        .filter(Boolean)

      saveStoredStandupSchedule(projectId, {
        _id: scheduleId,
        title: formState.title,
        date: selectedDate.toISOString(),
        time: formState.time,
        durationMinutes: Number(formState.durationMinutes),
        status: 'scheduled',
        participants: selectedParticipants,
        notes: formState.notes,
        assignments: assignments as any,
        comments: []
      })

      await new Promise((resolve) => setTimeout(resolve, 600))
      notifySuccess({ title: 'Standup schedule created', message: `${formState.title} scheduled for ${format(selectedDate, 'PPP')}` })
      router.push(`/tasks/standup-dashboard/${projectId}/schedule/${scheduleId}`)
    } catch {
      notifyError({ title: 'Unable to create schedule' })
    } finally {
      setSubmitting(false)
    }
  }

  if (loading || !project) {
    return (
      <MainLayout>
        <PageContent>
          <Card>
            <CardContent className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading schedule form...
            </CardContent>
          </Card>
        </PageContent>
      </MainLayout>
    )
  }

  if (!canManageStandup) {
    return (
      <MainLayout>
        <PageContent>
          <Card className="max-w-2xl">
            <CardHeader>
              <CardTitle>Create Standup Schedule</CardTitle>
              <CardDescription>This area is available to project managers.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">You do not currently have permission to create a schedule for this project.</p>
              <Button onClick={() => router.push(`/tasks/standup-dashboard/${projectId}`)}>Back to project</Button>
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
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2">
              <Button variant="ghost" size="sm" className="w-fit px-0 text-muted-foreground" onClick={() => router.push(`/tasks/standup-dashboard/${projectId}`)}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to project
              </Button>
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Create Standup Schedule</h1>
                <p className="max-w-3xl text-sm text-muted-foreground sm:text-base mt-2">
                  Set up a standup session for {project.name} and pick the attendees, date, and notes.
                </p>
              </div>
            </div>
            <Badge variant="outline" className="h-fit hidden sm:inline-flex">{project.teamMembers.length} members</Badge>
          </div>


          <Card>
            <CardHeader>
              <CardTitle className="text-base sm:text-lg">Schedule Details</CardTitle>
              <CardDescription>Fill in the standup details, then save the schedule.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="standup-title">Meeting title</Label>
                  <Input id="standup-title" value={formState.title} onChange={(event) => setFormState((current) => ({ ...current, title: event.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Meeting date</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-start text-left font-normal">
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {selectedDate ? format(selectedDate, 'PPP') : 'Pick a date'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar mode="single" selected={selectedDate} onSelect={setSelectedDate} initialFocus />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="standup-time">Time</Label>
                  <Input id="standup-time" type="time" value={formState.time} onChange={(event) => setFormState((current) => ({ ...current, time: event.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="standup-duration">Duration (minutes)</Label>
                  <Input id="standup-duration" type="number" min={5} step={5} value={formState.durationMinutes} onChange={(event) => setFormState((current) => ({ ...current, durationMinutes: event.target.value }))} />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Attendees</Label>
                <div className="flex flex-wrap gap-2">
                  {project.teamMembers.map((member: StandupMember) => {
                    const checked = formState.attendeeIds.includes(member._id)
                    return (
                      <button
                        key={member._id}
                        type="button"
                        onClick={() => handleToggleAttendee(member._id)}
                        className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors ${checked ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-background text-muted-foreground hover:bg-muted'}`}
                      >
                        <Checkbox checked={checked} aria-label={member.firstName} />
                        <span>{member.firstName} {member.lastName}</span>
                      </button>
                    )
                  })}
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="outline">{selectedCount} selected</Badge>
                  <span>Choose who should receive the schedule notification.</span>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <Label>Task assignments</Label>
                  <p className="text-xs text-muted-foreground">Assign one of the project tasks to each selected member.</p>
                </div>

                <div className="grid gap-3">
                  {selectedMembers.length > 0 ? selectedMembers.map((member) => (
                    <div key={member._id} className="grid gap-3 rounded-lg border p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] sm:items-center">
                      <div>
                        <p className="font-medium">{member.firstName} {member.lastName}</p>
                        <p className="text-xs text-muted-foreground">{member.role}</p>
                      </div>
                      <Select value={taskAssignments[member._id] || ''} onValueChange={(value) => handleSaveTaskAssignment(member._id, value)}>
                        <SelectTrigger>
                          <SelectValue placeholder="Choose a project task" />
                        </SelectTrigger>
                        <SelectContent>
                          {projectTasks.map((task) => (
                            <SelectItem key={task._id} value={task._id}>
                              {task.displayId ? `${task.displayId} · ` : ''}{task.title}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )) : (
                    <Card>
                      <CardContent className="py-6 text-center text-sm text-muted-foreground">
                        Select at least one attendee to assign project tasks.
                      </CardContent>
                    </Card>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="standup-notes">Notes</Label>
                <Textarea id="standup-notes" rows={4} value={formState.notes} onChange={(event) => setFormState((current) => ({ ...current, notes: event.target.value }))} placeholder="Add prep notes, blockers to review, or agenda items." />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <Button variant="outline" onClick={() => router.push(`/tasks/standup-dashboard/${projectId}`)}>Cancel</Button>
                <Button onClick={handleSubmit} disabled={submitting}>
                  {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Create Schedule
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </PageContent>
    </MainLayout>
  )
}