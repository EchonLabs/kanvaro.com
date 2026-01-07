'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/Badge'
import { 
  X, 
  Plus, 
  Calendar, 
  User, 
  Target, 
  Clock,
  Loader2,
  Trash2,
  Paperclip,
  Check
} from 'lucide-react'
import { AttachmentList } from '@/components/ui/AttachmentList'
import { useNotify } from '@/lib/notify'

interface CreateTaskModalProps {
  isOpen: boolean
  onClose: () => void
  projectId: string
  onTaskCreated: () => void
  defaultStatus?: string
  availableStatuses?: Array<{ key: string; title: string }>
  stayOnCurrentPage?: boolean // If true, don't redirect after task creation
}

interface User {
  _id: string
  firstName: string
  lastName: string
  email: string
  projectHourlyRate?: number
  isActive?: boolean
}

interface CurrentUser {
  id: string
  firstName: string
  lastName: string
  email: string
}

interface Story {
  _id: string
  title: string
  epic?: {
    _id: string
    title: string
  }
}

interface Epic {
  _id: string
  title: string
  project: {
    _id: string
    name: string
  }
}

interface AttachmentDraft {
  name: string
  url: string
  size: number
  type: string
  uploadedAt: string
  uploadedByName: string
  uploadedById: string
}

const mapUserResponse = (data: any): CurrentUser | null => {
  if (!data) return null
  const id = typeof data.id === 'string' ? data.id : (typeof data._id === 'string' ? data._id : '')
  if (!id) return null
  return {
    id,
    firstName: data.firstName || '',
    lastName: data.lastName || '',
    email: data.email || ''
  }
}

type SubtaskStatus = 'backlog' | 'todo' | 'in_progress' | 'review' | 'testing' | 'done' | 'cancelled'

interface Subtask {
  title: string
  description?: string
  status: SubtaskStatus
  isCompleted: boolean
}

const SUBTASK_STATUS_OPTIONS: Array<{ value: SubtaskStatus; label: string }> = [
  { value: 'backlog', label: 'Backlog' },
  { value: 'todo', label: 'To Do' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'review', label: 'Review' },
  { value: 'testing', label: 'Testing' },
  { value: 'done', label: 'Done' },
  { value: 'cancelled', label: 'Cancelled' }
]

const MAX_LABEL_LENGTH = 50

interface TaskFormData {
  title: string
  description: string
  priority: 'low' | 'medium' | 'high' | 'critical'
  type: 'task' | 'bug' | 'feature' | 'improvement' | 'subtask'
  assignedTo: string
  dueDate: string
  estimatedHours: string
  labels: string[]
  story: string
  epic: string
  isBillable: boolean
}

export default function CreateTaskModal({
  isOpen,
  onClose,
  projectId,
  onTaskCreated,
  defaultStatus: _defaultStatus,
  availableStatuses: _availableStatuses,
  stayOnCurrentPage = false
}: CreateTaskModalProps) {
  const router = useRouter()
  const { success: notifySuccess, error: notifyError } = useNotify()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [projectMembers, setProjectMembers] = useState<User[]>([])
  const [loadingProjectMembers, setLoadingProjectMembers] = useState(false)
  const [projects, setProjects] = useState<Array<{ _id: string; name: string }>>([])
  const [loadingProjects, setLoadingProjects] = useState(false)
  const [selectedProjectId, setSelectedProjectId] = useState<string>('')
  const [projectQuery, setProjectQuery] = useState('')
  const [subtasks, setSubtasks] = useState<Subtask[]>([])
  const [assignedTo, setAssignedTo] = useState<string[]>([])
  const [assigneeHourlyRates, setAssigneeHourlyRates] = useState<Record<string, string>>({})
  const [assigneeQuery, setAssigneeQuery] = useState('')
  const [newLabel, setNewLabel] = useState('')
  const [stories, setStories] = useState<Story[]>([])
  const [epics, setEpics] = useState<Epic[]>([])
  const [loadingStories, setLoadingStories] = useState(false)
  const [loadingEpics, setLoadingEpics] = useState(false)
  const [storyQuery, setStoryQuery] = useState('')
  const [epicQuery, setEpicQuery] = useState('')
  const [formData, setFormData] = useState<TaskFormData>({
    title: '',
    description: '',
    priority: 'medium',
    type: 'task',
    assignedTo: '',
    dueDate: '',
    estimatedHours: '',
    labels: [],
    story: '',
    epic: '',
    isBillable: false
  })
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null)
  const [attachments, setAttachments] = useState<AttachmentDraft[]>([])
  const [attachmentError, setAttachmentError] = useState('')
  const [isUploadingAttachment, setIsUploadingAttachment] = useState(false)
  const attachmentInputRef = useRef<HTMLInputElement>(null)

  const effectiveProjectId = projectId || selectedProjectId
  const hasProjectSelected = Boolean(effectiveProjectId)

  const fetchProjectMembers = useCallback(async (projectIdParam: string | undefined) => {
    if (!projectIdParam) {
      setProjectMembers([])
      return
    }

    setLoadingProjectMembers(true)
    try {
      const response = await fetch(`/api/projects/${projectIdParam}`)
      const data = await response.json()

      if (response.ok && data.success && data.data) {
        const projectData = data.data
        const members = Array.isArray(projectData.teamMembers) ? projectData.teamMembers : []

        // Transform populated team members data
        const populatedMembers = members
          .map((member: any) => ({
            _id: member.memberId._id,
            firstName: member.memberId.firstName,
            lastName: member.memberId.lastName,
            email: member.memberId.email,
            projectHourlyRate: member.hourlyRate,
            isActive: member.memberId.isActive !== false
          }))
          .filter((member: any) => member.isActive)

        setProjectMembers(populatedMembers)

        const billableDefault = typeof projectData.isBillableByDefault === 'boolean' ? projectData.isBillableByDefault : true
        setFormData(prev => ({ ...prev, isBillable: billableDefault }))
      } else {
        setProjectMembers([])
      }
    } catch (error) {
      console.error('Failed to fetch project members:', error)
      setProjectMembers([])
    } finally {
      setLoadingProjectMembers(false)
    }
  }, [])

  const fetchProjects = async () => {
    setLoadingProjects(true)
    try {
      const res = await fetch('/api/projects')
      const data = await res.json()
      if (data.success && Array.isArray(data.data)) {
        setProjects(data.data)
      } else {
        setProjects([])
      }
    } catch (e) {
      setProjects([])
    } finally {
      setLoadingProjects(false)
    }
  }

  const fetchStories = useCallback(async (projectIdParam: string | undefined) => {
    if (!projectIdParam) {
      setStories([])
      return
    }

    setLoadingStories(true)
    try {
      const response = await fetch(`/api/stories?projectId=${projectIdParam}`)
      const data = await response.json()

      if (data.success && Array.isArray(data.data)) {
        setStories(data.data)
      } else {
        setStories([])
      }
    } catch (err) {
      console.error('Failed to fetch stories:', err)
      setStories([])
    } finally {
      setLoadingStories(false)
    }
  }, [])

  const fetchEpics = useCallback(async (projectIdParam: string | undefined) => {
    if (!projectIdParam) {
      setEpics([])
      return
    }

    setLoadingEpics(true)
    try {
      const response = await fetch(`/api/epics?project=${encodeURIComponent(projectIdParam)}&limit=100`)
      const data = await response.json()

      if (data.success && Array.isArray(data.data)) {
        setEpics(data.data)
      } else {
        setEpics([])
      }
    } catch (err) {
      console.error('Failed to fetch epics:', err)
      setEpics([])
    } finally {
      setLoadingEpics(false)
    }
  }, [])

  const fetchCurrentUser = useCallback(async () => {
    try {
      const response = await fetch('/api/auth/me')
      if (response.ok) {
        const data = await response.json()
        const normalized = mapUserResponse(data)
        if (normalized) {
          setCurrentUser(normalized)
        }
        return
      }

      if (response.status === 401) {
        const refreshResponse = await fetch('/api/auth/refresh', { method: 'POST' })
        if (refreshResponse.ok) {
          const refreshData = await refreshResponse.json().catch(() => ({}))
          const normalized = mapUserResponse(refreshData?.user || refreshData)
          if (normalized) {
            setCurrentUser(normalized)
          }
        }
      }
    } catch (error) {
      console.error('Failed to fetch current user:', error)
    }
  }, [])

  // Fetch project members when modal opens or project selection changes
  useEffect(() => {
    if (!isOpen) return

    fetchCurrentUser()

    const effectiveId = projectId || selectedProjectId
    if (effectiveId) {
      fetchProjectMembers(effectiveId)
      fetchStories(effectiveId)
      fetchEpics(effectiveId)
    } else {
      setProjectMembers([])
      setStories([])
      setEpics([])
    }

    if (!projectId) {
      fetchProjects()
    }
  }, [isOpen, projectId, selectedProjectId, fetchProjectMembers, fetchCurrentUser, fetchStories, fetchEpics])

  // Reset form state whenever modal closes so it opens clean next time
  useEffect(() => {
    if (!isOpen) {
      setError('')
      setFormData({
        title: '',
        description: '',
        priority: 'medium',
        type: 'task',
        assignedTo: '',
        dueDate: '',
        estimatedHours: '',
        labels: [],
        story: '',
        epic: '',
        isBillable: false
      })
      setSubtasks([])
      setAssignedTo([])
      setAssigneeHourlyRates({})
      setAssigneeQuery('')
      setNewLabel('')
      setProjectMembers([])
      setLoadingProjectMembers(false)
      setStories([])
      setEpics([])
      setStoryQuery('')
      setEpicQuery('')
      if (!projectId) setSelectedProjectId('')
      setAttachments([])
      setAttachmentError('')
      setIsUploadingAttachment(false)
    }
  }, [isOpen, projectId])


  const addSubtask = () => {
    setSubtasks([...subtasks, {
      title: '',
      description: '',
      status: 'backlog',
      isCompleted: false
    }])
  }

  const updateSubtask = (index: number, field: keyof Subtask, value: any) => {
    setSubtasks(prev => {
      const updated = [...prev]
      updated[index] = {
        ...updated[index],
        [field]: field === 'status' ? (value as SubtaskStatus) : value
      }
      if (field === 'status') {
        updated[index].isCompleted = (value as SubtaskStatus) === 'done'
      }
      return updated
    })
  }

  const removeSubtask = (index: number) => {
    setSubtasks(subtasks.filter((_, i) => i !== index))
  }

  const addLabel = () => {
    const trimmed = newLabel.trim()
    if (!trimmed) return

    if (trimmed.length > MAX_LABEL_LENGTH) {
      setError(`Labels must be ${MAX_LABEL_LENGTH} characters or fewer.`)
      return
    }

    setFormData(prev => ({
      ...prev,
      labels: [...prev.labels, trimmed]
    }))
    setNewLabel('')
  }

  const removeLabel = (index: number) => {
    setFormData(prev => ({
      ...prev,
      labels: prev.labels.filter((_, i) => i !== index)
    }))
  }

  const uploadAttachmentFile = useCallback(async (file: File) => {
    if (!currentUser) {
      throw new Error('User information is still loading.')
    }

    const formDataUpload = new FormData()
    formDataUpload.append('attachment', file)
    const displayName = `${currentUser.firstName} ${currentUser.lastName}`.trim() || currentUser.email
    if (displayName) {
      formDataUpload.append('uploadedByName', displayName)
    }

    const response = await fetch('/api/uploads/attachments', {
      method: 'POST',
      body: formDataUpload
    })
    const uploadData = await response.json().catch(() => ({ error: 'Failed to upload attachment' }))
    if (!response.ok || !uploadData?.success) {
      throw new Error(uploadData.error || 'Failed to upload attachment')
    }

    const attachmentInfo = uploadData.data
    setAttachments(prev => [
      ...prev,
      {
        name: attachmentInfo.name,
        url: attachmentInfo.url,
        size: attachmentInfo.size,
        type: attachmentInfo.type,
        uploadedAt: attachmentInfo.uploadedAt,
        uploadedByName: attachmentInfo.uploadedByName || displayName,
        uploadedById: currentUser.id
      }
    ])
  }, [currentUser])

  const handleAttachmentInputChange = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    event.target.value = ''

    try {
      setAttachmentError('')
      setIsUploadingAttachment(true)
      await uploadAttachmentFile(file)
    } catch (err) {
      setAttachmentError(err instanceof Error ? err.message : 'Failed to upload attachment')
    } finally {
      setIsUploadingAttachment(false)
    }
  }, [uploadAttachmentFile])

  const handleAttachmentButtonClick = useCallback(() => {
    if (!currentUser) {
      setAttachmentError('User information is still loading. Please wait a moment.')
      return
    }
    attachmentInputRef.current?.click()
  }, [currentUser])

  const handleAttachmentDelete = useCallback((index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index))
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    // Validate required fields including subtasks titles
    const missingSubtaskTitle = subtasks.some(st => !(st.title && st.title.trim().length > 0))
    const missingDueDate = !(formData.dueDate && formData.dueDate.trim().length > 0)
    const missingAssignees = assignedTo.length === 0
    if (
      !formData.title ||
      !hasProjectSelected ||
      missingDueDate ||
      missingSubtaskTitle ||
      missingAssignees
    ) {
      setLoading(false)
      if (missingSubtaskTitle) {
        setError('Please fill in all required subtask titles')
      } else if (missingDueDate) {
        setError('Due date is required')
      } else if (missingAssignees) {
        setError('Please assign this task to at least one team member')
      } else {
        setError('Please fill in all required fields')
      }
      return
    }
    try {
      const preparedSubtasks = subtasks.map(subtask => ({
        title: subtask.title.trim(),
        description: subtask.description?.trim() || undefined,
        status: 'backlog', // Sub-tasks always created with backlog status
        isCompleted: false
      }))

      const assignedToPayload = assignedTo.map(userId => {
        const member = projectMembers.find(m => m._id.toString() === userId.toString())
        return {
          user: userId,
          firstName: member?.firstName,
          lastName: member?.lastName,
          email: member?.email
        }
      })

      const response = await fetch('/api/tasks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...formData,
          status: 'backlog',
          project: effectiveProjectId,
          assignedTo: assignedToPayload,
          estimatedHours: formData.estimatedHours ? parseFloat(formData.estimatedHours) : undefined,
          dueDate: formData.dueDate || undefined,
          labels: Array.isArray(formData.labels) ? formData.labels : [],
          subtasks: preparedSubtasks,
          story: formData.story || undefined,
          epic: formData.epic || undefined,
          attachments: attachments.map(att => ({
            name: att.name,
            url: att.url,
            size: att.size,
            type: att.type,
            uploadedAt: att.uploadedAt,
            uploadedBy: att.uploadedById
          }))
        })
      })

      // Read response body only once - you can't read it twice!
      const data = await response.json().catch(() => ({ error: 'Failed to parse response' }))
      
      if (!response.ok || !data.success) {
        const message = data.error || 'Failed to create task'
        setError(message)
        notifyError({ title: message })
        setLoading(false)
        return
      }

      notifySuccess({ title: 'Task created successfully' })
      setError('')
      onTaskCreated()

      // Reset form immediately after success
      setFormData({
        title: '',
        description: '',
        priority: 'medium',
        type: 'task',
        assignedTo: '',
        dueDate: '',
        estimatedHours: '',
        labels: [],
        story: '',
        epic: '',
        isBillable: false
      })
      setSubtasks([])
      setAssignedTo([])
      setAssigneeHourlyRates({})
      setAssigneeQuery('')
      setNewLabel('')
      if (!projectId) setSelectedProjectId('')
      setAttachments([])
      setAttachmentError('')
      onClose()

      if (!stayOnCurrentPage) {
        setTimeout(() => router.push('/tasks'), 100)
      }
    } catch (error) {
      console.error('Task creation error:', error)
      setError('Failed to create task. Please try again.')
      notifyError({ title: 'Failed to create task. Please try again.' })
      setLoading(false)
    }
  }

  useEffect(() => {
    if (error) {
      const t = setTimeout(() => setError(''), 3000)
      return () => clearTimeout(t)
    }
  }, [error])

  const attachmentListItems = useMemo(
    () =>
      attachments.map(att => ({
        name: att.name,
        url: att.url,
        size: att.size,
        type: att.type,
        uploadedAt: att.uploadedAt,
        uploadedBy: att.uploadedByName
      })),
    [attachments]
  )

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999]" onClick={(e) => {
      if (e.target === e.currentTarget) {
        onClose()
      }
    }}>
      <Card className="w-full max-w-2xl max-h-[90vh] flex flex-col bg-background m-4 sm:m-6" onClick={(e) => e.stopPropagation()}>
        <CardHeader className="flex-shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Create New Task</CardTitle>
              <CardDescription>Add a new task to this project</CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          <form onSubmit={handleSubmit} className="space-y-6" autoComplete="on" id="create-task-form">
            {!projectId && (
              <div>
                <label className="text-sm font-medium text-foreground">Project *</label>
                <Select
                  value={selectedProjectId}
                  onValueChange={(v) => {
                    setSelectedProjectId(v)
                    setAssignedTo([])
      setAssigneeHourlyRates({})
                    setAssigneeQuery('')
                    setProjectMembers([])
                    setFormData(prev => ({
                      ...prev,
                      story: '',
                      epic: '',
                      isBillable: false // Reset to unchecked when project changes
                    }))
                    setStories([])
                    setEpics([])
                    if (v) {
                      fetchProjectMembers(v)
                      fetchStories(v)
                      fetchEpics(v)
                    }
                  }}
                  onOpenChange={(open) => { if (open) setProjectQuery('') }}
                >
                  <SelectTrigger className="mt-1 w-full">
                    <SelectValue placeholder={loadingProjects ? 'Loading projects...' : 'Select project'} />
                  </SelectTrigger>
                  <SelectContent className="z-[10050] p-0 w-[var(--radix-select-trigger-width)] max-w-[var(--radix-select-trigger-width)]">
                    {loadingProjects ? (
                      <SelectItem value="loading" disabled>
                        <div className="flex items-center space-x-2 min-w-0">
                          <Loader2 className="h-4 w-4 animate-spin flex-shrink-0" />
                          <span className="truncate">Loading projects...</span>
                        </div>
                      </SelectItem>
                    ) : projects.length > 0 ? (
                      <div className="p-2">
                        <Input
                          value={projectQuery}
                          onChange={(e) => setProjectQuery(e.target.value)}
                          onKeyDown={(e) => e.stopPropagation()}
                          placeholder="Type to search projects"
                          className="mb-2"
                        />
                        <div className="max-h-56 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                          {(projects.filter(p => !projectQuery.trim() || p.name.toLowerCase().includes(projectQuery.toLowerCase()))).map((p) => (
                            <SelectItem key={p._id} value={p._id}>
                              <span className="truncate block">{p.name}</span>
                            </SelectItem>
                          ))}
                          {(projects.filter(p => !projectQuery.trim() || p.name.toLowerCase().includes(projectQuery.toLowerCase()))).length === 0 && (
                            <div className="px-2 py-1 text-sm text-muted-foreground">No matching projects</div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <SelectItem value="no-projects" disabled>No projects found</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="text-sm font-medium text-foreground">Task Title *</label>
                <Input
                  value={formData.title}
                  onChange={(e) => setFormData({...formData, title: e.target.value})}
                  placeholder="Enter task title"
                  className="mt-1"
                  required
                />
              </div>

              <div className="md:col-span-2">
                <label className="text-sm font-medium text-foreground">Description</label>
                <Textarea
                  value={formData.description}
                  onChange={(e) => setFormData({...formData, description: e.target.value})}
                  placeholder="Enter task description"
                  className="mt-1"
                  rows={3}
                />
              </div>

              <div className="md:col-span-2 space-y-2">
                <label className="text-sm font-medium text-foreground">Attachments</label>
                <div className="flex items-center gap-2 flex-wrap">
                  <input
                    ref={attachmentInputRef}
                    type="file"
                    className="hidden"
                    onChange={handleAttachmentInputChange}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleAttachmentButtonClick}
                    disabled={isUploadingAttachment || !currentUser}
                  >
                    <Paperclip className="h-4 w-4 mr-2" />
                    {isUploadingAttachment ? 'Uploading...' : 'Add Attachment'}
                  </Button>
                  {!currentUser && (
                    <span className="text-xs text-muted-foreground">Loading user info...</span>
                  )}
                </div>
                {attachmentError && (
                  <p className="text-sm text-red-600">{attachmentError}</p>
                )}
                {attachments.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No attachments added yet.</p>
                ) : (
                  <AttachmentList
                    attachments={attachmentListItems}
                    onDelete={handleAttachmentDelete}
                    canDelete={!loading}
                  />
                )}
              </div>

              <div>
                <label className="text-sm font-medium text-foreground">Priority</label>
                <Select value={formData.priority} onValueChange={(value) => setFormData({ ...formData, priority: value as TaskFormData['priority'] })}>
                  <SelectTrigger className="mt-1 w-full">
                    <SelectValue placeholder="Priority" />
                  </SelectTrigger>
                  <SelectContent className="z-[10050]">
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium text-foreground">Type</label>
                <Select value={formData.type} onValueChange={(value) => setFormData({ ...formData, type: value as TaskFormData['type'] })}>
                  <SelectTrigger className="mt-1 w-full">
                    <SelectValue placeholder="Type" />
                  </SelectTrigger>
                  <SelectContent className="z-[10050]">
                    <SelectItem value="task">Task</SelectItem>
                    <SelectItem value="bug">Bug</SelectItem>
                    <SelectItem value="feature">Feature</SelectItem>
                    <SelectItem value="improvement">Improvement</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {hasProjectSelected && (
                <>
                  <div>
                    <label className="text-sm font-medium text-foreground">User Story</label>
                    <Select 
                      value={formData.story} 
                      onValueChange={(value) => {
                        const selectedStory = stories.find(s => s._id === value)
                        setFormData({ 
                          ...formData, 
                          story: value,
                          epic: selectedStory?.epic?._id || ''
                        })
                      }}
                      onOpenChange={(open) => { if (open) setStoryQuery('') }}
                    >
                      <SelectTrigger className="mt-1 w-full">
                        <SelectValue placeholder={loadingStories ? 'Loading stories...' : 'Select a story'} />
                      </SelectTrigger>
                      <SelectContent className="z-[10050] p-0 w-[var(--radix-select-trigger-width)] max-w-[var(--radix-select-trigger-width)]">
                        <div className="p-2">
                          <Input
                            value={storyQuery}
                            onChange={(e) => setStoryQuery(e.target.value)}
                            onKeyDown={(e) => e.stopPropagation()}
                            placeholder={loadingStories ? 'Loading stories...' : 'Type to search stories'}
                            className="mb-2"
                          />
                          <div className="max-h-56 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                            {loadingStories ? (
                              <div className="flex items-center space-x-2 text-sm text-muted-foreground p-2">
                                <Loader2 className="h-4 w-4 animate-spin flex-shrink-0" />
                                <span className="truncate">Loading stories...</span>
                              </div>
                            ) : (() => {
                              const q = storyQuery.toLowerCase().trim()
                              const filtered = stories.filter(s => 
                                !q || s.title.toLowerCase().includes(q)
                              )
                              
                              if (filtered.length === 0) {
                                return (
                                  <div className="px-2 py-1 text-sm text-muted-foreground">No matching stories</div>
                                )
                              }
                              
                              return filtered.map((story) => (
                                <SelectItem key={story._id} value={story._id}>
                                  <span className="truncate block">{story.title}</span>
                                </SelectItem>
                              ))
                            })()}
                          </div>
                        </div>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-foreground">Epic</label>
                    <Select 
                      value={formData.epic} 
                      onValueChange={(value) => setFormData({ ...formData, epic: value })}
                      disabled={loadingEpics}
                      onOpenChange={(open) => { if (open) setEpicQuery('') }}
                    >
                      <SelectTrigger className="mt-1 w-full">
                        <SelectValue placeholder={loadingEpics ? 'Loading epics...' : 'Select an epic'} />
                      </SelectTrigger>
                      <SelectContent className="z-[10050] p-0 w-[var(--radix-select-trigger-width)] max-w-[var(--radix-select-trigger-width)]">
                        <div className="p-2">
                          <Input
                            value={epicQuery}
                            onChange={(e) => setEpicQuery(e.target.value)}
                            onKeyDown={(e) => e.stopPropagation()}
                            placeholder={loadingEpics ? 'Loading epics...' : 'Type to search epics'}
                            className="mb-2"
                          />
                          <div className="max-h-56 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                            {loadingEpics ? (
                              <div className="flex items-center space-x-2 text-sm text-muted-foreground p-2">
                                <Loader2 className="h-4 w-4 animate-spin flex-shrink-0" />
                                <span className="truncate">Loading epics...</span>
                              </div>
                            ) : (() => {
                              const q = epicQuery.toLowerCase().trim()
                              let availableEpics: Epic[] = []
                              
                              if (!formData.story) {
                                // No story selected, show all epics
                                availableEpics = epics
                              } else {
                                // Story selected, check if it has an epic
                                const selectedStory = stories.find(s => s._id === formData.story)
                                if (selectedStory?.epic) {
                                  // Story has an epic, show only that epic
                                  const epicExists = epics.find(e => e._id === selectedStory.epic!._id)
                                  if (epicExists) {
                                    availableEpics = [epicExists]
                                  }
                                } else {
                                  // Story selected but no epic, show all epics
                                  availableEpics = epics
                                }
                              }
                              
                              const filtered = availableEpics.filter(e => 
                                !q || e.title.toLowerCase().includes(q)
                              )
                              
                              if (filtered.length === 0) {
                                return (
                                  <div className="px-2 py-1 text-sm text-muted-foreground">No matching epics</div>
                                )
                              }
                              
                              return filtered.map((epic) => (
                                <SelectItem key={epic._id} value={epic._id}>
                                  <span className="truncate block">{epic.title}</span>
                                </SelectItem>
                              ))
                            })()}
                          </div>
                        </div>
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}

              {hasProjectSelected && (
                <div className="md:col-span-2">
                  <label className="text-sm font-medium text-foreground">Assigned To *</label>
                  <div className="space-y-2 mt-1">
                    <Select
                      value=""
                      onValueChange={(value) => {
                        if (!assignedTo.includes(value)) {
                          setAssignedTo(prev => [...prev, value])
                          setAssigneeQuery('')
                        }
                      }}
                      onOpenChange={(open) => { if (open) setAssigneeQuery(""); }}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder={loadingProjectMembers ? 'Loading members...' : 'Select team members *'} />
                      </SelectTrigger>
                      <SelectContent className="z-[10050] p-0 w-[var(--radix-select-trigger-width)] max-w-[var(--radix-select-trigger-width)]">
                        <div className="p-2">
                          <div className="relative mb-2">
                            <Input
                              value={assigneeQuery}
                              onChange={e => setAssigneeQuery(e.target.value)}
                              onKeyDown={(e) => e.stopPropagation()}
                              placeholder={loadingProjectMembers ? 'Loading members...' : 'Type to search team members'}
                              className="pr-8"
                            />
                            {assigneeQuery && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setAssigneeQuery('')
                                }}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 rounded-sm p-0.5"
                                aria-label="Clear search"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                          <div className="max-h-56 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                            {loadingProjectMembers ? (
                              <div className="flex items-center space-x-2 text-sm text-muted-foreground p-2">
                                <Loader2 className="h-4 w-4 animate-spin flex-shrink-0" />
                                <span className="truncate">Loading members...</span>
                              </div>
                            ) : projectMembers.length === 0 ? (
                              <div className="px-2 py-1 text-sm text-muted-foreground">No team members found for this project</div>
                            ) : (
                              (() => {
                                const activeMembers = projectMembers.filter(member => member.isActive !== false)
                                const q = assigneeQuery.toLowerCase().trim()
                                const filtered = activeMembers.filter(u =>
                                  !q ||
                                  `${u.firstName} ${u.lastName}`.toLowerCase().includes(q) ||
                                  u.email.toLowerCase().includes(q)
                                )

                                if (filtered.length === 0) {
                                  return (
                                    <div className="px-2 py-1 text-sm text-muted-foreground">No matching members</div>
                                  )
                                }

                                return filtered.map(user => {
                                  const isSelected = assignedTo.includes(user._id)
                                  return (
                                    <SelectItem
                                      key={user._id}
                                      value={user._id}
                                      disabled={isSelected}
                                      className={isSelected ? 'opacity-50 cursor-not-allowed' : ''}
                                    >
                                      <div className="flex items-center justify-between w-full min-w-0">
                                        <span className="truncate min-w-0">{user.firstName} {user.lastName} <span className="text-muted-foreground">({user.email})</span></span>
                                        {isSelected && (
                                          <span className="text-xs text-muted-foreground ml-2 flex-shrink-0">Selected</span>
                                        )}
                                      </div>
                                    </SelectItem>
                                  )
                                })
                              })()
                            )}
                          </div>
                        </div>
                      </SelectContent>
                    </Select>
                    {assignedTo.length > 0 && (
                      <div className="space-y-2">
                        <div className="flex flex-wrap gap-2">
                          {assignedTo.map(userId => {
                            const user = projectMembers.find(u => u._id === userId)
                            if (!user) return null
                            return (
                              <span
                                key={userId}
                                className="inline-flex items-center gap-1 text-xs bg-muted px-2 py-1 rounded"
                              >
                                <span>{user.firstName} {user.lastName}</span>
                                <button
                                  type="button"
                                  aria-label="Remove assignee"
                                  className="text-muted-foreground hover:text-foreground focus:outline-none"
                                  onClick={() => setAssignedTo(prev => prev.filter(id => id !== userId))}
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </span>
                            )
                          })}
                        </div>
                        {/* Hourly rate inputs for each assignee */}
                        {/* <div className="space-y-2">
                          <label className="text-xs font-medium text-muted-foreground">Hourly Rates (optional)</label>
                          <div className="grid gap-2">
                            {assignedTo.map(assignee => {
                              const memberData = projectMembers.find(u => u._id === assignee._id);
                              const defaultRate = memberData?.projectHourlyRate;
                              return (
                                <div key={assignee._id} className="flex items-center gap-2">
                                  <span className="text-sm min-w-0 flex-1 truncate">{assignee.firstName} {assignee.lastName}</span>
                                  <div className="flex items-center gap-1">
                                    <Input
                                      type="number"
                                      step="0.01"
                                      min="0"
                                      value={assignee.hourlyRate || ''}
                                      onChange={(e) => {
                                        const newRate = e.target.value
                                        setAssignedTo(prev => prev.map(a =>
                                          a._id === assignee._id ? { ...a, hourlyRate: newRate } : a
                                        ))
                                      }}
                                      placeholder={defaultRate ? `${defaultRate}` : 'Set rate'}
                                      className="w-20 h-7 text-xs"
                                    />
                                    <span className="text-xs text-muted-foreground">/hr</span>
                                    {defaultRate && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setAssignedTo(prev => prev.map(a =>
                                            a._id === assignee._id ? { ...a, hourlyRate: defaultRate.toString() } : a
                                          ))
                                        }}
                                        className="text-xs text-primary hover:text-primary/80"
                                        title="Use project default rate"
                                      >
                                        Use default
                                      </button>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div> */}
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div>
                <label className="text-sm font-medium text-foreground">Estimated Hours</label>
                <Input
                  type="number"
                  step="0.5"
                  value={formData.estimatedHours}
                  onChange={(e) => setFormData({...formData, estimatedHours: e.target.value})}
                  placeholder="e.g., 8"
                  className="mt-1"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-foreground">Due Date *</label>
                <Input
                  type="date"
                  value={formData.dueDate}
                  onChange={(e) => setFormData({...formData, dueDate: e.target.value})}
                  min={new Date().toISOString().split('T')[0]}
                  className="mt-1"
                  required
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <label className="text-sm font-medium text-foreground">Billable</label>
                  <p className="text-xs text-muted-foreground">Defaults from project; you can override per task.</p>
                </div>
                <input
                  type="checkbox"
                  checked={formData.isBillable}
                  onChange={(e) => setFormData(prev => ({ ...prev, isBillable: e.target.checked }))}
                />
              </div>

              <div>
                <label className="text-sm font-medium text-foreground">Labels</label>
                <div className="space-y-2">
                  <div className="flex space-x-2">
                    <Input
                      value={newLabel}
                      onChange={(e) => setNewLabel(e.target.value)}
                      placeholder="Enter label"
                      onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addLabel())}
                      maxLength={MAX_LABEL_LENGTH}
                      className="mt-1"
                    />
                    <Button type="button" onClick={addLabel} size="sm" disabled={newLabel.trim() === ''} className="mt-1">
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  {formData.labels.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {formData.labels.map((label, index) => (
                        <div 
                          key={index} 
                          className="inline-flex items-center gap-1.5 bg-muted px-3 py-1.5 rounded-md text-sm"
                        >
                          <span>{label}</span>
                          <button
                            type="button"
                            aria-label="Remove label"
                            className="text-muted-foreground hover:text-foreground focus:outline-none transition-colors"
                            onClick={() => removeLabel(index)}
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Subtasks Section */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium">Subtasks</h3>
                <Button type="button" variant="outline" size="sm" onClick={addSubtask}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Subtask
                </Button>
              </div>

              {subtasks.map((subtask, index) => (
                <div key={index} className="p-4 border rounded-lg space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium">Subtask {index + 1}</h4>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeSubtask(index)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  
                  <div>
                    <label className="text-sm font-medium text-foreground">Title *</label>
                    <Input
                      value={subtask.title}
                      onChange={(e) => updateSubtask(index, 'title', e.target.value)}
                      placeholder="Subtask title"
                      required
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium text-foreground">Description</label>
                    <Textarea
                      value={subtask.description || ''}
                      onChange={(e) => updateSubtask(index, 'description', e.target.value)}
                      placeholder="Subtask description"
                      rows={2}
                    />
                  </div>
                </div>
              ))}

              {subtasks.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <Target className="h-12 w-12 mx-auto mb-4" />
                  <p>No subtasks added yet</p>
                  <p className="text-sm">Click "Add Subtask" to create subtasks for this task</p>
                </div>
              )}
            </div>

          </form>
        </CardContent>
        <div className="flex-shrink-0 px-4 sm:px-6 pb-4 sm:pb-6 pt-3 sm:pt-4 border-t">
          <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-0 sm:space-x-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" form="create-task-form" disabled={
              loading ||
              !(formData.title && formData.title.trim().length > 0) ||
              !(projectId || (selectedProjectId && selectedProjectId.trim().length > 0)) ||
              !(formData.dueDate && formData.dueDate.trim().length > 0) ||
              assignedTo.length === 0 ||
              subtasks.some(st => !(st.title && st.title.trim().length > 0))
            }>
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Task
                </>
              )}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}
