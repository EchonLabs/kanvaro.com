'use client'

import { useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { Button } from '@/components/ui/Button'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/Dialog'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/Popover'
import { Checkbox } from '@/components/ui/Checkbox'
import { Badge } from '@/components/ui/Badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { CalendarIcon, Loader2, Plus, Trash2 } from 'lucide-react'
import { useNotify } from '@/lib/notify'
import { updateStandupSchedule } from './standup-schedule-storage'
import { formatToTitleCase, truncateText } from '@/lib/utils'
import type { StandupMember, StandupMeeting, StandupScheduleDetail } from './standup-dashboard-types'

interface EditStandupScheduleModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  organizationId: string
  detail: StandupScheduleDetail
  onSuccess: (updatedDetail: StandupScheduleDetail) => void
}

type TaskRow = {
  id: string
  taskId: string
  taskTitle: string
  status?: string
}

const generateRowId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

export function EditStandupScheduleModal({
  open,
  onOpenChange,
  projectId,
  organizationId,
  detail,
  onSuccess
}: EditStandupScheduleModalProps) {
  const { success: notifySuccess, error: notifyError } = useNotify()
  const [submitting, setSubmitting] = useState(false)
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date(detail.meeting.date))

  const [formState, setFormState] = useState({
    title: detail.meeting.title,
    time: detail.meeting.time,
    durationMinutes: String(detail.meeting.durationMinutes),
    status: detail.meeting.status,
    notes: detail.meeting.notes || '',
    attendeeIds: detail.meeting.participants.map((m) => m._id)
  })

  // Map of memberId -> TaskRow[]
  const [taskAssignments, setTaskAssignments] = useState<Record<string, TaskRow[]>>({})

  // Initialize assignments state
  useEffect(() => {
    if (open) {
      setSelectedDate(new Date(detail.meeting.date))
      setFormState({
        title: detail.meeting.title,
        time: detail.meeting.time,
        durationMinutes: String(detail.meeting.durationMinutes),
        status: detail.meeting.status,
        notes: detail.meeting.notes || '',
        attendeeIds: detail.meeting.participants.map((m) => m._id)
      })

      const initialAssignments: Record<string, TaskRow[]> = {}
      
      // Initialize with existing assignments
      if (Array.isArray(detail.meeting.assignments)) {
        detail.meeting.assignments.forEach((assignment) => {
          if (!initialAssignments[assignment.memberId]) {
            initialAssignments[assignment.memberId] = []
          }
          initialAssignments[assignment.memberId].push({
            id: generateRowId(),
            taskId: assignment.taskId,
            taskTitle: assignment.taskTitle,
            status: assignment.status
          })
        })
      }

      // Fill in default rows for participants without assignments
      detail.meeting.participants.forEach((participant) => {
        if (!initialAssignments[participant._id] || initialAssignments[participant._id].length === 0) {
          initialAssignments[participant._id] = [{ id: generateRowId(), taskId: '', taskTitle: '' }]
        }
      })

      setTaskAssignments(initialAssignments)
    }
  }, [open, detail])

  const projectMembers = detail.project.teamMembers
  const projectTasks = detail.projectTasks

  const selectedCount = formState.attendeeIds.length
  
  const selectedMembers = useMemo(() => {
    return projectMembers.filter((member) => formState.attendeeIds.includes(member._id))
  }, [formState.attendeeIds, projectMembers])

  // Sync task assignment rows when attendees list changes
  useEffect(() => {
    setTaskAssignments((current) => {
      const selectedIds = new Set(selectedMembers.map((member) => member._id))
      const next: Record<string, TaskRow[]> = {}

      selectedMembers.forEach((member) => {
        const existingRows = current[member._id]
        next[member._id] = existingRows && existingRows.length > 0 ? existingRows : [{ id: generateRowId(), taskId: '', taskTitle: '' }]
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
  }

  const handleSaveTaskAssignment = (memberId: string, rowId: string, patch: Partial<TaskRow>) => {
    setTaskAssignments((current) => ({
      ...current,
      [memberId]: (current[memberId] || [{ id: generateRowId(), taskId: '', taskTitle: '' }]).map((row) => 
        row.id === rowId ? { ...row, ...patch } : row
      )
    }))
  }

  const handleAddTaskRow = (memberId: string) => {
    setTaskAssignments((current) => ({
      ...current,
      [memberId]: [...(current[memberId] || [{ id: generateRowId(), taskId: '', taskTitle: '' }]), { id: generateRowId(), taskId: '', taskTitle: '' }]
    }))
  }

  const handleRemoveTaskRow = (memberId: string, rowId: string) => {
    setTaskAssignments((current) => {
      const rows = current[memberId] || []
      const nextRows = rows.filter((row) => row.id !== rowId)
      return {
        ...current,
        [memberId]: nextRows.length > 0 ? nextRows : [{ id: generateRowId(), taskId: '', taskTitle: '' }]
      }
    })
  }

  const handleSubmit = async () => {
    if (!selectedDate) {
      notifyError({ title: 'Choose a date before saving.' })
      return
    }

    if (!formState.title.trim()) {
      notifyError({ title: 'Meeting title cannot be empty.' })
      return
    }

    setSubmitting(true)
    try {
      const assignmentsPayload = selectedMembers.flatMap((member) => {
        const rows = taskAssignments[member._id] || []
        return rows
          .map((row) => {
            const task = projectTasks.find((item) => item._id === row.taskId)
            if (!task) return null
            return {
              member: member._id,
              memberId: member._id,
              task: task._id,
              taskId: task._id,
              taskTitle: task.title,
              taskStatus: task.status,
              durationMinutes: Number(formState.durationMinutes)
            }
          })
          .filter(Boolean)
      }).filter(Boolean)

      await updateStandupSchedule(projectId, detail.meeting._id, {
        title: formState.title,
        scheduledDate: selectedDate.toISOString(),
        time: formState.time,
        durationMinutes: Number(formState.durationMinutes),
        status: formState.status,
        actualDate: formState.status === 'completed' || formState.status === 'missed' ? (detail.meeting.actualDate || selectedDate.toISOString()) : null,
        participants: formState.attendeeIds,
        notes: formState.notes,
        assignments: assignmentsPayload
      })

      // Fully reload schedule detail
      const { fetchStandupScheduleDetail } = await import('./standup-dashboard-service')
      if (!organizationId) {
        throw new Error('Missing organization id')
      }
      const updatedDetail = await fetchStandupScheduleDetail(projectId, detail.meeting._id, organizationId)

      notifySuccess({ title: 'Standup updated', message: 'The standup schedule was saved successfully.' })
      onSuccess(updatedDetail)
      onOpenChange(false)
    } catch (error) {
      console.error(error)
      notifyError({ title: 'Unable to update standup schedule' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle>Edit Standup Details</DialogTitle>
              <DialogDescription>
                Modify schedule configurations, update participants, or change task assignments.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <DialogBody className="space-y-6 pt-2">
          {/* General Meeting Info */}
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="edit-title">Meeting Title</Label>
              <Input
                id="edit-title"
                value={formState.title}
                onChange={(event) => setFormState((current) => ({ ...current, title: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Meeting Date</Label>
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
            <div className="space-y-2">
              <Label htmlFor="edit-status">Status</Label>
              <Select
                value={formState.status}
                onValueChange={(value: any) => setFormState((current) => ({ ...current, status: value }))}
              >
                <SelectTrigger id="edit-status">
                  <SelectValue placeholder="Choose status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="scheduled">Scheduled</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="missed">Missed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="edit-time">Start Time</Label>
              <Input
                id="edit-time"
                type="time"
                value={formState.time}
                onChange={(event) => setFormState((current) => ({ ...current, time: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-duration">Duration (minutes)</Label>
              <Input
                id="edit-duration"
                type="number"
                min={5}
                step={5}
                value={formState.durationMinutes}
                onChange={(event) => setFormState((current) => ({ ...current, durationMinutes: event.target.value }))}
              />
            </div>
          </div>

          {/* Attendees Selection */}
          <div className="space-y-2">
            <Label>Participants / Attendees</Label>
            <div className="flex flex-wrap gap-2 pt-1">
              {projectMembers.map((member: StandupMember) => {
                const checked = formState.attendeeIds.includes(member._id)
                return (
                  <button
                    key={member._id}
                    type="button"
                    onClick={() => handleToggleAttendee(member._id)}
                    className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors ${
                      checked
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border bg-background text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    <Checkbox checked={checked} aria-label={member.firstName} />
                    <span>{member.firstName} {member.lastName}</span>
                  </button>
                )
              })}
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Badge variant="outline">{selectedCount} selected</Badge>
              <span>Toggle attendees participating in today's standup.</span>
            </div>
          </div>

          {/* Task Assignments */}
          <div className="space-y-4">
            <div>
              <Label className="text-sm font-semibold">Attendee Task Assignments</Label>
              <p className="text-sm text-muted-foreground">
                Assign tasks to each participant for minimal visual clarity during today's standup.
              </p>
            </div>

            <div className="grid gap-4">
              {selectedMembers.length > 0 ? (
                selectedMembers.map((member) => {
                  const rows = taskAssignments[member._id] || [{ id: generateRowId(), taskId: '', taskTitle: '' }]

                  return (
                    <div key={member._id} className="space-y-3 rounded-xl border border-border/80 bg-muted/10 p-4">
                      <div className="flex items-center justify-between border-b pb-2">
                        <div>
                          <p className="font-semibold text-sm text-foreground">{member.firstName} {member.lastName}</p>
                          <p className="text-sm text-muted-foreground">{member.role}</p>
                        </div>
                        <Badge variant="outline">{rows.length} Task{rows.length === 1 ? '' : 's'}</Badge>
                      </div>

                      <div className="space-y-2.5">
                        {rows.map((row, index) => {
                          const selectedTask = projectTasks.find((task) => task._id === row.taskId)

                          return (
                            <div
                              key={row.id}
                              className="flex items-center gap-3 p-3 rounded-lg border border-border bg-background shadow-xs hover:border-border-hover transition-all"
                            >
                              <div className="flex-1 flex flex-col sm:flex-row sm:items-center justify-between gap-3 min-w-0">
                                <div className="flex-1 min-w-0">
                                  <Select
                                    value={row.taskId}
                                    onValueChange={(value) => handleSaveTaskAssignment(member._id, row.id, { taskId: value })}
                                  >
                                    <SelectTrigger className="w-full max-w-full min-w-0 overflow-hidden border-none shadow-none font-medium h-fit p-0 hover:bg-transparent">
                                      <SelectValue placeholder="Select an assigned task..." />
                                    </SelectTrigger>
                                    <SelectContent className="w-[var(--radix-select-trigger-width)] max-w-[min(95vw,28rem)]">
                                      {projectTasks.map((task) => {
                                        const taskLabel = `${task.displayId ? `${task.displayId} · ` : ''}${task.title}`
                                        const { truncated: truncatedTaskLabel } = truncateText(taskLabel, 48)

                                        return (
                                          <SelectItem key={task._id} value={task._id} className="max-w-full">
                                            <span className="flex max-w-full items-center gap-2 text-sm text-foreground font-medium">
                                              <span className="truncate" title={taskLabel}>{truncatedTaskLabel}</span>
                                              {task.status && (
                                                <span className="text-sm text-muted-foreground capitalize bg-muted px-1.5 py-0.5 rounded shrink-0">
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
                                  <Badge variant="outline" className="text-sm shrink-0 capitalize">
                                    {formatToTitleCase(selectedTask.status)}
                                  </Badge>
                                )}
                              </div>

                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleRemoveTaskRow(member._id, row.id)}
                                className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive shrink-0"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          )
                        })}
                      </div>

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleAddTaskRow(member._id)}
                        className="w-full sm:w-fit py-1.5 h-auto text-sm flex items-center justify-center gap-1.5 mt-2"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Add Task Card
                      </Button>
                    </div>
                  )
                })
              ) : (
                <div className="border border-dashed rounded-lg p-6 text-center text-sm text-muted-foreground bg-muted/10">
                  Choose at least one standup attendee above to configure task assignments.
                </div>
              )}
            </div>
          </div>

          {/* Meeting Notes */}
          <div className="space-y-2">
            <Label htmlFor="edit-notes">Meeting Notes / Agenda Items</Label>
            <Textarea
              id="edit-notes"
              rows={4}
              value={formState.notes}
              onChange={(event) => setFormState((current) => ({ ...current, notes: event.target.value }))}
              placeholder="Add details, blockers to highlight, or key announcements..."
            />
          </div>
        </DialogBody>

        <DialogFooter className="border-t pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting} className="min-w-28">
            {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
