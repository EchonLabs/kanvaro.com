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

interface Sprint {
  _id: string
  name: string
  status: string
}

interface User {
  _id: string
  firstName: string
  lastName: string
  email: string
}

interface AddSprintEventModalProps {
  projectId: string
  onClose: () => void
  onSuccess: () => void
}

export function AddSprintEventModal({ projectId, onClose, onSuccess }: AddSprintEventModalProps) {
  const [loading, setLoading] = useState(false)
  const [sprints, setSprints] = useState<Sprint[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [selectedDate, setSelectedDate] = useState<Date>()
  const [formData, setFormData] = useState({
    sprintId: '',
    eventType: '',
    title: '',
    description: '',
    duration: 60,
    attendees: [] as string[],
    location: '',
    meetingLink: ''
  })

  useEffect(() => {
    fetchSprints()
    fetchUsers()
  }, [projectId])

  const fetchSprints = async () => {
    try {
      const response = await fetch(`/api/sprints?projectId=${projectId}`)
      if (response.ok) {
        const data = await response.json()
        setSprints(data.sprints || [])
      }
    } catch (error) {
      console.error('Error fetching sprints:', error)
    }
  }

  const fetchUsers = async () => {
    try {
      const response = await fetch(`/api/members?projectId=${projectId}`)
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
    
    if (!formData.sprintId || !formData.eventType || !formData.title || !selectedDate) {
      return
    }

    try {
      setLoading(true)
      const response = await fetch('/api/sprint-events', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sprintId: formData.sprintId,
          projectId,
          eventType: formData.eventType,
          title: formData.title,
          description: formData.description || undefined,
          scheduledDate: selectedDate.toISOString(),
          duration: formData.duration,
          attendees: formData.attendees,
          location: formData.location || undefined,
          meetingLink: formData.meetingLink || undefined
        })
      })

      if (response.ok) {
        onSuccess()
      } else {
        const error = await response.json()
        console.error('Error creating sprint event:', error)
      }
    } catch (error) {
      console.error('Error creating sprint event:', error)
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

  const handleAttendeeToggle = (userId: string) => {
    setFormData(prev => ({
      ...prev,
      attendees: prev.attendees.includes(userId)
        ? prev.attendees.filter(id => id !== userId)
        : [...prev.attendees, userId]
    }))
  }

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Create Sprint Event</DialogTitle>
          <DialogDescription>
            Schedule a new agile event or ceremony
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          <form onSubmit={handleSubmit} className="space-y-4" id="create-sprint-event-form">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="sprintId">Sprint *</Label>
              <Select value={formData.sprintId} onValueChange={(value) => handleInputChange('sprintId', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select sprint" />
                </SelectTrigger>
                <SelectContent>
                  {sprints.map((sprint) => (
                    <SelectItem key={sprint._id} value={sprint._id}>
                      {sprint.name} ({sprint.status})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="eventType">Event Type *</Label>
              <Select value={formData.eventType} onValueChange={(value) => handleInputChange('eventType', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select event type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="planning">Sprint Planning</SelectItem>
                  <SelectItem value="review">Sprint Review</SelectItem>
                  <SelectItem value="retrospective">Sprint Retrospective</SelectItem>
                  <SelectItem value="daily_standup">Daily Standup</SelectItem>
                  <SelectItem value="demo">Demo</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

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
                    onSelect={setSelectedDate}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
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

          <div className="space-y-2">
            <Label htmlFor="location">Location</Label>
            <Input
              id="location"
              value={formData.location}
              onChange={(e) => handleInputChange('location', e.target.value)}
              placeholder="Meeting room, office, etc."
            />
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

          </form>
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="create-sprint-event-form" disabled={loading}>
            {loading ? 'Creating...' : 'Create Event'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
