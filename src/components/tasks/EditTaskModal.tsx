'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/Checkbox'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/Badge'
import { RichTextEditor } from '@/components/ui/RichTextEditor'
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip'
import { 
  X, 
  Save, 
  Calendar, 
  User, 
  Target, 
  Clock,
  Loader2,
  Plus,
  Trash2
} from 'lucide-react'
import { useNotify } from '@/lib/notify'

interface EditTaskModalProps {
  isOpen: boolean
  onClose: () => void
  task: any
  onTaskUpdated: () => void
}

interface User {
  _id: string
  firstName: string
  lastName: string
  email: string
  projectHourlyRate?: number
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

type SubtaskStatus = 'backlog' | 'todo' | 'in_progress' | 'review' | 'testing' | 'done' | 'cancelled'

interface Subtask {
  _id?: string
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

interface TaskFormData {
  title: string
  description: string
  status: SubtaskStatus
  priority: 'low' | 'medium' | 'high' | 'critical'
  type: 'task' | 'bug' | 'feature' | 'improvement' | 'subtask'
  assignedTo: string
  dueDate: string
  estimatedHours: string
  labels: string
  story: string
  epic: string
  isBillable: boolean
}

export default function EditTaskModal({ isOpen, onClose, task, onTaskUpdated }: EditTaskModalProps) {
  const { success: notifySuccess, error: notifyError } = useNotify()
  const [loading, setLoading] = useState(false)
  const [users, setUsers] = useState<User[]>([])
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [stories, setStories] = useState<Story[]>([])
  const [epics, setEpics] = useState<Epic[]>([])
  const [loadingStories, setLoadingStories] = useState(false)
  const [loadingEpics, setLoadingEpics] = useState(false)
  const [storyQuery, setStoryQuery] = useState('')
  const [epicQuery, setEpicQuery] = useState('')
  const [assignedTo, setAssignedTo] = useState<Array<{
    _id: string
    firstName: string
    lastName: string
    email: string
    hourlyRate?: string
  }>>([])
  const [assigneeHourlyRates, setAssigneeHourlyRates] = useState<Record<string, string>>({})
  const [assigneeQuery, setAssigneeQuery] = useState('')
  const [formData, setFormData] = useState<TaskFormData>({
    title: '',
    description: '',
    status: 'backlog',
    priority: 'medium',
    type: 'task',
    assignedTo: '',
    dueDate: '',
    estimatedHours: '',
    labels: '',
    story: '',
    epic: '',
    isBillable: true
  })
  const [subtasks, setSubtasks] = useState<Subtask[]>([])
  const [initialFormData, setInitialFormData] = useState<TaskFormData | null>(null)
  const [initialSubtasks, setInitialSubtasks] = useState<Subtask[]>([])
  const [availableStatuses, setAvailableStatuses] = useState<Array<{ value: SubtaskStatus; label: string }>>(SUBTASK_STATUS_OPTIONS)

  useEffect(() => {
    if (isOpen && task) {
      // Populate form with task data
      const initialData: TaskFormData = {
        title: task.title || '',
        description: task.description || '',
        status: (task.status || 'backlog') as SubtaskStatus,
        priority: task.priority || 'medium',
        type: task.type || 'task',
        assignedTo: '', // Not used anymore since we use assignedToIds array
        dueDate: task.dueDate ? new Date(task.dueDate).toISOString().split('T')[0] : '',
        estimatedHours: task.estimatedHours?.toString() || '',
        labels: task.labels?.join(', ') || '',
        story: task.story?._id || task.story || '',
        epic: task.epic?._id || task.epic || '',
        isBillable: typeof task.isBillable === 'boolean' ? task.isBillable : true
      }
      setFormData(initialData)
      setInitialFormData(initialData)
      // Set assignedTo array and hourly rates from task.assignedTo (now an array of objects)
      if (task.assignedTo && Array.isArray(task.assignedTo) && task.assignedTo.length > 0) {
        const assignees: Array<{
          _id: string
          firstName: string
          lastName: string
          email: string
          hourlyRate?: string
        }> = []
        const rates: Record<string, string> = {}

        task.assignedTo.forEach((a: any) => {
          let userId: string | undefined
          let firstName: string = ''
          let lastName: string = ''
          let email: string = ''
          let hourlyRate: any

          // New format: { user: ObjectId, firstName, lastName, email, hourlyRate }
          if (typeof a === 'object' && a?.user) {
            userId = typeof a.user === 'object' ? String(a.user._id || a.user) : String(a.user)
            firstName = a.firstName || ''
            lastName = a.lastName || ''
            email = a.email || ''
            hourlyRate = a.hourlyRate
          }
          // Legacy format: direct ObjectId
          else if (typeof a === 'string') {
            userId = a
          }
          // Legacy format: { _id: ObjectId }
          else if (typeof a === 'object' && a?._id) {
            userId = String(a._id)
            hourlyRate = a.hourlyRate
          }

          if (userId) {
            assignees.push({
              _id: userId,
              firstName,
              lastName,
              email,
              hourlyRate: hourlyRate !== undefined ? String(hourlyRate) : undefined
            })
            if (hourlyRate !== undefined) {
              rates[userId] = String(hourlyRate)
            }
          }
        })

        setAssignedTo(assignees)
        setAssigneeHourlyRates(rates)
      } else {
        setAssignedTo([])
        setAssigneeHourlyRates({})
      }
      
      // Set subtasks if they exist
      const initialSubtasksData: Subtask[] = task.subtasks && Array.isArray(task.subtasks)
        ? task.subtasks.map((subtask: any) => ({
            _id: subtask._id,
            title: subtask.title,
            description: subtask.description || '',
            status: (subtask.status || 'todo') as SubtaskStatus,
            isCompleted: typeof subtask.isCompleted === 'boolean'
              ? subtask.isCompleted
              : subtask.status === 'done'
          }))
        : []
      setSubtasks(initialSubtasksData)
      setInitialSubtasks(initialSubtasksData)
      
      // Get project ID - use task.project if available
      const getProjectId = async () => {
        let projectId: string | null = null
        
        // First, try to get project ID from task object
        if (task.project) {
          projectId = typeof task.project === 'string' ? task.project : task.project._id
        }
        
        // Fetch all data if we have a project ID
        if (projectId) {
          Promise.all([
            fetchUsers(projectId),
            fetchProjectStatuses(projectId),
            fetchStories(projectId),
            fetchEpics(projectId)
          ]).catch((error) => {
            console.error('Error fetching task edit data:', error)
          })
        } else {
          setUsers([])
          setStories([])
          setEpics([])
        }
      }
      
      getProjectId()
    }
  }, [isOpen, task])

  const fetchProjectStatuses = async (projectId?: string) => {
    if (!projectId) {
      setAvailableStatuses(SUBTASK_STATUS_OPTIONS)
      return
    }

    try {
      const response = await fetch(`/api/projects/${projectId}`)
      const data = await response.json()
      
      if (data.success && data.data?.settings?.kanbanStatuses && data.data.settings.kanbanStatuses.length > 0) {
        const statuses = data.data.settings.kanbanStatuses.map((col: any) => ({
          value: col.key as SubtaskStatus,
          label: col.title
        }))
        setAvailableStatuses(statuses)
      } else {
        setAvailableStatuses(SUBTASK_STATUS_OPTIONS)
      }
    } catch (err) {
      console.error('Failed to fetch project statuses:', err)
      setAvailableStatuses(SUBTASK_STATUS_OPTIONS)
    }
  }

  const fetchUsers = async (projectId: string) => {
    if (!projectId) {
      setUsers([])
      return
    }

    setLoadingUsers(true)
    try {
      // Fetch project data with populated team members
      const response = await fetch(`/api/projects/${projectId}`)
      const data = await response.json()

      if (response.ok && data.success && data.data) {
        const members = Array.isArray(data.data.teamMembers) ? data.data.teamMembers : []

        // Transform populated team members data
        const populatedMembers: User[] = members.map((member: any) => ({
          _id: String(member.memberId._id),
          firstName: member.memberId.firstName,
          lastName: member.memberId.lastName,
          email: member.memberId.email || '',
          projectHourlyRate: member.hourlyRate
        }))

        setUsers(populatedMembers)

        // Set billable default from project
        const billableDefault = typeof data.data.isBillableByDefault === 'boolean' ? data.data.isBillableByDefault : true
        setFormData(prev => ({ ...prev, isBillable: billableDefault }))
      } else {
        setUsers([])
      }
    } catch (error) {
      console.error('Failed to fetch users:', error)
      setUsers([])
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
      const response = await fetch(`/api/epics?project=${encodeURIComponent(projectId)}&all=true`)
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    // Validate required fields
    if (assignedTo.length === 0) {
      notifyError({ title: 'Validation Error', message: 'Please assign this task to at least one team member' })
      setLoading(false)
      return
    }

    try {
      const preparedSubtasks = subtasks.map(subtask => ({
        _id: subtask._id,
        title: subtask.title.trim(),
        description: subtask.description?.trim() || undefined,
        status: subtask.status,
        isCompleted: subtask.status === 'done' ? true : subtask.isCompleted
      }))

      // Send assignedTo as array

      const response = await fetch(`/api/tasks/${task._id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...formData,
          assignedTo: assignedTo.map(assignee => ({
            user: assignee._id,
            firstName: assignee.firstName,
            lastName: assignee.lastName,
            email: assignee.email,
            hourlyRate: assignee.hourlyRate ? parseFloat(assignee.hourlyRate) : undefined
          })),
          estimatedHours: formData.estimatedHours ? parseFloat(formData.estimatedHours) : undefined,
          dueDate: formData.dueDate || undefined,
          labels: formData.labels ? formData.labels.split(',').map(label => label.trim()) : [],
          story: formData.story || undefined,
          epic: formData.epic || undefined,
          subtasks: preparedSubtasks
        })
      })

      const data = await response.json()
      
      if (data.success) {
        notifySuccess({ title: 'Task Updated', message: 'Task updated successfully' })
        // Call update callback asynchronously to not block UI
        setTimeout(() => {
          onTaskUpdated()
        }, 0)
        onClose()
      } else {
        const message = data.error || 'Failed to update task'
        notifyError({ title: 'Failed to Update Task', message })
      }
    } catch (error) {
      notifyError({ title: 'Failed to Update Task', message: 'Failed to update task' })
    } finally {
      setLoading(false)
    }
  }

  const addSubtask = () => {
    setSubtasks([...subtasks, {
      title: '',
      description: '',
      status: 'todo',
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

  const toggleSubtaskCompletion = (index: number, checked: boolean) => {
    setSubtasks(prev => {
      const updated = [...prev]
      const current = updated[index]
      const nextStatus: SubtaskStatus = checked
        ? 'done'
        : (current.status === 'done' ? 'todo' : (current.status || 'todo'))
      updated[index] = {
        ...current,
        status: nextStatus,
        isCompleted: checked
      }
      return updated
    })
  }

  const removeSubtask = (index: number) => {
    setSubtasks(subtasks.filter((_, i) => i !== index))
  }

  const hasChanges = (): boolean => {
    // If initial data hasn't been loaded yet, no changes can be detected
    if (!initialFormData) return false

    // Normalize values for comparison
    const normalizeString = (val: string | undefined | null): string => {
      return (val || '').trim()
    }

    const normalizeNumber = (val: string | undefined | null): string => {
      return (val || '').trim()
    }

    // Normalize assignedTo: empty string and 'unassigned' are equivalent
    const normalizeAssignedTo = (val: string): string => {
      if (!val || val === 'unassigned') return ''
      return val
    }

    // Check if assignedTo have changed
    const initialAssignedTo = initialFormData?.assignedTo
      ? (task.assignedTo && Array.isArray(task.assignedTo) && task.assignedTo.length > 0
          ? task.assignedTo.map((a: any) => {
              const userId = typeof a === 'object' && a?.user ? (typeof a.user === 'object' ? a.user._id : a.user) : (a._id || a)
              const firstName = (typeof a.user === 'object' && a.user?.firstName) ? a.user.firstName : (a.firstName || '')
              const lastName = (typeof a.user === 'object' && a.user?.lastName) ? a.user.lastName : (a.lastName || '')
              const email = (typeof a.user === 'object' && a.user?.email) ? a.user.email : (a.email || '')
              return {
              _id: userId,
              firstName,
              lastName,
              email,
              hourlyRate: a.hourlyRate !== undefined ? String(a.hourlyRate) : undefined
              }
            })
          : [{
              _id: initialFormData.assignedTo,
              firstName: '',
              lastName: '',
              email: '',
              hourlyRate: undefined
            }])
      : []
    const assignedToChanged = JSON.stringify(assignedTo.sort((a: any, b: any) => a._id.localeCompare(b._id))) !== JSON.stringify(initialAssignedTo.sort((a: any, b: any) => a._id.localeCompare(b._id)))

    // Check if form data has changed
    const formDataChanged = 
      normalizeString(formData.title) !== normalizeString(initialFormData.title) ||
      normalizeString(formData.description) !== normalizeString(initialFormData.description) ||
      formData.status !== initialFormData.status ||
      formData.priority !== initialFormData.priority ||
      formData.type !== initialFormData.type ||
      assignedToChanged ||
      normalizeNumber(formData.estimatedHours) !== normalizeNumber(initialFormData.estimatedHours) ||
      (formData.dueDate || '') !== (initialFormData.dueDate || '') ||
      normalizeString(formData.labels) !== normalizeString(initialFormData.labels) ||
      (formData.story || '') !== (initialFormData.story || '') ||
      (formData.epic || '') !== (initialFormData.epic || '')

    if (formDataChanged) {
      return true
    }

    // Filter out empty new subtasks (those without _id and empty title) for comparison
    // Only count subtasks that have either an _id (existing) or a non-empty title (new but filled)
    const validCurrentSubtasks = subtasks.filter(st => {
      if (st._id) return true // Existing subtask
      return st.title.trim().length > 0 // New subtask with content
    })
    
    const validInitialSubtasks = initialSubtasks.filter(st => {
      if (st._id) return true // Existing subtask
      return st.title.trim().length > 0 // New subtask with content
    })

    // Check if subtasks have changed (length difference)
    if (validCurrentSubtasks.length !== validInitialSubtasks.length) {
      return true
    }

    // If no valid subtasks, no changes in subtasks
    if (validCurrentSubtasks.length === 0) {
      return false
    }

    // Compare each subtask by index (order matters)
    for (let i = 0; i < validCurrentSubtasks.length; i++) {
      const current = validCurrentSubtasks[i]
      const initial = validInitialSubtasks[i]
      
      if (!initial) {
        return true // New subtask added
      }
      
      // For existing subtasks with _id, verify _id matches
      if (current._id && initial._id && current._id !== initial._id) {
        return true // Different subtask at this position
      }
      
      // Check if subtask content has changed
      if (
        normalizeString(current.title) !== normalizeString(initial.title) ||
        normalizeString(current.description) !== normalizeString(initial.description) ||
        current.status !== initial.status ||
        current.isCompleted !== initial.isCompleted
      ) {
        return true
      }
    }

    return false
  }

  // Compute if there are changes and if button should be enabled
  const hasFormChanges = hasChanges()
  const isButtonDisabled = loading || !formData.title.trim() || !initialFormData || !hasFormChanges || assignedTo.length === 0

  if (!isOpen || !task) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <TooltipProvider>
        <Card className="w-full max-w-4xl max-h-[90vh] flex flex-col m-4 sm:m-6">
        <CardHeader className="flex-shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Edit Task</CardTitle>
              <CardDescription>Update task details and subtasks</CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex-1 overflow-y-auto">
          <form onSubmit={handleSubmit} className="space-y-6" id="edit-task-form">
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
                <div className="mt-1">
                  <RichTextEditor
                    value={formData.description}
                    onChange={(value) => setFormData({...formData, description: value})}
                    placeholder="Enter task description with rich formatting..."
                    disabled={loading}
                    maxLength={10000}
                    showCharCount={true}
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Maximum 10,000 characters.
                </p>
              </div>

              <div>
                <label className="text-sm font-medium text-foreground">Status</label>
                <Select value={formData.status} onValueChange={(value) => setFormData({ ...formData, status: value as SubtaskStatus })} disabled={!task?.sprint}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {availableStatuses.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium text-foreground">Priority</label>
                <Select value={formData.priority} onValueChange={(value) => setFormData({ ...formData, priority: value as TaskFormData['priority'] })}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
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
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="task">Task</SelectItem>
                    <SelectItem value="bug">Bug</SelectItem>
                    <SelectItem value="feature">Feature</SelectItem>
                    <SelectItem value="improvement">Improvement</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {task?.project && (
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
                                  <TruncateTooltip text={story.title}>
                                    <div className="truncate max-w-full">{story.title}</div>
                                  </TruncateTooltip>
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
                                  <TruncateTooltip text={epic.title}>
                                    <div className="truncate max-w-full">{epic.title}</div>
                                  </TruncateTooltip>
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

              <div className="md:col-span-2">
                <label className="text-sm font-medium text-foreground">Assigned To *</label>
                <div className="space-y-2 mt-1">
                  <Select
                    value=""
                    onValueChange={(value) => {
                      if (!assignedTo.some(assignee => assignee._id === value)) {
                        const selectedUser = users.find(u => u._id === value)
                        if (selectedUser) {
                          setAssignedTo(prev => [...prev, {
                            _id: selectedUser._id,
                            firstName: selectedUser.firstName,
                            lastName: selectedUser.lastName,
                            email: selectedUser.email,
                            hourlyRate: assigneeHourlyRates[selectedUser._id] || ''
                          }])
                          setAssigneeQuery('')
                        }
                      }
                    }}
                    onOpenChange={(open) => { if (open) setAssigneeQuery(""); }}
                  >
                    <SelectTrigger className={assignedTo.length === 0 ? 'border-destructive' : ''}>
                      <SelectValue placeholder={loadingUsers ? 'Loading members...' : 'Select team members *'} />
                    </SelectTrigger>
                    <SelectContent className="z-[10050] p-0">
                      <div className="p-2">
                        <Input
                          value={assigneeQuery}
                          onChange={e => setAssigneeQuery(e.target.value)}
                          onKeyDown={(e) => e.stopPropagation()}
                          placeholder={loadingUsers ? 'Loading members...' : 'Type to search team members'}
                          className="mb-2"
                        />
                        <div className="max-h-56 overflow-y-auto">
                          {loadingUsers ? (
                            <div className="flex items-center space-x-2 text-sm text-muted-foreground p-2">
                              <Loader2 className="h-4 w-4 animate-spin" />
                              <span>Loading members...</span>
                            </div>
                          ) : users.length === 0 ? (
                            <div className="px-2 py-1 text-sm text-muted-foreground">No team members found</div>
                          ) : (() => {
                            const q = assigneeQuery.toLowerCase().trim()
                            const filtered = users.filter(u =>
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
                              const isSelected = assignedTo.some(assignee => assignee._id === user._id)
                              return (
                                <SelectItem
                                  key={user._id}
                                  value={user._id}
                                  disabled={isSelected}
                                  className={isSelected ? 'opacity-50 cursor-not-allowed' : ''}
                                >
                                  <div className="flex items-center justify-between w-full">
                                    <span>{user.firstName} {user.lastName} <span className="text-muted-foreground">({user.email})</span></span>
                                    {isSelected && (
                                      <span className="text-xs text-muted-foreground ml-2">Selected</span>
                                    )}
                                  </div>
                                </SelectItem>
                              )
                            })
                          })()}
                        </div>
                      </div>
                    </SelectContent>
                  </Select>
                  {assignedTo.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex flex-wrap gap-2">
                        {assignedTo.map((assignee: any) => {
                           const u = users.find(x => x._id === assignee._id);
                           if (!u) return null; // Skip if user not found
                          return (
                          <Badge
                            key={assignee._id}
                            variant="secondary"
                            className="flex items-center gap-1 px-3 py-1 text-xs bg-background border"
                            title={`${u!.firstName} ${u!.lastName} (${u!.email})`}
                          >
                            <span className="truncate max-w-[150px]">{u!.firstName} {u!.lastName}</span>
                            <button
                              type="button"
                              onClick={() => setAssignedTo(prev => prev.filter(a => a._id !== assignee._id))}
                              className="ml-1 rounded-full p-0.5 hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                              aria-label={`Remove ${u!.firstName} ${u!.lastName}`}
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                          )
                        })}
                      </div>
                      {/* Hourly rate inputs for each assignee */}
                      {/* <div className="space-y-2">
                        <label className="text-xs font-medium text-muted-foreground">Hourly Rates (optional)</label>
                        <div className="grid gap-2">
                          {assignedTo.map((assignee: any) => {
                            const u = users.find(x => x._id === assignee._id);
                            if (!u) return null;
                            const defaultRate = u.projectHourlyRate;
                            return (
                              <div key={assignee._id} className="flex items-center gap-2">
                                <span className="text-sm min-w-0 flex-1 truncate">{u.firstName} {u.lastName}</span>
                                <div className="flex items-center gap-1">
                                  <Input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={assignee.hourlyRate || ''}
                                    onChange={(e) => {
                                      const newRate = e.target.value;
                                      setAssignedTo(prev => prev.map(a =>
                                        a._id === assignee._id ? { ...a, hourlyRate: newRate } : a
                                      ));
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
                                        ));
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
                <label className="text-sm font-medium text-foreground">Due Date</label>
                <Input
                  type="date"
                  value={formData.dueDate}
                  onChange={(e) => setFormData({...formData, dueDate: e.target.value})}
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
                  checked={formData.isBillable}
                  onChange={(e) => setFormData(prev => ({ ...prev, isBillable: e.target.checked }))}
                />
              </div>

              <div>
                <label className="text-sm font-medium text-foreground">Labels</label>
                <Input
                  value={formData.labels}
                  onChange={(e) => setFormData({...formData, labels: e.target.value})}
                  placeholder="e.g., frontend, urgent, design"
                  className="mt-1"
                />
                <p className="text-xs text-muted-foreground mt-1">Separate multiple labels with commas</p>
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
                  
                  <div className="grid gap-3 md:grid-cols-2">
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
                      <label className="text-sm font-medium text-foreground">Status</label>
                      <Select
                        value={subtask.status}
                        onValueChange={(value) => updateSubtask(index, 'status', value as SubtaskStatus)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {SUBTASK_STATUS_OPTIONS.map(option => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  
                  <div>
                    <label className="text-sm font-medium text-foreground">Description</label>
                    <div className="mt-1">
                      <RichTextEditor
                        value={subtask.description || ''}
                        onChange={(value) => updateSubtask(index, 'description', value)}
                        placeholder="Subtask description"
                        disabled={loading}
                        maxLength={2000}
                        showCharCount={true}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Supports rich text formatting. Maximum 2,000 characters.
                    </p>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      checked={subtask.isCompleted || subtask.status === 'done'}
                      onCheckedChange={(checked) => toggleSubtaskCompletion(index, !!checked)}
                    />
                    <span className="text-sm text-muted-foreground">
                      Mark as completed
                    </span>
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
            <Button 
              type="submit" 
              form="edit-task-form" 
              disabled={isButtonDisabled}
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Updating...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Update Task
                </>
              )}
            </Button>
          </div>
        </div>
      </Card>
      </TooltipProvider>
    </div>
  )
}

interface TruncateTooltipProps {
  text?: string | number | null
  children: React.ReactElement
}

function TruncateTooltip({ text, children }: TruncateTooltipProps) {
  const displayText = text === undefined || text === null ? '' : String(text)
  if (!displayText.trim()) {
    return children
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {children}
      </TooltipTrigger>
      <TooltipContent side="top" align="start">
        <p className="max-w-sm break-words">{displayText}</p>
      </TooltipContent>
    </Tooltip>
  )
}
