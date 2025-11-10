'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogBody } from '@/components/ui/Dialog'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/Popover'
import { CalendarIcon } from 'lucide-react'
import { format } from 'date-fns'

interface SprintEvent {
  _id: string
  eventType: string
  title: string
  description?: string
  scheduledDate: string
  actualDate?: string
  duration: number
  status: string
  facilitator: {
    firstName: string
    lastName: string
    email: string
  }
  attendees: Array<{
    firstName: string
    lastName: string
    email: string
  }>
  outcomes?: {
    decisions: string[]
    actionItems: Array<{
      description: string
      assignedTo: string
      dueDate: string
      status: string
    }>
    notes: string
    velocity?: number
    capacity?: number
  }
  location?: string
  meetingLink?: string
  sprint: {
    _id: string
    name: string
    status: string
  }
  project: {
    _id: string
    name: string
  }
}

interface User {
  _id: string
  firstName: string
  lastName: string
  email: string
}

interface EditSprintEventModalProps {
  event: SprintEvent
  onClose: () => void
  onSuccess: () => void
}

export function EditSprintEventModal({ event, onClose, onSuccess }: EditSprintEventModalProps) {
  const [loading, setLoading] = useState(false)
  const [users, setUsers] = useState<User[]>([])
  const [selectedDate, setSelectedDate] = useState<Date>(new Date(event.scheduledDate))
  const [actualDate, setActualDate] = useState<Date | undefined>(
    event.actualDate ? new Date(event.actualDate) : undefined
  )
  const [formData, setFormData] = useState({
    title: event.title,
    description: event.description || '',
    duration: event.duration,
    status: event.status,
    attendees: event.attendees.map(a => (a as any)._id),
    location: event.location || '',
    meetingLink: event.meetingLink || '',
    outcomes: event.outcomes || {
      decisions: [],
      actionItems: [],
      notes: '',
      velocity: undefined,
      capacity: undefined
    }
  })

  useEffect(() => {
    fetchUsers()
  }, [])

  const fetchUsers = async () => {
    try {
      const response = await fetch(`/api/members?projectId=${event.project._id}`)
      if (response.ok) {
        const data = await response.json()
        setUsers(data.members || [])
      }
    } catch (error) {
      console.error('Error fetching users:', error)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.title || !selectedDate) {
      return
    }

    try {
      setLoading(true)
      const response = await fetch(`/api/sprint-events/${event._id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: formData.title,
          description: formData.description || undefined,
          scheduledDate: selectedDate.toISOString(),
          actualDate: actualDate?.toISOString(),
          duration: formData.duration,
          attendees: formData.attendees,
          status: formData.status,
          outcomes: formData.outcomes,
          location: formData.location || undefined,
          meetingLink: formData.meetingLink || undefined
        })
      })

      if (response.ok) {
        onSuccess()
      } else {
        const error = await response.json()
        console.error('Error updating sprint event:', error)
      }
    } catch (error) {
      console.error('Error updating sprint event:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleInputChange = (field: string, value: string | number) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }))
  }

  const handleOutcomeChange = (field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      outcomes: {
        ...prev.outcomes,
        [field]: value
      }
    }))
  }

  const handleAttendeeToggle = (userId: string) => {
    setFormData(prev => ({
      ...prev,
      attendees: prev.attendees.includes(userId)
        ? prev.attendees.filter(id => id !== userId)
        : [...prev.attendees, userId]
    }))
  }

  const addDecision = () => {
    setFormData(prev => ({
      ...prev,
      outcomes: {
        ...prev.outcomes,
        decisions: [...prev.outcomes.decisions, '']
      }
    }))
  }

  const updateDecision = (index: number, value: string) => {
    setFormData(prev => ({
      ...prev,
      outcomes: {
        ...prev.outcomes,
        decisions: prev.outcomes.decisions.map((d, i) => i === index ? value : d)
      }
    }))
  }

  const removeDecision = (index: number) => {
    setFormData(prev => ({
      ...prev,
      outcomes: {
        ...prev.outcomes,
        decisions: prev.outcomes.decisions.filter((_, i) => i !== index)
      }
    }))
  }

  const addActionItem = () => {
    setFormData(prev => ({
      ...prev,
      outcomes: {
        ...prev.outcomes,
        actionItems: [...prev.outcomes.actionItems, {
          description: '',
          assignedTo: '',
          dueDate: new Date().toISOString().split('T')[0],
          status: 'pending'
        }]
      }
    }))
  }

  const updateActionItem = (index: number, field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      outcomes: {
        ...prev.outcomes,
        actionItems: prev.outcomes.actionItems.map((item, i) => 
          i === index ? { ...item, [field]: value } : item
        )
      }
    }))
  }

  const removeActionItem = (index: number) => {
    setFormData(prev => ({
      ...prev,
      outcomes: {
        ...prev.outcomes,
        actionItems: prev.outcomes.actionItems.filter((_, i) => i !== index)
      }
    }))
  }

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Edit Sprint Event</DialogTitle>
          <DialogDescription>
            Update event details and outcomes
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          <form onSubmit={handleSubmit} className="space-y-4" id="edit-sprint-event-form">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="title">Event Title *</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => handleInputChange('title', e.target.value)}
                placeholder="Enter event title"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select value={formData.status} onValueChange={(value) => handleInputChange('status', value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="scheduled">Scheduled</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => handleInputChange('description', e.target.value)}
              placeholder="Describe the event..."
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="scheduledDate">Scheduled Date *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start text-left font-normal">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {selectedDate ? format(selectedDate, 'PPP') : 'Pick a date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={(date) => date && setSelectedDate(date)}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <Label htmlFor="actualDate">Actual Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start text-left font-normal">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {actualDate ? format(actualDate, 'PPP') : 'Pick a date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={actualDate}
                    onSelect={setActualDate}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="duration">Duration (minutes)</Label>
              <Input
                id="duration"
                type="number"
                min="15"
                max="480"
                value={formData.duration}
                onChange={(e) => handleInputChange('duration', parseInt(e.target.value))}
                placeholder="60"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="location">Location</Label>
              <Input
                id="location"
                value={formData.location}
                onChange={(e) => handleInputChange('location', e.target.value)}
                placeholder="Meeting room, office, etc."
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="meetingLink">Meeting Link</Label>
            <Input
              id="meetingLink"
              value={formData.meetingLink}
              onChange={(e) => handleInputChange('meetingLink', e.target.value)}
              placeholder="Zoom, Teams, Google Meet link"
            />
          </div>

          <div className="space-y-2">
            <Label>Attendees</Label>
            <div className="max-h-32 overflow-y-auto border rounded-md p-2 space-y-1">
              {users.map((user) => (
                <label key={user._id} className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={formData.attendees.includes(user._id)}
                    onChange={() => handleAttendeeToggle(user._id)}
                    className="rounded"
                  />
                  <span className="text-sm">
                    {user.firstName} {user.lastName} ({user.email})
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Event Outcomes */}
          <div className="space-y-4 border-t pt-4">
            <h3 className="text-lg font-medium">Event Outcomes</h3>
            
            <div className="space-y-2">
              <Label>Decisions Made</Label>
              {formData.outcomes.decisions.map((decision, index) => (
                <div key={index} className="flex space-x-2">
                  <Input
                    value={decision}
                    onChange={(e) => updateDecision(index, e.target.value)}
                    placeholder="Enter decision..."
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => removeDecision(index)}
                  >
                    Remove
                  </Button>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={addDecision}>
                Add Decision
              </Button>
            </div>

            <div className="space-y-2">
              <Label>Action Items</Label>
              {formData.outcomes.actionItems.map((item, index) => (
                <div key={index} className="border rounded p-3 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      value={item.description}
                      onChange={(e) => updateActionItem(index, 'description', e.target.value)}
                      placeholder="Action item description..."
                    />
                    <Select value={item.assignedTo} onValueChange={(value) => updateActionItem(index, 'assignedTo', value)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Assign to..." />
                      </SelectTrigger>
                      <SelectContent>
                        {users.map((user) => (
                          <SelectItem key={user._id} value={user._id}>
                            {user.firstName} {user.lastName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      type="date"
                      value={item.dueDate}
                      onChange={(e) => updateActionItem(index, 'dueDate', e.target.value)}
                    />
                    <Select value={item.status} onValueChange={(value) => updateActionItem(index, 'status', value)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="in_progress">In Progress</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => removeActionItem(index)}
                  >
                    Remove Action Item
                  </Button>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={addActionItem}>
                Add Action Item
              </Button>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={formData.outcomes.notes}
                onChange={(e) => handleOutcomeChange('notes', e.target.value)}
                placeholder="Additional notes from the event..."
                rows={3}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="velocity">Velocity (points)</Label>
                <Input
                  id="velocity"
                  type="number"
                  value={formData.outcomes.velocity || ''}
                  onChange={(e) => handleOutcomeChange('velocity', e.target.value ? parseInt(e.target.value) : undefined)}
                  placeholder="0"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="capacity">Capacity (hours)</Label>
                <Input
                  id="capacity"
                  type="number"
                  value={formData.outcomes.capacity || ''}
                  onChange={(e) => handleOutcomeChange('capacity', e.target.value ? parseInt(e.target.value) : undefined)}
                  placeholder="0"
                />
              </div>
            </div>
          </div>

          </form>
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="edit-sprint-event-form" disabled={loading}>
            {loading ? 'Updating...' : 'Update Event'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
