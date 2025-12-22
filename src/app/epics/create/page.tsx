'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { MainLayout } from '@/components/layout/MainLayout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  ArrowLeft,
  Save,
  Loader2,
  Layers,
  Plus,
  X
} from 'lucide-react'
import { useNotify } from '@/lib/notify'

interface Project {
  _id: string
  name: string
  startDate?: Date
  endDate?: Date
}

export default function CreateEpicPage() {
  const router = useRouter()
  const { success: notifySuccess, error: notifyError } = useNotify()
  const [loading, setLoading] = useState(false)
  const [authError, setAuthError] = useState('')
  const [projects, setProjects] = useState<Project[]>([])
  const [projectQuery, setProjectQuery] = useState("");

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    project: '',
    assignedTo: '',
    priority: 'medium',
    dueDate: '',
    estimatedHours: '',
    labels: [] as string[]
  })
  const [newLabel, setNewLabel] = useState('')

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

  // Clear due date if it's outside the valid range when project changes
  useEffect(() => {
    if (formData.project && formData.dueDate) {
      const dateRange = getValidDateRange()
      if (dateRange) {
        const selectedDate = new Date(formData.dueDate)
        const isBeforeMin = dateRange.minDate && selectedDate < dateRange.minDate
        const isAfterMax = dateRange.maxDate && selectedDate > dateRange.maxDate

        if (isBeforeMin || isAfterMax) {
          setFormData(prev => ({ ...prev, dueDate: '' }))
        }
      }
    }
  }, [formData.project])

  const fetchProjects = async () => {
    try {
      const response = await fetch('/api/projects?fields=name,startDate,endDate')
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

  const addLabel = () => {
    if (newLabel.trim() && !formData.labels.includes(newLabel.trim())) {
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

  // Calculate valid date range for due date based on selected project
  const getValidDateRange = () => {
    const selectedProject = projects.find(p => p._id === formData.project)
    if (!selectedProject) return null

    let minDate = null
    let maxDate = null

    // If project has start date, due date should be on or after project start
    if (selectedProject.startDate) {
      minDate = new Date(selectedProject.startDate)
      minDate.setHours(0, 0, 0, 0)
    }

    // If project has end date, due date should be on or before project end
    if (selectedProject.endDate) {
      maxDate = new Date(selectedProject.endDate)
      maxDate.setHours(23, 59, 59, 999)
    }

    return { minDate, maxDate }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const response = await fetch('/api/epics', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ...formData,
          title: formData.name?.trim() || undefined,
          estimatedHours: formData.estimatedHours ? parseInt(formData.estimatedHours) : undefined,
          labels: formData.labels
        })
      })

      const data = await response.json()

      if (data.success) {
        notifySuccess({ title: 'Epic created successfully' })
        router.push('/epics?created=1')
      } else {
        notifyError({ title: data.error || 'Failed to create epic' })
      }
    } catch (err) {
      notifyError({ title: 'Failed to create epic' })
    } finally {
      setLoading(false)
    }
  }

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }))
  }

  // Required field validation for Epic
  const isFormValid = () => {
    return (
      !!formData.name.trim() &&
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
          <Button variant="ghost" onClick={() => router.push('/epics')} className="w-full sm:w-auto">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground flex items-center space-x-2 min-w-0">
              <Layers className="h-6 w-6 sm:h-8 sm:w-8 text-purple-600 flex-shrink-0" />
              <span className="truncate">Create New Epic</span>
            </h1>
            <p className="text-sm sm:text-base text-muted-foreground">Create a new epic for your project</p>
          </div>
        </div>

        <Card className="overflow-x-hidden">
          <CardHeader>
            <CardTitle>Epic Details</CardTitle>
            <CardDescription>Fill in the details for your new epic</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-foreground">Name *</label>
                    <Input
                      value={formData.name}
                      onChange={(e) => handleChange('name', e.target.value)}
                      placeholder="Enter epic name"
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
                      <SelectTrigger className="w-full">
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

                  <div>
                    <label className="text-sm font-medium text-foreground">Due Date *</label>
                    <Input
                      type="date"
                      value={formData.dueDate}
                      onChange={(e) => handleChange('dueDate', e.target.value)}
                      min={getValidDateRange()?.minDate?.toISOString().split('T')[0]}
                      max={getValidDateRange()?.maxDate?.toISOString().split('T')[0]}
                      required
                    />
                    {formData.project && getValidDateRange() && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Due date must be within the selected project's date range
                      </p>
                    )}
                  </div>
                </div>

                <div className="space-y-4">
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
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-foreground">Description</label>
                <Textarea
                  value={formData.description}
                  onChange={(e) => handleChange('description', e.target.value)}
                  placeholder="Enter epic description"
                  rows={4}
                />
              </div>

              <div className="flex flex-col sm:flex-row justify-end gap-2 sm:gap-4 pt-6 mt-8 border-t border-muted">
                <Button type="button" variant="outline" onClick={() => router.push('/epics')} className="w-full sm:w-auto">
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
                      Create Epic
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
