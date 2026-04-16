'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { MainLayout } from '@/components/layout/MainLayout'
import { useBreadcrumb } from '@/contexts/BreadcrumbContext'
import { PermissionGate } from '@/lib/permissions/permission-components'
import { Permission } from '@/lib/permissions'
import { TestPlanForm } from '@/components/test-management/TestPlanForm'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useNotify } from '@/lib/notify'

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

interface ProjectOption {
  _id: string
  name: string
}

export default function NewTestPlanPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { setItems } = useBreadcrumb()
  const { success: notifySuccess, error: notifyError } = useNotify()

  const [projects, setProjects] = useState<ProjectOption[]>([])
  const [loadingProjects, setLoadingProjects] = useState(false)

  const [projectId, setProjectId] = useState<string>('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setItems([
      { label: 'Test Management', href: '/test-management' },
      { label: 'Test Plans', href: '/test-management/plans' },
      { label: 'Create Test Plan' },
    ])
  }, [setItems])

  useEffect(() => {
    const loadProjects = async () => {
      setLoadingProjects(true)
      try {
        const res = await fetch('/api/projects?limit=1000')
        const data = await res.json().catch(() => ({}))

        const list: any[] = (res.ok && data?.success && Array.isArray(data.data)) ? data.data : []
        const options: ProjectOption[] = list
          .filter((p) => p?._id && p?.name)
          .map((p) => ({ _id: String(p._id), name: String(p.name) }))

        setProjects(options)
      } catch (e) {
        console.error('Error fetching projects:', e)
        setProjects([])
      } finally {
        setLoadingProjects(false)
      }
    }

    loadProjects()
  }, [])

  useEffect(() => {
    if (projects.length === 0) return

    const fromQuery = searchParams.get('projectId')
    const queryProjectId = fromQuery && projects.some((p) => p._id === fromQuery) ? fromQuery : null

    const currentValid = projectId && projects.some((p) => p._id === projectId) ? projectId : ''
    const desired = queryProjectId ?? currentValid ?? projects[0]._id

    if (desired && desired !== projectId) setProjectId(desired)
  }, [projects, searchParams, projectId])

  const handleProjectChange = (value: string) => {
    setProjectId(value)

    const params = new URLSearchParams(searchParams.toString())
    params.set('projectId', value)
    router.replace(`/test-management/plans/new?${params.toString()}`)
  }

  const handleSave = async (testPlanData: TestPlan) => {
    if (!projectId) return
    setSaving(true)
    try {
      const response = await fetch('/api/test-plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...testPlanData,
          projectId,
        })
      })

      const data = await response.json().catch(() => ({}))

      if (response.ok && (data as any)?.success) {
        notifySuccess({ title: 'Test plan created.' })
        router.push('/test-management/plans')
      } else {
        notifyError({
          title: 'Failed to create test plan.',
          message: (data as any)?.error || 'Please check the form and try again.'
        })
        console.error('Failed to create test plan', data)
      }
    } catch (error) {
      notifyError({ title: 'Failed to create test plan.', message: 'Please try again.' })
      console.error('Error creating test plan:', error)
    } finally {
      setSaving(false)
    }
  }

  return (
    <MainLayout>
      <PermissionGate permission={Permission.TEST_MANAGE}>
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold">Create Test Plan</h1>
            <p className="text-muted-foreground">Create a test plan and select test cases by suite.</p>
          </div>

          <div className="space-y-2 max-w-xl">
            <Label>Project *</Label>
            <Select value={projectId} onValueChange={handleProjectChange} disabled={loadingProjects || projects.length === 0}>
              <SelectTrigger>
                <SelectValue placeholder={loadingProjects ? 'Loading projects…' : 'Select a project'} />
              </SelectTrigger>
              <SelectContent>
                {projects.map((p) => (
                  <SelectItem key={p._id} value={p._id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {projects.length === 0 && !loadingProjects && (
              <p className="text-sm text-muted-foreground">No projects available.</p>
            )}
          </div>

          {!projectId ? (
            <div className="text-sm text-muted-foreground">Select a project to continue.</div>
          ) : (
            <TestPlanForm
              projectId={projectId}
              onSave={handleSave}
              onCancel={() => router.push('/test-management/plans')}
              loading={saving}
            />
          )}
        </div>
      </PermissionGate>
    </MainLayout>
  )
}
