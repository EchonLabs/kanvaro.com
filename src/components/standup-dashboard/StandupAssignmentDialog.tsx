'use client'

import { useState } from 'react'
import { format } from 'date-fns'
import { Button } from '@/components/ui/Button'
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/Dialog'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/Popover'
import { CalendarIcon, Loader2 } from 'lucide-react'
import { StandupAssignmentPayload, StandupMember, StandupPriority } from './standup-dashboard-types'
import { useNotify } from '@/lib/notify'

interface StandupAssignmentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  members: StandupMember[]
  onSubmit?: (payload: StandupAssignmentPayload) => Promise<void> | void
}

export function StandupAssignmentDialog({ open, onOpenChange, members, onSubmit }: StandupAssignmentDialogProps) {
  const [submitting, setSubmitting] = useState(false)
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date())
  const [formState, setFormState] = useState<StandupAssignmentPayload>({
    memberId: members[0]?._id ?? '',
    taskTitle: '',
    priority: 'medium',
    dueDate: new Date().toISOString(),
    notes: ''
  })
  const { success: notifySuccess, error: notifyError } = useNotify()

  const handleSubmit = async () => {
    if (!formState.memberId || !formState.taskTitle.trim()) {
      notifyError({ title: 'Select a team member and provide a task title.' })
      return
    }

    const dueDate = selectedDate ? selectedDate.toISOString() : formState.dueDate
    const payload = { ...formState, dueDate }

    setSubmitting(true)
    try {
      if (onSubmit) {
        await onSubmit(payload)
      }
      notifySuccess({ title: 'Task assigned', message: 'Standup assignment saved successfully.' })
      onOpenChange(false)
    } catch (error) {
      notifyError({ title: 'Unable to save assignment' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Assign Standup Task</DialogTitle>
          <DialogDescription>
            Capture follow-up work directly from the standup dashboard.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Team member</Label>
              <Select value={formState.memberId} onValueChange={(value) => setFormState((current) => ({ ...current, memberId: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a member" />
                </SelectTrigger>
                <SelectContent>
                  {members.map((member) => (
                    <SelectItem key={member._id} value={member._id}>
                      {member.firstName} {member.lastName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Priority</Label>
              <Select value={formState.priority} onValueChange={(value) => setFormState((current) => ({ ...current, priority: value as StandupPriority }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Priority" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="assignment-title">Task</Label>
            <Input id="assignment-title" value={formState.taskTitle} onChange={(event) => setFormState((current) => ({ ...current, taskTitle: event.target.value }))} placeholder="e.g. Close blocker on permission mapping" />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Due date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start text-left font-normal">
                    <CalendarIcon className="mr-2 h-4 w-4" strokeWidth={1.5} />
                    {selectedDate ? format(selectedDate, 'PPP') : 'Pick a due date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar mode="single" selected={selectedDate} onSelect={setSelectedDate} initialFocus />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <Label htmlFor="assignment-notes">Notes</Label>
              <Textarea id="assignment-notes" rows={3} value={formState.notes} onChange={(event) => setFormState((current) => ({ ...current, notes: event.target.value }))} placeholder="Context, blockers, dependencies, or acceptance notes." />
            </div>
          </div>
        </DialogBody>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" strokeWidth={1.5} /> : null}
            Save Assignment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}