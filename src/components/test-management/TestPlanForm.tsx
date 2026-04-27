'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/Badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Checkbox } from '@/components/ui/Checkbox'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/Popover'
import { CalendarIcon, X } from 'lucide-react'
import { format } from 'date-fns'
import { formatToTitleCase } from '@/lib/utils'
import { RichTextEditor } from '@/components/ui/RichTextEditor'
import { validateAndCorrectDateRange, isValidDateRange } from '@/lib/dateRangeValidation'

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
  testSuite?: { _id?: string; name?: string } | string
}

interface User {
  _id: string
  firstName: string
  lastName: string
  email: string
  role?: string
  customRole?: { _id?: string; name?: string } | string | null
}

interface TestSuite {
  _id: string
  name: string
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
  const [qaUsers, setQaUsers] = useState<User[]>([])
  const [testSuites, setTestSuites] = useState<TestSuite[]>([])
  const [newTag, setNewTag] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [testCaseSearch, setTestCaseSearch] = useState('')
  const [testCasePriority, setTestCasePriority] = useState<string>('all')
  const [testCaseCategory, setTestCaseCategory] = useState<string>('all')
  const [expandedSuites, setExpandedSuites] = useState<Set<string>>(new Set())

  useEffect(() => {
    // Reset project-scoped lists immediately to avoid showing stale data while refetching.
    setTestCases([])
    setQaUsers([])
    setTestSuites([])

    if (!projectId) return

    fetchTestCases()
    fetchProjectQAs()
    fetchTestSuites()
  }, [projectId])

  useEffect(() => {
    setFormData((prev) => {
      const next: TestPlan = { ...prev, project: projectId }

      // When creating a new plan, switching projects should clear project-scoped selections.
      if (!testPlan?._id) {
        next.assignedTo = undefined
        next.testCases = []
      }

      return next
    })
  }, [projectId, testPlan?._id])

  const fetchTestCases = async () => {
    try {
      // Use a high limit so selection UI can search/filter client-side.
      const response = await fetch(`/api/test-cases?projectId=${projectId}&page=1&limit=10000`)
      const data = await response.json()
      if (data.success) {
        setTestCases(data.data)
      }
    } catch (error) {
      console.error('Error fetching test cases:', error)
    }
  }

  const fetchProjectQAs = async () => {
    try {
      const response = await fetch(`/api/projects/${projectId}/team`)
      const data = await response.json()
      if (!data?.success) return

      const teamMembers: User[] = Array.isArray(data?.data?.teamMembers) ? data.data.teamMembers : []
      const projectRoles: any[] = Array.isArray(data?.data?.projectRoles) ? data.data.projectRoles : []

      const isQAUser = (u: any): boolean => {
        const globalRole = String(u?.role || '').toLowerCase()
        if (['qa_engineer', 'tester'].includes(globalRole)) return true

        const cr = u?.customRole
        const crName = (cr && typeof cr === 'object') ? String(cr.name || '') : ''
        if (!crName) return false

        // Prefer explicit QA naming, but allow broader matching
        if (/\bqa\b/i.test(crName)) return true
        if (/quality\s*assurance/i.test(crName)) return true
        if (/qa/i.test(crName)) return true

        return false
      }

      const qaProjectRoleUsers: User[] = projectRoles
        .filter((pr: any) => pr?.user && (['project_qa_lead', 'project_tester'].includes(pr.role) || isQAUser(pr.user)))
        .map((pr: any) => pr.user)

      const qaTeamMembers: User[] = teamMembers.filter(isQAUser)

      const byId = new Map<string, User>()
      ;[...qaProjectRoleUsers, ...qaTeamMembers].forEach((u) => {
        if (u?._id) byId.set(u._id, u)
      })

      setQaUsers(Array.from(byId.values()).sort((a, b) => {
        const an = `${a.firstName ?? ''} ${a.lastName ?? ''}`.trim()
        const bn = `${b.firstName ?? ''} ${b.lastName ?? ''}`.trim()
        return an.localeCompare(bn)
      }))
    } catch (error) {
      console.error('Error fetching project QAs:', error)
    }
  }

  const fetchTestSuites = async () => {
    try {
      const response = await fetch(`/api/test-suites?projectId=${projectId}`)
      const data = await response.json()
      if (data?.success && Array.isArray(data.data)) {
        setTestSuites(data.data.map((s: any) => ({ _id: s._id, name: s.name })))
      }
    } catch (error) {
      console.error('Error fetching test suites:', error)
    }
  }

  const stripHtmlToText = (html: string) => {
    return (html || '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  }

  const validateForm = () => {
    const newErrors: Record<string, string> = {}

    if (!formData.name.trim()) {
      newErrors.name = 'Name is required'
    }
    if (!stripHtmlToText(formData.description).trim()) {
      newErrors.description = 'Description is required'
    }
    if (!formData.version.trim()) {
      newErrors.version = 'Version is required'
    }

    if (!isValidDateRange(formData.startDate, formData.endDate)) {
      newErrors.dateRange = 'End date cannot be earlier than start date'
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

  const toggleSuiteExpanded = (suiteId: string) => {
    setExpandedSuites(prev => {
      const next = new Set(prev)
      if (next.has(suiteId)) next.delete(suiteId)
      else next.add(suiteId)
      return next
    })
  }

  const toggleSelectAllInSuite = (suiteId: string, suiteTestCases: TestCase[]) => {
    const suiteIds = suiteTestCases.map(tc => tc._id)
    const allSelected = suiteIds.every(id => formData.testCases.includes(id))
    setFormData(prev => ({
      ...prev,
      testCases: allSelected
        ? prev.testCases.filter(id => !suiteIds.includes(id))
        : Array.from(new Set([...prev.testCases, ...suiteIds]))
    }))
  }

  const handleStartDateSelect = (date: Date | undefined) => {
    setFormData(prev => {
      const corrected = validateAndCorrectDateRange(date, prev.endDate)
      return { ...prev, startDate: corrected.from, endDate: corrected.to }
    })
    setErrors(prev => {
      const { dateRange, ...rest } = prev
      return rest
    })
  }

  const handleEndDateSelect = (date: Date | undefined) => {
    setFormData(prev => {
      const corrected = validateAndCorrectDateRange(prev.startDate, date)
      return { ...prev, startDate: corrected.from, endDate: corrected.to }
    })
    setErrors(prev => {
      const { dateRange, ...rest } = prev
      return rest
    })
  }

  const getTestSuiteId = (tc: TestCase): string => {
    const suite = tc.testSuite as any
    if (!suite) return 'unspecified'
    if (typeof suite === 'string') return suite
    if (suite?._id) return String(suite._id)
    return 'unspecified'
  }

  const getTestSuiteName = (suiteId: string): string => {
    if (suiteId === 'unspecified') return 'Unassigned Suite'
    const fromSuites = testSuites.find(s => s._id === suiteId)?.name
    if (fromSuites) return fromSuites
    // Fallback: infer from populated testSuite on any case
    const anyCase = testCases.find(tc => getTestSuiteId(tc) === suiteId)
    const suite = (anyCase?.testSuite as any)
    if (suite && typeof suite !== 'string' && suite?.name) return suite.name
    return 'Test Suite'
  }

  const filteredTestCases = testCases.filter(tc => {
    const query = testCaseSearch.trim().toLowerCase()
    if (query && !tc.title.toLowerCase().includes(query)) return false
    if (testCasePriority !== 'all' && tc.priority !== testCasePriority) return false
    if (testCaseCategory !== 'all' && tc.category !== testCaseCategory) return false
    return true
  })

  const suiteIdsToRender = (() => {
    // Primary: suites belonging to the selected project (show even if empty)
    const orderedFromSuites = testSuites.map((s) => s._id)

    // Fallback/extra: suites inferred from test case payload (handles stale/populated data)
    const extraFromCases = Array.from(new Set(filteredTestCases.map(getTestSuiteId)))
      .filter((id) => id && id !== 'unspecified' && !orderedFromSuites.includes(id))
      .sort((a, b) => getTestSuiteName(a).localeCompare(getTestSuiteName(b)))

    const ids = [...orderedFromSuites, ...extraFromCases]

    // If we ever have unassigned cases, show a dedicated group.
    const hasUnassigned = filteredTestCases.some((tc) => getTestSuiteId(tc) === 'unspecified')
    if (hasUnassigned) ids.push('unspecified')

    // Ensure uniqueness without reordering.
    return ids.filter((id, idx) => ids.indexOf(id) === idx)
  })()

  const suiteIdsToRenderKey = suiteIdsToRender.join('|')

  useEffect(() => {
    // Keep suites expanded by default when list changes (new project, filters, etc.)
    setExpandedSuites(new Set(suiteIdsToRender))
  }, [suiteIdsToRenderKey])

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
            <RichTextEditor
              value={formData.description}
              onChange={(value) => setFormData(prev => ({ ...prev, description: value }))}
              placeholder="Describe the purpose and scope of this test plan"
              className={errors.description ? 'border border-red-500 rounded-md' : undefined}
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
                  {qaUsers.map((user) => (
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
                    onSelect={handleStartDateSelect}
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
                    onSelect={handleEndDateSelect}
                    disabled={formData.startDate ? { before: formData.startDate } : undefined}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {errors.dateRange && <p className="text-sm text-red-600">{errors.dateRange}</p>}

          {/* Test Cases Selection */}
          <div className="space-y-4">
            <Label>Test Cases</Label>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Search</Label>
              <Input
                value={testCaseSearch}
                onChange={(e) => setTestCaseSearch(e.target.value)}
                placeholder="Search test cases"
              />
            </div>

            <div className="border rounded-lg p-4 max-h-[420px] overflow-y-auto space-y-3">
              {testSuites.length === 0 && testCases.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No test suites available for this project
                </p>
              ) : filteredTestCases.length === 0 && testCases.length > 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No matching test cases
                </p>
              ) : (
                <div className="space-y-3">
                  {suiteIdsToRender.map((suiteId) => {
                    const suiteName = getTestSuiteName(suiteId)
                    const suiteTestCases = filteredTestCases.filter(tc => getTestSuiteId(tc) === suiteId)

                    const selectedCount = suiteTestCases.filter(tc => formData.testCases.includes(tc._id)).length
                    const allSelected = suiteTestCases.length > 0 && selectedCount === suiteTestCases.length
                    const isExpanded = expandedSuites.has(suiteId)

                    return (
                      <div key={suiteId} className="border rounded-lg">
                        <div
                          className="flex items-center justify-between p-3 cursor-pointer hover:bg-muted/50"
                          onClick={() => toggleSuiteExpanded(suiteId)}
                        >
                          <div className="flex items-center space-x-2">
                            <span className="font-medium">{suiteName}</span>
                            <span className="text-sm text-muted-foreground">
                              ({selectedCount}/{suiteTestCases.length})
                            </span>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              disabled={suiteTestCases.length === 0}
                              onClick={(e) => {
                                e.stopPropagation()
                                toggleSelectAllInSuite(suiteId, suiteTestCases)
                              }}
                            >
                              {allSelected ? 'Deselect All' : 'Select All'}
                            </Button>
                            <span className="text-muted-foreground">
                              {isExpanded ? '▼' : '▶'}
                            </span>
                          </div>
                        </div>

                        {isExpanded && (
                          <div className="border-t p-3 space-y-2">
                            {suiteTestCases.length === 0 ? (
                              <p className="text-sm text-muted-foreground text-center py-2">
                                No test cases in this suite
                              </p>
                            ) : (
                              suiteTestCases.map((testCase) => (
                                <div key={testCase._id} className="flex items-start space-x-3">
                                  <Checkbox
                                    id={testCase._id}
                                    checked={formData.testCases.includes(testCase._id)}
                                    onCheckedChange={() => toggleTestCase(testCase._id)}
                                  />
                                  <div className="flex-1">
                                    <Label htmlFor={testCase._id} className="text-sm font-medium cursor-pointer">
                                      {testCase.title}
                                    </Label>
                                    <div className="flex items-center space-x-2 mt-1">
                                      <Badge variant="outline" className="text-xs">
                                        {formatToTitleCase(testCase.priority)}
                                      </Badge>
                                      <Badge variant="secondary" className="text-xs">
                                        {formatToTitleCase(testCase.category)}
                                      </Badge>
                                    </div>
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {formData.testCases.length} test case(s) selected
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Priority</Label>
                <Select value={testCasePriority} onValueChange={setTestCasePriority}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Category</Label>
                <Select value={testCaseCategory} onValueChange={setTestCaseCategory}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="functional">Functional</SelectItem>
                    <SelectItem value="regression">Regression</SelectItem>
                    <SelectItem value="integration">Integration</SelectItem>
                    <SelectItem value="performance">Performance</SelectItem>
                    <SelectItem value="security">Security</SelectItem>
                    <SelectItem value="usability">Usability</SelectItem>
                    <SelectItem value="compatibility">Compatibility</SelectItem>
                  </SelectContent>
                </Select>
              </div>
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
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
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
