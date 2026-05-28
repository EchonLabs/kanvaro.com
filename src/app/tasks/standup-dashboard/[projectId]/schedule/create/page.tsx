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
import { ArrowLeft, CalendarIcon, Loader2, Plus, Trash2 } from 'lucide-react'
import { useNotify } from '@/lib/notify'
import { createStandupParticipantList, createStandupSchedule } from '@/components/standup-dashboard/standup-schedule-storage'
import { formatToTitleCase } from '@/lib/utils'

type MemberTaskRow = {
  id: string
  taskId: string
  notes: string
}

const createTaskRow = (): MemberTaskRow => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  taskId: '',
  notes: ''
})

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
  const [taskAssignments, setTaskAssignments] = useState<Record<string, MemberTaskRow[]>>({})

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

  useEffect(() => {
    setTaskAssignments((current) => {
      const selectedIds = new Set(selectedMembers.map((member) => member._id))
      const next: Record<string, MemberTaskRow[]> = {}

      selectedMembers.forEach((member) => {
        const existingRows = current[member._id]
        next[member._id] = existingRows && existingRows.length > 0 ? existingRows : [createTaskRow()]
      })

      Object.entries(current).forEach(([memberId, rows]) => {
        if (selectedIds.has(memberId) && rows.length > 0) {
          next[memberId] = rows
        }
      })

      return next
    })
  }, [selectedMembers])

  const handleToggleAttendee = (memberId: string) => {
    setFormState((current) => ({
      ...current,
      attendeeIds: current.attendeeIds.includes(memberId)
        ? current.attendeeIds.filter((id) => id !== memberId)
        : [...current.attendeeIds, memberId]
    }))

    setTaskAssignments((current) => {
      if (current[memberId]) {
        const next = { ...current }
        delete next[memberId]
        return next
      }

      return {
        ...current,
        [memberId]: [createTaskRow()]
      }
    })
  }

  const handleSaveTaskAssignment = (memberId: string, rowId: string, patch: Partial<MemberTaskRow>) => {
    setTaskAssignments((current) => ({
      ...current,
      [memberId]: (current[memberId] || [createTaskRow()]).map((row) => (row.id === rowId ? { ...row, ...patch } : row))
    }))
  }

  const handleAddTaskRow = (memberId: string) => {
    setTaskAssignments((current) => ({
      ...current,
      [memberId]: [...(current[memberId] || [createTaskRow()]), createTaskRow()]
    }))
  }

  const handleRemoveTaskRow = (memberId: string, rowId: string) => {
    setTaskAssignments((current) => {
      const rows = current[memberId] || []
      const nextRows = rows.filter((row) => row.id !== rowId)
      return {
        ...current,
        [memberId]: nextRows.length > 0 ? nextRows : [createTaskRow()]
      }
    })
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
      const selectedParticipants = project.teamMembers.filter((member) => formState.attendeeIds.includes(member._id))
      const assignments = selectedParticipants.flatMap((member) => {
        const rows = taskAssignments[member._id] || []
        return rows
          .map((row) => {
            const task = projectTasks.find((item) => item._id === row.taskId)
            if (!task) return null
            return {
              memberId: member._id,
              memberName: `${member.firstName} ${member.lastName}`.trim(),
              taskId: task._id,
              taskTitle: task.title,
              status: task.status,
              durationMinutes: Number(formState.durationMinutes),
              notes: row.notes.trim() || undefined
            }
          })
          .filter(Boolean)
      }).filter(Boolean)

      const createdSchedule = await createStandupSchedule(projectId, {
        title: formState.title,
        scheduledDate: selectedDate.toISOString(),
        time: formState.time,
        durationMinutes: Number(formState.durationMinutes),
        status: 'scheduled',
        participants: selectedParticipants.map((member) => member._id),
        facilitator: selectedParticipants[0]?._id || project.teamMembers[0]?._id,
        notes: formState.notes,
        assignments: assignments.map((assignment) => ({
          memberId: assignment?.memberId,
          taskId: assignment?.taskId,
          taskTitle: assignment?.taskTitle,
          taskStatus: assignment?.status,
          durationMinutes: assignment?.durationMinutes,
          notes: assignment?.notes
        })),
        comments: []
      })

      notifySuccess({ title: 'Standup schedule created', message: `${formState.title} scheduled for ${format(selectedDate, 'PPP')}` })
      router.push(`/tasks/standup-dashboard/${projectId}/schedule/${createdSchedule._id}`)
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
                  {selectedMembers.length > 0 ? selectedMembers.map((member) => {
                    const rows = taskAssignments[member._id] || [createTaskRow()]

                    return (
                      <div key={member._id} className="space-y-3 rounded-lg border p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-medium">{member.firstName} {member.lastName}</p>
                            <p className="text-xs text-muted-foreground">{member.role}</p>
                          </div>
                          <Badge variant="outline" className="shrink-0">{rows.length} task{rows.length === 1 ? '' : 's'}</Badge>
                        </div>

                        <div className="space-y-3">
                          {rows.map((row, index) => {
                            const selectedTask = projectTasks.find((task) => task._id === row.taskId)

                            return (
                              <div key={row.id} className="space-y-3 rounded-md bg-muted/30 p-3">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div className="flex items-center gap-2">
                                    <Badge variant="secondary">Task {index + 1}</Badge>
                                    {selectedTask?.status ? (
                                      <Badge variant="outline">{formatToTitleCase(selectedTask.status)}</Badge>
                                    ) : null}
                                  </div>
                                  <Button variant="ghost" size="sm" onClick={() => handleRemoveTaskRow(member._id, row.id)} className="h-8 px-2 text-muted-foreground">
                                    <Trash2 className="mr-2 h-3.5 w-3.5" />
                                    Remove
                                  </Button>
                                </div>

                                <div className="grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
                                  <Select value={row.taskId} onValueChange={(value) => handleSaveTaskAssignment(member._id, row.id, { taskId: value })}>
                                    <SelectTrigger>
                                      <SelectValue placeholder="Choose a project task" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {projectTasks.map((task) => (
                                        <SelectItem key={task._id} value={task._id}>
                                          <span className="flex items-center gap-2">
                                            <span>{task.displayId ? `${task.displayId} · ` : ''}{task.title}</span>
                                            {task.status ? <span className="text-xs text-muted-foreground">{formatToTitleCase(task.status)}</span> : null}
                                          </span>
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>

                                  <Textarea
                                    rows={3}
                                    value={row.notes}
                                    onChange={(event) => handleSaveTaskAssignment(member._id, row.id, { notes: event.target.value })}
                                    placeholder="Task notes, blockers, or handoff details"
                                  />
                                </div>
                              </div>
                            )
                          })}
                        </div>

                        <Button variant="outline" size="sm" onClick={() => handleAddTaskRow(member._id)} className="w-fit">
                          <Plus className="mr-2 h-4 w-4" />
                          Add task
                        </Button>
                      </div>
                    )
                  }) : (
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