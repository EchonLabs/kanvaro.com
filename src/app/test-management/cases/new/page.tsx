'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { MainLayout } from '@/components/layout/MainLayout'
import { PermissionGate } from '@/lib/permissions/permission-components'
import { Permission } from '@/lib/permissions'
import { useBreadcrumb } from '@/contexts/BreadcrumbContext'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { TestCaseForm } from '@/components/test-management/TestCaseForm'
import { useNotify } from '@/lib/notify'

interface Project {
  _id: string
  name: string
}

export default function NewTestCasePage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { setItems } = useBreadcrumb()
  const { success: notifySuccess, error: notifyError } = useNotify()

  const projectId = searchParams.get('projectId') || ''
  const initialSuiteId = searchParams.get('testSuiteId') || ''

  const [project, setProject] = useState<Project | null>(null)
  const [loadingProject, setLoadingProject] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setItems([
      { label: 'Test Management', href: '/test-management' },
      { label: 'Test Cases', href: '/test-management/cases' },
      { label: 'Create Test Case' },
    ])
  }, [setItems])

  useEffect(() => {
    if (!projectId) return

    const fetchProject = async () => {
      try {
        setLoadingProject(true)
        const res = await fetch(`/api/projects/${projectId}`)
        const data = await res.json().catch(() => ({}))
        if (data?.success) {
          setProject({ _id: data.data._id, name: data.data.name })
        } else {
          setProject(null)
        }
      } catch (e) {
        console.error('Error fetching project:', e)
        setProject(null)
      } finally {
        setLoadingProject(false)
      }
    }

    fetchProject()
  }, [projectId])

  const canRenderForm = useMemo(() => Boolean(projectId), [projectId])

  const handleSave = async (testCaseData: any) => {
    if (!projectId) return

    setSaving(true)
    try {
      const res = await fetch('/api/test-cases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...testCaseData,
          testSuiteId: testCaseData.testSuite,
          projectId,
        }),
      })

      const data = await res.json().catch(() => ({}))

      if (res.ok && (data as any)?.success) {
        notifySuccess({ title: 'Test case created.' })
        router.push(`/test-management/cases?projectId=${encodeURIComponent(projectId)}`)
      } else {
        notifyError({
          title: 'Failed to create test case.',
          message: (data as any)?.error || 'Please try again.'
        })
        console.error('Failed to create test case', data)
      }
    } catch (e) {
      notifyError({ title: 'Failed to create test case.', message: 'Please try again.' })
      console.error('Error creating test case:', e)
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
              <CardTitle>Create Test Case</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {!projectId ? (
                <div className="text-sm text-muted-foreground">
                  Please select a project from the Test Cases page first.
                </div>
              ) : loadingProject ? (
                <div className="text-sm text-muted-foreground">Loading project…</div>
              ) : (
                <div className="text-sm">
                  <span className="text-muted-foreground">Project: </span>
                  <span className="font-medium">{project?.name || '—'}</span>
                </div>
              )}
            </CardContent>
          </Card>

          {canRenderForm && (
            <TestCaseForm
              testCase={initialSuiteId ? ({ testSuite: initialSuiteId } as any) : undefined}
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
