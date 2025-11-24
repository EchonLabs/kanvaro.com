'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { MainLayout } from '@/components/layout/MainLayout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Checkbox } from '@/components/ui/Checkbox'
import { 
  ArrowLeft,
  Save,
  Loader2,
  AlertTriangle,
  Target,
  Plus,
  X,
  Trash2
} from 'lucide-react'

interface Project {
  _id: string
  name: string
}

interface User {
  _id: string
  firstName: string
  lastName: string
  email: string
}

interface Story {
  _id: string
  title: string
  description: string
  status: 'todo' | 'in_progress' | 'review' | 'testing' | 'done' | 'cancelled'
  priority: 'low' | 'medium' | 'high' | 'critical'
  project: {
    _id: string
    name: string
  }
  epic?: {
    _id: string
    name: string
  }
  sprint?: {
    _id: string
    name: string
  }
  assignedTo?: {
    firstName: string
    lastName: string
    email: string
  }
  createdBy: {
    firstName: string
    lastName: string
    email: string
  }
  storyPoints?: number
  dueDate?: string
  estimatedHours?: number
  acceptanceCriteria: string[]
  tags: string[]
  createdAt: string
  updatedAt: string
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

export default function CreateTaskPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [authError, setAuthError] = useState('')
  const [projects, setProjects] = useState<Project[]>([])
  const [projectMembers, setProjectMembers] = useState<User[]>([])
  const [loadingProjectMembers, setLoadingProjectMembers] = useState(false)
  const [stories, setStories] = useState<Story[]>([])
  const today = new Date().toISOString().split('T')[0]
  const [projectQuery, setProjectQuery] = useState("");
  const [assignedToIds, setAssignedToIds] = useState<string[]>([]);
  const [assigneeQuery, setAssigneeQuery] = useState('');
  const [newLabel, setNewLabel] = useState('')
  const [subtasks, setSubtasks] = useState<Subtask[]>([])

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    displayId: '',
    project: '',
    story: '',
    parentTask: '',
    assignedTo: '',
    priority: 'medium',
    type: 'task',
    dueDate: '',
    estimatedHours: '',
    labels: [] as string[]
  })

  const fetchProjects = useCallback(async () => {
    try {
      const response = await fetch('/api/projects')
      const data = await response.json()

      if (data.success && Array.isArray(data.data)) {
        setProjects(data.data)
      } else {
        setProjects([])
      }
    } catch (err) {
      console.error('Failed to fetch projects:', err)
      setProjects([])
    }
  }, [])

  const checkAuth = useCallback(async () => {
    try {
      const response = await fetch('/api/auth/me')
      
      if (response.ok) {
        setAuthError('')
        await fetchProjects()
      } else if (response.status === 401) {
        const refreshResponse = await fetch('/api/auth/refresh', {
          method: 'POST'
        })
        
        if (refreshResponse.ok) {
          setAuthError('')
          await fetchProjects()
        } else {
          setAuthError('Session expired')
          setTimeout(() => {
            router.push('/login')
          }, 2000)
        }
      } else {
        router.push('/login')
      }
    } catch (error) {
      console.error('Auth check failed:', error)
      setAuthError('Authentication failed')
      setTimeout(() => {
        router.push('/login')
      }, 2000)
    }
  }, [router, fetchProjects])

  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  const fetchStories = useCallback(async (projectId: string) => {
    if (!projectId) {
      setStories([])
      return
    }

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
    }
  }, [])

  const fetchProjectMembers = useCallback(async (projectId: string) => {
    if (!projectId) {
      setProjectMembers([])
      return
    }

    setLoadingProjectMembers(true)
    try {
      const response = await fetch(`/api/projects/${projectId}`)
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      // Prevent past due dates
      if (formData.dueDate && formData.dueDate < today) {
        setError('Due date cannot be in the past')
        setLoading(false)
        return
      }

      // Validate required fields before submitting
      const missingSubtaskTitle = subtasks.some(st => !(st.title && st.title.trim().length > 0))
      if (!formData.title.trim() || !formData.project || !formData.dueDate) {
        setError('Please fill in all required fields')
        setLoading(false)
        return
      }

      if (assignedToIds.length === 0) {
        setError('Please assign this task to at least one user')
        setLoading(false)
        return
      }

      if (missingSubtaskTitle) {
        setError('Please fill in all required subtask titles')
        setLoading(false)
        return
      }

      const preparedSubtasks = subtasks.map(subtask => ({
        title: subtask.title.trim(),
        description: subtask.description?.trim() || undefined,
        status: 'backlog', // Sub-tasks always created with backlog status
        isCompleted: false
      }))

      const response = await fetch('/api/tasks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          title: formData.title.trim(),
          description: formData.description?.trim() || undefined,
          displayId: formData.displayId?.trim() || undefined,
          project: formData.project,
          story: formData.story === 'none' ? undefined : formData.story || undefined,
          parentTask: formData.parentTask || undefined,
          assignedTo: assignedToIds.length === 1 ? assignedToIds[0] : assignedToIds.length > 0 ? assignedToIds[0] : undefined,
          priority: formData.priority,
          type: formData.type,
          status: 'backlog',
          dueDate: formData.dueDate,
          estimatedHours: formData.estimatedHours ? parseInt(formData.estimatedHours) : undefined,
          labels: Array.isArray(formData.labels) ? formData.labels : [],
          subtasks: preparedSubtasks
        })
      })

      // Read response body only once - you can't read it twice!
      const data = await response.json().catch(() => ({ error: 'Failed to parse response' }))

      if (!response.ok) {
        setError(data.error || 'Failed to create task')
        setLoading(false)
        return
      }

      if (data.success) {
        router.push('/tasks')
      } else {
        setError(data.error || 'Failed to create task')
        setLoading(false)
      }
    } catch (err) {
      console.error('Task creation error:', err)
      setError('Failed to create task. Please try again.')
      setLoading(false)
    }
  }

  const handleChange = useCallback((field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }))

    if (field === 'project') {
      setAssignedToIds([])
      setAssigneeQuery('')
      setProjectMembers([])
      fetchStories(value)
      fetchProjectMembers(value)
    }
  }, [fetchStories, fetchProjectMembers])

  const addLabel = () => {
    if (newLabel.trim()) {
      setFormData(prev => ({
        ...prev,
        labels: [...prev.labels, newLabel.trim()]
      }))
      setNewLabel('')
    }
  }

  const removeLabel = (index: number) => {
    setFormData(prev => ({
      ...prev,
      labels: prev.labels.filter((_, i) => i !== index)
    }))
  }

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

  // Memoize filtered projects to avoid recalculating on every render
  const filteredProjects = useMemo(() => {
    if (!projectQuery.trim()) return projects
    const q = projectQuery.toLowerCase()
    return projects.filter(p => p.name.toLowerCase().includes(q))
  }, [projects, projectQuery])

  // Memoize filtered project members to avoid recalculating on every render
  const filteredProjectMembers = useMemo(() => {
    if (!assigneeQuery.trim()) return projectMembers
    const q = assigneeQuery.toLowerCase().trim()
    return projectMembers.filter(u =>
      `${u.firstName} ${u.lastName}`.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q)
    )
  }, [projectMembers, assigneeQuery])

  // Required field validation (only fields marked with *)
  const isFormValid = useMemo(() => {
    return (
      !!formData.title.trim() &&
      !!formData.project &&
      !!formData.dueDate &&
      assignedToIds.length > 0 &&
      !subtasks.some(st => !(st.title && st.title.trim().length > 0))
    )
  }, [formData.title, formData.project, formData.dueDate, assignedToIds.length, subtasks])

  if (authError) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <p className="text-destructive mb-4">{authError}</p>
            <p className="text-muted-foreground">Redirecting to login...</p>
          </div>
        </div>
      </MainLayout>
    )
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex items-center space-x-4">
          <Button variant="ghost" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-foreground flex items-center space-x-2">
              <Target className="h-8 w-8 text-green-600" />
              <span>Create New Task</span>
            </h1>
            <p className="text-muted-foreground">Create a new task for your project</p>
          </div>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Task Details</CardTitle>
            <CardDescription>Fill in the details for your new task</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-foreground">Title *</label>
                    <Input
                      value={formData.title}
                      onChange={(e) => handleChange('title', e.target.value)}
                      placeholder="Enter task title"
                      required
                    />
                  </div>

                  {/* <div>
                    <label className="text-sm font-medium text-foreground">Task ID</label>
                    <Input
                      value={formData.displayId}
                      onChange={(e) => handleChange('displayId', e.target.value)}
                      placeholder="e.g. 3.2"
                    />
                  </div> */}

                  <div>
                    <label className="text-sm font-medium text-foreground">Project *</label>
                    <Select
                      value={formData.project}
                      onValueChange={(value) => handleChange('project', value)}
                      onOpenChange={open => { if(open) setProjectQuery(""); }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select a project" />
                      </SelectTrigger>
                      <SelectContent className="z-[10050] p-0">
                        <div className="p-2">
                          <Input
                            value={projectQuery}
                            onChange={e => setProjectQuery(e.target.value)}
                            placeholder="Type to search projects"
                            className="mb-2"
                          />
                          <div className="max-h-56 overflow-y-auto">
                            {filteredProjects.length > 0 ? (
                              filteredProjects.map((project) => (
                                <SelectItem key={project._id} value={project._id}>
                                  {project.name}
                                </SelectItem>
                              ))
                            ) : (
                              <div className="px-2 py-1 text-sm text-muted-foreground">No matching projects</div>
                            )}
                          </div>
                        </div>
                      </SelectContent>
                    </Select>
                  </div>

                  {formData.project && (
                    <div>
                      <label className="text-sm font-medium text-foreground">Assigned To *</label>
                      <div className="space-y-2">
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
                            <SelectValue placeholder={loadingProjectMembers ? 'Loading members...' : 'Select a team member'} />
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
                                    <SelectItem value="__unassigned">
                                      Unassigned
                                    </SelectItem>
                                    <div className="px-2 py-1 text-sm text-muted-foreground">No team members found for this project</div>
                                  </>
                                ) : filteredProjectMembers.length > 0 ? (
                                  filteredProjectMembers.map(user => {
                                    const isSelected = assignedToIds.includes(user._id);
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
                                    );
                                  })
                                ) : (
                                  <div className="px-2 py-1 text-sm text-muted-foreground">No matching members</div>
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
                    <label className="text-sm font-medium text-foreground">Type</label>
                    <Select value={formData.type} onValueChange={(value) => handleChange('type', value)}>
                      <SelectTrigger>
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
                    <label className="text-sm font-medium text-foreground">Priority</label>
                    <Select value={formData.priority} onValueChange={(value) => handleChange('priority', value)}>
                      <SelectTrigger>
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
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-foreground">User Story</label>
                    <Select value={formData.story} onValueChange={(value) => handleChange('story', value)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a story" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No Story</SelectItem>
                        {Array.isArray(stories) && stories.map((story) => (
                          <SelectItem key={story._id} value={story._id}>
                            {story.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-foreground">Due Date *</label>
                    <Input
                      type="date"
                      value={formData.dueDate}
                  min={today}
                      onChange={(e) => handleChange('dueDate', e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium text-foreground">Estimated Hours</label>
                    <Input
                      type="number"
                      value={formData.estimatedHours}
                      onChange={(e) => handleChange('estimatedHours', e.target.value)}
                      placeholder="Enter estimated hours"
                    />
                  </div>

                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-foreground">Description</label>
                <Textarea
                  value={formData.description}
                  onChange={(e) => handleChange('description', e.target.value)}
                  placeholder="Enter task description"
                  rows={4}
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
                    />
                    <Button type="button" onClick={addLabel} size="sm" disabled={newLabel.trim() === ''}>
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

              <div className="flex justify-end space-x-4">
                <Button type="button" variant="outline" onClick={() => router.back()}>
                  Cancel
                </Button>
                <Button type="submit" disabled={loading || !isFormValid}>
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      Create Task
                    </>
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  )
}
