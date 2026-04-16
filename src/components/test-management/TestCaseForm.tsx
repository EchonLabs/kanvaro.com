'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/Badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { RichTextEditor } from '@/components/ui/RichTextEditor'
import { X, Plus, Trash2 } from 'lucide-react'

interface TestCase {
  _id?: string
  title: string
  description: string
  preconditions: string
  steps: Array<{ step: string; expectedResult: string }>
  expectedResult: string
  testData: string
  priority: 'low' | 'medium' | 'high' | 'critical'
  category: 'functional' | 'integration' | 'regression' | 'performance' | 'security' | 'usability' | 'compatibility'
  automationStatus: 'not_automated' | 'automated' | 'semi_automated' | 'deprecated'
  estimatedExecutionTime: number
  testSuite: string
  tags: string[]
  requirements?: string
}

interface TestSuite {
  _id: string
  name: string
}

interface TestCaseFormProps {
  testCase?: TestCase
  projectId: string
  onSave: (testCase: TestCase) => void
  onCancel: () => void
  loading?: boolean
}

export function TestCaseForm({ testCase, projectId, onSave, onCancel, loading = false }: TestCaseFormProps) {
  const titleFocusAdjustedRef = useRef(false)
  const [formData, setFormData] = useState<TestCase>({
    title: '',
    description: '',
    preconditions: '',
    steps: [{ step: '', expectedResult: '' }],
    expectedResult: '',
    testData: '',
    priority: 'medium',
    category: 'functional',
    automationStatus: 'not_automated',
    estimatedExecutionTime: 5,
    testSuite: '',
    tags: [],
    requirements: '',
    ...testCase
  })
  const [testSuites, setTestSuites] = useState<TestSuite[]>([])
  const [suiteQuery, setSuiteQuery] = useState('')
  const [newTag, setNewTag] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [estimatedTimeText, setEstimatedTimeText] = useState(() => String((testCase?.estimatedExecutionTime ?? 5) as number))

  useEffect(() => {
    setEstimatedTimeText(String((testCase?.estimatedExecutionTime ?? 5) as number))
  }, [testCase?._id])

  const filteredTestSuites = useMemo(() => {
    const q = suiteQuery.trim().toLowerCase()
    if (!q) return testSuites
    return testSuites.filter(s => s.name.toLowerCase().includes(q))
  }, [testSuites, suiteQuery])

  const stripHtml = (html: string): string => {
    // Best-effort plain-text extraction for validation.
    return (html || '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  }

  useEffect(() => {
    fetchTestSuites()
  }, [projectId])

  const fetchTestSuites = async () => {
    try {
      const response = await fetch(`/api/test-suites?projectId=${projectId}`)
      const data = await response.json()
      if (data.success) {
        setTestSuites(data.data)
      }
    } catch (error) {
      console.error('Error fetching test suites:', error)
    }
  }

  const validateForm = () => {
    const newErrors: Record<string, string> = {}

    if (!formData.title.trim()) {
      newErrors.title = 'Title is required'
    }
    if (!stripHtml(formData.description)) {
      newErrors.description = 'Description is required'
    }
    if (!formData.testSuite) {
      newErrors.testSuite = 'Test suite is required'
    }
    if (formData.steps.some(step => !stripHtml(step.step) || !stripHtml(step.expectedResult))) {
      newErrors.steps = 'All test steps must have both step and expected result'
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

  const addStep = () => {
    setFormData(prev => ({
      ...prev,
      steps: [...prev.steps, { step: '', expectedResult: '' }]
    }))
  }

  const removeStep = (index: number) => {
    setFormData(prev => ({
      ...prev,
      steps: prev.steps.filter((_, i) => i !== index)
    }))
  }

  const updateStep = (index: number, field: 'step' | 'expectedResult', value: string) => {
    setFormData(prev => ({
      ...prev,
      steps: prev.steps.map((step, i) => 
        i === index ? { ...step, [field]: value } : step
      )
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
    <Card className="w-full">
      <CardHeader>
        <CardTitle>
          {testCase?._id ? 'Edit Test Case' : 'Create Test Case'}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Information */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
            <div className="space-y-2">
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                onFocus={(e) => {
                  // Some browsers/radix focus management can highlight the initial value.
                  // Only on first focus, collapse selection to the end.
                  if (titleFocusAdjustedRef.current) return
                  titleFocusAdjustedRef.current = true
                  const el = e.currentTarget
                  queueMicrotask(() => {
                    try {
                      const end = el.value.length
                      el.setSelectionRange(end, end)
                    } catch {
                      // ignore
                    }
                  })
                }}
                placeholder="Test case title"
                className={errors.title ? 'border-red-500' : ''}
              />
              {errors.title && <p className="text-sm text-red-600">{errors.title}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="testSuite">Test Suite *</Label>
              <Select 
                value={formData.testSuite} 
                onValueChange={(value) => setFormData(prev => ({ ...prev, testSuite: value }))}
                onOpenChange={(open) => {
                  if (open) setSuiteQuery('')
                }}
              >
                <SelectTrigger className={errors.testSuite ? 'border-red-500' : ''}>
                  <SelectValue placeholder="Select test suite" />
                </SelectTrigger>
                <SelectContent className="p-0">
                  <div className="p-2">
                    <Input
                      value={suiteQuery}
                      onChange={(e) => setSuiteQuery(e.target.value)}
                      placeholder="Search test suites"
                      className="mb-2"
                      onKeyDown={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <div className="max-h-56 overflow-y-auto">
                      {filteredTestSuites.length === 0 ? (
                        <div className="px-2 py-2 text-sm text-muted-foreground">No matching test suites</div>
                      ) : (
                        filteredTestSuites.map((suite) => (
                          <SelectItem key={suite._id} value={suite._id}>
                            {suite.name}
                          </SelectItem>
                        ))
                      )}
                    </div>
                  </div>
                </SelectContent>
              </Select>
              {errors.testSuite && <p className="text-sm text-red-600">{errors.testSuite}</p>}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description *</Label>
            <RichTextEditor
              value={formData.description}
              onChange={(value) => setFormData(prev => ({ ...prev, description: value }))}
              placeholder="Describe what this test case validates"
              className={errors.description ? 'border border-red-500 rounded-md' : undefined}
            />
            {errors.description && <p className="text-sm text-red-600">{errors.description}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="preconditions">Preconditions</Label>
            <RichTextEditor
              value={formData.preconditions}
              onChange={(value) => setFormData(prev => ({ ...prev, preconditions: value }))}
              placeholder="Any prerequisites or setup required"
            />
          </div>

          {/* Test Steps */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label>Test Steps *</Label>
              <Button type="button" variant="outline" size="sm" onClick={addStep}>
                <Plus className="h-4 w-4 mr-2" />
                Add Step
              </Button>
            </div>
            
            {formData.steps.map((step, index) => (
              <div key={index} className="border rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Step {index + 1}</span>
                  {formData.steps.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeStep(index)}
                      className="text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor={`step-${index}`}>Action</Label>
                  <RichTextEditor
                    value={step.step}
                    onChange={(value) => updateStep(index, 'step', value)}
                    placeholder="Describe the action to perform"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor={`expected-${index}`}>Expected Result</Label>
                  <RichTextEditor
                    value={step.expectedResult}
                    onChange={(value) => updateStep(index, 'expectedResult', value)}
                    placeholder="Describe the expected outcome"
                  />
                </div>
              </div>
            ))}
            
            {errors.steps && <p className="text-sm text-red-600">{errors.steps}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="expectedResult">Overall Expected Result</Label>
            <RichTextEditor
              value={formData.expectedResult}
              onChange={(value) => setFormData(prev => ({ ...prev, expectedResult: value }))}
              placeholder="Overall expected result of the test case"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="testData">Test Data</Label>
            <Textarea
              id="testData"
              value={formData.testData}
              onChange={(e) => setFormData(prev => ({ ...prev, testData: e.target.value }))}
              placeholder="Any specific test data or inputs required"
              rows={2}
            />
          </div>

          {/* Properties */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
            <div className="space-y-2">
              <Label htmlFor="priority">Priority</Label>
              <Select 
                value={formData.priority} 
                onValueChange={(value: any) => setFormData(prev => ({ ...prev, priority: value }))}
              >
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

            <div className="space-y-2">
              <Label htmlFor="category">Testing Types</Label>
              <Select 
                value={formData.category} 
                onValueChange={(value: any) => setFormData(prev => ({ ...prev, category: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="functional">Functional</SelectItem>
                  <SelectItem value="integration">Integration</SelectItem>
                  <SelectItem value="regression">Regression</SelectItem>
                  <SelectItem value="performance">Performance</SelectItem>
                  <SelectItem value="security">Security</SelectItem>
                  <SelectItem value="usability">Usability</SelectItem>
                  <SelectItem value="compatibility">Compatibility</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="automationStatus">Testing Approaches</Label>
              <Select 
                value={formData.automationStatus} 
                onValueChange={(value: any) => setFormData(prev => ({ ...prev, automationStatus: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="not_automated">Not Automated</SelectItem>
                  <SelectItem value="automated">Automated</SelectItem>
                  <SelectItem value="semi_automated">Semi Automated</SelectItem>
                  <SelectItem value="deprecated">Deprecated</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="estimatedExecutionTime">Estimated Time (minutes)</Label>
              <Input
                id="estimatedExecutionTime"
                type="number"
                min="1"
                value={estimatedTimeText}
                onChange={(e) => {
                  const next = e.target.value
                  setEstimatedTimeText(next)
                  const parsed = parseInt(next, 10)
                  if (Number.isFinite(parsed)) {
                    setFormData(prev => ({ ...prev, estimatedExecutionTime: parsed }))
                  }
                }}
                onBlur={() => {
                  const parsed = parseInt(estimatedTimeText, 10)
                  const normalized = Number.isFinite(parsed) && parsed > 0 ? parsed : 1
                  setEstimatedTimeText(String(normalized))
                  setFormData(prev => ({ ...prev, estimatedExecutionTime: normalized }))
                }}
              />
            </div>
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

          <div className="space-y-2">
            <Label htmlFor="requirements">Requirements</Label>
            <Textarea
              id="requirements"
              value={formData.requirements || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, requirements: e.target.value }))}
              placeholder="Related requirements or user stories"
              rows={2}
            />
          </div>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row justify-end gap-3 pt-4 border-t">
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Saving...' : (testCase?._id ? 'Update Test Case' : 'Create Test Case')}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}