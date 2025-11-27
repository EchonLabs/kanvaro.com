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
import { FileUploader } from '@/components/ui/FileUploader'
import { CalendarIcon, X, Link as LinkIcon, AlertCircle } from 'lucide-react'
import { format } from 'date-fns'
import { Checkbox } from '@/components/ui/Checkbox'
import { Alert, AlertDescription } from '@/components/ui/alert'

interface Sprint {
  _id: string
  name: string
  status: string
  project: string
}

interface User {
  _id: string
  firstName: string
  lastName: string
  email: string
}

interface Project {
  _id: string
  name: string
}

interface Attachment {
  name: string
  url: string
  size: number
  type: string
}

interface AddSprintEventModalProps {
  projectId?: string
  onClose: () => void
  onSuccess: () => void
}

export function AddSprintEventModal({ projectId, onClose, onSuccess }: AddSprintEventModalProps) {
  const [loading, setLoading] = useState(false)
  const [projects, setProjects] = useState<Project[]>([])
  const [sprints, setSprints] = useState<Sprint[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [selectedDate, setSelectedDate] = useState<Date>()
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [linkUrl, setLinkUrl] = useState('')
  
  // Search queries for dropdowns
  const [projectQuery, setProjectQuery] = useState('')
  const [sprintQuery, setSprintQuery] = useState('')
  const [eventTypeQuery, setEventTypeQuery] = useState('')
  const [statusQuery, setStatusQuery] = useState('')
  const [attendeeQuery, setAttendeeQuery] = useState('')
  
  const [timeError, setTimeError] = useState('')
  
  const [formData, setFormData] = useState({
    projectId: projectId || '',
    sprintId: '',
    eventType: '',
    title: '',
    description: '',
    startTime: '',
    endTime: '',
    status: 'scheduled',
    duration: 60,
    attendees: [] as string[],
    location: '',
    meetingLink: '',
    notificationSettings: {
      enabled: false,
      reminderTime: 'none' as 'none' | '10mins' | '30mins' | '1hour' | '24hours'
    }
  })

  // Event types for filtering
  const eventTypes = [
    { value: 'planning', label: 'Planning' },
    { value: 'review', label: 'Review' },
    { value: 'retrospective', label: 'Retrospective' },
    { value: 'daily_standup', label: 'Daily Standup' },
    { value: 'demo', label: 'Demo' },
    { value: 'other', label: 'Other' }
  ]

  // Status options for filtering
  const statusOptions = [
    { value: 'scheduled', label: 'Scheduled' },
    { value: 'in_progress', label: 'In Progress' },
    { value: 'completed', label: 'Completed' },
    { value: 'cancelled', label: 'Cancelled' }
  ]

  useEffect(() => {
    // Always fetch users (all organization members)
    fetchUsers()
    
    if (projectId) {
      fetchSprints()
    } else {
      fetchProjects()
    }
  }, [projectId])

  useEffect(() => {
    if (formData.projectId && !projectId) {
      // Reset sprint selection when project changes
      setFormData(prev => ({
        ...prev,
        sprintId: ''
      }))
      fetchSprints()
      // Users are already fetched on mount, no need to fetch again
    }
  }, [formData.projectId])

  useEffect(() => {
    if (formData.projectId && !projectId) {
      fetchSprints()
      // Users are already fetched on mount, no need to fetch again
    }
  }, [formData.projectId])

  // Validate end time is after start time
  useEffect(() => {
    if (formData.startTime && formData.endTime) {
      const [startHours, startMinutes] = formData.startTime.split(':').map(Number)
      const [endHours, endMinutes] = formData.endTime.split(':').map(Number)
      const start = startHours * 60 + startMinutes
      const end = endHours * 60 + endMinutes
      
      if (end <= start) {
        setTimeError('End time must be greater than start time')
      } else {
        setTimeError('')
      }
    } else {
      setTimeError('')
    }
  }, [formData.startTime, formData.endTime])

  const fetchProjects = async () => {
    try {
      const response = await fetch('/api/projects')
      if (response.ok) {
        const data = await response.json()
        // API returns { success: true, data: [...], pagination: {...} }
        setProjects(data.data || data.projects || [])
      }
    } catch (error) {
      console.error('Error fetching projects:', error)
    }
  }

  const fetchSprints = async () => {
    try {
      const projId = projectId || formData.projectId
      if (!projId) {
        setSprints([])
        return
      }
      // API uses 'project' parameter, not 'projectId'
      const response = await fetch(`/api/sprints?project=${projId}&limit=100`)
      if (response.ok) {
        const data = await response.json()
        // API returns { success: true, data: [...] } or { sprints: [...] }
        const allSprints = data.data || data.sprints || []
        // Only show planning and active sprints
        const filteredSprints = allSprints.filter((sprint: Sprint) => 
          sprint.status === 'planning' || sprint.status === 'active'
        )
        setSprints(filteredSprints)
      } else {
        console.error('Failed to fetch sprints:', response.status)
        setSprints([])
      }
    } catch (error) {
      console.error('Error fetching sprints:', error)
      setSprints([])
    }
  }

  const fetchUsers = async () => {
    try {
      // Fetch all organization members, not just project members
      const response = await fetch('/api/members?limit=1000')
      if (response.ok) {
        const data = await response.json()
        // API returns { success: true, data: { members: [...] } }
        const members = data.data?.members || data.members || []
        // Ensure it's always an array
        setUsers(Array.isArray(members) ? members : [])
      } else {
        // Fallback to /api/users if /api/members fails
        const fallbackResponse = await fetch('/api/users')
        if (fallbackResponse.ok) {
          const usersData = await fallbackResponse.json()
          setUsers(Array.isArray(usersData) ? usersData : [])
        } else {
          setUsers([])
        }
      }
    } catch (error) {
      console.error('Error fetching users:', error)
      // Try fallback API
      try {
        const fallbackResponse = await fetch('/api/users')
        if (fallbackResponse.ok) {
          const usersData = await fallbackResponse.json()
          setUsers(Array.isArray(usersData) ? usersData : [])
        } else {
          setUsers([])
        }
      } catch (fallbackError) {
        console.error('Error fetching users from fallback API:', fallbackError)
        setUsers([]) // Set empty array on error
      }
    }
  }

  const handleFileUpload = async (file: File) => {
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('type', 'attachments')

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      })

      if (response.ok) {
        const data = await response.json()
        setAttachments(prev => [...prev, {
          name: file.name,
          url: data.url,
          size: file.size,
          type: file.type
        }])
      }
    } catch (error) {
      console.error('Error uploading file:', error)
    }
  }

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index))
  }

  const addLink = () => {
    if (linkUrl.trim()) {
      setAttachments(prev => [...prev, {
        name: linkUrl,
        url: linkUrl,
        size: 0,
        type: 'link'
      }])
      setLinkUrl('')
    }
  }

  const calculateDuration = () => {
    if (formData.startTime && formData.endTime && !timeError) {
      const [startHours, startMinutes] = formData.startTime.split(':').map(Number)
      const [endHours, endMinutes] = formData.endTime.split(':').map(Number)
      const start = startHours * 60 + startMinutes
      const end = endHours * 60 + endMinutes
      const duration = end - start
      if (duration > 0) {
        setFormData(prev => ({ ...prev, duration }))
      }
    }
  }

  useEffect(() => {
    calculateDuration()
  }, [formData.startTime, formData.endTime, timeError])

  // Check if form is valid
  const isFormValid = () => {
    const projId = projectId || formData.projectId
    const hasRequiredFields = 
      projId &&
      formData.sprintId &&
      formData.eventType &&
      formData.title &&
      selectedDate
    
    const hasValidTime = !formData.startTime || !formData.endTime || !timeError
    
    return hasRequiredFields && hasValidTime
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!isFormValid()) {
      return
    }

    const projId = projectId || formData.projectId
    if (!formData.sprintId || !formData.eventType || !formData.title || !selectedDate || !projId) {
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
          projectId: projId,
          eventType: formData.eventType,
          title: formData.title,
          description: formData.description || undefined,
          scheduledDate: selectedDate.toISOString(),
          startTime: formData.startTime || undefined,
          endTime: formData.endTime || undefined,
          duration: formData.duration,
          status: formData.status,
          attendees: formData.attendees,
          location: formData.location || undefined,
          meetingLink: formData.meetingLink || undefined,
          attachments: attachments.length > 0 ? attachments : undefined,
          notificationSettings: formData.notificationSettings.enabled ? formData.notificationSettings : undefined
        })
      })

      if (response.ok) {
        onSuccess()
      } else {
        const error = await response.json()
        console.error('Error creating sprint event:', error)
        alert(error.error || 'Failed to create event')
      }
    } catch (error) {
      console.error('Error creating sprint event:', error)
      alert('Failed to create event')
    } finally {
      setLoading(false)
    }
  }

  const handleInputChange = (field: string, value: string | number | any) => {
    if (field.includes('.')) {
      const [parent, child] = field.split('.')
      setFormData(prev => {
        const parentValue = prev[parent as keyof typeof prev] as any
        return {
          ...prev,
          [parent]: {
            ...(parentValue || {}),
            [child]: value
          }
        }
      })
    } else {
      setFormData(prev => ({
        ...prev,
        [field]: value
      }))
    }
    
    // Reset sprint and attendees when project changes
    if (field === 'projectId' && value) {
      setFormData(prev => ({
        ...prev,
        sprintId: '',
        attendees: []
      }))
      setSprints([])
      setUsers([])
    }
  }

  const handleAttendeeToggle = (userId: string) => {
    setFormData(prev => ({
      ...prev,
      attendees: prev.attendees.includes(userId)
        ? prev.attendees.filter(id => id !== userId)
        : [...prev.attendees, userId]
    }))
  }

  // Filter functions
  const filteredProjects = projects.filter(p => 
    !projectQuery.trim() || p.name.toLowerCase().includes(projectQuery.toLowerCase())
  )
  
  const filteredSprints = sprints.filter(s => 
    !sprintQuery.trim() || s.name.toLowerCase().includes(sprintQuery.toLowerCase())
  )
  
  const filteredEventTypes = eventTypes.filter(et => 
    !eventTypeQuery.trim() || et.label.toLowerCase().includes(eventTypeQuery.toLowerCase())
  )
  
  const filteredStatusOptions = statusOptions.filter(so => 
    !statusQuery.trim() || so.label.toLowerCase().includes(statusQuery.toLowerCase())
  )
  
  const filteredUsers = Array.isArray(users) ? users.filter((u: User) => {
    if (!attendeeQuery.trim()) return true
    const fullName = `${u.firstName} ${u.lastName}`.toLowerCase()
    const query = attendeeQuery.toLowerCase()
    return fullName.includes(query) || u.email.toLowerCase().includes(query)
  }) : []

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Sprint Event</DialogTitle>
          <DialogDescription>
            Schedule a new agile event or ceremony
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          <form onSubmit={handleSubmit} className="space-y-6" id="create-sprint-event-form">
            {/* (1) Basic Details */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold">Basic Details</h3>
              {!projectId && (
                <div className="space-y-2">
                  <Label htmlFor="projectId">Project *</Label>
                  <Select 
                    value={formData.projectId} 
                    onValueChange={(value) => handleInputChange('projectId', value)}
                    onOpenChange={(open) => { if (open) setProjectQuery('') }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select project" />
                    </SelectTrigger>
                    <SelectContent className="z-[10050] p-0">
                      <div className="p-2">
                        <Input
                          value={projectQuery}
                          onChange={(e) => setProjectQuery(e.target.value)}
                          placeholder="Type to search projects"
                          className="mb-2"
                          onKeyDown={(e) => e.stopPropagation()}
                        />
                        <div className="max-h-56 overflow-y-auto">
                          {filteredProjects.map((project) => (
                            <SelectItem key={project._id} value={project._id}>
                              {project.name}
                            </SelectItem>
                          ))}
                          {filteredProjects.length === 0 && (
                            <div className="px-2 py-1 text-sm text-muted-foreground">No matching projects</div>
                          )}
                        </div>
                      </div>
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="sprintId">Sprint *</Label>
                  <Select 
                    value={formData.sprintId} 
                    onValueChange={(value) => handleInputChange('sprintId', value)}
                    disabled={!formData.projectId && !projectId}
                    onOpenChange={(open) => { if (open) setSprintQuery('') }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select sprint" />
                    </SelectTrigger>
                    <SelectContent className="z-[10050] p-0">
                      <div className="p-2">
                        <Input
                          value={sprintQuery}
                          onChange={(e) => setSprintQuery(e.target.value)}
                          placeholder="Type to search sprints"
                          className="mb-2"
                          onKeyDown={(e) => e.stopPropagation()}
                        />
                        <div className="max-h-56 overflow-y-auto">
                          {filteredSprints.map((sprint) => (
                            <SelectItem key={sprint._id} value={sprint._id}>
                              {sprint.name} ({sprint.status})
                            </SelectItem>
                          ))}
                          {filteredSprints.length === 0 && (
                            <div className="px-2 py-1 text-sm text-muted-foreground">
                              {sprints.length === 0 ? 'No sprints available' : 'No matching sprints'}
                            </div>
                          )}
                        </div>
                      </div>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="eventType">Event Type *</Label>
                  <Select 
                    value={formData.eventType} 
                    onValueChange={(value) => handleInputChange('eventType', value)}
                    onOpenChange={(open) => { if (open) setEventTypeQuery('') }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select event type" />
                    </SelectTrigger>
                    <SelectContent className="z-[10050] p-0">
                      <div className="p-2">
                        <Input
                          value={eventTypeQuery}
                          onChange={(e) => setEventTypeQuery(e.target.value)}
                          placeholder="Type to search event types"
                          className="mb-2"
                          onKeyDown={(e) => e.stopPropagation()}
                        />
                        <div className="max-h-56 overflow-y-auto">
                          {filteredEventTypes.map((et) => (
                            <SelectItem key={et.value} value={et.value}>
                              {et.label}
                            </SelectItem>
                          ))}
                        </div>
                      </div>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="title">Event Name *</Label>
                <Input
                  id="title"
                  value={formData.title}
                  onChange={(e) => handleInputChange('title', e.target.value)}
                  placeholder="Enter event name"
                  required
                />
              </div>
            </div>

            {/* (3) Schedule */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold">Schedule</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="scheduledDate">Date *</Label>
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
                  <Label htmlFor="status">Status *</Label>
                  <Select 
                    value={formData.status} 
                    onValueChange={(value) => handleInputChange('status', value)}
                    onOpenChange={(open) => { if (open) setStatusQuery('') }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="z-[10050] p-0">
                      <div className="p-2">
                        <Input
                          value={statusQuery}
                          onChange={(e) => setStatusQuery(e.target.value)}
                          placeholder="Type to search status"
                          className="mb-2"
                          onKeyDown={(e) => e.stopPropagation()}
                        />
                        <div className="max-h-56 overflow-y-auto">
                          {filteredStatusOptions.map((so) => (
                            <SelectItem key={so.value} value={so.value}>
                              {so.label}
                            </SelectItem>
                          ))}
                        </div>
                      </div>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="startTime">Start Time</Label>
                  <Input
                    id="startTime"
                    type="time"
                    value={formData.startTime}
                    onChange={(e) => handleInputChange('startTime', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="endTime">End Time</Label>
                  <Input
                    id="endTime"
                    type="time"
                    value={formData.endTime}
                    onChange={(e) => handleInputChange('endTime', e.target.value)}
                  />
                  {timeError && (
                    <Alert variant="destructive" className="mt-2">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>{timeError}</AlertDescription>
                    </Alert>
                  )}
                </div>
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

            {/* (4) Attendees */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold">Attendees</h3>
              <div className="max-h-32 overflow-y-auto border rounded-md p-2">
                <Input
                  value={attendeeQuery}
                  onChange={(e) => setAttendeeQuery(e.target.value)}
                  placeholder="Search attendees..."
                  className="mb-2"
                />
                <div className="space-y-2">
                  {filteredUsers.map((user) => (
                    <label key={user._id} className="flex items-center space-x-2 cursor-pointer">
                      <Checkbox
                        checked={formData.attendees.includes(user._id)}
                        onCheckedChange={() => handleAttendeeToggle(user._id)}
                      />
                      <span className="text-sm">
                        {user.firstName} {user.lastName} ({user.email})
                      </span>
                    </label>
                  ))}
                  {filteredUsers.length === 0 && users.length > 0 && (
                    <div className="px-2 py-1 text-sm text-muted-foreground">No matching attendees</div>
                  )}
                  {users.length === 0 && (projectId || formData.projectId) && (
                    <div className="px-2 py-1 text-sm text-muted-foreground">No attendees available</div>
                  )}
                </div>
              </div>
            </div>

            {/* (5) Description / Notes */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold">Description / Notes</h3>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => handleInputChange('description', e.target.value)}
                placeholder="Meeting agenda, talking points, key decisions..."
                rows={6}
                className="resize-none"
              />
            </div>

            {/* (6) Attachments */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold">Attachments (Optional)</h3>
              <FileUploader onUpload={handleFileUpload} />
              {attachments.length > 0 && (
                <div className="space-y-2">
                  {attachments.map((attachment, index) => (
                    <div key={index} className="flex items-center justify-between p-2 border rounded-md">
                      <div className="flex items-center space-x-2 flex-1 min-w-0">
                        {attachment.type === 'link' ? (
                          <LinkIcon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        ) : (
                          <span className="text-sm truncate">{attachment.name}</span>
                        )}
                        <a 
                          href={attachment.url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-sm text-primary hover:underline truncate"
                        >
                          {attachment.type === 'link' ? attachment.url : 'View'}
                        </a>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeAttachment(index)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <Input
                  placeholder="Add link URL"
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addLink())}
                />
                <Button type="button" variant="outline" onClick={addLink}>
                  Add Link
                </Button>
              </div>
            </div>

            {/* (7) Notification Settings */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold">Notification Settings (Optional)</h3>
              <div className="space-y-2">
                <label className="flex items-center space-x-2">
                  <Checkbox
                    checked={formData.notificationSettings.enabled}
                    onCheckedChange={(checked) => handleInputChange('notificationSettings.enabled', checked)}
                  />
                  <span className="text-sm">Enable notifications</span>
                </label>
                {formData.notificationSettings.enabled && (
                  <Select 
                    value={formData.notificationSettings.reminderTime} 
                    onValueChange={(value) => handleInputChange('notificationSettings.reminderTime', value)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      <SelectItem value="10mins">10 mins before</SelectItem>
                      <SelectItem value="30mins">30 mins before</SelectItem>
                      <SelectItem value="1hour">1 hour before</SelectItem>
                      <SelectItem value="24hours">24 hours before</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>

            {/* Location and Meeting Link */}
            <div className="grid grid-cols-2 gap-4">
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
            </div>
          </form>
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button 
            type="submit" 
            form="create-sprint-event-form" 
            disabled={loading || !isFormValid()}
          >
            {loading ? 'Creating...' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
