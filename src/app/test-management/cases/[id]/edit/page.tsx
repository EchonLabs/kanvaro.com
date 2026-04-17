'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { MainLayout } from '@/components/layout/MainLayout'
import { PermissionGate } from '@/lib/permissions/permission-components'
import { Permission } from '@/lib/permissions'
import { useBreadcrumb } from '@/contexts/BreadcrumbContext'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { TestCaseForm } from '@/components/test-management/TestCaseForm'
import { useNotify } from '@/lib/notify'

export default function EditTestCasePage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const searchParams = useSearchParams()
  const { setItems } = useBreadcrumb()
  const { success: notifySuccess, error: notifyError } = useNotify()

  const id = params?.id
  const projectIdFromQuery = searchParams.get('projectId') || ''

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testCase, setTestCase] = useState<any | null>(null)

  const projectName = testCase?.project?.name
  const projectId = useMemo(() => {
    const fromCase = testCase?.project?._id || testCase?.project
    return (fromCase && typeof fromCase === 'string' ? fromCase : fromCase?._id) || projectIdFromQuery
  }, [testCase, projectIdFromQuery])

  useEffect(() => {
    setItems([
      { label: 'Test Management', href: '/test-management' },
      { label: 'Test Cases', href: '/test-management/cases' },
      { label: 'Edit Test Case' },
    ])
  }, [setItems])

  useEffect(() => {
    if (!id) return

    const fetchTestCase = async () => {
      try {
        setLoading(true)
        const res = await fetch(`/api/test-cases/${id}`)
        const data = await res.json().catch(() => ({}))
        if (data?.success) {
          setTestCase(data.data)
        } else {
          setTestCase(null)
        }
      } catch (e) {
        console.error('Error fetching test case:', e)
        setTestCase(null)
      } finally {
        setLoading(false)
      }
    }

    fetchTestCase()
  }, [id])

  const mappedFormData = useMemo(() => {
    if (!testCase) return null
    return {
      _id: testCase._id,
      title: testCase.title,
      description: testCase.description || '',
      preconditions: testCase.preconditions || '',
      steps: testCase.steps || [{ step: '', expectedResult: '' }],
      expectedResult: testCase.expectedResult || '',
      testData: testCase.testData || '',
      priority: testCase.priority,
      category: testCase.category,
      automationStatus: testCase.automationStatus,
      estimatedExecutionTime: testCase.estimatedExecutionTime,
      testSuite: testCase.testSuite?._id || testCase.testSuite,
      tags: testCase.tags || [],
      requirements: testCase.requirements || '',
    }
  }, [testCase])

  const handleSave = async (testCaseData: any) => {
    if (!id) return

    setSaving(true)
    try {
      const res = await fetch(`/api/test-cases/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...testCaseData,
          testSuiteId: testCaseData.testSuite,
        }),
      })

      const data = await res.json().catch(() => ({}))

      if (res.ok && (data as any)?.success) {
        notifySuccess({ title: 'Test case updated.' })
        if (projectId) {
          router.push(`/test-management/cases?projectId=${encodeURIComponent(projectId)}`)
        } else {
          router.push('/test-management/cases')
        }
      } else {
        notifyError({
          title: 'Failed to update test case.',
          message: (data as any)?.error || 'Please try again.'
        })
        console.error('Failed to update test case', data)
      }
    } catch (e) {
      notifyError({ title: 'Failed to update test case.', message: 'Please try again.' })
      console.error('Error updating test case:', e)
    } finally {
      setSaving(false)
    }
  }

  return (
    <MainLayout>
      <PermissionGate permission={Permission.TEST_MANAGE}>
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Edit Test Case</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {loading ? (
                <div className="text-sm text-muted-foreground">Loading test case…</div>
              ) : (
                <div className="text-sm">
                  <span className="text-muted-foreground">Project: </span>
                  <span className="font-medium">{projectName || '—'}</span>
                </div>
              )}
            </CardContent>
          </Card>

          {mappedFormData && projectId && (
            <TestCaseForm
              testCase={mappedFormData as any}
              projectId={projectId}
              onSave={handleSave}
              onCancel={() => router.back()}
              loading={saving}
            />
          )}
        </div>
      </PermissionGate>
    </MainLayout>
  )
}
