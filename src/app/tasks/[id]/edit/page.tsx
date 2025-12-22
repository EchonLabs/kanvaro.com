'use client'

import { useEffect, useState, useCallback, useMemo, useRef, ChangeEvent } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { MainLayout } from '@/components/layout/MainLayout'
import { useBreadcrumb } from '@/contexts/BreadcrumbContext'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useNotify } from '@/lib/notify'
import { Checkbox } from '@/components/ui/Checkbox'
import { AttachmentList } from '@/components/ui/AttachmentList'
import { Loader2, ArrowLeft, CheckCircle, Plus, Trash2, Target, User, Clock, Calendar, Paperclip, X } from 'lucide-react'

const STATUS_OPTIONS = [
  { value: 'backlog', label: 'backlog' },
  { value: 'todo', label: 'To Do' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'review', label: 'Review' },
  { value: 'testing', label: 'Testing' },
  { value: 'done', label: 'Done' },
  { value: 'cancelled', label: 'Cancelled' }
] as const

type TaskStatus = typeof STATUS_OPTIONS[number]['value']
type TaskPriority = 'low' | 'medium' | 'high' | 'critical'
type TaskType = 'task' | 'bug' | 'feature' | 'improvement' | 'subtask'

type SubtaskStatus = TaskStatus

interface Subtask {
  _id?: string
  title: string
  description?: string
  status: SubtaskStatus
  isCompleted: boolean
  createdAt?: string
  updatedAt?: string
}

interface User {
  _id: string
  firstName: string
  lastName: string
  email: string
  projectHourlyRate?: number
}

interface Project {
  _id: string
  name: string
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

interface TaskFormState {
  title: string
  description: string
  status: TaskStatus
  priority: TaskPriority
  type: TaskType
  project?: string
  assignedTo?: string
  dueDate?: string
  labels?: string
  estimatedHours?: number
  story?: string
  epic?: string
  isBillable?: boolean
  // storyPoints?: number
}

const mapTaskFormState = (data: any): TaskFormState => ({
  title: data?.title ?? '',
  description: data?.description ?? '',
  status: (data?.status ?? 'backlog') as TaskStatus,
  priority: (data?.priority ?? 'medium') as TaskPriority,
  type: (data?.type ?? 'task') as TaskType,
  project: data?.project?._id ?? undefined,
  assignedTo: data?.assignedTo?._id ?? undefined,
  dueDate: data?.dueDate ? new Date(data.dueDate).toISOString().split('T')[0] : undefined,
  labels: Array.isArray(data?.labels) ? data.labels.join(', ') : undefined,
  estimatedHours: typeof data?.estimatedHours === 'number' ? data.estimatedHours : undefined,
  story: data?.story?._id ?? data?.story ?? undefined,
  epic: data?.epic?._id ?? data?.epic ?? undefined,
  isBillable: typeof data?.isBillable === 'boolean' ? data.isBillable : undefined,
 // storyPoints: typeof data?.storyPoints === 'number' ? data.storyPoints : undefined
})

const mapSubtasksFromResponse = (input: any): Subtask[] => {
  if (!Array.isArray(input)) return []
  return input.map((item: any) => ({
    _id: typeof item?._id === 'string' ? item._id : undefined,
    title: item?.title ?? '',
    description: item?.description ?? '',
    status: (item?.status ?? 'todo') as SubtaskStatus,
    isCompleted: typeof item?.isCompleted === 'boolean' ? item.isCompleted : item?.status === 'done',
    createdAt: item?.createdAt,
    updatedAt: item?.updatedAt
  }))
}

const sanitizeSubtasksForPayload = (subtasks: Subtask[]) =>
  subtasks
    .filter((subtask) => subtask.title.trim().length > 0)
    .map((subtask) => ({
      _id: subtask._id,
      title: subtask.title.trim(),
      description: subtask.description?.trim() || undefined,
      status: subtask.status,
      isCompleted: subtask.status === 'done' ? true : subtask.isCompleted
    }))

const normalizeSubtasksForCompare = (subtasks: Subtask[]) =>
  sanitizeSubtasksForPayload(subtasks).map((subtask) => ({
    _id: subtask._id ?? null,
    title: subtask.title,
    description: subtask.description ?? '',
    status: subtask.status,
    isCompleted: subtask.isCompleted
  }))

interface AttachmentDraft {
  _id?: string
  name: string
  url: string
  size: number
  type: string
  uploadedAt: string
  uploadedById?: string
  uploadedByName?: string
}

interface CurrentUser {
  id: string
  firstName: string
  lastName: string
  email: string
}

const mapAttachmentsFromResponse = (input: any): AttachmentDraft[] => {
  if (!Array.isArray(input)) return []
  return input
    .filter((item: any) => typeof item?.name === 'string' && typeof item?.url === 'string')
    .map((item: any) => {
      const uploadedBy = item?.uploadedBy
      const uploadedById =
        typeof uploadedBy === 'string'
          ? uploadedBy
          : typeof uploadedBy?._id === 'string'
            ? uploadedBy._id
            : undefined

      const uploadedByName =
        typeof uploadedBy === 'object' && uploadedBy !== null
          ? `${uploadedBy.firstName || ''} ${uploadedBy.lastName || ''}`.trim() ||
            uploadedBy.email ||
            'Unknown'
          : undefined

      return {
        _id: typeof item?._id === 'string' ? item._id : undefined,
        name: item.name,
        url: item.url,
        size: typeof item.size === 'number' ? item.size : 0,
        type: typeof item.type === 'string' ? item.type : 'application/octet-stream',
        uploadedAt: item.uploadedAt ? new Date(item.uploadedAt).toISOString() : new Date().toISOString(),
        uploadedById,
        uploadedByName
      }
    })
}

const normalizeAttachmentsForCompare = (attachments: AttachmentDraft[]) =>
  attachments.map((attachment) => ({
    name: attachment.name,
    url: attachment.url,
    size: attachment.size,
    type: attachment.type,
    uploadedById: attachment.uploadedById ?? null
  }))

const mapCurrentUser = (input: any): CurrentUser | null => {
  if (!input) return null
  const id = typeof input.id === 'string' ? input.id : (typeof input._id === 'string' ? input._id : '')
  if (!id) return null
  return {
    id,
    firstName: input.firstName || '',
    lastName: input.lastName || '',
    email: input.email || ''
  }
}

const extractAssigneeObjects = (data: any): Array<{
  _id: string
  firstName: string
  lastName: string
  email: string
  hourlyRate?: string
}> => {
  const assignees: Array<{
    _id: string
    firstName: string
    lastName: string
    email: string
    hourlyRate?: string
  }> = []

  if (Array.isArray(data?.assignedTo)) {
    data.assignedTo.forEach((assignee: any) => {

      let userId: string | undefined
      let firstName: string = ''
      let lastName: string = ''
      let email: string = ''
      let hourlyRate: string | undefined

      // New format: { user: populated User object, firstName, lastName, email, hourlyRate }
      if (typeof assignee === 'object' && assignee?.user) {
        if (typeof assignee.user === 'object' && assignee.user._id) {
          // Populated user object
          userId = String(assignee.user._id)
          firstName = assignee.user.firstName || assignee.firstName || ''
          lastName = assignee.user.lastName || assignee.lastName || ''
          email = assignee.user.email || assignee.email || ''
        } else {
          // User ObjectId string
          userId = String(assignee.user)
          firstName = assignee.firstName || ''
          lastName = assignee.lastName || ''
          email = assignee.email || ''
        }
        hourlyRate = assignee.hourlyRate !== undefined ? String(assignee.hourlyRate) : undefined
      }
      // Legacy format: direct ObjectId
      else if (typeof assignee === 'string') {
        userId = assignee
      }
      // Legacy format: { _id: ObjectId }
      else if (typeof assignee === 'object' && assignee?._id) {
        userId = String(assignee._id)
        hourlyRate = assignee.hourlyRate !== undefined ? String(assignee.hourlyRate) : undefined
      }

      if (userId) {
        assignees.push({
          _id: userId,
          firstName,
          lastName,
          email,
          hourlyRate
        })
      }
    })
  }
  return assignees
}

export default function EditTaskPage() {
  const router = useRouter()
  const params = useParams()
  const taskId = params.id as string
  const { setItems } = useBreadcrumb()

  const [task, setTask] = useState<TaskFormState | null>(null)
  const [originalTask, setOriginalTask] = useState<TaskFormState | null>(null)
  const [subtasks, setSubtasks] = useState<Subtask[]>([])
  const [originalSubtasks, setOriginalSubtasks] = useState<Subtask[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [projects, setProjects] = useState<Project[]>([])
  const [loadingProjects, setLoadingProjects] = useState(false)
  const [stories, setStories] = useState<Story[]>([])
  const [epics, setEpics] = useState<Epic[]>([])
  const [loadingStories, setLoadingStories] = useState(false)
  const [loadingEpics, setLoadingEpics] = useState(false)
  const [storyQuery, setStoryQuery] = useState('')
  const [epicQuery, setEpicQuery] = useState('')
  const [projectFilterQuery, setProjectFilterQuery] = useState('')
  const [assignedToFilterQuery, setAssignedToFilterQuery] = useState('')
  const [assignedTo, setAssignedTo] = useState<Array<{
    _id: string
    firstName: string
    lastName: string
    email: string
    hourlyRate?: string
  }>>([])
  const [originalAssignedTo, setOriginalAssignedTo] = useState<Array<{
    _id: string
    firstName: string
    lastName: string
    email: string
    hourlyRate?: string
  }>>([])
  const [assigneeHourlyRates, setAssigneeHourlyRates] = useState<Record<string, string>>({})
  const [labelsInput, setLabelsInput] = useState('')
  const [attachments, setAttachments] = useState<AttachmentDraft[]>([])
  const [originalAttachments, setOriginalAttachments] = useState<AttachmentDraft[]>([])
  const [isUploadingAttachment, setIsUploadingAttachment] = useState(false)
  const attachmentInputRef = useRef<HTMLInputElement>(null)
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null)

  // Use the notification hook
  const { success: notifySuccess, error: notifyError } = useNotify()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const updateAssignees = useCallback((updater: (prev: Array<{
    _id: string
    firstName: string
    lastName: string
    email: string
    hourlyRate?: string
  }>) => Array<{
    _id: string
    firstName: string
    lastName: string
    email: string
    hourlyRate?: string
  }>) => {
    setAssignedTo(prev => {
      const next = updater(prev)
      return next
    })
  }, [])

  const fetchTask = useCallback(async () => {
    // Set breadcrumb
    setItems([
      { label: 'Tasks', href: '/tasks' },
      { label: 'Edit Task' }
    ])
    
    try {
      setLoading(true)
      const res = await fetch(`/api/tasks/${taskId}`)
      const data = await res.json()

      if (data.success) {
        const mappedTask = mapTaskFormState(data.data)
        const mappedSubtasks = mapSubtasksFromResponse(data.data?.subtasks)
        const mappedAttachments = mapAttachmentsFromResponse(data.data?.attachments)
        const initialAssignees = extractAssigneeObjects(data.data)
        const normalizedTask = {
          ...mappedTask,
          assignedTo: initialAssignees[0]?._id ?? mappedTask.assignedTo
        }

        setTask(normalizedTask)
        setOriginalTask(normalizedTask)
        setSubtasks(mappedSubtasks)
        setOriginalSubtasks(mappedSubtasks)
        setAttachments(mappedAttachments)
        setOriginalAttachments(mappedAttachments)
        setLabelsInput(Array.isArray(data.data?.labels) ? data.data.labels.join(', ') : '')
        updateAssignees(() => initialAssignees)
        setOriginalAssignedTo(initialAssignees)

        // Initialize hourly rates
        const initialRates: Record<string, string> = {}
        initialAssignees.forEach(assignee => {
          if (assignee.hourlyRate !== undefined) {
            initialRates[assignee._id] = assignee.hourlyRate
          }
        })
        setAssigneeHourlyRates(initialRates)
        // Reset filter queries
        setProjectFilterQuery('')
        setAssignedToFilterQuery('')
        fetchProjects()
        
        // Fetch team members for the project if one is set
        // On initial load: fetch team members and preserve existing assignee if valid
        if (normalizedTask.project) {
          fetchProjectTeamMembers(normalizedTask.project, normalizedTask.assignedTo)
          fetchStories(normalizedTask.project)
          fetchEpics(normalizedTask.project)
        } else {
          // If no project, clear users
          setUsers([])
          updateAssignees(() => [])
          setStories([])
          setEpics([])
        }
      } else {
        notifyError({ title: 'Failed to Load Task', message: data.error || 'Failed to load task' })
      }
    } catch (e) {
      notifyError({ title: 'Failed to Load Task', message: 'Failed to load task' })
    } finally {
      setLoading(false)
    }
  }, [taskId, updateAssignees])

  const fetchCurrentUser = useCallback(async () => {
    try {
      const response = await fetch('/api/auth/me')
      if (response.ok) {
        const payload = await response.json().catch(() => ({}))
        const userData = mapCurrentUser(payload?.user || payload)
        if (userData) {
          setCurrentUser(userData)
        }
        return
      }

      if (response.status === 401) {
        const refreshResponse = await fetch('/api/auth/refresh', { method: 'POST' })
        if (refreshResponse.ok) {
          const refreshPayload = await refreshResponse.json().catch(() => ({}))
          const userData = mapCurrentUser(refreshPayload?.user || refreshPayload)
          if (userData) {
            setCurrentUser(userData)
          }
        }
      }
    } catch (err) {
      console.error('Failed to load current user', err)
    }
  }, [])

  useEffect(() => {
    if (taskId) {
      fetchTask()
    }
  }, [taskId, fetchTask])

  useEffect(() => {
    fetchCurrentUser()
  }, [fetchCurrentUser])

  const fetchProjects = async () => {
    setLoadingProjects(true)
    try {
      const response = await fetch('/api/projects?limit=1000&page=1')
      const data = await response.json()
      
      if (data.success && Array.isArray(data.data)) {
        setProjects(data.data.map((p: any) => ({ _id: p._id, name: p.name })))
      } else {
        setProjects([])
      }
    } catch (error) {
      console.error('Failed to fetch projects:', error)
      setProjects([])
    } finally {
      setLoadingProjects(false)
    }
  }

  const fetchProjectTeamMembers = async (projectId: string, preserveAssigneeId?: string) => {
    if (!projectId) {
      setUsers([])
      updateAssignees(() => [])
      return
    }

    setLoadingUsers(true)
    try {
      const response = await fetch(`/api/projects/${projectId}`)
      const data = await response.json()

      if (!response.ok || !data.success || !data.data) {
        setUsers([])
        updateAssignees(() => [])
        return
      }

      const rawMembers = Array.isArray(data.data.teamMembers)
        ? data.data.teamMembers
        : []

      // Transform populated team members data
      const teamMembers: User[] = rawMembers
        .map((member: any) => ({
          _id: String(member.memberId._id),
          firstName: member.memberId.firstName,
          lastName: member.memberId.lastName,
          email: member.memberId.email || '',
          projectHourlyRate: member.hourlyRate
        }))
        .filter((member: User): boolean => Boolean(member._id && member.firstName && member.lastName))

      setUsers(teamMembers)

      // Set billable default from project
      const billableDefault = typeof data.data.isBillableByDefault === 'boolean' ? data.data.isBillableByDefault : true
      setTask((prev) => prev ? ({ ...prev, isBillable: billableDefault }) : prev)

      updateAssignees((prev) => {
        const valid = prev.filter(assignee => teamMembers.some((member) => String(member._id) === String(assignee._id)))
        const preserveId = preserveAssigneeId ? String(preserveAssigneeId) : undefined
        if (preserveId && teamMembers.some((member) => String(member._id) === preserveId)) {
          const preservedMember = teamMembers.find(m => String(m._id) === preserveId)
          if (preservedMember && !valid.some(v => v._id === preserveId)) {
            valid.push({
              _id: preservedMember._id,
              firstName: preservedMember.firstName,
              lastName: preservedMember.lastName,
              email: preservedMember.email,
              hourlyRate: assigneeHourlyRates[preserveId] || ''
            })
          }
        }
        return valid
      })
    } catch (error) {
      console.error('Failed to fetch project team members:', error)
      setUsers([])
      updateAssignees(() => [])
    } finally {
      setLoadingUsers(false)
    }
  }

  const fetchStories = async (projectId: string) => {
    if (!projectId) {
      setStories([])
      return
    }

    setLoadingStories(true)
    try {
      const response = await fetch(`/api/stories?projectId=${projectId}`)
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
  }

  const fetchEpics = async (projectId: string) => {
    if (!projectId) {
      setEpics([])
      return
    }

    setLoadingEpics(true)
    try {
      const response = await fetch(`/api/epics?project=${projectId}`)
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
  }

  const filteredProjectOptions = useMemo(() => {
    const query = projectFilterQuery.trim().toLowerCase()
    if (!query) return projects
    return projects.filter((project) => project.name.toLowerCase().includes(query))
  }, [projects, projectFilterQuery])

  const filteredAssignedToOptions = useMemo(() => {
    const query = assignedToFilterQuery.trim().toLowerCase()
    if (!query) return users
    return users.filter((user) =>
      `${user.firstName || ''} ${user.lastName || ''}`.toLowerCase().includes(query) ||
      (user.email && user.email.toLowerCase().includes(query))
    )
  }, [users, assignedToFilterQuery])

  const addSubtask = () => {
    setSubtasks((prev) => ([
      ...prev,
      {
        title: '',
        description: '',
        status: 'todo',
        isCompleted: false
      }
    ]))
  }

  const updateSubtask = (index: number, field: keyof Subtask, value: any) => {
    setSubtasks((prev) => {
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

  const toggleSubtaskCompletion = (index: number, checked: boolean) => {
    setSubtasks((prev) => {
      const updated = [...prev]
      const current = updated[index]
      const nextStatus: SubtaskStatus = checked
        ? 'done'
        : (current.status === 'done' ? 'todo' : current.status || 'todo')
      updated[index] = {
        ...current,
        status: nextStatus,
        isCompleted: checked
      }
      return updated
    })
  }

  const removeSubtask = (index: number) => {
    setSubtasks((prev) => prev.filter((_, i) => i !== index))
  }

  const uploadAttachmentFile = useCallback(async (file: File) => {
    if (!currentUser) {
      throw new Error('User information is still loading. Please try again.')
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

    const uploadResult = await response.json().catch(() => ({ error: 'Failed to upload attachment' }))
    if (!response.ok || !uploadResult?.success) {
      throw new Error(uploadResult.error || 'Failed to upload attachment')
    }

    const attachmentData = uploadResult.data
    setAttachments((prev) => [
      ...prev,
      {
        name: attachmentData.name,
        url: attachmentData.url,
        size: attachmentData.size,
        type: attachmentData.type,
        uploadedAt: attachmentData.uploadedAt,
        uploadedByName: attachmentData.uploadedByName || displayName,
        uploadedById: currentUser.id
      }
    ])
  }, [currentUser])

  const handleAttachmentInputChange = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    event.target.value = ''

    try {
      setIsUploadingAttachment(true)
      await uploadAttachmentFile(file)
    } catch (err) {
      notifyError({ title: 'Upload Failed', message: err instanceof Error ? err.message : 'Failed to upload attachment' })
    } finally {
      setIsUploadingAttachment(false)
    }
  }, [uploadAttachmentFile])

  const handleAttachmentButtonClick = useCallback(() => {
    if (!currentUser) {
      notifyError({ title: 'User Loading', message: 'User information is still loading. Please try again shortly.' })
      return
    }
    attachmentInputRef.current?.click()
  }, [currentUser, notifyError])

  const handleAttachmentDelete = useCallback((index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index))
  }, [])

  const handleSave = async () => {
    if (!task) return

    if (!task.project) {
      notifyError({ title: 'Validation Error', message: 'Project is required' })
      return
    }

    if (assignedTo.length === 0) {
      notifyError({ title: 'Validation Error', message: 'Please assign this task to at least one team member' })
      return
    }

    try {
      setSaving(true)
      const preparedSubtasks = sanitizeSubtasksForPayload(subtasks)
      const preparedAttachments = attachments
        .filter((attachment) => attachment.name && attachment.url)
        .map((attachment) => ({
          name: attachment.name.trim(),
          url: attachment.url.trim(),
          size: attachment.size ?? 0,
          type: attachment.type || 'application/octet-stream',
          uploadedAt: attachment.uploadedAt,
          uploadedBy: attachment.uploadedById || currentUser?.id || ''
        }))
        .filter((attachment) => attachment.uploadedBy)
      
      // Parse labels from comma-separated string
      const labels = labelsInput
        ? labelsInput.split(',').map(label => label.trim()).filter(label => label.length > 0)
        : []

      const res = await fetch(`/api/tasks/${taskId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: task.title,
          description: task.description,
          status: task.status,
          priority: task.priority,
          type: task.type,
          project: task.project || undefined,
          assignedTo: assignedTo.map(assignee => ({
            user: assignee._id,
            firstName: assignee.firstName,
            lastName: assignee.lastName,
            email: assignee.email,
            hourlyRate: assignee.hourlyRate ? parseFloat(assignee.hourlyRate) : undefined
          })),
          dueDate: task.dueDate || undefined,
          labels: labels,
          estimatedHours: task.estimatedHours || undefined,
          isBillable: task.isBillable,
        //  storyPoints: task.storyPoints || undefined,
          story: task.story || undefined,
          epic: task.epic || undefined,
          subtasks: preparedSubtasks,
          attachments: preparedAttachments
        })
      })

      const data = await res.json()

      if (data.success) {
        // Optimistically update the UI immediately without re-fetching
        // The API already returns the updated task data
        const mappedTask = mapTaskFormState(data.data)
        const mappedSubtasks = mapSubtasksFromResponse(data.data?.subtasks)
        const mappedAttachments = mapAttachmentsFromResponse(data.data?.attachments)
        const updatedAssignees = extractAssigneeObjects(data.data)

        setTask(mappedTask)
        setOriginalTask(mappedTask)
        setSubtasks(mappedSubtasks)
        setOriginalSubtasks(mappedSubtasks)
        setAttachments(mappedAttachments)
        setOriginalAttachments(mappedAttachments)
        setLabelsInput(Array.isArray(data.data?.labels) ? data.data.labels.join(', ') : '')
        updateAssignees(() => updatedAssignees)
        setOriginalAssignedTo(updatedAssignees)
        notifySuccess({ title: 'Task Updated', message: 'Task updated successfully' })
        setTimeout(() => {
          router.push('/tasks?success=Task%20updated%20successfully')
        }, 1200)
      } else {
        notifyError({ title: 'Failed to Save Task', message: data.error || 'Failed to save task' })
      }
    } catch (e) {
      notifyError({ title: 'Failed to Save Task', message: 'Failed to save task' })
    } finally {
      setSaving(false)
    }
  }

  const comparableOriginalSubtasks = useMemo(() => normalizeSubtasksForCompare(originalSubtasks), [originalSubtasks])
  const comparableCurrentSubtasks = useMemo(() => normalizeSubtasksForCompare(subtasks), [subtasks])
  const comparableOriginalAttachments = useMemo(() => normalizeAttachmentsForCompare(originalAttachments), [originalAttachments])
  const comparableCurrentAttachments = useMemo(() => normalizeAttachmentsForCompare(attachments), [attachments])
  const attachmentListItems = useMemo(() => {
    return attachments.map((attachment) => ({
      name: attachment.name,
      url: attachment.url,
      size: attachment.size,
      type: attachment.type,
      uploadedAt: attachment.uploadedAt,
      uploadedBy:
        attachment.uploadedByName ||
        (attachment.uploadedById && attachment.uploadedById === currentUser?.id
          ? `${currentUser.firstName || ''} ${currentUser.lastName || ''}`.trim() || currentUser.email || 'You'
          : 'Unknown')
    }))
  }, [attachments, currentUser])

  const isDirty = useMemo(() => {
    if (!task || !originalTask) return false
    const taskChanged = JSON.stringify(task) !== JSON.stringify(originalTask)
    const subtasksChanged = JSON.stringify(comparableCurrentSubtasks) !== JSON.stringify(comparableOriginalSubtasks)
    const attachmentsChanged = JSON.stringify(comparableCurrentAttachments) !== JSON.stringify(comparableOriginalAttachments)
    
    // Check labels separately since they're stored in a separate state
    const originalLabelsStr = Array.isArray(originalTask.labels) ? originalTask.labels.join(', ') : (originalTask.labels || '')
    const labelsChanged = labelsInput.trim() !== originalLabelsStr.trim()
    
    const assigneesChanged = JSON.stringify(assignedTo) !== JSON.stringify(originalAssignedTo)
    
    return taskChanged || subtasksChanged || labelsChanged || attachmentsChanged || assigneesChanged
  }, [
    task,
    originalTask,
    comparableCurrentSubtasks,
    comparableOriginalSubtasks,
    comparableCurrentAttachments,
    comparableOriginalAttachments,
    labelsInput,
    assignedTo,
    originalAssignedTo
  ])

  const isValid = useMemo(() => {
    if (!task) return false
    // Check all required fields
    return !!(task.title?.trim() && task.project && assignedTo.length > 0)
  }, [task, assignedTo])


  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
            <p className="text-muted-foreground">Loading task...</p>
          </div>
        </div>
      </MainLayout>
    )
  }

  if (!task) {
    return (
      <MainLayout>
        <div className="max-w-3xl mx-auto">
          <Button variant="ghost" onClick={() => router.back()} className="mb-4">
            <ArrowLeft className="h-4 w-4 mr-2" /> Back
          </Button>
        </div>
      </MainLayout>
    )
  }

  return (
    <MainLayout>
      <div className="max-w-3xl mx-auto space-y-4">
        <Button variant="ghost" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Back
        </Button>

        <Card>
          <CardHeader>
            <CardTitle>Edit Task</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4">
            <div>
                  <label className="text-sm font-medium flex items-center gap-2">
                    <Target className="h-4 w-4" />
                    Project *
                  </label>
                  <Select 
                    value={task.project || ''} 
                    onValueChange={(v) => {
                      const newProjectId = v || undefined
                      const currentAssigneeId = task?.assignedTo
                      
                      // Update project but DON'T clear assignee yet - will be validated when team members load
                      setTask((prev) => prev ? ({ ...prev, project: newProjectId, story: undefined, epic: undefined }) : prev)
                      setProjectFilterQuery('')
                      setAssignedToFilterQuery('')
                      
                      // Fetch team members for new project and preserve assignee if they're in the new team
                      if (newProjectId) {
                        // Pass current assignee ID to preserve it if valid in new project
                        fetchProjectTeamMembers(newProjectId, currentAssigneeId)
                        fetchStories(newProjectId)
                        fetchEpics(newProjectId)
                      } else {
                        setUsers([])
                        updateAssignees(() => [])
                        setStories([])
                        setEpics([])
                      }
                    }}
                    disabled={loadingProjects}
                    required
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder={loadingProjects ? "Loading projects..." : "Select project"} />
                    </SelectTrigger>
                    <SelectContent className="z-[10050] p-0">
                      <div 
                        className="p-2"
                        onPointerDown={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                      >
                        <Input
                          value={projectFilterQuery}
                          onChange={(e) => setProjectFilterQuery(e.target.value)}
                          placeholder="Search projects"
                          className="mb-2"
                          autoFocus
                          onClick={(e) => e.stopPropagation()}
                          onPointerDown={(e) => e.stopPropagation()}
                          onKeyDown={(e) => {
                            e.stopPropagation()
                            // Prevent Select from handling keyboard navigation when typing
                            if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === 'Escape') {
                              e.preventDefault()
                            }
                          }}
                          onFocus={(e) => e.stopPropagation()}
                        />
                        <div className="max-h-56 overflow-y-auto">
                          {loadingProjects ? (
                            <div className="px-2 py-1 text-xs text-muted-foreground flex items-center space-x-2">
                              <Loader2 className="h-4 w-4 animate-spin" />
                              <span>Loading projects...</span>
                            </div>
                          ) : filteredProjectOptions.length === 0 ? (
                            <div className="px-2 py-1 text-xs text-muted-foreground">No matching projects</div>
                          ) : (
                            filteredProjectOptions.map((project) => (
                              <SelectItem key={project._id} value={project._id}>
                                {project.name}
                              </SelectItem>
                            ))
                          )}
                        </div>
                      </div>
                    </SelectContent>
                  </Select>
                </div>
              <div>
                <label className="text-sm font-medium">Title</label>
                <Input
                  value={task.title}
                  onChange={(e) => setTask((prev) => prev ? ({ ...prev, title: e.target.value }) : prev)}
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Description</label>
                <Textarea
                  value={task.description}
                  onChange={(e) => setTask((prev) => prev ? ({ ...prev, description: e.target.value }) : prev)}
                  className="mt-1"
                  rows={4}
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="text-sm font-medium">Status</label>
                  <Select value={task.status} onValueChange={(v) => setTask((prev) => prev ? ({ ...prev, status: v as TaskStatus }) : prev)}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium">Priority</label>
                  <Select value={task.priority} onValueChange={(v) => setTask((prev) => prev ? ({ ...prev, priority: v as TaskPriority }) : prev)}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="critical">Critical</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium">Type</label>
                  <Select value={task.type} onValueChange={(v) => setTask((prev) => prev ? ({ ...prev, type: v as TaskType }) : prev)}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="task">Task</SelectItem>
                      <SelectItem value="bug">Bug</SelectItem>
                      <SelectItem value="feature">Feature</SelectItem>
                      <SelectItem value="improvement">Improvement</SelectItem>
                      <SelectItem value="subtask">Subtask</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                

                <div>
                  <label className="text-sm font-medium flex items-center gap-2">
                    <User className="h-4 w-4" />
                    Assigned To *
                  </label>
                  <div className="space-y-2 mt-1">
                    <Select
                      value=""
                      onValueChange={(value) => {
                        if (!assignedTo.some(assignee => assignee._id === value)) {
                          const selectedUser = users.find(u => u._id === value)
                          if (selectedUser) {
                            console.log('Selected user:', selectedUser)
                            updateAssignees(prev => [...prev, {
                              _id: selectedUser._id,
                              firstName: selectedUser.firstName,
                              lastName: selectedUser.lastName,
                              email: selectedUser.email,
                              hourlyRate: assigneeHourlyRates[selectedUser._id] || ''
                            }])
                          }
                        }
                      }}
                      disabled={loadingUsers || !task.project}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={
                          loadingUsers
                            ? 'Loading team members...'
                            : !task.project
                              ? 'Select project first'
                              : users.length === 0
                                ? 'No team members available'
                                : 'Select team members'
                        } />
                      </SelectTrigger>
                      <SelectContent className="z-[10050] p-0">
                        <div className="p-2">
                          <Input
                            value={assignedToFilterQuery}
                            onChange={(e) => setAssignedToFilterQuery(e.target.value)}
                            placeholder="Search team members"
                            className="mb-2"
                          />
                          <div className="max-h-56 overflow-y-auto">
                            {loadingUsers ? (
                              <div className="flex items-center space-x-2 text-sm text-muted-foreground p-2">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                <span>Loading members...</span>
                              </div>
                            ) : users.length === 0 ? (
                              <div className="px-2 py-1 text-xs text-muted-foreground">
                                No team members found for this project
                              </div>
                            ) : (
                              filteredAssignedToOptions.length === 0 ? (
                                <div className="px-2 py-1 text-xs text-muted-foreground">
                                  No matching team members
                                </div>
                              ) : (
                                filteredAssignedToOptions.map((member: User) => {
                                  const isSelected = assignedTo.some(assignee => assignee._id === member._id)
                                  return (
                                    <SelectItem
                                      key={member._id}
                                      value={member._id}
                                      disabled={isSelected}
                                      className={isSelected ? 'opacity-50 cursor-not-allowed' : ''}
                                    >
                                      <div className="flex items-center justify-between w-full">
                                        <span>{member.firstName} {member.lastName}</span>
                                        {member.email && (
                                          <span className="text-xs text-muted-foreground ml-2 truncate max-w-[180px]">
                                            {member.email}
                                          </span>
                                        )}
                                      </div>
                                    </SelectItem>
                                  )
                                })
                              )
                            )}
                          </div>
                        </div>
                      </SelectContent>
                    </Select>
                    {assignedTo.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {assignedTo.map((assignee) => {
                          return (
                          <span
                            key={assignee._id}
                            className="inline-flex items-center gap-1 text-xs bg-muted px-2 py-1 rounded"
                          >
                            <span>{assignee.firstName} {assignee.lastName}</span>
                            <button
                              type="button"
                              aria-label="Remove assignee"
                              className="text-muted-foreground hover:text-foreground focus:outline-none"
                              onClick={() => {
                                updateAssignees(prev => prev.filter((a) => a._id !== assignee._id))
                              }}
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </span>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {task.project && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium">User Story</label>
                    <Select 
                      value={task.story || ''} 
                      onValueChange={(value) => {
                        const selectedStory = stories.find(s => s._id === value)
                        setTask((prev) => prev ? ({ 
                          ...prev, 
                          story: value,
                          epic: selectedStory?.epic?._id || undefined
                        }) : prev)
                      }}
                      onOpenChange={(open) => { if (open) setStoryQuery('') }}
                    >
                      <SelectTrigger className="mt-1">
                        <SelectValue placeholder={loadingStories ? 'Loading stories...' : 'Select a story'} />
                      </SelectTrigger>
                      <SelectContent className="z-[10050] p-0">
                        <div className="p-2">
                          <Input
                            value={storyQuery}
                            onChange={(e) => setStoryQuery(e.target.value)}
                            onKeyDown={(e) => e.stopPropagation()}
                            placeholder={loadingStories ? 'Loading stories...' : 'Type to search stories'}
                            className="mb-2"
                          />
                          <div className="max-h-56 overflow-y-auto">
                            {loadingStories ? (
                              <div className="flex items-center space-x-2 text-sm text-muted-foreground p-2">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                <span>Loading stories...</span>
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
                                  {story.title}
                                </SelectItem>
                              ))
                            })()}
                          </div>
                        </div>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label className="text-sm font-medium">Epic</label>
                    <Select 
                      value={task.epic || ''} 
                      onValueChange={(value) => setTask((prev) => prev ? ({ ...prev, epic: value || undefined }) : prev)}
                      disabled={loadingEpics}
                      onOpenChange={(open) => { if (open) setEpicQuery('') }}
                    >
                      <SelectTrigger className="mt-1">
                        <SelectValue placeholder={loadingEpics ? 'Loading epics...' : 'Select an epic'} />
                      </SelectTrigger>
                      <SelectContent className="z-[10050] p-0">
                        <div className="p-2">
                          <Input
                            value={epicQuery}
                            onChange={(e) => setEpicQuery(e.target.value)}
                            onKeyDown={(e) => e.stopPropagation()}
                            placeholder={loadingEpics ? 'Loading epics...' : 'Type to search epics'}
                            className="mb-2"
                          />
                          <div className="max-h-56 overflow-y-auto">
                            {loadingEpics ? (
                              <div className="flex items-center space-x-2 text-sm text-muted-foreground p-2">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                <span>Loading epics...</span>
                              </div>
                            ) : (() => {
                              const q = epicQuery.toLowerCase().trim()
                              let availableEpics: Epic[] = []
                              
                              if (!task.story) {
                                // No story selected, show all epics
                                availableEpics = epics
                              } else {
                                // Story selected, check if it has an epic
                                const selectedStory = stories.find(s => s._id === task.story)
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
                                  {epic.title}
                                </SelectItem>
                              ))
                            })()}
                          </div>
                        </div>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    Estimated Hours
                  </label>
                  <Input
                    type="number"
                    step="0.5"
                    value={task.estimatedHours || ''}
                    onChange={(e) => setTask((prev) => prev ? ({ 
                      ...prev, 
                      estimatedHours: e.target.value ? parseFloat(e.target.value) : undefined 
                    }) : prev)}
                    placeholder="e.g., 8"
                    className="mt-1"
                    min="0"
                  />
                </div>

                {/* <div>
                  <label className="text-sm font-medium">Story Points</label>
                  <Input
                    type="number"
                    value={task.storyPoints || ''}
                    onChange={(e) => setTask((prev) => prev ? ({ 
                      ...prev, 
                      storyPoints: e.target.value ? parseInt(e.target.value) : undefined 
                    }) : prev)}
                    placeholder="e.g., 5"
                    className="mt-1"
                    min="0"
                  />
                </div> */}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    Due Date
                  </label>
                  <Input
                    type="date"
                    value={task.dueDate || ''}
                    onChange={(e) => setTask((prev) => prev ? ({ ...prev, dueDate: e.target.value || undefined }) : prev)}
                    className="mt-1"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-sm font-medium text-foreground">Billable</label>
                    <p className="text-xs text-muted-foreground">Override project default for this task.</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={task.isBillable || false}
                    onChange={(e) => setTask((prev) => prev ? ({ ...prev, isBillable: e.target.checked }) : prev)}
                  />
                </div>

                <div>
                  <label className="text-sm font-medium">Labels</label>
                  <Input
                    value={labelsInput}
                    onChange={(e) => setLabelsInput(e.target.value)}
                    placeholder="e.g., frontend, urgent, design"
                    className="mt-1"
                  />
                  <p className="text-xs text-muted-foreground mt-1">Separate multiple labels with commas</p>
                </div>
              </div>

              <div className="space-y-4 border-t pt-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-medium flex items-center gap-2">
                    <Paperclip className="h-4 w-4 text-muted-foreground" />
                    Attachments
                  </h3>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleAttachmentButtonClick}
                    disabled={isUploadingAttachment}
                    className="flex items-center gap-2"
                  >
                    <Plus className="h-4 w-4" />
                    Add Attachment
                  </Button>
                </div>
                <input
                  type="file"
                  ref={attachmentInputRef}
                  onChange={handleAttachmentInputChange}
                  className="hidden"
                />
                {isUploadingAttachment && (
                  <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Uploading attachment...</span>
                  </div>
                )}
                <AttachmentList
                  attachments={attachmentListItems}
                  onDelete={handleAttachmentDelete}
                  canDelete
                />
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between mt-2">
                <div>
                  <h3 className="text-lg font-medium">Subtask Details</h3>
                  <p className="text-sm text-muted-foreground">Manage subtasks linked to this task</p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={addSubtask}>
                  <Plus className="h-4 w-4 mr-2" /> Add Subtask
                </Button>
              </div>

              {subtasks.length === 0 && (
                <div className="text-center py-10 text-muted-foreground border rounded-lg">
                  <p className="font-medium">No subtasks yet</p>
                  <p className="text-sm">Use the button above to add a new subtask.</p>
                </div>
              )}

              {subtasks.map((subtask, index) => (
                <div key={subtask._id || index} className="p-4 border rounded-lg space-y-3">
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

                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <label className="text-sm font-medium">Title *</label>
                      <Input
                        value={subtask.title}
                        onChange={(e) => updateSubtask(index, 'title', e.target.value)}
                        placeholder="Subtask title"
                        required
                      />
                    </div>

                    <div>
                      <label className="text-sm font-medium">Status</label>
                      <Select
                        value={subtask.status}
                        onValueChange={(value) => updateSubtask(index, 'status', value as SubtaskStatus)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="z-[10050]">
                          {STATUS_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      checked={subtask.isCompleted || subtask.status === 'done'}
                      onCheckedChange={(checked) => toggleSubtaskCompletion(index, !!checked)}
                    />
                    <span className="text-sm text-muted-foreground">Mark as completed</span>
                  </div>

                  <div>
                    <label className="text-sm font-medium">Description</label>
                    <Textarea
                      value={subtask.description || ''}
                      onChange={(e) => updateSubtask(index, 'description', e.target.value)}
                      placeholder="Subtask description"
                      rows={2}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end space-x-2 pt-2">
              <Button variant="outline" onClick={() => router.push('/tasks')}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving || !isDirty || !isValid}>
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...
                  </>
                ) : 'Save Changes'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  )
}
