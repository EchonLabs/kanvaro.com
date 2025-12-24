'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogBody } from '@/components/ui/Dialog'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/Popover'
import { CalendarIcon, Loader2, X, UserPlus } from 'lucide-react'
import { format } from 'date-fns'
import { Badge } from '@/components/ui/Badge'
import { Checkbox } from '@/components/ui/Checkbox'
import { useNotify } from '@/lib/notify'

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
    _id?: string
    firstName: string
    lastName: string
    email: string
    isActive?: boolean
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
  isActive?: boolean
}

interface EditSprintEventModalProps {
  event: SprintEvent
  onClose: () => void
  onSuccess: () => void
}

export function EditSprintEventModal({ event, onClose, onSuccess }: EditSprintEventModalProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [users, setUsers] = useState<User[]>([])
  const [loadingUsers, setLoadingUsers] = useState(true)
  const [showAddAttendees, setShowAddAttendees] = useState(false)
  const [attendeeSearchQuery, setAttendeeSearchQuery] = useState('')
  const [selectedDate, setSelectedDate] = useState<Date>(new Date(event.scheduledDate))
  const [actualDate, setActualDate] = useState<Date | undefined>(
    event.actualDate ? new Date(event.actualDate) : undefined
  )
  const { success: notifySuccess, error: notifyError } = useNotify()
  const attendeeIds = event.attendees
    .map(a => (a as any)._id)
    .filter((id): id is string => Boolean(id))
 
  
  // Store initial state to compare changes
  const initialFormData = {
    title: event.title,
    description: event.description || '',
    duration: event.duration,
    status: event.status,
    attendees: [...attendeeIds].sort(),
    location: event.location || '',
    meetingLink: event.meetingLink || '',
    outcomes: event.outcomes || {
      decisions: [],
      actionItems: [],
      notes: '',
      velocity: undefined,
      capacity: undefined
    }
  }
  const initialSelectedDate = new Date(event.scheduledDate)
  const initialActualDate = event.actualDate ? new Date(event.actualDate) : undefined
  
  const [formData, setFormData] = useState({
    title: event.title,
    description: event.description || '',
    duration: event.duration,
    status: event.status,
    attendees: attendeeIds,
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

  const normalizeMembers = (members: any[]): User[] => {
    if (!Array.isArray(members)) return []
    return members
      .filter((member: any) => member && member._id)
      .map((member: any) => ({
        _id: member._id,
        firstName: member.firstName || '',
        lastName: member.lastName || '',
        email: member.email || '',
        isActive: member.isActive !== false
      }))
  }

  const includeExistingAttendees = (members: User[]): User[] => {
    const memberMap = new Map<string, User>()
    members.forEach(member => {
      if (member?._id) {
        memberMap.set(member._id, member)
      }
    })

    formData.attendees.forEach(attendeeId => {
      if (!attendeeId || memberMap.has(attendeeId)) return
      const fallbackAttendee = event.attendees.find(att => att._id === attendeeId)
      memberMap.set(attendeeId, {
        _id: attendeeId,
        firstName: fallbackAttendee?.firstName || 'Unknown',
        lastName: fallbackAttendee?.lastName || '',
        email: fallbackAttendee?.email || '',
        isActive: false
      })
    })

    return Array.from(memberMap.values())
  }

  useEffect(() => {
    fetchUsers()
  }, [])

  const fetchUsers = async () => {
    try {
      setLoadingUsers(true)
      const response = await fetch('/api/members?limit=1000')
      if (response.ok) {
        const data = await response.json()
        // Handle different response structures
        let members = []
        if (data.success && data.data && data.data.members) {
          members = data.data.members
        } else if (data.data && Array.isArray(data.data)) {
          members = data.data
        } else if (data.members && Array.isArray(data.members)) {
          members = data.members
        } else if (Array.isArray(data)) {
          members = data
        }
        const normalizedMembers = normalizeMembers(members)
        const activeMembers = normalizedMembers.filter(member => member.isActive !== false)

        console.log('All Loaded Users:', normalizedMembers.map(u => ({
          _id: u._id,
          name: `${u.firstName} ${u.lastName}`,
          email: u.email,
          isActive: u.isActive
        })))
        console.log('Active Members Only:', activeMembers.map(u => ({
          _id: u._id,
          name: `${u.firstName} ${u.lastName}`,
          email: u.email,
          isActive: u.isActive
        })))

        setUsers(includeExistingAttendees(activeMembers))
      } else {
        // Fallback to /api/users
        const fallbackResponse = await fetch('/api/users')
        if (fallbackResponse.ok) {
          const usersData = await fallbackResponse.json()
          const normalizedFallback = normalizeMembers(Array.isArray(usersData) ? usersData : [])
          const activeFallback = normalizedFallback.filter(member => member.isActive !== false)

          console.log('Fallback - All Loaded Users:', normalizedFallback.map(u => ({
            _id: u._id,
            name: `${u.firstName} ${u.lastName}`,
            email: u.email,
            isActive: u.isActive
          })))
          console.log('Fallback - Active Members Only:', activeFallback.map(u => ({
            _id: u._id,
            name: `${u.firstName} ${u.lastName}`,
            email: u.email,
            isActive: u.isActive
          })))

          setUsers(includeExistingAttendees(activeFallback))
        }
      }
    } catch (error) {
      console.error('Error fetching users:', error)
      setUsers(includeExistingAttendees([]))
    } finally {
      setLoadingUsers(false)
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
        notifySuccess({
          title: 'Sprint Event Updated',
          message: 'Sprint Event updated successfully'
        })
        setLoading(false)
        onSuccess()
        // Close modal and redirect after showing success notification
        setTimeout(() => {
          onClose()
          router.push('/sprint-events?success=updated')
        }, 1000)
      } else {
        const errorData = await response.json()
        const errorMessage = errorData.error || 'Failed to update event'
        console.error('Error updating sprint event:', errorData)
        notifyError({
          title: 'Failed to Update Sprint Event',
          message: errorMessage
        })
        setLoading(false)
      }
    } catch (err) {
      console.error('Error updating sprint event:', err)
      notifyError({
        title: 'Failed to Update Sprint Event',
        message: 'Failed to update event. Please try again.'
      })
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

  const removeAttendee = (userId: string) => {
    setFormData(prev => ({
      ...prev,
      attendees: prev.attendees.filter(id => id !== userId)
    }))
  }

  const getSelectedAttendees = () => {
    const selected = users.filter(user => formData.attendees.includes(user._id))
  
    return selected
  }

  const getAvailableAttendees = () => {
    const query = attendeeSearchQuery.toLowerCase()
    const available = users.filter(user => {
      const isNotSelected = !formData.attendees.includes(user._id)
      const matchesSearch = !query ||
        user.firstName.toLowerCase().includes(query) ||
        user.lastName.toLowerCase().includes(query) ||
        user.email.toLowerCase().includes(query)
      const isActive = user.isActive !== false
      return isActive && isNotSelected && matchesSearch
    })

  

    return available
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

  // Check if any changes have been made
  const hasChanges = () => {
    // Compare dates
    const scheduledDateChanged = selectedDate.getTime() !== initialSelectedDate.getTime()
    const actualDateChanged = 
      (actualDate === undefined && initialActualDate !== undefined) ||
      (actualDate !== undefined && initialActualDate === undefined) ||
      (actualDate && initialActualDate && actualDate.getTime() !== initialActualDate.getTime())
    
    if (scheduledDateChanged || actualDateChanged) {
      return true
    }

    // Compare form data fields
    if (
      formData.title !== initialFormData.title ||
      formData.description !== initialFormData.description ||
      formData.duration !== initialFormData.duration ||
      formData.status !== initialFormData.status ||
      formData.location !== initialFormData.location ||
      formData.meetingLink !== initialFormData.meetingLink
    ) {
      return true
    }

    // Compare attendees (order-independent)
    const currentAttendees = [...formData.attendees].sort()
    const initialAttendees = [...initialFormData.attendees].sort()
    if (currentAttendees.length !== initialAttendees.length ||
        currentAttendees.some((id, index) => id !== initialAttendees[index])) {
      return true
    }

    // Compare outcomes
    const outcomes = formData.outcomes
    const initialOutcomes = initialFormData.outcomes

    // Compare decisions
    if (outcomes.decisions.length !== initialOutcomes.decisions.length ||
        outcomes.decisions.some((d, i) => d !== initialOutcomes.decisions[i])) {
      return true
    }

    // Compare notes
    if (outcomes.notes !== initialOutcomes.notes) {
      return true
    }

    // Compare velocity and capacity
    if (outcomes.velocity !== initialOutcomes.velocity ||
        outcomes.capacity !== initialOutcomes.capacity) {
      return true
    }

    // Compare action items
    if (outcomes.actionItems.length !== initialOutcomes.actionItems.length) {
      return true
    }
    
    for (let i = 0; i < outcomes.actionItems.length; i++) {
      const item = outcomes.actionItems[i]
      const initialItem = initialOutcomes.actionItems[i]
      if (
        item.description !== initialItem.description ||
        item.assignedTo !== initialItem.assignedTo ||
        item.dueDate !== initialItem.dueDate ||
        item.status !== initialItem.status
      ) {
        return true
      }
    }

    return false
  }

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent 
        className="sm:max-w-[700px] max-h-[90vh] flex flex-col overflow-hidden"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Edit Sprint Event</DialogTitle>
          <DialogDescription>
            Update event details and outcomes
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="flex-1 overflow-y-auto px-4 sm:px-6">
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
            <div className="flex items-center justify-between">
              <Label>Attendees</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowAddAttendees(!showAddAttendees)}
              >
                <UserPlus className="h-4 w-4 mr-2" />
                Add Attendees
              </Button>
            </div>
            
            {/* Selected Attendees as Chips */}
            {loadingUsers ? (
              <div className="border rounded-md p-4 flex items-center justify-center">
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                <span className="text-sm text-muted-foreground">Loading attendees...</span>
              </div>
            ) : getSelectedAttendees().length > 0 ? (
              <div className="border rounded-md p-3 flex flex-wrap gap-2">
                {getSelectedAttendees().map((user) => (
                  <Badge key={user._id} variant="secondary" className="flex items-center gap-2 px-3 py-1">
                    <span className="text-sm">
                      {user.firstName} {user.lastName}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeAttendee(user._id)}
                      className="hover:bg-secondary-foreground/20 rounded-full p-0.5"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            ) : (
              <div className="border rounded-md p-4 text-center">
                <p className="text-sm text-muted-foreground">No attendees selected</p>
                <p className="text-xs text-muted-foreground mt-1">Click "Add Attendees" to select participants</p>
              </div>
            )}

            {/* Add Attendees Section */}
            {showAddAttendees && !loadingUsers && (
              <div className="border rounded-md p-3 space-y-2">
                <Input
                  placeholder="Search attendees..."
                  value={attendeeSearchQuery}
                  onChange={(e) => setAttendeeSearchQuery(e.target.value)}
                  className="mb-2"
                />
                <div className="max-h-48 overflow-y-auto space-y-1">
                  {getAvailableAttendees().length > 0 ? (
                    getAvailableAttendees().map((user) => (
                      <label key={user._id} className="flex items-center space-x-2 p-2 hover:bg-muted rounded cursor-pointer">
                        <Checkbox
                          checked={formData.attendees.includes(user._id)}
                          onCheckedChange={() => handleAttendeeToggle(user._id)}
                        />
                        <span className="text-sm flex-1">
                          {user.firstName} {user.lastName} <span className="text-muted-foreground">({user.email})</span>
                        </span>
                      </label>
                    ))
                  ) : (
                    <div className="text-center py-3">
                      <p className="text-sm text-muted-foreground">
                        {attendeeSearchQuery ? 'No matching attendees found' : 'All available attendees have been added'}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
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
          <Button type="submit" form="edit-sprint-event-form" disabled={loading || !hasChanges()}>
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Updating...
              </>
            ) : (
              'Update Event'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
