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

interface TestSuiteFormProps {
  testSuite?: TestSuite
  projectId: string
  onSave: (testSuite: TestSuite) => void
  onCancel: () => void
  loading?: boolean
}

export function TestSuiteForm({ testSuite, projectId, onSave, onCancel, loading = false }: TestSuiteFormProps) {
  const [formData, setFormData] = useState<TestSuite>({
    name: '',
    description: '',
    parentSuite: '',
    project: projectId,
    ...testSuite
  })
  const [parentSuites, setParentSuites] = useState<TestSuite[]>([])
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    fetchParentSuites()
  }, [projectId, testSuite?._id])

  const fetchParentSuites = async () => {
    try {
      const response = await fetch(`/api/test-suites?projectId=${projectId}`)
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

  const validateForm = () => {
    const newErrors: Record<string, string> = {}

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
