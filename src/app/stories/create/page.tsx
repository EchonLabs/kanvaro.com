'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { MainLayout } from '@/components/layout/MainLayout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { 
  ArrowLeft,
  Save,
  Loader2,
  AlertTriangle,
  BookOpen,
  Plus,
  X
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

interface Epic {
  _id: string
  title: string
}

interface Sprint {
  _id: string
  name: string
}

export default function CreateStoryPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [authError, setAuthError] = useState('')
  const [projects, setProjects] = useState<Project[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [epics, setEpics] = useState<Epic[]>([])
  const [sprints, setSprints] = useState<Sprint[]>([])
  const [projectQuery, setProjectQuery] = useState("");
  const [assigneeQuery, setAssigneeQuery] = useState('')

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    project: '',
    epic: '',
    sprint: '',
    assignedTo: '',
    priority: 'medium',
    dueDate: '',
    estimatedHours: '',
    storyPoints: '',
    tags: '',
    acceptanceCriteria: [] as string[]
  })

  const [newCriteria, setNewCriteria] = useState('')

  const checkAuth = useCallback(async () => {
    try {
      const response = await fetch('/api/auth/me')
      
      if (response.ok) {
        setAuthError('')
        await Promise.all([fetchProjects(), fetchUsers()])
      } else if (response.status === 401) {
        const refreshResponse = await fetch('/api/auth/refresh', {
          method: 'POST'
        })
        
        if (refreshResponse.ok) {
          setAuthError('')
          await Promise.all([fetchProjects(), fetchUsers()])
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
  }, [router])

  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  const fetchProjects = async () => {
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
  }

  const fetchUsers = async () => {
    try {
      const response = await fetch('/api/members')
      const data = await response.json()

      // Align with members API shape used elsewhere (e.g., tasks create page)
      if (data.success && data.data && Array.isArray(data.data.members)) {
        setUsers(data.data.members)
      } else if (Array.isArray(data.data)) {
        // Fallback in case API returns raw array
        setUsers(data.data)
      } else {
        setUsers([])
      }
    } catch (err) {
      console.error('Failed to fetch users:', err)
      setUsers([])
    }
  }

  const fetchEpics = async (projectId: string) => {
    if (!projectId) {
      setEpics([])
      return
    }

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
    }
  }

  const fetchSprints = async (projectId: string) => {
    if (!projectId) {
      setSprints([])
      return
    }

    try {
      const response = await fetch(`/api/sprints?project=${projectId}`)
      const data = await response.json()
      if (data.success && Array.isArray(data.data)) {
        setSprints(data.data)
      } else {
        setSprints([])
      }
    } catch (err) {
      console.error('Failed to fetch sprints:', err)
      setSprints([])
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const response = await fetch('/api/stories', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ...formData,
          estimatedHours: formData.estimatedHours ? parseInt(formData.estimatedHours) : undefined,
          storyPoints: formData.storyPoints ? parseInt(formData.storyPoints) : undefined,
          tags: formData.tags ? formData.tags.split(',').map(tag => tag.trim()) : [],
          epic: formData.epic === 'none' ? undefined : formData.epic || undefined,
          sprint: formData.sprint === 'none' ? undefined : formData.sprint || undefined,
          assignedTo: formData.assignedTo === 'unassigned' ? undefined : formData.assignedTo || undefined
        })
      })

      const data = await response.json()

      if (data.success) {
        router.push('/stories?success=story-created')
      } else {
        setError(data.error || 'Failed to create story')
      }
    } catch (err) {
      setError('Failed to create story')
    } finally {
      setLoading(false)
    }
  }

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }))

    // Fetch related data when project changes
    if (field === 'project') {
      fetchEpics(value)
      fetchSprints(value)
      if (!value) {
        setFormData(prev => ({ ...prev, assignedTo: '' }))
        setAssigneeQuery('')
      }
    }
  }

  const addCriteria = () => {
    if (newCriteria.trim()) {
      setFormData(prev => ({
        ...prev,
        acceptanceCriteria: [...prev.acceptanceCriteria, newCriteria.trim()]
      }))
      setNewCriteria('')
    }
  }

  const removeCriteria = (index: number) => {
    setFormData(prev => ({
      ...prev,
      acceptanceCriteria: prev.acceptanceCriteria.filter((_, i) => i !== index)
    }))
  }

  // Add required field validation
  const isFormValid = () => {
    return (
      !!formData.title.trim() &&
      !!formData.project &&
      !!formData.dueDate
    );
  };

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
          <Button variant="ghost" onClick={() => router.push('/stories')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-foreground flex items-center space-x-2">
              <BookOpen className="h-8 w-8 text-blue-600" />
              <span>Create New Story</span>
            </h1>
            <p className="text-muted-foreground">Create a new user story for your project</p>
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
            <CardTitle>Story Details</CardTitle>
            <CardDescription>Fill in the details for your new user story</CardDescription>
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
                      placeholder="Enter story title"
                      required
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium text-foreground">Project *</label>
                    <Select
                      value={formData.project}
                      onValueChange={(value) => handleChange('project', value)}
                      onOpenChange={open => { if (open) setProjectQuery(""); }}
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
                            {projects.filter(p => !projectQuery.trim() || p.name.toLowerCase().includes(projectQuery.toLowerCase())).map((project) => (
                              <SelectItem key={project._id} value={project._id}>
                                {project.name}
                              </SelectItem>
                            ))}
                            {projects.filter(p => !projectQuery.trim() || p.name.toLowerCase().includes(projectQuery.toLowerCase())).length === 0 && (
                              <div className="px-2 py-1 text-sm text-muted-foreground">No matching projects</div>
                            )}
                          </div>
                        </div>
                      </SelectContent>
                    </Select>
                  </div>

                {formData.project && (
                  <div>
                    <label className="text-sm font-medium text-foreground">Assigned To</label>
                    <div className="mt-1 border rounded-md p-2">
                      <Input
                        value={assigneeQuery}
                        onChange={e => setAssigneeQuery(e.target.value)}
                        placeholder={'Type to search team members'}
                        className="mb-2"
                      />
                      <div className="max-h-40 overflow-y-auto space-y-1">
                        {assigneeQuery.trim() === '' ? null : (
                          (() => {
                            const q = assigneeQuery.toLowerCase();
                            const filtered = users.filter(u =>
                              `${u.firstName} ${u.lastName}`.toLowerCase().includes(q) ||
                              u.email.toLowerCase().includes(q)
                            );
                            if (filtered.length === 0) {
                              return (
                                <div className="text-sm text-muted-foreground p-2">No matching members</div>
                              )
                            }
                            return filtered.map(user => (
                              <button
                                type="button"
                                key={user._id}
                                className="w-full text-left p-1 rounded hover:bg-accent"
                                onClick={() => {
                                  setFormData(prev => ({ ...prev, assignedTo: user._id }))
                                  setAssigneeQuery('')
                                }}
                              >
                                <div className="flex items-center justify-between">
                                  <span className="text-sm">{user.firstName} {user.lastName} <span className="text-muted-foreground">({user.email})</span></span>
                                  {formData.assignedTo === user._id && (
                                    <span className="text-xs text-muted-foreground">Selected</span>
                                  )}
                                </div>
                              </button>
                            ));
                          })()
                        )}
                      </div>
                      {formData.assignedTo && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {(() => {
                            const u = users.find(x => x._id === formData.assignedTo);
                            if (!u) return null;
                            return (
                              <span className="inline-flex items-center text-xs bg-muted px-2 py-1 rounded">
                                <span className="mr-2">{u.firstName} {u.lastName}</span>
                                <button
                                  type="button"
                                  aria-label="Remove assignee"
                                  className="text-muted-foreground hover:text-foreground"
                                  onClick={() => setFormData(prev => ({ ...prev, assignedTo: '' }))}
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </span>
                            );
                          })()}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                  <div>
                    <label className="text-sm font-medium text-foreground">Epic</label>
                    <Select value={formData.epic} onValueChange={(value) => handleChange('epic', value)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select an epic" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No Epic</SelectItem>
                        {Array.isArray(epics) && epics.map((epic) => (
                          <SelectItem key={epic._id} value={epic._id}>
                            {epic.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-foreground">Sprint</label>
                    <Select value={formData.sprint} onValueChange={(value) => handleChange('sprint', value)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a sprint" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No Sprint</SelectItem>
                        {Array.isArray(sprints) && sprints.map((sprint) => (
                          <SelectItem key={sprint._id} value={sprint._id}>
                            {sprint.name}
                          </SelectItem>
                        ))}
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
                    <label className="text-sm font-medium text-foreground">Due Date *</label>
                    <Input
                      type="date"
                      value={formData.dueDate}
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

                  <div>
                    <label className="text-sm font-medium text-foreground">Story Points</label>
                    <Input
                      type="number"
                      value={formData.storyPoints}
                      onChange={(e) => handleChange('storyPoints', e.target.value)}
                      placeholder="Enter story points"
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium text-foreground">Tags</label>
                    <Input
                      value={formData.tags}
                      onChange={(e) => handleChange('tags', e.target.value)}
                      placeholder="Enter tags separated by commas"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-foreground">Description</label>
                <Textarea
                  value={formData.description}
                  onChange={(e) => handleChange('description', e.target.value)}
                  placeholder="Enter story description"
                  rows={4}
                />
              </div>

              <div>
                <label className="text-sm font-medium text-foreground">Acceptance Criteria</label>
                <div className="space-y-2">
                  <div className="flex space-x-2">
                    <Input
                      value={newCriteria}
                      onChange={(e) => setNewCriteria(e.target.value)}
                      placeholder="Enter acceptance criteria"
                      onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addCriteria())}
                    />
                    <Button type="button" onClick={addCriteria} size="sm" disabled={newCriteria.trim() === ''}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="space-y-1">
                    {formData.acceptanceCriteria.map((criteria, index) => (
                      <div key={index} className="flex items-center space-x-2">
                        <span className="text-sm">{criteria}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeCriteria(index)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex justify-end space-x-4">
                <Button type="button" variant="outline" onClick={() => router.push('/stories')}>
                  Cancel
                </Button>
                <Button type="submit" disabled={loading || !isFormValid()}>
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      Create Story
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
