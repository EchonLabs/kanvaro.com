'use client'

import { useMemo, useState } from 'react'
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
import { CalendarIcon, Loader2 } from 'lucide-react'
import { StandupMember } from './standup-dashboard-types'
import { useNotify } from '@/lib/notify'

interface StandupScheduleDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  members: StandupMember[]
  onSubmit?: (payload: {
    title: string
    scheduledDate: string
    time: string
    durationMinutes: number
    notes: string
    participants: string[]
  }) => Promise<void> | void
}

export function StandupScheduleDialog({ open, onOpenChange, members, onSubmit }: StandupScheduleDialogProps) {
  const [submitting, setSubmitting] = useState(false)
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date())
  const [formState, setFormState] = useState({
    title: 'Daily Standup',
    time: '09:00',
    durationMinutes: '15',
    notes: '',
    attendeeIds: members.slice(0, 4).map((member) => member._id)
  })
  const { success: notifySuccess, error: notifyError } = useNotify()

  const selectedCount = useMemo(() => formState.attendeeIds.length, [formState.attendeeIds])

  const handleToggleAttendee = (memberId: string) => {
    setFormState((current) => ({
      ...current,
      attendeeIds: current.attendeeIds.includes(memberId)
        ? current.attendeeIds.filter((id) => id !== memberId)
        : [...current.attendeeIds, memberId]
    }))
  }

  const handleSubmit = async () => {
    if (!selectedDate) {
      notifyError({ title: 'Choose a standup date before saving.' })
      return
    }

    setSubmitting(true)
    try {
      const payload = {
        title: formState.title,
        scheduledDate: selectedDate.toISOString(),
        time: formState.time,
        durationMinutes: Number(formState.durationMinutes),
        notes: formState.notes,
        participants: formState.attendeeIds
      }

      if (onSubmit) {
        await onSubmit(payload)
      }

      notifySuccess({ title: 'Standup schedule created', message: `${formState.title} scheduled for ${format(selectedDate, 'PPP')}` })
      onOpenChange(false)
    } catch (error) {
      notifyError({ title: 'Unable to create schedule' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create Standup Schedule</DialogTitle>
          <DialogDescription>
            Set up a recurring standup session for the selected project team.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-5">
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
              {members.map((member) => {
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

          <div className="space-y-2">
            <Label htmlFor="standup-notes">Notes</Label>
            <Textarea id="standup-notes" rows={4} value={formState.notes} onChange={(event) => setFormState((current) => ({ ...current, notes: event.target.value }))} placeholder="Add prep notes, blockers to review, or agenda items." />
          </div>
        </DialogBody>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className="rounded-full px-5 h-9 text-[13.5px] font-medium border-0 text-[var(--apple-secondary-label)] hover:text-[var(--apple-label)] hover:bg-[var(--apple-tertiary-fill)] apple-transition"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting}
            className="rounded-full px-5 h-9 text-[13.5px] font-medium text-white border-0 apple-transition"
            style={{ background: 'var(--apple-system-blue)', boxShadow: '0 2px 10px rgba(0,122,255,0.28)' }}
          >
            {submitting ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Scheduling…</>
            ) : (
              'Create Schedule'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}