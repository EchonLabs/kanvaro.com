'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { MainLayout } from '@/components/layout/MainLayout'
import { PageContent } from '@/components/ui/PageContent'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/Popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useAuthContext } from '@/contexts/AuthContext'
import { usePermissions } from '@/lib/permissions/permission-context'
import { Permission } from '@/lib/permissions/permission-definitions'
import { fetchStandupProjectDetail } from '@/components/standup-dashboard/standup-dashboard-service'
import type { StandupMember, StandupProjectSummary } from '@/components/standup-dashboard/standup-dashboard-types'
import { ArrowLeft, CalendarCheck, CalendarIcon, Check, Loader2, Plus, Trash2, Users } from 'lucide-react'
import { useNotify } from '@/lib/notify'
import { createStandupParticipantList, createStandupSchedule } from '@/components/standup-dashboard/standup-schedule-storage'
import { formatToTitleCase, truncateText } from '@/lib/utils'

const HEADER_GRADIENT = 'var(--apple-card-gradient)'
const HEADER_GLOW = 'var(--apple-chart-glow)'

type MemberTaskRow = { id: string; taskId: string; notes: string }

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
          setFormState((cur) => ({
            ...cur,
            attendeeIds: data.summary.teamMembers.slice(0, 4).map((m) => m._id)
          }))
        }
      } finally {
        if (!abortController.signal.aborted) setLoading(false)
      }
    }

    loadProject()
    return () => abortController.abort()
  }, [projectId])

  const breadcrumbItems = [
    { label: 'Tasks', href: '/tasks' },
    { label: 'Standup Dashboard', href: '/tasks/standup-dashboard' },
    { label: `${project?.name || 'Project'} Standups`, href: `/tasks/standup-dashboard/${projectId}` },
    { label: 'Create Standup' }
  ]

  const selectedCount = useMemo(() => formState.attendeeIds.length, [formState.attendeeIds])
  const canManageStandup = hasPermission(Permission.PROJECT_MANAGE_TEAM) && canManageProject(projectId)
  const selectedMembers = useMemo(() => {
    if (!project) return [] as StandupMember[]
    return createStandupParticipantList(project.teamMembers, formState.attendeeIds)
  }, [formState.attendeeIds, project])

  useEffect(() => {
    setTaskAssignments((cur) => {
      const selectedIds = new Set(selectedMembers.map((m) => m._id))
      const next: Record<string, MemberTaskRow[]> = {}
      selectedMembers.forEach((m) => {
        next[m._id] = (cur[m._id]?.length ?? 0) > 0 ? cur[m._id] : [createTaskRow()]
      })
      Object.entries(cur).forEach(([id, rows]) => {
        if (selectedIds.has(id) && rows.length > 0) next[id] = rows
      })
      return next
    })
  }, [selectedMembers])

  const handleToggleAttendee = (memberId: string) => {
    setFormState((cur) => ({
      ...cur,
      attendeeIds: cur.attendeeIds.includes(memberId)
        ? cur.attendeeIds.filter((id) => id !== memberId)
        : [...cur.attendeeIds, memberId]
    }))
    setTaskAssignments((cur) => {
      if (cur[memberId]) {
        const next = { ...cur }
        delete next[memberId]
        return next
      }
      return { ...cur, [memberId]: [createTaskRow()] }
    })
  }

  const handleSaveTaskAssignment = (memberId: string, rowId: string, patch: Partial<MemberTaskRow>) => {
    setTaskAssignments((cur) => ({
      ...cur,
      [memberId]: (cur[memberId] || [createTaskRow()]).map((row) => row.id === rowId ? { ...row, ...patch } : row)
    }))
  }

  const handleAddTaskRow = (memberId: string) => {
    setTaskAssignments((cur) => ({
      ...cur,
      [memberId]: [...(cur[memberId] || [createTaskRow()]), createTaskRow()]
    }))
  }

  const handleRemoveTaskRow = (memberId: string, rowId: string) => {
    setTaskAssignments((cur) => {
      const rows = cur[memberId] || []
      const next = rows.filter((r) => r.id !== rowId)
      return { ...cur, [memberId]: next.length > 0 ? next : [createTaskRow()] }
    })
  }

  const handleSubmit = async () => {
    if (!selectedDate) { notifyError({ title: 'Choose a standup date before saving.' }); return }
    if (!project) { notifyError({ title: 'Project data is not available yet.' }); return }

    setSubmitting(true)
    try {
      const selectedParticipants = project.teamMembers.filter((m) => formState.attendeeIds.includes(m._id))
      const assignments = selectedParticipants.flatMap((member) => {
        const rows = taskAssignments[member._id] || []
        return rows.map((row) => {
          const task = projectTasks.find((t) => t._id === row.taskId)
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
        }).filter(Boolean)
      }).filter(Boolean)

      const createdSchedule = await createStandupSchedule(projectId, {
        title: formState.title,
        scheduledDate: selectedDate.toISOString(),
        time: formState.time,
        durationMinutes: Number(formState.durationMinutes),
        status: 'scheduled',
        participants: selectedParticipants.map((m) => m._id),
        facilitator: selectedParticipants[0]?._id || project.teamMembers[0]?._id,
        notes: formState.notes,
        assignments: assignments.map((a) => ({
          memberId: a?.memberId,
          taskId: a?.taskId,
          taskTitle: a?.taskTitle,
          taskStatus: a?.status,
          durationMinutes: a?.durationMinutes,
          notes: a?.notes
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
      <MainLayout breadcrumbItems={breadcrumbItems}>
        <PageContent>
          <div className="flex items-center justify-center gap-2.5 py-20 text-[13px] text-[var(--apple-secondary-label)]">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading schedule form…
          </div>
        </PageContent>
      </MainLayout>
    )
  }

  if (!canManageStandup) {
    return (
      <MainLayout breadcrumbItems={breadcrumbItems}>
        <PageContent>
          <div className="max-w-lg rounded-[var(--apple-radius-xl)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] p-8 text-center space-y-4">
            <p className="text-[15px] font-semibold">Create Standup Schedule</p>
            <p className="text-[13px] text-[var(--apple-secondary-label)]">You do not currently have permission to create a schedule for this project.</p>
            <Button onClick={() => router.push(`/tasks/standup-dashboard/${projectId}`)}>Back to project</Button>
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
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-3">
              <Button
                variant="ghost"
                size="sm"
                className="w-fit gap-1.5 px-0 text-[var(--apple-secondary-label)] hover:text-[var(--apple-label)]"
                onClick={() => router.push(`/tasks/standup-dashboard/${projectId}`)}
              >
                <ArrowLeft className="h-4 w-4" />
                Back to project
              </Button>

              <div className="flex items-center gap-4">
                <div
                  className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[var(--apple-radius-md)] shadow-lg"
                  style={{ background: HEADER_GRADIENT, boxShadow: `0 8px 24px ${HEADER_GLOW}` }}
                >
                  <CalendarCheck className="h-7 w-7 text-white" />
                </div>
                <div>
                  <h1 className="text-[28px] sm:text-[30px] font-bold tracking-tight">Create Standup Schedule</h1>
                  <p className="text-[13px] text-[var(--apple-secondary-label)] mt-0.5">
                    Set up a standup session for {project.name}.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 text-[13px] text-[var(--apple-secondary-label)]">
              <Users className="h-4 w-4" />
              {project.teamMembers.length} members
            </div>
          </div>

          {/* Form card */}
          <div className="rounded-[var(--apple-radius-xl)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] overflow-hidden">

            {/* Card header */}
            <div className="border-b border-[var(--apple-separator)] bg-[var(--apple-quaternary-fill)] px-6 py-4">
              <p className="text-[17px] font-semibold">Schedule Details</p>
              <p className="text-[12px] text-[var(--apple-secondary-label)] mt-0.5">Fill in the standup details, then save the schedule.</p>
            </div>

            <div className="p-6 space-y-6">

              {/* Title + date */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="standup-title" className="text-[13px] font-medium">Meeting title</Label>
                  <Input
                    id="standup-title"
                    value={formState.title}
                    onChange={(e) => setFormState((cur) => ({ ...cur, title: e.target.value }))}
                    className="rounded-[var(--apple-radius-sm)] border-[var(--apple-separator)] bg-[var(--apple-quaternary-fill)] focus:bg-card"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[13px] font-medium">Meeting date</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-start text-left font-normal rounded-[var(--apple-radius-sm)] border-[var(--apple-separator)] bg-[var(--apple-quaternary-fill)] hover:bg-card">
                        <CalendarIcon className="mr-2 h-4 w-4 text-[var(--apple-secondary-label)]" />
                        <span className="text-[13px]">{selectedDate ? format(selectedDate, 'PPP') : 'Pick a date'}</span>
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0 rounded-[var(--apple-radius-lg)]">
                      <Calendar mode="single" selected={selectedDate} onSelect={setSelectedDate} initialFocus />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>

              {/* Time + duration */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="standup-time" className="text-[13px] font-medium">Time</Label>
                  <Input
                    id="standup-time"
                    type="time"
                    value={formState.time}
                    onChange={(e) => setFormState((cur) => ({ ...cur, time: e.target.value }))}
                    className="rounded-[var(--apple-radius-sm)] border-[var(--apple-separator)] bg-[var(--apple-quaternary-fill)] focus:bg-card"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="standup-duration" className="text-[13px] font-medium">Duration (minutes)</Label>
                  <Input
                    id="standup-duration"
                    type="number"
                    min={5}
                    step={5}
                    value={formState.durationMinutes}
                    onChange={(e) => setFormState((cur) => ({ ...cur, durationMinutes: e.target.value }))}
                    className="rounded-[var(--apple-radius-sm)] border-[var(--apple-separator)] bg-[var(--apple-quaternary-fill)] focus:bg-card"
                  />
                </div>
              </div>

              {/* Attendees */}
              <div className="space-y-2">
                <Label className="text-[13px] font-medium">Attendees</Label>
                <div className="flex flex-wrap gap-2">
                  {project.teamMembers.map((member: StandupMember) => {
                    const checked = formState.attendeeIds.includes(member._id)
                    return (
                      <button
                        key={member._id}
                        type="button"
                        onClick={() => handleToggleAttendee(member._id)}
                        className={`apple-transition inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[12px] font-medium ${
                          checked
                            ? 'border-[var(--apple-system-blue)] bg-blue-50 dark:bg-blue-950/30 text-[var(--apple-system-blue)]'
                            : 'border-[var(--apple-separator)] bg-[var(--apple-quaternary-fill)] text-[var(--apple-secondary-label)] hover:bg-[var(--apple-tertiary-fill)]'
                        }`}
                      >
                        {checked && <Check className="h-3 w-3" />}
                        {member.firstName} {member.lastName}
                      </button>
                    )
                  })}
                </div>
                <p className="text-[11px] text-[var(--apple-secondary-label)]">
                  {selectedCount} member{selectedCount !== 1 ? 's' : ''} selected · Choose who should receive the schedule notification.
                </p>
              </div>

              {/* Separator */}
              <div className="border-t border-[var(--apple-separator)]" />

              {/* Task assignments */}
              <div className="space-y-3">
                <div>
                  <p className="text-[13px] font-medium">Task assignments</p>
                  <p className="text-[11px] text-[var(--apple-secondary-label)] mt-0.5">Assign project tasks to each selected member.</p>
                </div>

                {selectedMembers.length > 0 ? (
                  <div className="space-y-3">
                    {selectedMembers.map((member) => {
                      const rows = taskAssignments[member._id] || [createTaskRow()]
                      return (
                        <div
                          key={member._id}
                          className="rounded-[var(--apple-radius-md)] border border-[var(--apple-separator)] bg-[var(--apple-quaternary-fill)] overflow-hidden"
                        >
                          {/* Member header */}
                          <div className="flex items-center justify-between gap-3 border-b border-[var(--apple-separator)] bg-card px-4 py-2.5">
                            <div>
                              <p className="text-[13px] font-semibold">{member.firstName} {member.lastName}</p>
                              <p className="text-[11px] text-[var(--apple-secondary-label)]">{member.role}</p>
                            </div>
                            <span className="rounded-full border border-[var(--apple-separator)] bg-[var(--apple-quaternary-fill)] px-2 py-0.5 text-[10px] font-medium text-[var(--apple-secondary-label)]">
                              {rows.length} task{rows.length !== 1 ? 's' : ''}
                            </span>
                          </div>

                          {/* Task rows */}
                          <div className="p-3 space-y-2">
                            {rows.map((row) => {
                              const selectedTask = projectTasks.find((t) => t._id === row.taskId)
                              return (
                                <div
                                  key={row.id}
                                  className="flex items-center gap-2 rounded-[var(--apple-radius-sm)] border border-[var(--apple-separator)] bg-card p-2.5 apple-transition hover:shadow-[0_2px_8px_rgba(0,0,0,0.06)]"
                                >
                                  <div className="flex-1 min-w-0">
                                    <Select
                                      value={row.taskId}
                                      onValueChange={(v) => handleSaveTaskAssignment(member._id, row.id, { taskId: v })}
                                    >
                                      <SelectTrigger className="w-full border-none shadow-none font-medium h-fit p-0 hover:bg-transparent text-[13px]">
                                        <SelectValue placeholder="Choose a project task" />
                                      </SelectTrigger>
                                      <SelectContent className="w-[var(--radix-select-trigger-width)] max-w-[min(95vw,28rem)]">
                                        {projectTasks.map((task) => {
                                          const taskLabel = `${task.displayId ? `${task.displayId} · ` : ''}${task.title}`
                                          const { truncated } = truncateText(taskLabel, 48)
                                          return (
                                            <SelectItem key={task._id} value={task._id} className="max-w-full text-[12px]">
                                              <span className="flex items-center gap-2">
                                                <span className="truncate">{truncated}</span>
                                                {task.status && (
                                                  <span className="shrink-0 text-[10px] text-[var(--apple-secondary-label)] capitalize bg-[var(--apple-tertiary-fill)] px-1.5 py-0.5 rounded">
                                                    {formatToTitleCase(task.status)}
                                                  </span>
                                                )}
                                              </span>
                                            </SelectItem>
                                          )
                                        })}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                  {selectedTask?.status && (
                                    <span className="shrink-0 text-[10px] capitalize rounded-full border border-[var(--apple-separator)] bg-[var(--apple-quaternary-fill)] px-2 py-0.5 font-medium text-[var(--apple-secondary-label)]">
                                      {formatToTitleCase(selectedTask.status)}
                                    </span>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveTaskRow(member._id, row.id)}
                                    className="apple-transition h-7 w-7 shrink-0 flex items-center justify-center rounded-full text-[var(--apple-tertiary-label)] hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/30"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              )
                            })}

                            <button
                              type="button"
                              onClick={() => handleAddTaskRow(member._id)}
                              className="apple-transition flex items-center gap-1.5 text-[11px] font-medium text-[var(--apple-system-blue)] hover:opacity-70 mt-1"
                            >
                              <Plus className="h-3.5 w-3.5" />
                              Add task
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="rounded-[var(--apple-radius-md)] border border-dashed border-[var(--apple-separator)] bg-[var(--apple-quaternary-fill)] px-6 py-8 text-center text-[12px] text-[var(--apple-secondary-label)]">
                    Select at least one attendee to assign project tasks.
                  </div>
                )}
              </div>

              {/* Separator */}
              <div className="border-t border-[var(--apple-separator)]" />

              {/* Notes */}
              <div className="space-y-1.5">
                <Label htmlFor="standup-notes" className="text-[13px] font-medium">Notes</Label>
                <Textarea
                  id="standup-notes"
                  rows={4}
                  value={formState.notes}
                  onChange={(e) => setFormState((cur) => ({ ...cur, notes: e.target.value }))}
                  placeholder="Add prep notes, blockers to review, or agenda items."
                  className="resize-none rounded-[var(--apple-radius-sm)] border-[var(--apple-separator)] bg-[var(--apple-quaternary-fill)] focus:bg-card text-[13px]"
                />
              </div>

              {/* Submit */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <Button variant="outline" onClick={() => router.push(`/tasks/standup-dashboard/${projectId}`)} className="apple-transition">
                  Cancel
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="text-white apple-transition"
                  style={{ background: HEADER_GRADIENT, boxShadow: `0 2px 12px ${HEADER_GLOW}` }}
                >
                  {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Create Schedule
                </Button>
              </div>
            </div>
          </div>
        </div>
      </PageContent>
    </MainLayout>
  )
}
