'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
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
  Plus, 
  Calendar, 
  User, 
  Target, 
  Clock,
  AlertTriangle,
  Loader2,
  Trash2
} from 'lucide-react'
import { Check } from 'lucide-react'

interface CreateTaskModalProps {
  isOpen: boolean
  onClose: () => void
  projectId: string
  onTaskCreated: () => void
  defaultStatus?: string
  availableStatuses?: Array<{ key: string; title: string }>
}

interface User {
  _id: string
  firstName: string
  lastName: string
  email: string
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

interface TaskFormData {
  title: string
  description: string
  priority: 'low' | 'medium' | 'high' | 'critical'
  type: 'task' | 'bug' | 'feature' | 'improvement' | 'subtask'
  assignedTo: string
  storyPoints: string
  dueDate: string
  estimatedHours: string
  labels: string
}

export default function CreateTaskModal({
  isOpen,
  onClose,
  projectId,
  onTaskCreated,
  defaultStatus: _defaultStatus,
  availableStatuses: _availableStatuses
}: CreateTaskModalProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [projectMembers, setProjectMembers] = useState<User[]>([])
  const [loadingProjectMembers, setLoadingProjectMembers] = useState(false)
  const [projects, setProjects] = useState<Array<{ _id: string; name: string }>>([])
  const [loadingProjects, setLoadingProjects] = useState(false)
  const [selectedProjectId, setSelectedProjectId] = useState<string>('')
  const [projectQuery, setProjectQuery] = useState('')
  const [subtasks, setSubtasks] = useState<Subtask[]>([])
  const [assignedToIds, setAssignedToIds] = useState<string[]>([])
  const [assigneeQuery, setAssigneeQuery] = useState('')
  const [formData, setFormData] = useState<TaskFormData>({
    title: '',
    description: '',
    priority: 'medium',
    type: 'task',
    assignedTo: '',
    storyPoints: '',
    dueDate: '',
    estimatedHours: '',
    labels: ''
  })

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
        const members = Array.isArray(data.data.teamMembers) ? data.data.teamMembers : []
        setProjectMembers(members)
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

  // Fetch project members when modal opens or project selection changes
  useEffect(() => {
    if (!isOpen) return

    if (projectId) {
      fetchProjectMembers(projectId)
    } else if (selectedProjectId) {
      fetchProjectMembers(selectedProjectId)
    } else {
      setProjectMembers([])
    }

    if (!projectId) {
      fetchProjects()
    }
  }, [isOpen, projectId, selectedProjectId, fetchProjectMembers])

  // Reset form state whenever modal closes so it opens clean next time
  useEffect(() => {
    if (!isOpen) {
      setError('')
      setSuccess('')
      setFormData({
        title: '',
        description: '',
        priority: 'medium',
        type: 'task',
        assignedTo: '',
        storyPoints: '',
        dueDate: '',
        estimatedHours: '',
        labels: ''
      })
      setSubtasks([])
      setAssignedToIds([])
      setAssigneeQuery('')
      setProjectMembers([])
      setLoadingProjectMembers(false)
      if (!projectId) setSelectedProjectId('')
    }
  }, [isOpen, projectId])


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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setSuccess('')
    // Validate required fields including subtasks titles
    const missingSubtaskTitle = subtasks.some(st => !(st.title && st.title.trim().length > 0))
    const missingDueDate = !(formData.dueDate && formData.dueDate.trim().length > 0)
    const missingAssignees = assignedToIds.length === 0
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
        status: subtask.status,
        isCompleted: subtask.status === 'done' ? true : subtask.isCompleted
      }))

      const response = await fetch('/api/tasks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...formData,
          status: 'backlog',
          project: effectiveProjectId,
          assignedTo: assignedToIds.length === 1 ? assignedToIds[0] : undefined,
          assignees: assignedToIds.length > 1 ? assignedToIds : undefined,
          storyPoints: formData.storyPoints ? parseInt(formData.storyPoints) : undefined,
          estimatedHours: formData.estimatedHours ? parseFloat(formData.estimatedHours) : undefined,
          dueDate: formData.dueDate || undefined,
          labels: formData.labels ? formData.labels.split(',').map(label => label.trim()) : [],
          subtasks: preparedSubtasks
        })
      })

      const data = await response.json()
      
      if (data.success) {
        onTaskCreated()
        const newId = data?.data?._id
        onClose()
        setTimeout(() => {
          if (newId) {
            router.push(`/tasks/${newId}`)
          }
        }, 300)
        // Reset form
        setFormData({
          title: '',
          description: '',
          priority: 'medium',
          type: 'task',
          assignedTo: '',
          storyPoints: '',
          dueDate: '',
          estimatedHours: '',
          labels: ''
        })
        setSubtasks([])
        setAssignedToIds([])
        setAssigneeQuery('')
        if (!projectId) setSelectedProjectId('')
      } else {
        onClose()
      }
    } catch (error) {
      onClose()
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (success) {
      const t = setTimeout(() => setSuccess(''), 2500)
      return () => clearTimeout(t)
    }
  }, [success])

  useEffect(() => {
    if (error) {
      const t = setTimeout(() => setError(''), 3000)
      return () => clearTimeout(t)
    }
  }, [error])

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
        <CardContent className="flex-1 overflow-y-auto">
          <form onSubmit={handleSubmit} className="space-y-6" autoComplete="on" id="create-task-form">
            {success && (
              <Alert variant="success">
                <AlertDescription>{success}</AlertDescription>
              </Alert>
            )}
            {error && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {!projectId && (
              <div>
                <label className="text-sm font-medium text-foreground">Project *</label>
                <Select
                  value={selectedProjectId}
                  onValueChange={(v) => {
                    setSelectedProjectId(v)
                    setAssignedToIds([])
                    setAssigneeQuery('')
                    setProjectMembers([])
                    fetchProjectMembers(v)
                  }}
                  onOpenChange={(open) => { if (open) setProjectQuery('') }}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder={loadingProjects ? 'Loading projects...' : 'Select project'} />
                  </SelectTrigger>
                  <SelectContent className="z-[10050] p-0">
                    {loadingProjects ? (
                      <SelectItem value="loading" disabled>
                        <div className="flex items-center space-x-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span>Loading projects...</span>
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
                        <div className="max-h-56 overflow-y-auto">
                          {(projects.filter(p => !projectQuery.trim() || p.name.toLowerCase().includes(projectQuery.toLowerCase()))).map((p) => (
                            <SelectItem key={p._id} value={p._id}>{p.name}</SelectItem>
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
                    <SelectItem value="subtask">Subtask</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {hasProjectSelected && (
                <div className="md:col-span-2">
                  <label className="text-sm font-medium text-foreground">Assigned To *</label>
                  <div className="space-y-2 mt-1">
                    <Select
                      value=""
                      onValueChange={(value) => {
                        if (value === '__unassigned') {
                          setAssignedToIds([])
                          return
                        }
                        if (!assignedToIds.includes(value)) {
                          setAssignedToIds(prev => [...prev, value])
                        }
                      }}
                      onOpenChange={(open) => { if (open) setAssigneeQuery(""); }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={loadingProjectMembers ? 'Loading members...' : 'Select team members'} />
                      </SelectTrigger>
                      <SelectContent className="z-[10050] p-0">
                        <div className="p-2">
                          <Input
                            value={assigneeQuery}
                            onChange={e => setAssigneeQuery(e.target.value)}
                            onKeyDown={(e) => e.stopPropagation()}
                            placeholder={loadingProjectMembers ? 'Loading members...' : 'Type to search team members'}
                            className="mb-2"
                          />
                          <div className="max-h-56 overflow-y-auto">
                            {loadingProjectMembers ? (
                              <div className="flex items-center space-x-2 text-sm text-muted-foreground p-2">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                <span>Loading members...</span>
                              </div>
                            ) : projectMembers.length === 0 ? (
                              <>
                                <SelectItem value="__unassigned">Unassigned</SelectItem>
                                <div className="px-2 py-1 text-sm text-muted-foreground">No team members found for this project</div>
                              </>
                            ) : (
                              (() => {
                                const q = assigneeQuery.toLowerCase().trim()
                                const filtered = projectMembers.filter(u =>
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
                                  const isSelected = assignedToIds.includes(user._id)
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
                              })()
                            )}
                          </div>
                        </div>
                      </SelectContent>
                    </Select>
                    {assignedToIds.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {assignedToIds.map(id => {
                          const u = projectMembers.find(x => x._id === id);
                          if (!u) return null;
                          return (
                            <span 
                              key={id} 
                              className="inline-flex items-center gap-1 text-xs bg-muted px-2 py-1 rounded"
                            >
                              <span>{u.firstName} {u.lastName}</span>
                              <button
                                type="button"
                                aria-label="Remove assignee"
                                className="text-muted-foreground hover:text-foreground focus:outline-none"
                                onClick={() => setAssignedToIds(prev => prev.filter(x => x !== id))}
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}

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
                <label className="text-sm font-medium text-foreground">Due Date *</label>
                <Input
                  type="date"
                  value={formData.dueDate}
                  onChange={(e) => setFormData({...formData, dueDate: e.target.value})}
                  className="mt-1"
                  required
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
                        <SelectContent className="z-[10050]">
                          {SUBTASK_STATUS_OPTIONS.map(option => (
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
                    <span className="text-sm text-muted-foreground">
                      Mark as completed
                    </span>
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
      {(success || error) && (
        <div className="fixed bottom-6 right-6 z-[10000]">
          <div
            className={`flex items-center space-x-2 rounded-md px-4 py-3 shadow-lg ${success ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}
            role="status"
            aria-live="polite"
          >
            {success ? <Check className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
            <span className="text-sm font-medium">{success || error}</span>
          </div>
        </div>
      )}
    </div>
  )
}
