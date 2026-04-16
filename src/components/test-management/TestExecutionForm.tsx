'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/Badge'
import { Bold, Italic, Link as LinkIcon, List, ListOrdered, Code } from 'lucide-react'

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

interface TestSuite {
  _id: string
  name: string
}

interface TestCase {
  _id: string
  title: string
  priority: string
  category: string
  estimatedExecutionTime: number
  testSuite?: { _id?: string; name?: string } | string
}

interface TestPlan {
  _id: string
  name: string
  version?: string
}

interface TestExecutionFormProps {
  testExecution?: TestExecution
  /** When executing from a specific case context (optional). */
  testCase?: TestCase
  /** When executing from a URL (optional). */
  initialTestCaseId?: string
  projectId: string
  onSave: (testExecution: TestExecution) => void
  onCancel: () => void
  loading?: boolean
}

export function TestExecutionForm({
  testExecution,
  testCase,
  initialTestCaseId,
  projectId,
  onSave,
  onCancel,
  loading = false,
}: TestExecutionFormProps) {
  const isEdit = !!testExecution?._id

  const [formData, setFormData] = useState<TestExecution>(() => ({
    testCase: '',
    testPlan: undefined,
    status: 'passed',
    actualResult: '',
    comments: '',
    executionTime: 0,
    environment: '',
    version: '',
    attachments: [],
    ...testExecution,
  }))

  const [testSuites, setTestSuites] = useState<TestSuite[]>([])
  const [selectedSuiteId, setSelectedSuiteId] = useState<string>('')
  const [testCases, setTestCases] = useState<TestCase[]>([])
  const [autoTestPlans, setAutoTestPlans] = useState<TestPlan[]>([])
  const [editTestPlan, setEditTestPlan] = useState<TestPlan | null>(null)

  const [executionTimeText, setExecutionTimeText] = useState<string>(() => {
    const v = testExecution?.executionTime
    return typeof v === 'number' && v > 0 ? String(v) : ''
  })

  const [errors, setErrors] = useState<Record<string, string>>({})
  const actualResultRef = useRef<HTMLTextAreaElement>(null)

  const prefillTestCaseId = testCase?._id || initialTestCaseId || ''

  useEffect(() => {
    // When switching between edit/create or changing the record, reset form state.
    setFormData({
      testCase: '',
      testPlan: undefined,
      status: 'passed',
      actualResult: '',
      comments: '',
      executionTime: 0,
      environment: '',
      version: '',
      attachments: [],
      ...testExecution,
    })

    const v = testExecution?.executionTime
    setExecutionTimeText(typeof v === 'number' && v > 0 ? String(v) : '')
    setErrors({})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [testExecution?._id])

  useEffect(() => {
    // Reset project-scoped lists immediately to avoid stale data.
    setTestSuites([])
    setSelectedSuiteId('')
    setTestCases([])
    setAutoTestPlans([])

    if (!projectId) return

    const fetchSuites = async () => {
      try {
        const res = await fetch(`/api/test-suites?projectId=${encodeURIComponent(projectId)}`)
        const data = await res.json().catch(() => ({}))
        if (data?.success && Array.isArray(data.data)) {
          const suites = (data.data as Array<{ _id: string; name: string }>).map((s) => ({ _id: s._id, name: s.name }))
          setTestSuites(suites)
        }
      } catch (e) {
        console.error('Error fetching test suites:', e)
      }
    }

    fetchSuites()
  }, [projectId])

  useEffect(() => {
    if (isEdit) return
    if (!projectId) return
    if (!prefillTestCaseId) return

    // When launching from a specific test case, infer its suite so the user sees the filtered list.
    const prime = async () => {
      try {
        const res = await fetch(`/api/test-cases/${encodeURIComponent(prefillTestCaseId)}`)
        const data = await res.json().catch(() => ({}))
        if (!res.ok || !data?.success || !data?.data) return

        const suiteId = (data.data?.testSuite && typeof data.data.testSuite === 'object')
          ? data.data.testSuite._id
          : data.data?.testSuite

        if (suiteId && typeof suiteId === 'string') {
          setSelectedSuiteId(suiteId)
        }

        setFormData((prev) => ({
          ...prev,
          testCase: prefillTestCaseId,
        }))
      } catch (e) {
        console.error('Error priming test case selection:', e)
      }
    }

    prime()
  }, [isEdit, prefillTestCaseId, projectId])

  useEffect(() => {
    if (isEdit) return
    if (!projectId || !selectedSuiteId) return

    const fetchCases = async () => {
      try {
        const res = await fetch(
          `/api/test-cases?projectId=${encodeURIComponent(projectId)}&testSuiteId=${encodeURIComponent(selectedSuiteId)}&page=1&limit=500`
        )
        const data = await res.json().catch(() => ({}))
        if (data?.success && Array.isArray(data.data)) {
          setTestCases(data.data)
        } else {
          setTestCases([])
        }
      } catch (e) {
        console.error('Error fetching test cases:', e)
        setTestCases([])
      }
    }

    fetchCases()
  }, [isEdit, projectId, selectedSuiteId])

  const selectedTestCase = useMemo(() => {
    if (!formData.testCase) return undefined
    return testCases.find((tc) => tc._id === formData.testCase)
  }, [formData.testCase, testCases])

  useEffect(() => {
    if (isEdit) return
    if (!projectId || !formData.testCase) {
      setAutoTestPlans([])
      setFormData((prev) => ({ ...prev, testPlan: undefined }))
      return
    }

    const fetchPlans = async () => {
      try {
        const res = await fetch(
          `/api/test-plans?projectId=${encodeURIComponent(projectId)}&testCaseId=${encodeURIComponent(formData.testCase)}&page=1&limit=50`
        )
        const data = await res.json().catch(() => ({}))
        const plans: TestPlan[] = data?.success && Array.isArray(data.data)
          ? (data.data as Array<{ _id: string; name: string; version?: string }>).map((p) => ({
              _id: p._id,
              name: p.name,
              version: p.version,
            }))
          : []

        setAutoTestPlans(plans)
        setFormData((prev) => ({
          ...prev,
          testPlan: plans[0]?._id,
        }))
      } catch (e) {
        console.error('Error fetching test plans:', e)
        setAutoTestPlans([])
        setFormData((prev) => ({ ...prev, testPlan: undefined }))
      }
    }

    fetchPlans()
  }, [isEdit, formData.testCase, projectId])

  useEffect(() => {
    if (!isEdit) {
      setEditTestPlan(null)
      return
    }

    const id = formData.testPlan
    if (!id) {
      setEditTestPlan(null)
      return
    }

    const fetchPlan = async () => {
      try {
        const res = await fetch(`/api/test-plans/${encodeURIComponent(id)}`)
        const data = (await res.json().catch(() => ({}))) as {
          success?: boolean
          data?: { _id: string; name: string; version?: string }
        }

        if (res.ok && data?.success && data.data?._id) {
          setEditTestPlan({ _id: data.data._id, name: data.data.name, version: data.data.version })
        } else {
          setEditTestPlan(null)
        }
      } catch {
        setEditTestPlan(null)
      }
    }

    fetchPlan()
  }, [isEdit, formData.testPlan])

  const stripHtmlToText = (value: string) => {
    // Actual result is stored as plain text, but keep this helper for future-proof validation.
    return (value || '').replace(/\s+/g, ' ').trim()
  }

  const validateForm = () => {
    const next: Record<string, string> = {}

    if (!isEdit) {
      if (!selectedSuiteId) next.testSuite = 'Test suite is required'
      if (!formData.testCase) next.testCase = 'Test case is required'
    }

    if (!formData.status) {
      next.status = 'Status is required'
    }

    if (!stripHtmlToText(formData.actualResult)) {
      next.actualResult = 'Actual result is required'
    }

    setErrors(next)
    return Object.keys(next).length === 0
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!validateForm()) return

    const normalizedExecutionTime = (() => {
      const raw = executionTimeText.trim()
      if (!raw) return 0
      const parsed = parseInt(raw, 10)
      return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
    })()

    onSave({
      ...formData,
      executionTime: normalizedExecutionTime,
    })
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'passed':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
      case 'failed':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
      case 'blocked':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
      case 'skipped':
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
    }
  }

  const insertIntoActualResult = (opts: {
    prefix?: string
    suffix?: string
    multilinePrefix?: string
    sampleText?: string
  }) => {
    const el = actualResultRef.current
    if (!el) return

    const start = el.selectionStart ?? 0
    const end = el.selectionEnd ?? 0
    const current = formData.actualResult || ''
    const selected = current.slice(start, end)

    const prefix = opts.prefix ?? ''
    const suffix = opts.suffix ?? ''

    let nextText = ''

    if (opts.multilinePrefix) {
      const multilinePrefix = opts.multilinePrefix
      const base = selected || opts.sampleText || ''
      const lines = base.split(/\r?\n/)
      const prefixed = lines
        .map((l) => (l ? `${multilinePrefix}${l}` : multilinePrefix.trimEnd()))
        .join('\n')
      nextText = current.slice(0, start) + prefixed + current.slice(end)
    } else {
      const base = selected || opts.sampleText || ''
      nextText = current.slice(0, start) + prefix + base + suffix + current.slice(end)
    }

    setFormData((prev) => ({ ...prev, actualResult: nextText }))

    queueMicrotask(() => {
      try {
        el.focus()
        const cursor = start + prefix.length + (selected ? selected.length : (opts.sampleText?.length ?? 0))
        el.setSelectionRange(cursor, cursor)
      } catch {
        // ignore
      }
    })
  }

  const selectedPlan = autoTestPlans[0]
  const displayedPlan = isEdit ? editTestPlan : selectedPlan

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {!isEdit && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
          <div className="space-y-2">
            <Label htmlFor="testSuite">Test Suite *</Label>
            <Select
              value={selectedSuiteId}
              onValueChange={(value) => {
                setSelectedSuiteId(value)
                setErrors((prev) => {
                  const next = { ...prev }
                  delete next.testSuite
                  return next
                })

                // Changing suite should reset dependent selections.
                setFormData((prev) => ({
                  ...prev,
                  testCase: '',
                  testPlan: undefined,
                }))
                setAutoTestPlans([])
              }}
            >
              <SelectTrigger className={errors.testSuite ? 'border-red-500' : ''}>
                <SelectValue placeholder="Select test suite" />
              </SelectTrigger>
              <SelectContent>
                {testSuites.map((s) => (
                  <SelectItem key={s._id} value={s._id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.testSuite && <p className="text-sm text-red-600">{errors.testSuite}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="testCase">Test Case *</Label>
            <Select
              value={formData.testCase}
              onValueChange={(value) => {
                setFormData((prev) => ({ ...prev, testCase: value }))
                setErrors((prev) => {
                  const next = { ...prev }
                  delete next.testCase
                  return next
                })
              }}
              disabled={!selectedSuiteId || !!testCase}
            >
              <SelectTrigger className={errors.testCase ? 'border-red-500' : ''}>
                <SelectValue placeholder={selectedSuiteId ? 'Select test case' : 'Select a suite first'} />
              </SelectTrigger>
              <SelectContent>
                {testCases.map((tc) => (
                  <SelectItem key={tc._id} value={tc._id}>
                    <div className="flex items-center justify-between w-full">
                      <span className="truncate">{tc.title}</span>
                      <div className="flex items-center space-x-2 ml-4 shrink-0">
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
          </div>

          {selectedTestCase && (
            <div className="sm:col-span-2 rounded-lg border bg-muted/30 p-3">
              <div className="text-sm font-medium">{selectedTestCase.title}</div>
              <div className="text-xs text-muted-foreground">
                Estimated time: {selectedTestCase.estimatedExecutionTime} minutes
              </div>
            </div>
          )}
        </div>
      )}

      {displayedPlan && (
        <div className="space-y-2">
          <Label>Test Plan</Label>
          <div className="rounded-lg border bg-muted/30 p-3">
            <div className="text-sm font-medium">
              {displayedPlan.name}{displayedPlan.version ? ` (${displayedPlan.version})` : ''}
            </div>
            {!isEdit && autoTestPlans.length > 1 && (
              <div className="text-xs text-muted-foreground">
                Also included in {autoTestPlans.length - 1} other active plan{autoTestPlans.length - 1 === 1 ? '' : 's'}.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Execution Details */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
        <div className="space-y-2">
          <Label htmlFor="status">Status *</Label>
          <Select
            value={formData.status}
            onValueChange={(value) => setFormData((prev) => ({ ...prev, status: value as TestExecution['status'] }))}
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
            value={executionTimeText}
            onChange={(e) => {
              const next = e.target.value
              setExecutionTimeText(next)
              const parsed = next.trim() ? parseInt(next, 10) : 0
              setFormData((prev) => ({
                ...prev,
                executionTime: Number.isFinite(parsed) && parsed >= 0 ? parsed : 0,
              }))
            }}
            placeholder="e.g., 10"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
        <div className="space-y-2">
          <Label htmlFor="environment">Environment</Label>
          <Input
            id="environment"
            value={formData.environment}
            onChange={(e) => setFormData((prev) => ({ ...prev, environment: e.target.value }))}
            placeholder="e.g., Development, Staging, Production"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="version">Version</Label>
          <Input
            id="version"
            value={formData.version}
            onChange={(e) => setFormData((prev) => ({ ...prev, version: e.target.value }))}
            placeholder="e.g., v1.0.0"
          />
        </div>
      </div>

      {/* Results */}
      <div className="space-y-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <Label htmlFor="actualResult">Actual Result *</Label>
          <div className="flex flex-wrap items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 px-2"
              onClick={() => insertIntoActualResult({ prefix: '**', suffix: '**', sampleText: 'bold text' })}
              title="Bold"
            >
              <Bold className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 px-2"
              onClick={() => insertIntoActualResult({ prefix: '*', suffix: '*', sampleText: 'italic text' })}
              title="Italic"
            >
              <Italic className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 px-2"
              onClick={() => insertIntoActualResult({ multilinePrefix: '- ', sampleText: 'Item 1\nItem 2' })}
              title="Bulleted list"
            >
              <List className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 px-2"
              onClick={() => insertIntoActualResult({ multilinePrefix: '1. ', sampleText: 'Step 1\nStep 2' })}
              title="Numbered list"
            >
              <ListOrdered className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 px-2"
              onClick={() => insertIntoActualResult({ prefix: '`', suffix: '`', sampleText: 'code' })}
              title="Inline code"
            >
              <Code className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 px-2"
              onClick={() => insertIntoActualResult({ prefix: '[', suffix: '](https://)', sampleText: 'link text' })}
              title="Link"
            >
              <LinkIcon className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <Textarea
          id="actualResult"
          ref={actualResultRef}
          value={formData.actualResult}
          onChange={(e) => setFormData((prev) => ({ ...prev, actualResult: e.target.value }))}
          placeholder="Describe what actually happened during the test execution"
          rows={6}
          className={errors.actualResult ? 'border-red-500' : ''}
        />
        {errors.actualResult && <p className="text-sm text-red-600">{errors.actualResult}</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor="comments">Comments</Label>
        <Textarea
          id="comments"
          value={formData.comments}
          onChange={(e) => setFormData((prev) => ({ ...prev, comments: e.target.value }))}
          placeholder="Additional notes, issues, or observations"
          rows={4}
        />
      </div>

      {/* Status Preview */}
      {formData.status && (
        <div className="rounded-lg border bg-muted/30 p-4">
          <div className="flex items-center gap-2">
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
        <Button id="test-execution-submit" type="submit" disabled={loading}>
          {loading ? 'Saving...' : (isEdit ? 'Update Execution' : 'Record Execution')}
        </Button>
      </div>
    </form>
  )
}
