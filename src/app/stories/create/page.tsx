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
  const [epics, setEpics] = useState<Epic[]>([])
  const [sprints, setSprints] = useState<Sprint[]>([])
  const [projectQuery, setProjectQuery] = useState('')
  const [epicQuery, setEpicQuery] = useState('')
  const [sprintQuery, setSprintQuery] = useState('')

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    project: '',
    epic: '',
    sprint: '',
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
        // If epics are loaded and current selection is "none", clear it
        if (formData.epic === 'none' && data.data.length > 0) {
          setFormData(prev => ({ ...prev, epic: '' }))
        }
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
          sprint: formData.sprint === 'none' ? undefined : formData.sprint || undefined
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
    if (field === 'project') {
      fetchEpics(value)
      fetchSprints(value)
      setFormData(prev => ({
        ...prev,
        project: value,
      }))
      return
    }

    setFormData(prev => ({
      ...prev,
      [field]: value
    }))
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
      <div className="space-y-8 sm:space-y-10 overflow-x-hidden">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <Button variant="ghost" onClick={() => router.push('/stories')} className="w-full sm:w-auto">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground flex items-center space-x-2">
              <BookOpen className="h-6 w-6 sm:h-8 sm:w-8 text-blue-600 flex-shrink-0" />
              <span className="truncate">Create New Story</span>
            </h1>
            <p className="text-sm sm:text-base text-muted-foreground">Create a new user story for your project</p>
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
                            onKeyDown={e => e.stopPropagation()}
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
                    <label className="text-sm font-medium text-foreground">Epic</label>
                    <Select
                      value={formData.epic}
                      onValueChange={(value) => handleChange('epic', value)}
                      onOpenChange={open => {
                        if (open) setEpicQuery('')
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select an epic" />
                      </SelectTrigger>
                      <SelectContent className="z-[10050] p-0">
                        {Array.isArray(epics) && epics.length > 0 ? (
                          <div className="p-2">
                            <Input
                              value={epicQuery}
                              onChange={e => setEpicQuery(e.target.value)}
                              placeholder="Type to search epics"
                              className="mb-2"
                              onKeyDown={e => e.stopPropagation()}
                            />
                            <div className="max-h-56 overflow-y-auto">
                              {epics
                                .filter(epic =>
                                  !epicQuery.trim() ||
                                  epic.title.toLowerCase().includes(epicQuery.toLowerCase())
                                )
                                .map(epic => (
                                  <SelectItem key={epic._id} value={epic._id}>
                                    {epic.title}
                                  </SelectItem>
                                ))}
                              {epics.filter(epic =>
                                !epicQuery.trim() ||
                                epic.title.toLowerCase().includes(epicQuery.toLowerCase())
                              ).length === 0 && (
                                <div className="px-2 py-1 text-sm text-muted-foreground">
                                  No matching epics
                                </div>
                              )}
                            </div>
                          </div>
                        ) : (
                          <SelectItem value="none">No Epic</SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-foreground">Sprint</label>
                    <Select
                      value={formData.sprint}
                      onValueChange={(value) => handleChange('sprint', value)}
                      onOpenChange={open => {
                        if (open) setSprintQuery('')
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select a sprint" />
                      </SelectTrigger>
                      <SelectContent className="z-[10050] p-0">
                        {Array.isArray(sprints) && sprints.length > 0 ? (
                          <div className="p-2">
                            <Input
                              value={sprintQuery}
                              onChange={e => setSprintQuery(e.target.value)}
                              placeholder="Type to search sprints"
                              className="mb-2"
                              onKeyDown={e => e.stopPropagation()}
                            />
                            <div className="max-h-56 overflow-y-auto">
                              {sprints
                                .filter(sprint =>
                                  !sprintQuery.trim() ||
                                  sprint.name.toLowerCase().includes(sprintQuery.toLowerCase())
                                )
                                .map(sprint => (
                                  <SelectItem key={sprint._id} value={sprint._id}>
                                    {sprint.name}
                                  </SelectItem>
                                ))}
                              {sprints.filter(sprint =>
                                !sprintQuery.trim() ||
                                sprint.name.toLowerCase().includes(sprintQuery.toLowerCase())
                              ).length === 0 && (
                                <div className="px-2 py-1 text-sm text-muted-foreground">
                                  No matching sprints
                                </div>
                              )}
                            </div>
                          </div>
                        ) : (
                          <SelectItem value="none">No Sprint</SelectItem>
                        )}
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
                    <Select value={formData.storyPoints} onValueChange={(value) => handleChange('storyPoints', value)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select story points" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">1</SelectItem>
                        <SelectItem value="2">2</SelectItem>
                        <SelectItem value="3">3</SelectItem>
                        <SelectItem value="5">5</SelectItem>
                        <SelectItem value="8">8</SelectItem>
                        <SelectItem value="13">13</SelectItem>
                      </SelectContent>
                    </Select>
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
                  <div className="flex gap-2 min-w-0">
                    <Input
                      value={newCriteria}
                      onChange={(e) => setNewCriteria(e.target.value)}
                      placeholder="Enter acceptance criteria"
                      onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addCriteria())}
                      className="flex-1 min-w-0"
                    />
                    <Button type="button" onClick={addCriteria} size="sm" disabled={newCriteria.trim() === ''} className="flex-shrink-0">
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {formData.acceptanceCriteria.map((criteria, index) => (
                      <div key={index} className="flex items-center gap-1.5 px-3 py-1.5 bg-muted rounded-md border border-muted-foreground/20">
                        <span className="text-sm truncate max-w-[200px] sm:max-w-none" title={criteria}>{criteria}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeCriteria(index)}
                          className="h-5 w-5 p-0 flex-shrink-0 hover:bg-destructive/10 hover:text-destructive"
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row justify-end gap-2 sm:gap-4 pt-6 mt-8 border-t border-muted">
                <Button type="button" variant="outline" onClick={() => router.push('/stories')} className="w-full sm:w-auto">
                  Cancel
                </Button>
                <Button type="submit" disabled={loading || !isFormValid()} className="w-full sm:w-auto">
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
