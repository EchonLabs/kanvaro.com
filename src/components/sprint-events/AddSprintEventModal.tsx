'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useDebounce } from '@/hooks/useDebounce'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogBody } from '@/components/ui/Dialog'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/Popover'
import { FileUploader } from '@/components/ui/FileUploader'
import { AttachmentList } from '@/components/ui/AttachmentList'
import { CalendarIcon, X, Link as LinkIcon, AlertCircle, Loader2, CheckCircle } from 'lucide-react'
import { format } from 'date-fns'
import { Checkbox } from '@/components/ui/Checkbox'
import { Alert, AlertDescription } from '@/components/ui/alert'

interface Sprint {
  _id: string
  name: string
  status: string
  project: string
  startDate?: string
  endDate?: string
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
  uploadedBy: string
  uploadedAt: string
}

interface AddSprintEventModalProps {
  projectId?: string
  onClose: () => void
  onSuccess: () => void
}

export function AddSprintEventModal({ projectId, onClose, onSuccess }: AddSprintEventModalProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')
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
  
  // Debounced search queries (300ms delay)
  const debouncedProjectQuery = useDebounce(projectQuery, 300)
  const debouncedSprintQuery = useDebounce(sprintQuery, 300)
  const debouncedEventTypeQuery = useDebounce(eventTypeQuery, 300)
  const debouncedAttendeeQuery = useDebounce(attendeeQuery, 300)
  
  // Request cancellation
  const abortControllerRef = useRef<AbortController | null>(null)
  
  // Simple cache for API responses (5 minute TTL)
  const cacheRef = useRef<{
    projects?: { data: Project[]; timestamp: number }
    sprints?: { data: Sprint[]; projectId: string; timestamp: number }
    users?: { data: User[]; timestamp: number }
  }>({})
  const CACHE_DURATION = 5 * 60 * 1000 // 5 minutes
  
  const [timeError, setTimeError] = useState('')
  const [dateError, setDateError] = useState('')
  const [selectedSprint, setSelectedSprint] = useState<Sprint | null>(null)
  
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

  // Define fetch functions BEFORE useEffect that uses them
  const fetchProjects = useCallback(async (signal?: AbortSignal) => {
    // Check cache first
    const cached = cacheRef.current.projects
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      setProjects(cached.data)
      return
    }
    
    try {
      const response = await fetch('/api/projects', { signal })
      if (signal?.aborted) return
      
      if (response.ok) {
        const data = await response.json()
        const projectsData = data.data || data.projects || []
        setProjects(projectsData)
        // Update cache
        cacheRef.current.projects = { data: projectsData, timestamp: Date.now() }
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return
      console.error('Error fetching projects:', error)
    }
  }, [])

  const fetchSprints = useCallback(async (projId: string, signal?: AbortSignal) => {
    if (!projId) {
      setSprints([])
      return
    }
    
    // Check cache first
    const cached = cacheRef.current.sprints
    if (cached && cached.projectId === projId && Date.now() - cached.timestamp < CACHE_DURATION) {
      setSprints(cached.data)
      return
    }
    
    try {
      const response = await fetch(`/api/sprints?project=${projId}&limit=100`, { signal })
      if (signal?.aborted) return
      
      if (response.ok) {
        const data = await response.json()
        const allSprints = data.data || data.sprints || []
        // Only show planning and active sprints
        const filteredSprints = allSprints.filter((sprint: Sprint) => 
          sprint.status === 'planning' || sprint.status === 'active'
        )
        setSprints(filteredSprints)
        // Update cache
        cacheRef.current.sprints = { data: filteredSprints, projectId: projId, timestamp: Date.now() }
      } else {
        setSprints([])
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return
      console.error('Error fetching sprints:', error)
      setSprints([])
    }
  }, [])

  const fetchUsers = useCallback(async (signal?: AbortSignal) => {
    // Check cache first
    const cached = cacheRef.current.users
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      setUsers(cached.data)
      return
    }
    
    try {
      const response = await fetch('/api/members?limit=1000', { signal })
      if (signal?.aborted) return
      
      if (response.ok) {
        const data = await response.json()
        const members = data.data?.members || data.members || []
        const usersData = Array.isArray(members) ? members : []
        setUsers(usersData)
        // Update cache
        cacheRef.current.users = { data: usersData, timestamp: Date.now() }
      } else {
        // Fallback to /api/users if /api/members fails
        const fallbackResponse = await fetch('/api/users', { signal })
        if (signal?.aborted) return
        
        if (fallbackResponse.ok) {
          const usersData = await fallbackResponse.json()
          const usersArray = Array.isArray(usersData) ? usersData : []
          setUsers(usersArray)
          cacheRef.current.users = { data: usersArray, timestamp: Date.now() }
        } else {
          setUsers([])
        }
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return
      
      // Try fallback API
      try {
        const fallbackResponse = await fetch('/api/users', { signal })
        if (signal?.aborted) return
        
        if (fallbackResponse.ok) {
          const usersData = await fallbackResponse.json()
          const usersArray = Array.isArray(usersData) ? usersData : []
          setUsers(usersArray)
          cacheRef.current.users = { data: usersArray, timestamp: Date.now() }
        } else {
          setUsers([])
        }
      } catch (fallbackError) {
        if (fallbackError instanceof Error && fallbackError.name === 'AbortError') return
        console.error('Error fetching users:', fallbackError)
        setUsers([])
      }
    }
  }, [])

  // Optimized parallel data fetching with caching
  useEffect(() => {
    // Cancel any pending requests
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    
    abortControllerRef.current = new AbortController()
    const signal = abortControllerRef.current.signal
    
    // Fetch all data in parallel
    const fetchAllData = async () => {
      const promises: Promise<void>[] = []
      
      // Always fetch users (cached)
      promises.push(fetchUsers(signal))
      
      if (projectId) {
        promises.push(fetchSprints(projectId, signal))
      } else {
        promises.push(fetchProjects(signal))
      }
      
      await Promise.all(promises)
    }
    
    fetchAllData()
    
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [projectId, fetchUsers, fetchSprints, fetchProjects])

  useEffect(() => {
    if (formData.projectId && !projectId) {
      // Reset sprint selection when project changes
      setFormData(prev => ({
        ...prev,
        sprintId: ''
      }))
      
      // Cancel previous request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
      
      abortControllerRef.current = new AbortController()
      fetchSprints(formData.projectId, abortControllerRef.current.signal)
    }
  }, [formData.projectId, projectId, fetchSprints])

  // Date validation function
  const validateDate = useCallback((date: Date) => {
    setDateError('')
    
    if (!selectedSprint || !selectedSprint.startDate || !selectedSprint.endDate) {
      return true // Allow if sprint details not loaded yet
    }

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const selected = new Date(date)
    selected.setHours(0, 0, 0, 0)

    const sprintStart = new Date(selectedSprint.startDate)
    sprintStart.setHours(0, 0, 0, 0)

    const sprintEnd = new Date(selectedSprint.endDate)
    sprintEnd.setHours(23, 59, 59, 999)

    // Check if date is in the past
    if (selected < today) {
      setDateError('Date cannot be in the past')
      return false
    }

    // Check if date is before sprint start
    if (selected < sprintStart) {
      setDateError(`Date must be on or after sprint start date (${format(sprintStart, 'MMM dd, yyyy')})`)
      return false
    }

    // Check if date is after sprint end
    if (selected > sprintEnd) {
      setDateError(`Date must be on or before sprint end date (${format(sprintEnd, 'MMM dd, yyyy')})`)
      return false
    }

    return true
  }, [selectedSprint])

  const handleDateSelect = (date: Date | undefined) => {
    if (!date) {
      setSelectedDate(undefined)
      setDateError('')
      return
    }

    if (validateDate(date)) {
      setSelectedDate(date)
    } else {
      // Still set the date but show error
      setSelectedDate(date)
    }
  }

  // Validate end time is after start time and prevent past times
  useEffect(() => {
    if (formData.startTime && formData.endTime) {
      const [startHours, startMinutes] = formData.startTime.split(':').map(Number)
      const [endHours, endMinutes] = formData.endTime.split(':').map(Number)
      const start = startHours * 60 + startMinutes
      const end = endHours * 60 + endMinutes
      
      // Check if date is selected and validate against current time
      if (selectedDate) {
        const now = new Date()
        const selectedDateTime = new Date(selectedDate)
        selectedDateTime.setHours(startHours, startMinutes, 0, 0)
        
        // If selected date is today, check if time is in the past
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        const selectedDateOnly = new Date(selectedDate)
        selectedDateOnly.setHours(0, 0, 0, 0)
        
        if (selectedDateOnly.getTime() === today.getTime() && selectedDateTime < now) {
          setTimeError('Start time cannot be in the past')
          return
        }
      }
      
      if (end <= start) {
        setTimeError('End time must be greater than start time')
      } else {
        setTimeError('')
      }
    } else if (formData.startTime && selectedDate) {
      // Validate start time alone if date is selected
      const [startHours, startMinutes] = formData.startTime.split(':').map(Number)
      const now = new Date()
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const selectedDateOnly = new Date(selectedDate)
      selectedDateOnly.setHours(0, 0, 0, 0)
      
      if (selectedDateOnly.getTime() === today.getTime()) {
        const selectedDateTime = new Date(selectedDate)
        selectedDateTime.setHours(startHours, startMinutes, 0, 0)
        if (selectedDateTime < now) {
          setTimeError('Start time cannot be in the past')
          return
        }
      }
      setTimeError('')
    } else {
      setTimeError('')
    }
  }, [formData.startTime, formData.endTime, selectedDate])

  const handleFileUpload = async (file: File) => {
    try {
      const formData = new FormData()
      // The attachments API expects the file in the "attachment" field
      formData.append('attachment', file)

      const response = await fetch('/api/uploads/attachments', {
        method: 'POST',
        body: formData
      })

      if (!response.ok) {
        console.error('Failed to upload attachment:', response.status)
        return
      }

      const result = await response.json()
      const data = result.data || result

      if (!data?.url) {
        console.error('Invalid attachment upload response:', result)
        return
      }

      setAttachments(prev => [
        ...prev,
        {
          name: data.name || file.name,
          url: data.url,
          size: data.size ?? file.size,
          type: data.type || file.type || 'application/octet-stream',
          // Use uploadedByName from API when available, otherwise fall back to a generic label
          uploadedBy: data.uploadedByName || 'Attachment',
          uploadedAt: data.uploadedAt || new Date().toISOString()
        }
      ])
    } catch (error) {
      console.error('Error uploading file:', error)
    }
  }

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index))
  }

  const handleAttachmentDownload = async (attachment: Attachment) => {
    // For links, open in new tab instead of downloading
    if (attachment.type === 'link') {
      window.open(attachment.url, '_blank', 'noopener,noreferrer')
      return
    }
    
    try {
      // Fetch the file as a blob to force download
      const response = await fetch(attachment.url)
      if (!response.ok) {
        throw new Error('Failed to fetch file')
      }
      
      const blob = await response.blob()
      const blobUrl = window.URL.createObjectURL(blob)
      
      // Create a temporary link element to trigger download
      const link = document.createElement('a')
      link.href = blobUrl
      link.download = attachment.name
      link.style.display = 'none'
      
      // Append to body, click, then remove
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      
      // Clean up the blob URL after a short delay
      setTimeout(() => {
        window.URL.revokeObjectURL(blobUrl)
      }, 100)
    } catch (error) {
      console.error('Error downloading file:', error)
      // Fallback: try direct download link
      const link = document.createElement('a')
      link.href = attachment.url
      link.download = attachment.name
      link.target = '_blank'
      link.rel = 'noopener noreferrer'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    }
  }

  const addLink = () => {
    if (linkUrl.trim()) {
      setAttachments(prev => [...prev, {
        name: linkUrl,
        url: linkUrl,
        size: 0,
        type: 'link',
        uploadedBy: 'Link',
        uploadedAt: new Date().toISOString()
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
      } else {
        setFormData(prev => ({ ...prev, duration: 0 }))
      }
    } else {
      // Reset duration if times are not both provided
      setFormData(prev => ({ ...prev, duration: 0 }))
    }
  }

  // Convert minutes to hours and minutes format for display
  const formatDuration = (minutes: number) => {
    if (minutes <= 0) {
      return '0 minutes'
    }
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    if (hours > 0 && mins > 0) {
      return `${hours} hour${hours > 1 ? 's' : ''} ${mins} minute${mins > 1 ? 's' : ''}`
    } else if (hours > 0) {
      return `${hours} hour${hours > 1 ? 's' : ''}`
    } else {
      return `${mins} minute${mins > 1 ? 's' : ''}`
    }
  }

  // Get the calculated duration display value
  const getDurationDisplay = () => {
    if (formData.startTime && formData.endTime && !timeError && formData.duration > 0) {
      return formatDuration(formData.duration)
    }
    return 'Enter start and end time to calculate'
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
    
    // If start time is provided, end time must also be provided and valid
    // If both times are provided, they must be valid (no timeError) and duration must be > 0
    const hasValidTime = 
      (!formData.startTime && !formData.endTime) || // Both empty is OK (optional)
      (formData.startTime && formData.endTime && !timeError && formData.duration > 0) // Both filled and valid
    
    // Check date validation - date must be valid if selected
    const hasValidDate = !dateError || (selectedDate && (!selectedSprint || validateDate(selectedDate)))
    
    return hasRequiredFields && hasValidTime && hasValidDate
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
        setSuccess('Sprint Event created successfully')
        setError('')
        setLoading(false)
        onSuccess()
        // Show success message briefly before closing and redirecting
        setTimeout(() => {
          setSuccess('')
          onClose()
          router.push('/sprint-events?success=created')
        }, 2500)
      } else {
        const errorData = await response.json()
        const errorMessage = errorData.error || 'Failed to create event'
        console.error('Error creating sprint event:', errorData)
        setError(errorMessage)
        setSuccess('')
        setLoading(false)
      }
    } catch (err) {
      console.error('Error creating sprint event:', err)
      setError('Failed to create event. Please try again.')
      setSuccess('')
      setLoading(false)
    }
  }

  useEffect(() => {
    if (error) {
      const t = setTimeout(() => setError(''), 5000)
      return () => clearTimeout(t)
    }
  }, [error])

  const handleInputChange = useCallback((field: string, value: string | number | any) => {
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
      // Don't reset users - they're shared across projects
    }
  }, [])

  const handleAttendeeToggle = useCallback((userId: string) => {
    setFormData(prev => ({
      ...prev,
      attendees: prev.attendees.includes(userId)
        ? prev.attendees.filter(id => id !== userId)
        : [...prev.attendees, userId]
    }))
  }, [])

  // Optimized filter functions with memoization and debouncing
  const filteredProjects = useMemo(() => {
    if (!debouncedProjectQuery.trim()) return projects
    const query = debouncedProjectQuery.toLowerCase()
    return projects.filter(p => p.name.toLowerCase().includes(query))
  }, [projects, debouncedProjectQuery])
  
  const filteredSprints = useMemo(() => {
    if (!debouncedSprintQuery.trim()) return sprints
    const query = debouncedSprintQuery.toLowerCase()
    return sprints.filter(s => s.name.toLowerCase().includes(query))
  }, [sprints, debouncedSprintQuery])
  
  const filteredEventTypes = useMemo(() => {
    if (!debouncedEventTypeQuery.trim()) return eventTypes
    const query = debouncedEventTypeQuery.toLowerCase()
    return eventTypes.filter(et => et.label.toLowerCase().includes(query))
  }, [debouncedEventTypeQuery])
  
  const filteredStatusOptions = useMemo(() => {
    if (!statusQuery.trim()) return statusOptions
    const query = statusQuery.toLowerCase()
    return statusOptions.filter(so => so.label.toLowerCase().includes(query))
  }, [statusQuery])
  
  const filteredUsers = useMemo(() => {
    if (!Array.isArray(users)) return []
    if (!debouncedAttendeeQuery.trim()) return users
    const query = debouncedAttendeeQuery.toLowerCase()
    return users.filter((u: User) => {
      const fullName = `${u.firstName} ${u.lastName}`.toLowerCase()
      return fullName.includes(query) || u.email.toLowerCase().includes(query)
    })
  }, [users, debouncedAttendeeQuery])

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
            {success && (
              <Alert variant="success" className="flex items-center justify-between pr-2">
                <AlertDescription className="flex-1 flex items-center gap-2">
                  <CheckCircle className="h-4 w-4" />
                  {success}
                </AlertDescription>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 hover:bg-green-100 dark:hover:bg-green-900/40"
                  onClick={() => {
                    setSuccess('')
                    onClose()
                  }}
                >
                  <X className="h-4 w-4 text-green-700 dark:text-green-300" />
                </Button>
              </Alert>
            )}
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
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
            <div className="space-y-4 mt-8">
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
                        onSelect={handleDateSelect}
                        disabled={(date) => {
                          const today = new Date()
                          today.setHours(0, 0, 0, 0)
                          const checkDate = new Date(date)
                          checkDate.setHours(0, 0, 0, 0)
                          
                          // Disable past dates
                          if (checkDate < today) {
                            return true
                          }
                          
                          // Disable dates outside sprint range if sprint is selected
                          if (selectedSprint && selectedSprint.startDate && selectedSprint.endDate) {
                            const sprintStart = new Date(selectedSprint.startDate)
                            sprintStart.setHours(0, 0, 0, 0)
                            const sprintEnd = new Date(selectedSprint.endDate)
                            sprintEnd.setHours(23, 59, 59, 999)
                            
                            if (checkDate < sprintStart || checkDate > sprintEnd) {
                              return true
                            }
                          }
                          
                          return false
                        }}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                  {dateError && (
                    <Alert variant="destructive" className="mt-2">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>{dateError}</AlertDescription>
                    </Alert>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="status">Status *</Label>
                  <Input
                    id="status"
                    value="Scheduled"
                    disabled
                    className="bg-muted"
                  />
                  <input type="hidden" value={formData.status} />
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
                <Label htmlFor="duration">Duration</Label>
                <Input
                  id="duration"
                  value={getDurationDisplay()}
                  disabled
                  className="bg-muted"
                  placeholder="Enter start and end time to calculate"
                />
              </div>
            </div>

            {/* (4) Attendees */}
            <div className="space-y-4 mt-8">
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
            <div className="space-y-4 mt-8">
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
                <AttachmentList
                  attachments={attachments}
                  onDelete={removeAttachment}
                  onDownload={handleAttachmentDownload}
                  canDelete
                />
              )}

              <div className="flex gap-2">
                <Input
                  placeholder="Enter Link"
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
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : (
              'Save'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
