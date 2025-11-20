'use client'

import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { MainLayout } from '@/components/layout/MainLayout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, ArrowLeft, CheckCircle, Plus, X, BookOpen, Target, Calendar, Clock, Tag } from 'lucide-react'

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

interface Story {
  _id: string
  title: string
  description: string
  status: 'todo' | 'in_progress' | 'review' | 'testing' | 'done' | 'cancelled'
  priority: 'low' | 'medium' | 'high' | 'critical'
  project?: {
    _id: string
    name: string
  }
  epic?: {
    _id: string
    title?: string
    name?: string
  }
  sprint?: {
    _id: string
    name: string
  }
  assignedTo?: {
    _id: string
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
  acceptanceCriteria?: string[]
  tags?: string[]
  createdAt: string
  updatedAt: string
}

export default function EditStoryPage() {
  const router = useRouter()
  const params = useParams()
  const storyId = params.id as string
  
  const [story, setStory] = useState<Story | null>(null)
  const [originalStory, setOriginalStory] = useState<Story | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const messageRef = useRef<HTMLDivElement>(null)

  // Additional state for form fields
  const [projects, setProjects] = useState<Project[]>([])
  const [epics, setEpics] = useState<Epic[]>([])
  const [sprints, setSprints] = useState<Sprint[]>([])
  const [projectMembers, setProjectMembers] = useState<User[]>([])
  const [loadingProjectMembers, setLoadingProjectMembers] = useState(false)
  const [projectQuery, setProjectQuery] = useState('')
  const [assigneeQuery, setAssigneeQuery] = useState('')
  const [newCriteria, setNewCriteria] = useState('')
  const [tagsInput, setTagsInput] = useState('')

  // Auto-scroll to message when error or success appears
  useEffect(() => {
    if ((error || success) && messageRef.current) {
      messageRef.current.scrollIntoView({ 
        behavior: 'smooth', 
        block: 'start',
        inline: 'nearest'
      })
    }
  }, [error, success])

  const fetchProjects = useCallback(async () => {
    try {
      const response = await fetch('/api/projects')
      const data = await response.json()
      if (data.success && Array.isArray(data.data)) {
        setProjects(data.data)
      }
    } catch (err) {
      console.error('Failed to fetch projects:', err)
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

  const fetchEpics = useCallback(async (projectId: string) => {
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
  }, [])

  const fetchSprints = useCallback(async (projectId: string) => {
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
  }, [])

  const fetchStory = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch(`/api/stories/${storyId}`)
      const data = await res.json()
      if (data.success) {
        const storyData = data.data
        setStory(storyData)
        setOriginalStory(storyData)
        
        // Set tags input
        setTagsInput(Array.isArray(storyData.tags) ? storyData.tags.join(', ') : '')
        
        // Fetch related data if project exists
        await fetchProjects()
        if (storyData.project?._id) {
          fetchEpics(storyData.project._id)
          fetchSprints(storyData.project._id)
          fetchProjectMembers(storyData.project._id)
        }
      } else {
        setError(data.error || 'Failed to load story')
      }
    } catch (e) {
      setError('Failed to load story')
    } finally {
      setLoading(false)
    }
  }, [storyId, fetchProjects, fetchEpics, fetchSprints, fetchProjectMembers])

  useEffect(() => {
    if (storyId) fetchStory()
  }, [storyId, fetchStory])

  const filteredProjectMembers = useMemo(() => {
    if (!assigneeQuery.trim()) return projectMembers
    const q = assigneeQuery.toLowerCase().trim()
    return projectMembers.filter(u =>
      `${u.firstName} ${u.lastName}`.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q)
    )
  }, [projectMembers, assigneeQuery])

  const filteredProjects = useMemo(() => {
    if (!projectQuery.trim()) return projects
    const q = projectQuery.toLowerCase()
    return projects.filter(p => p.name.toLowerCase().includes(q))
  }, [projects, projectQuery])

  const addCriteria = () => {
    if (newCriteria.trim() && story) {
      const currentCriteria = Array.isArray(story.acceptanceCriteria) ? story.acceptanceCriteria : []
      setStory({ ...story, acceptanceCriteria: [...currentCriteria, newCriteria.trim()] })
      setNewCriteria('')
    }
  }

  const removeCriteria = (index: number) => {
    if (!story) return
    const currentCriteria = Array.isArray(story.acceptanceCriteria) ? story.acceptanceCriteria : []
    setStory({ ...story, acceptanceCriteria: currentCriteria.filter((_, i) => i !== index) })
  }

  const handleSave = async () => {
    if (!story) return
    
    try {
      setSaving(true)
      setError('')
      
      // Parse tags from comma-separated string
      const tags = tagsInput
        ? tagsInput.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0)
        : []
      
      const res = await fetch(`/api/stories/${storyId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: story.title,
          description: story.description,
          status: story.status,
          priority: story.priority,
          project: story.project?._id || undefined,
          epic: story.epic?._id || undefined,
          sprint: story.sprint?._id || undefined,
          assignedTo: story.assignedTo?._id || undefined,
          dueDate: story.dueDate || undefined,
          estimatedHours: story.estimatedHours || undefined,
          storyPoints: story.storyPoints || undefined,
          tags: tags,
          acceptanceCriteria: Array.isArray(story.acceptanceCriteria) ? story.acceptanceCriteria : []
        })
      })
      
      const data = await res.json()
      if (data.success) {
        setSuccess('Story updated successfully')
        setTimeout(() => setSuccess(''), 4000)
        setOriginalStory(story)
      } else {
        setError(data.error || 'Failed to save story')
      }
    } catch (e) {
      setError('Failed to save story')
    } finally {
      setSaving(false)
    }
  }

  const isDirty = useMemo(() => {
    if (!story || !originalStory) return false

    const storyChanged = 
      story.title !== originalStory.title ||
      (story.description || '') !== (originalStory.description || '') ||
      story.status !== originalStory.status ||
      story.priority !== originalStory.priority ||
      (story.project?._id || '') !== (originalStory.project?._id || '') ||
      (story.epic?._id || '') !== (originalStory.epic?._id || '') ||
      (story.sprint?._id || '') !== (originalStory.sprint?._id || '') ||
      (story.assignedTo?._id || '') !== (originalStory.assignedTo?._id || '') ||
      (story.dueDate || '') !== (originalStory.dueDate || '') ||
      (story.estimatedHours || 0) !== (originalStory.estimatedHours || 0) ||
      (story.storyPoints || 0) !== (originalStory.storyPoints || 0)

    // Check tags separately
    const originalTags = Array.isArray(originalStory.tags) ? originalStory.tags.join(', ') : ''
    const tagsChanged = tagsInput.trim() !== originalTags.trim()

    // Check acceptance criteria separately
    const originalCriteria = Array.isArray(originalStory.acceptanceCriteria) ? originalStory.acceptanceCriteria : []
    const currentCriteria = Array.isArray(story.acceptanceCriteria) ? story.acceptanceCriteria : []
    const criteriaChanged = JSON.stringify(originalCriteria) !== JSON.stringify(currentCriteria)

    return storyChanged || tagsChanged || criteriaChanged
  }, [story, originalStory, tagsInput])

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
            <p className="text-muted-foreground">Loading story...</p>
          </div>
        </div>
      </MainLayout>
    )
  }

  if (error || !story) {
    return (
      <MainLayout>
        <div className="max-w-2xl mx-auto">
          <Button variant="ghost" onClick={() => router.back()} className="mb-4">
            <ArrowLeft className="h-4 w-4 mr-2" /> Back
          </Button>
          <Alert variant="destructive">
            <AlertDescription>{error || 'Story not found'}</AlertDescription>
          </Alert>
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

        <div ref={messageRef}>
          {success && (
            <Alert>
              <div className="flex items-center">
                <CheckCircle className="h-4 w-4 mr-2 text-green-600" />
                <AlertDescription>{success}</AlertDescription>
              </div>
            </Alert>
          )}

          {error && !success && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5" />
              Edit Story
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <label className="text-sm font-medium">Title</label>
              <Input
                value={story.title}
                onChange={(e) => setStory({ ...story, title: e.target.value })}
                className="mt-1"
              />
            </div>

            <div>
              <label className="text-sm font-medium">Description</label>
              <Textarea
                value={story.description || ''}
                onChange={(e) => setStory({ ...story, description: e.target.value })}
                className="mt-1"
                rows={4}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium flex items-center gap-2">
                  <Target className="h-4 w-4" />
                  Project
                </label>
                <Select
                  value={story.project?._id || ''}
                  onValueChange={(value) => {
                    const selectedProject = projects.find(p => p._id === value)
                    if (selectedProject) {
                      setStory({
                        ...story,
                        project: { _id: selectedProject._id, name: selectedProject.name },
                        assignedTo: undefined,
                        epic: undefined,
                        sprint: undefined
                      })
                      fetchEpics(value)
                      fetchSprints(value)
                      fetchProjectMembers(value)
                    } else {
                      setStory({ ...story, project: undefined, assignedTo: undefined, epic: undefined, sprint: undefined })
                      setEpics([])
                      setSprints([])
                      setProjectMembers([])
                    }
                    setProjectQuery('')
                  }}
                  onOpenChange={(open) => { if (open) setProjectQuery('') }}
                >
                  <SelectTrigger className="mt-1">
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

              {story.project && (
                <div>
                  <label className="text-sm font-medium">Assigned To</label>
                  <Select
                    value={story.assignedTo?._id || ''}
                    onValueChange={(value) => {
                      if (value === '__unassigned') {
                        setStory({ ...story, assignedTo: undefined })
                        return
                      }
                      const selectedUser = projectMembers.find(u => u._id === value)
                      if (selectedUser) {
                        setStory({
                          ...story,
                          assignedTo: {
                            _id: selectedUser._id,
                            firstName: selectedUser.firstName,
                            lastName: selectedUser.lastName,
                            email: selectedUser.email
                          }
                        })
                      }
                      setAssigneeQuery('')
                    }}
                    onOpenChange={(open) => { if (open) setAssigneeQuery('') }}
                  >
                    <SelectTrigger className="mt-1">
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
                              <SelectItem value="__unassigned">Unassigned</SelectItem>
                              <div className="px-2 py-1 text-sm text-muted-foreground">No team members found</div>
                            </>
                          ) : filteredProjectMembers.length > 0 ? (
                            <>
                              <SelectItem value="__unassigned">Unassigned</SelectItem>
                              {filteredProjectMembers.map(user => (
                                <SelectItem key={user._id} value={user._id}>
                                  {user.firstName} {user.lastName} <span className="text-muted-foreground">({user.email})</span>
                                </SelectItem>
                              ))}
                            </>
                          ) : (
                            <div className="px-2 py-1 text-sm text-muted-foreground">No matching members</div>
                          )}
                        </div>
                      </div>
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div>
                <label className="text-sm font-medium">Epic</label>
                <Select
                  value={story.epic?._id || 'none'}
                  onValueChange={(value) => {
                    if (value === 'none') {
                      setStory({ ...story, epic: undefined })
                    } else {
                      const selectedEpic = epics.find(e => e._id === value)
                      if (selectedEpic) {
                        setStory({ ...story, epic: { _id: selectedEpic._id, title: selectedEpic.title } })
                      }
                    }
                  }}
                  disabled={!story.project}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder={story.project ? "Select an epic" : "Select project first"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No Epic</SelectItem>
                    {epics.map((epic) => (
                      <SelectItem key={epic._id} value={epic._id}>
                        {epic.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium">Sprint</label>
                <Select
                  value={story.sprint?._id || 'none'}
                  onValueChange={(value) => {
                    if (value === 'none') {
                      setStory({ ...story, sprint: undefined })
                    } else {
                      const selectedSprint = sprints.find(s => s._id === value)
                      if (selectedSprint) {
                        setStory({ ...story, sprint: { _id: selectedSprint._id, name: selectedSprint.name } })
                      }
                    }
                  }}
                  disabled={!story.project}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder={story.project ? "Select a sprint" : "Select project first"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No Sprint</SelectItem>
                    {sprints.map((sprint) => (
                      <SelectItem key={sprint._id} value={sprint._id}>
                        {sprint.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium">Status</label>
                <Select value={story.status} onValueChange={(v) => setStory({ ...story, status: v as Story['status'] })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todo">To Do</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="review">Review</SelectItem>
                    <SelectItem value="testing">Testing</SelectItem>
                    <SelectItem value="done">Done</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium">Priority</label>
                <Select value={story.priority} onValueChange={(v) => setStory({ ...story, priority: v as Story['priority'] })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Due Date
                </label>
                <Input
                  type="date"
                  value={story.dueDate || ''}
                  onChange={(e) => setStory({ ...story, dueDate: e.target.value || undefined })}
                  className="mt-1"
                />
              </div>

              <div>
                <label className="text-sm font-medium flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Estimated Hours
                </label>
                <Input
                  type="number"
                  step="0.5"
                  value={story.estimatedHours || ''}
                  onChange={(e) => setStory({ ...story, estimatedHours: e.target.value ? parseFloat(e.target.value) : undefined })}
                  placeholder="Enter estimated hours"
                  className="mt-1"
                  min="0"
                />
              </div>

              <div>
                <label className="text-sm font-medium">Story Points</label>
                <Input
                  type="number"
                  value={story.storyPoints || ''}
                  onChange={(e) => setStory({ ...story, storyPoints: e.target.value ? parseInt(e.target.value) : undefined })}
                  placeholder="Enter story points"
                  className="mt-1"
                  min="0"
                />
              </div>

              <div>
                <label className="text-sm font-medium flex items-center gap-2">
                  <Tag className="h-4 w-4" />
                  Tags
                </label>
                <Input
                  value={tagsInput}
                  onChange={(e) => setTagsInput(e.target.value)}
                  placeholder="e.g., frontend, urgent, design"
                  className="mt-1"
                />
                <p className="text-xs text-muted-foreground mt-1">Separate multiple tags with commas</p>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium">Acceptance Criteria</label>
              <div className="space-y-2 mt-1">
                <div className="flex gap-2">
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
                  {Array.isArray(story.acceptanceCriteria) && story.acceptanceCriteria.map((criteria, index) => (
                    <div key={index} className="flex items-center space-x-2">
                      <span className="text-sm flex-1">{criteria}</span>
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

            <div className="flex justify-end space-x-2 pt-2">
              <Button variant="outline" onClick={() => router.push('/stories')}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving || !isDirty}>
                {saving ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</>) : 'Save Changes'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  )
}
