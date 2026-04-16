'use client'

import { useState, useEffect, useRef } from 'react'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/Button'
import { ChevronsUpDown } from 'lucide-react'
import { cn } from '@/lib/utils'

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
    project: testSuite?.project || projectId || '',
    ...testSuite
  })
  const [parentSuites, setParentSuites] = useState<TestSuite[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [errors, setErrors] = useState<Record<string, string>>({})
  // For editing: use testSuite.project. For creating: use projectId if provided, otherwise empty
  const [currentProjectId, setCurrentProjectId] = useState<string>(testSuite?.project || projectId || '')
  const nameInputRef = useRef<HTMLInputElement | null>(null)
  const [selectedProjectName, setSelectedProjectName] = useState(projectName || '')
  const [projectQuery, setProjectQuery] = useState('')
  const [parentSuiteQuery, setParentSuiteQuery] = useState('')
  
  const filteredParentSuites = parentSuites.filter(suite =>
    suite.name.toLowerCase().includes(parentSuiteQuery.toLowerCase())
  )

  const filteredProjects = projects.filter(project =>
    project.name.toLowerCase().includes(projectQuery.toLowerCase())
  )

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
    setCurrentProjectId(testSuite?.project || projectId || '')
    setSelectedProjectName(projectName || '')
    // Reset form data when creating new suite to avoid stale values
    if (!testSuite) {
      setFormData({
        name: '',
        description: '',
        parentSuite: '',
        project: projectId || ''
      })
    } else {
      // When editing, update with the suite data
      setFormData(prev => ({
        ...prev,
        ...testSuite
      }))
    }
  }, [projectId, projectName, testSuite])

  useEffect(() => {
    // When the dialog opens, Radix focus management may auto-focus the first input
    // and select its content. Clear any initial selection after mount.
    const el = nameInputRef.current
    if (!el) return

    const collapseSelection = () => {
      try {
        const pos = (el.value ?? '').length
        el.setSelectionRange(pos, pos)
      } catch {
        // ignore (e.g. element not focusable yet)
      }
    }

    // Run a few times to reliably override browser/Radix timing.
    queueMicrotask(collapseSelection)
    requestAnimationFrame(collapseSelection)
    setTimeout(collapseSelection, 0)
  }, [])

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
      // Ensure project value is included in formData
      onSave({ ...formData, project: formData.project || currentProjectId })
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
              onOpenChange={(open) => {
                if (open) setProjectQuery('')
              }}
            >
              <SelectTrigger className={errors.project ? 'border-red-500' : ''}>
                {selectedProjectName ? (
                  <span className="text-sm font-medium">{selectedProjectName}</span>
                ) : (
                  <SelectValue placeholder="Select a project" />
                )}
              </SelectTrigger>
              <SelectContent className="p-0">
                <div className="p-2">
                  <Input
                    value={projectQuery}
                    onChange={(e) => setProjectQuery(e.target.value)}
                    placeholder="Search projects..."
                    className="mb-2"
                    onKeyDown={(e) => e.stopPropagation()}
                  />
                  <div className="max-h-56 overflow-y-auto">
                    {filteredProjects.length === 0 ? (
                      <div className="px-2 py-2 text-sm text-muted-foreground">No projects found.</div>
                    ) : (
                      filteredProjects.map((project) => (
                        <SelectItem key={project._id} value={project._id}>
                          {project.name}
                        </SelectItem>
                      ))
                    )}
                  </div>
                </div>
              </SelectContent>
            </Select>
            {errors.project && <p className="text-sm text-red-600">{errors.project}</p>}
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="name">Name *</Label>
          <Input
            id="name"
            type="text"
            ref={nameInputRef}
            value={formData.name}
            onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
            onFocus={(e) => {
              // Prevent auto-select on focus (keep caret collapsed)
              const el = e.currentTarget
              const pos = (el.value ?? '').length
              requestAnimationFrame(() => {
                try {
                  el.setSelectionRange(pos, pos)
                } catch {
                  // ignore
                }
              })
            }}
            placeholder="Test suite name"
            className={cn(errors.name ? 'border-red-500' : '')}
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
            value={formData.parentSuite ? String(formData.parentSuite) : 'none'}
            onValueChange={(value) => {
              setFormData(prev => ({ ...prev, parentSuite: value === 'none' ? '' : value }))
            }}
            onOpenChange={(open) => {
              if (open) setParentSuiteQuery('')
            }}
          >
            <SelectTrigger className="w-full justify-between">
              <SelectValue placeholder="No parent suite" />
            </SelectTrigger>
            <SelectContent className="p-0">
              <div className="p-2">
                <Input
                  value={parentSuiteQuery}
                  onChange={(e) => setParentSuiteQuery(e.target.value)}
                  placeholder="Search parent suites..."
                  className="mb-2"
                  onKeyDown={(e) => e.stopPropagation()}
                />
                <div className="max-h-56 overflow-y-auto">
                  <SelectItem value="none">No parent suite</SelectItem>
                  {filteredParentSuites.length === 0 ? (
                    <div className="px-2 py-2 text-sm text-muted-foreground">No parent suite found.</div>
                  ) : (
                    filteredParentSuites.map((suite) => (
                      <SelectItem key={String(suite._id)} value={String(suite._id)}>
                        {suite.name}
                      </SelectItem>
                    ))
                  )}
                </div>
              </div>
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
