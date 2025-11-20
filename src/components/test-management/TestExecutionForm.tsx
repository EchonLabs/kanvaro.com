'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { formatToTitleCase } from '@/lib/utils'

interface TestExecution {
  _id?: string
  testCase: string
  testPlan?: string
  status: 'passed' | 'failed' | 'blocked' | 'skipped'
  actualResult: string
  comments: string
  executionTime: number
  environment: string
  version: string
  attachments?: string[]
}

interface TestCase {
  _id: string
  title: string
  priority: string
  category: string
  estimatedExecutionTime: number
}

interface TestPlan {
  _id: string
  name: string
  version: string
}

interface TestExecutionFormProps {
  testExecution?: TestExecution
  testCase?: TestCase
  projectId: string
  onSave: (testExecution: TestExecution) => void
  onCancel: () => void
  loading?: boolean
}

export function TestExecutionForm({ 
  testExecution, 
  testCase, 
  projectId, 
  onSave, 
  onCancel, 
  loading = false 
}: TestExecutionFormProps) {
  const [formData, setFormData] = useState<TestExecution>({
    testCase: '',
    testPlan: '',
    status: 'passed',
    actualResult: '',
    comments: '',
    executionTime: 0,
    environment: '',
    version: '',
    attachments: [],
    ...testExecution
  })
  const [testCases, setTestCases] = useState<TestCase[]>([])
  const [testPlans, setTestPlans] = useState<TestPlan[]>([])
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    fetchTestCases()
    fetchTestPlans()
    
    // If a specific test case is provided, set it
    if (testCase) {
      setFormData(prev => ({ ...prev, testCase: testCase._id }))
    }
  }, [projectId, testCase])

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

  const fetchTestPlans = async () => {
    try {
      const response = await fetch(`/api/test-plans?projectId=${projectId}`)
      const data = await response.json()
      if (data.success) {
        setTestPlans(data.data)
      }
    } catch (error) {
      console.error('Error fetching test plans:', error)
    }
  }

  const validateForm = () => {
    const newErrors: Record<string, string> = {}

    if (!formData.testCase) {
      newErrors.testCase = 'Test case is required'
    }
    if (!formData.status) {
      newErrors.status = 'Status is required'
    }
    if (!formData.actualResult.trim()) {
      newErrors.actualResult = 'Actual result is required'
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

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'passed': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
      case 'failed': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
      case 'blocked': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
      case 'skipped': return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
    }
  }

  const selectedTestCase = testCases.find(tc => tc._id === formData.testCase)

  return (
    <Card className="w-full max-w-3xl mx-auto">
      <CardHeader>
        <CardTitle>
          {testExecution?._id ? 'Edit Test Execution' : 'Execute Test Case'}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Test Case Selection */}
          <div className="space-y-2">
            <Label htmlFor="testCase">Test Case *</Label>
            <Select 
              value={formData.testCase} 
              onValueChange={(value) => setFormData(prev => ({ ...prev, testCase: value }))}
              disabled={!!testCase}
            >
              <SelectTrigger className={errors.testCase ? 'border-red-500' : ''}>
                <SelectValue placeholder="Select test case" />
              </SelectTrigger>
              <SelectContent>
                {testCases.map((tc) => (
                  <SelectItem key={tc._id} value={tc._id}>
                    <div className="flex items-center justify-between w-full">
                      <span>{tc.title}</span>
                      <div className="flex items-center space-x-2 ml-4">
                        <Badge variant="outline" className="text-xs">
                          {tc.priority}
                        </Badge>
                        <Badge variant="secondary" className="text-xs">
                          {tc.category}
                        </Badge>
                      </div>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.testCase && <p className="text-sm text-red-600">{errors.testCase}</p>}
            
            {selectedTestCase && (
              <div className="mt-2 p-3 bg-muted rounded-lg">
                <p className="text-sm font-medium">{selectedTestCase.title}</p>
                <p className="text-xs text-muted-foreground">
                  Estimated time: {selectedTestCase.estimatedExecutionTime} minutes
                </p>
              </div>
            )}
          </div>

          {/* Test Plan Selection */}
          <div className="space-y-2">
            <Label htmlFor="testPlan">Test Plan (Optional)</Label>
            <Select 
              value={formData.testPlan || 'none'} 
              onValueChange={(value) => setFormData(prev => ({ ...prev, testPlan: value === 'none' ? undefined : value }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select test plan (optional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No test plan</SelectItem>
                {testPlans.map((plan) => (
                  <SelectItem key={plan._id} value={plan._id}>
                    {plan.name} ({plan.version})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Execution Details */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
            <div className="space-y-2">
              <Label htmlFor="status">Status *</Label>
              <Select 
                value={formData.status} 
                onValueChange={(value: any) => setFormData(prev => ({ ...prev, status: value }))}
              >
                <SelectTrigger className={errors.status ? 'border-red-500' : ''}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="passed">Passed</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                  <SelectItem value="blocked">Blocked</SelectItem>
                  <SelectItem value="skipped">Skipped</SelectItem>
                </SelectContent>
              </Select>
              {errors.status && <p className="text-sm text-red-600">{errors.status}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="executionTime">Execution Time (minutes)</Label>
              <Input
                id="executionTime"
                type="number"
                min="0"
                value={formData.executionTime}
                onChange={(e) => setFormData(prev => ({ ...prev, executionTime: parseInt(e.target.value) || 0 }))}
                placeholder="0"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
            <div className="space-y-2">
              <Label htmlFor="environment">Environment</Label>
              <Input
                id="environment"
                value={formData.environment}
                onChange={(e) => setFormData(prev => ({ ...prev, environment: e.target.value }))}
                placeholder="e.g., Development, Staging, Production"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="version">Version</Label>
              <Input
                id="version"
                value={formData.version}
                onChange={(e) => setFormData(prev => ({ ...prev, version: e.target.value }))}
                placeholder="e.g., v1.0.0"
              />
            </div>
          </div>

          {/* Results */}
          <div className="space-y-2">
            <Label htmlFor="actualResult">Actual Result *</Label>
            <Textarea
              id="actualResult"
              value={formData.actualResult}
              onChange={(e) => setFormData(prev => ({ ...prev, actualResult: e.target.value }))}
              placeholder="Describe what actually happened during the test execution"
              rows={4}
              className={errors.actualResult ? 'border-red-500' : ''}
            />
            {errors.actualResult && <p className="text-sm text-red-600">{errors.actualResult}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="comments">Comments</Label>
            <Textarea
              id="comments"
              value={formData.comments}
              onChange={(e) => setFormData(prev => ({ ...prev, comments: e.target.value }))}
              placeholder="Additional notes, issues, or observations"
              rows={3}
            />
          </div>

          {/* Status Preview */}
          {formData.status && (
            <div className="p-4 border rounded-lg bg-muted/50">
              <div className="flex items-center space-x-2">
                <span className="text-sm font-medium">Execution Status:</span>
                <Badge className={getStatusColor(formData.status)}>
                  {formData.status.charAt(0).toUpperCase() + formData.status.slice(1)}
                </Badge>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-col sm:flex-row justify-end gap-3 pt-4 border-t">
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Saving...' : (testExecution?._id ? 'Update Execution' : 'Record Execution')}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
