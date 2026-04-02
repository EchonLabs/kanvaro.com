'use client'

import { useState, useEffect } from 'react'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface TestSuite {
  _id?: string
  name: string
  description: string
  parentSuite?: string
  project: string
}

interface Project {
  _id: string
  name: string
}

interface TestSuiteFormProps {
  testSuite?: TestSuite
  projectId: string
  projectName?: string
  onSave: (testSuite: TestSuite) => void
  onCancel: () => void
  loading?: boolean
  showProjectSelector?: boolean
  onProjectChange?: (projectId: string) => void
}

export function TestSuiteForm({ testSuite, projectId, projectName, onSave, onCancel, loading = false, showProjectSelector = false, onProjectChange }: TestSuiteFormProps) {
  const [formData, setFormData] = useState<TestSuite>({
    name: '',
    description: '',
    parentSuite: '',
    project: projectId,
    ...testSuite
  })
  const [parentSuites, setParentSuites] = useState<TestSuite[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [errors, setErrors] = useState<Record<string, string>>({})
  // Use testSuite.project if editing, otherwise use projectId
  const [currentProjectId, setCurrentProjectId] = useState(testSuite?.project || projectId)
  const [selectedProjectName, setSelectedProjectName] = useState(projectName || '')

  useEffect(() => {
    if (showProjectSelector || currentProjectId) {
      // Fetch projects if:
      // 1. showProjectSelector is true (user needs to pick a project), OR
      // 2. currentProjectId is set but we don't have the name yet (editing existing suite)
      if (projects.length === 0) {
        fetchProjects()
      }
    }
  }, [showProjectSelector, currentProjectId, projects.length])

  useEffect(() => {
    setCurrentProjectId(testSuite?.project || projectId)
    setSelectedProjectName(projectName || '')
    setFormData(prev => ({
      ...prev,
      project: testSuite?.project || projectId,
      ...testSuite
    }))
  }, [projectId, projectName, testSuite])

  useEffect(() => {
    if (currentProjectId && projects.length > 0) {
      const selected = projects.find(p => p._id === currentProjectId)
      if (selected) {
        setSelectedProjectName(selected.name)
      }
    }
  }, [currentProjectId, projects])

  useEffect(() => {
    if (currentProjectId) {
      fetchParentSuites(currentProjectId)
    } else {
      setParentSuites([])
    }
  }, [currentProjectId, testSuite?._id])

  const fetchProjects = async () => {
    try {
      const response = await fetch('/api/projects')
      const data = await response.json()
      if (data.success) {
        setProjects(data.data)
      }
    } catch (error) {
      console.error('Error fetching projects:', error)
    }
  }

  const fetchParentSuites = async (projId: string) => {
    try {
      const response = await fetch(`/api/test-suites?projectId=${projId}`)
      const data = await response.json()
      if (data.success) {
        // Filter out the current suite to prevent self-parenting
        const filteredSuites = data.data.filter((suite: TestSuite) => suite._id !== testSuite?._id)
        setParentSuites(filteredSuites)
      }
    } catch (error) {
      console.error('Error fetching parent suites:', error)
    }
  }

  const handleProjectChange = (newProjectId: string) => {
    setCurrentProjectId(newProjectId)
    // Find and display the selected project name
    const selected = projects.find(p => p._id === newProjectId)
    if (selected) {
      setSelectedProjectName(selected.name)
    }
    setFormData(prev => ({ ...prev, project: newProjectId, parentSuite: '' }))
    onProjectChange?.(newProjectId)
  }

  const validateForm = () => {
    const newErrors: Record<string, string> = {}

    if (showProjectSelector && !currentProjectId) {
      newErrors.project = 'Project is required'
    }
    if (!formData.name.trim()) {
      newErrors.name = 'Name is required'
    }
    if (!formData.description.trim()) {
      newErrors.description = 'Description is required'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (validateForm()) {
      onSave(formData)
    }
  }

  return (
    <div className="w-full">
      <form onSubmit={handleSubmit} className="space-y-6" id="test-suite-form">
        {showProjectSelector && (
          <div className="space-y-2">
            <Label htmlFor="project">Project *</Label>
            <Select
              value={currentProjectId || 'none'}
              onValueChange={(value) => handleProjectChange(value === 'none' ? '' : value)}
            >
              <SelectTrigger className={errors.project ? 'border-red-500' : ''}>
                {selectedProjectName ? (
                  <span className="text-sm font-medium">{selectedProjectName}</span>
                ) : (
                  <SelectValue placeholder="Select a project" />
                )}
              </SelectTrigger>
              <SelectContent>
                {projects.map((project) => (
                  <SelectItem key={project._id} value={project._id}>
                    {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.project && <p className="text-sm text-red-600">{errors.project}</p>}
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="name">Name *</Label>
          <Input
            id="name"
            value={formData.name}
            onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
            placeholder="Test suite name"
            className={errors.name ? 'border-red-500' : ''}
          />
          {errors.name && <p className="text-sm text-red-600">{errors.name}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">Description *</Label>
          <Textarea
            id="description"
            value={formData.description}
            onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
            placeholder="Describe the purpose of this test suite"
            rows={3}
            className={errors.description ? 'border-red-500' : ''}
          />
          {errors.description && <p className="text-sm text-red-600">{errors.description}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="parentSuite">Parent Suite (Optional)</Label>
          <Select
            value={formData.parentSuite || 'none'}
            onValueChange={(value) => setFormData(prev => ({ ...prev, parentSuite: value === 'none' ? undefined : value }))}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select parent suite (optional)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No parent suite</SelectItem>
              {parentSuites.map((suite) => (
                <SelectItem key={suite._id} value={suite._id!}>
                  {suite.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Select a parent suite to create a hierarchical structure
          </p>
        </div>
      </form>
    </div>
  )
}
