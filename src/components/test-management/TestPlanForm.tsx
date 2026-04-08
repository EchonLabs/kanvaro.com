'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/Badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Checkbox } from '@/components/ui/Checkbox'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/Popover'
import { CalendarIcon, X, Plus } from 'lucide-react'
import { format } from 'date-fns'
import { formatToTitleCase } from '@/lib/utils'

interface TestPlan {
  _id?: string
  name: string
  description: string
  project: string
  version: string
  assignedTo?: string
  startDate?: Date
  endDate?: Date
  testCases: string[]
  tags: string[]
  customFields?: Record<string, any>
}

interface TestCase {
  _id: string
  title: string
  priority: string
  category: string
}

interface User {
  _id: string
  firstName: string
  lastName: string
  email: string
}

interface TestPlanFormProps {
  testPlan?: TestPlan
  projectId: string
  onSave: (testPlan: TestPlan) => void
  onCancel: () => void
  loading?: boolean
}

export function TestPlanForm({ testPlan, projectId, onSave, onCancel, loading = false }: TestPlanFormProps) {
  const [formData, setFormData] = useState<TestPlan>({
    name: '',
    description: '',
    project: projectId,
    version: '',
    assignedTo: '',
    startDate: undefined,
    endDate: undefined,
    testCases: [],
    tags: [],
    customFields: {},
    ...testPlan
  })
  const [testCases, setTestCases] = useState<TestCase[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [newTag, setNewTag] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    fetchTestCases()
    fetchUsers()
  }, [projectId])

  const fetchTestCases = async () => {
    try {
      const response = await fetch(`/api/test-cases?projectId=${projectId}`)
      const data = await response.json()
      if (data.success) {
        setTestCases(data.data)
      }
    } catch (error) {
      console.error('Error fetching test cases:', error)
    }
  }

  const fetchUsers = async () => {
    try {
      const response = await fetch('/api/users')
      const data = await response.json()
      if (data.success) {
        setUsers(data.data)
      }
    } catch (error) {
      console.error('Error fetching users:', error)
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
    if (!formData.version.trim()) {
      newErrors.version = 'Version is required'
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

  const toggleTestCase = (testCaseId: string) => {
    setFormData(prev => ({
      ...prev,
      testCases: prev.testCases.includes(testCaseId)
        ? prev.testCases.filter(id => id !== testCaseId)
        : [...prev.testCases, testCaseId]
    }))
  }

  const addTag = () => {
    if (newTag.trim() && !formData.tags.includes(newTag.trim())) {
      setFormData(prev => ({
        ...prev,
        tags: [...prev.tags, newTag.trim()]
      }))
      setNewTag('')
    }
  }

  const removeTag = (tagToRemove: string) => {
    setFormData(prev => ({
      ...prev,
      tags: prev.tags.filter(tag => tag !== tagToRemove)
    }))
  }

  return (
    <Card className="w-full max-w-4xl mx-auto">
      <CardHeader>
        <CardTitle>
          {testPlan?._id ? 'Edit Test Plan' : 'Create Test Plan'}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Information */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
            <div className="space-y-2">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Test plan name"
                className={errors.name ? 'border-red-500' : ''}
              />
              {errors.name && <p className="text-sm text-red-600">{errors.name}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="version">Version *</Label>
              <Input
                id="version"
                value={formData.version}
                onChange={(e) => setFormData(prev => ({ ...prev, version: e.target.value }))}
                placeholder="e.g., v1.0.0"
                className={errors.version ? 'border-red-500' : ''}
              />
              {errors.version && <p className="text-sm text-red-600">{errors.version}</p>}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description *</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Describe the purpose and scope of this test plan"
              rows={3}
              className={errors.description ? 'border-red-500' : ''}
            />
            {errors.description && <p className="text-sm text-red-600">{errors.description}</p>}
          </div>

          {/* Assignment and Dates */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            <div className="space-y-2">
              <Label htmlFor="assignedTo">Assigned To</Label>
              <Select 
                value={formData.assignedTo || 'unassigned'} 
                onValueChange={(value) => setFormData(prev => ({ ...prev, assignedTo: value === 'unassigned' ? undefined : value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select assignee" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {users.map((user) => (
                    <SelectItem key={user._id} value={user._id}>
                      {user.firstName} {user.lastName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Start Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-start text-left font-normal"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {formData.startDate ? format(formData.startDate, 'PPP') : 'Pick a date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={formData.startDate}
                    onSelect={(date) => setFormData(prev => ({ ...prev, startDate: date }))}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label>End Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-start text-left font-normal"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {formData.endDate ? format(formData.endDate, 'PPP') : 'Pick a date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={formData.endDate}
                    onSelect={(date) => setFormData(prev => ({ ...prev, endDate: date }))}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* Test Cases Selection */}
          <div className="space-y-4">
            <Label>Test Cases</Label>
            <div className="border rounded-lg p-4 max-h-60 overflow-y-auto">
              {testCases.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No test cases available for this project
                </p>
              ) : (
                <div className="space-y-2">
                  {testCases.map((testCase) => (
                    <div key={testCase._id} className="flex items-center space-x-2">
                      <Checkbox
                        id={testCase._id}
                        checked={formData.testCases.includes(testCase._id)}
                        onCheckedChange={() => toggleTestCase(testCase._id)}
                      />
                      <Label htmlFor={testCase._id} className="flex-1 cursor-pointer">
                        <div className="flex items-center justify-between">
                          <span className="font-medium">{testCase.title}</span>
                          <div className="flex items-center space-x-2">
                            <Badge variant="outline" className="text-xs">
                              {formatToTitleCase(testCase.priority)}
                            </Badge>
                            <Badge variant="secondary" className="text-xs">
                              {formatToTitleCase(testCase.category)}
                            </Badge>
                          </div>
                        </div>
                      </Label>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {formData.testCases.length} test case(s) selected
            </p>
          </div>

          {/* Tags */}
          <div className="space-y-2">
            <Label>Tags</Label>
            <div className="flex flex-wrap gap-2 mb-2">
              {formData.tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="flex items-center gap-1">
                  {tag}
                  <button
                    type="button"
                    onClick={() => removeTag(tag)}
                    className="ml-1 hover:text-red-600"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                placeholder="Add a tag"
                onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
              />
              <Button type="button" variant="outline" onClick={addTag}>
                Add
              </Button>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row justify-end gap-3 pt-4 border-t">
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Saving...' : (testPlan?._id ? 'Update Test Plan' : 'Create Test Plan')}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
