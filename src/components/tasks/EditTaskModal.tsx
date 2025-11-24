'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/Badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Checkbox } from '@/components/ui/Checkbox'
import { 
  X, 
  Save, 
  Calendar, 
  User, 
  Target, 
  Clock,
  AlertTriangle,
  Loader2,
  Plus,
  Trash2
} from 'lucide-react'

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
  storyPoints: string
  dueDate: string
  estimatedHours: string
  labels: string
}

export default function EditTaskModal({ isOpen, onClose, task, onTaskUpdated }: EditTaskModalProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [users, setUsers] = useState<User[]>([])
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [formData, setFormData] = useState<TaskFormData>({
    title: '',
    description: '',
    status: 'backlog',
    priority: 'medium',
    type: 'task',
    assignedTo: '',
    storyPoints: '',
    dueDate: '',
    estimatedHours: '',
    labels: ''
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
        assignedTo: task.assignedTo?._id || '',
        storyPoints: task.storyPoints?.toString() || '',
        dueDate: task.dueDate ? new Date(task.dueDate).toISOString().split('T')[0] : '',
        estimatedHours: task.estimatedHours?.toString() || '',
        labels: task.labels?.join(', ') || ''
      }
      setFormData(initialData)
      setInitialFormData(initialData)
      
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
      
      fetchUsers()
      // Fetch project statuses if project is available
      if (task.project) {
        const projectId = typeof task.project === 'string' ? task.project : task.project._id
        if (projectId) {
          fetchProjectStatuses(projectId)
        }
      }
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

  const fetchUsers = async () => {
    setLoadingUsers(true)
    try {
      const response = await fetch('/api/members')
      const data = await response.json()
      
      if (data.success && data.data && Array.isArray(data.data.members)) {
        setUsers(data.data.members)
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const preparedSubtasks = subtasks.map(subtask => ({
        _id: subtask._id,
        title: subtask.title.trim(),
        description: subtask.description?.trim() || undefined,
        status: subtask.status,
        isCompleted: subtask.status === 'done' ? true : subtask.isCompleted
      }))

      const response = await fetch(`/api/tasks/${task._id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...formData,
          assignedTo: formData.assignedTo === 'unassigned' ? undefined : formData.assignedTo || undefined,
          storyPoints: formData.storyPoints ? parseInt(formData.storyPoints) : undefined,
          estimatedHours: formData.estimatedHours ? parseFloat(formData.estimatedHours) : undefined,
          dueDate: formData.dueDate || undefined,
          labels: formData.labels ? formData.labels.split(',').map(label => label.trim()) : [],
          subtasks: preparedSubtasks
        })
      })

      const data = await response.json()
      
      if (data.success) {
        // Close modal immediately for better UX
        onClose()
        // Call update callback asynchronously to not block UI
        setTimeout(() => {
          onTaskUpdated()
        }, 0)
      } else {
        setError(data.error || 'Failed to update task')
      }
    } catch (error) {
      setError('Failed to update task')
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

    // Check if form data has changed
    const formDataChanged = 
      normalizeString(formData.title) !== normalizeString(initialFormData.title) ||
      normalizeString(formData.description) !== normalizeString(initialFormData.description) ||
      formData.status !== initialFormData.status ||
      formData.priority !== initialFormData.priority ||
      formData.type !== initialFormData.type ||
      normalizeAssignedTo(formData.assignedTo) !== normalizeAssignedTo(initialFormData.assignedTo) ||
      normalizeNumber(formData.storyPoints) !== normalizeNumber(initialFormData.storyPoints) ||
      normalizeNumber(formData.estimatedHours) !== normalizeNumber(initialFormData.estimatedHours) ||
      (formData.dueDate || '') !== (initialFormData.dueDate || '') ||
      normalizeString(formData.labels) !== normalizeString(initialFormData.labels)

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
  const isButtonDisabled = loading || !formData.title.trim() || !initialFormData || !hasFormChanges

  if (!isOpen || !task) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
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
            {error && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
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

              <div>
                <label className="text-sm font-medium text-foreground">Status</label>
                <Select value={formData.status} onValueChange={(value) => setFormData({ ...formData, status: value as SubtaskStatus })}>
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
                    <SelectItem value="subtask">Subtask</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium text-foreground">Assigned To</label>
                <Select value={formData.assignedTo} onValueChange={(value) => setFormData({...formData, assignedTo: value})}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder={loadingUsers ? "Loading members..." : "Select assignee"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">Unassigned</SelectItem>
                    {loadingUsers ? (
                      <SelectItem value="loading" disabled>
                        <div className="flex items-center space-x-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span>Loading members...</span>
                        </div>
                      </SelectItem>
                    ) : (
                      Array.isArray(users) && users.length > 0 ? (
                        users.map((user) => (
                          <SelectItem key={user._id} value={user._id}>
                            {user.firstName} {user.lastName}
                          </SelectItem>
                        ))
                      ) : (
                        <SelectItem value="no-users" disabled>
                          No team members found
                        </SelectItem>
                      )
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium text-foreground">Story Points</label>
                <Input
                  type="number"
                  value={formData.storyPoints}
                  onChange={(e) => setFormData({...formData, storyPoints: e.target.value})}
                  placeholder="e.g., 5"
                  className="mt-1"
                />
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
                    <Textarea
                      value={subtask.description || ''}
                      onChange={(e) => updateSubtask(index, 'description', e.target.value)}
                      placeholder="Subtask description"
                      rows={2}
                    />
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
    </div>
  )
}
