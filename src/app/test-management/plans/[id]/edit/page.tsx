'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { MainLayout } from '@/components/layout/MainLayout'
import { useBreadcrumb } from '@/contexts/BreadcrumbContext'
import { PermissionGate } from '@/lib/permissions/permission-components'
import { Permission } from '@/lib/permissions'
import { TestPlanForm } from '@/components/test-management/TestPlanForm'
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

export default function EditTestPlanPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const { setItems } = useBreadcrumb()
  const { success: notifySuccess, error: notifyError } = useNotify()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testPlan, setTestPlan] = useState<TestPlan | null>(null)

  useEffect(() => {
    setItems([
      { label: 'Test Management', href: '/test-management' },
      { label: 'Test Plans', href: '/test-management/plans' },
      { label: 'Edit Test Plan' },
    ])
  }, [setItems])

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/test-plans/${params.id}`)
        const data = await res.json()
        if (!res.ok || !data?.success) {
          console.error('Failed to load test plan', data)
          setTestPlan(null)
          return
        }

        const p = data.data
        const mapped: TestPlan = {
          _id: p._id,
          name: p.name,
          description: p.description,
          project: typeof p.project === 'object' && p.project?._id ? p.project._id : p.project,
          version: p.version,
          assignedTo: p.assignedTo?._id || p.assignedTo || undefined,
          startDate: p.startDate ? new Date(p.startDate) : undefined,
          endDate: p.endDate ? new Date(p.endDate) : undefined,
          testCases: Array.isArray(p.testCases) ? p.testCases.map((tc: any) => (typeof tc === 'string' ? tc : tc._id)) : [],
          tags: p.tags || [],
          customFields: p.customFields || {},
        }
        setTestPlan(mapped)
      } catch (e) {
        console.error('Error loading test plan:', e)
        setTestPlan(null)
      } finally {
        setLoading(false)
      }
    }

    if (params?.id) load()
  }, [params?.id])

  const handleSave = async (testPlanData: TestPlan) => {
    setSaving(true)
    try {
      const response = await fetch(`/api/test-plans/${params.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...testPlanData,
          // API currently updates fields directly; dates will serialize automatically.
        })
      })

      const data = await response.json().catch(() => ({}))

      if (response.ok && (data as any)?.success) {
        notifySuccess({ title: 'Test plan updated.' })
        router.push('/test-management/plans')
      } else {
        notifyError({
          title: 'Failed to update test plan.',
          message: (data as any)?.error || 'Please try again.'
        })
        console.error('Failed to update test plan', data)
      }
    } catch (error) {
      notifyError({ title: 'Failed to update test plan.', message: 'Please try again.' })
      console.error('Error updating test plan:', error)
    } finally {
      setSaving(false)
    }
  }

  return (
    <MainLayout>
      <PermissionGate permission={Permission.TEST_MANAGE}>
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold">Edit Test Plan</h1>
            <p className="text-muted-foreground">Update details and selected test cases.</p>
          </div>

          {loading ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : !testPlan ? (
            <div className="text-sm text-muted-foreground">Test plan not found.</div>
          ) : (
            <TestPlanForm
              testPlan={testPlan}
              projectId={testPlan.project}
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
