'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { MainLayout } from '@/components/layout/MainLayout'
import { useBreadcrumb } from '@/contexts/BreadcrumbContext'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { DeleteConfirmDialog } from '@/components/test-management/DeleteConfirmDialog'
import {
  Plus, Calendar, Users, CheckSquare, Edit, Trash2,
  ListChecks, Tag, Hash, Clock
} from 'lucide-react'
import { useDateTime } from '@/components/providers/DateTimeProvider'
import { Permission } from '@/lib/permissions'
import { PermissionGate } from '@/lib/permissions/permission-components'
import { useNotify } from '@/lib/notify'
import { cn } from '@/lib/utils'

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

const PLAN_PALETTE = [
  { gradient: 'linear-gradient(135deg,#BF5AF2 0%,#FF375F 100%)', glow: 'rgba(191,90,242,0.25)' },
  { gradient: 'linear-gradient(135deg,#007AFF 0%,#5AC8FA 100%)', glow: 'rgba(0,122,255,0.25)' },
  { gradient: 'linear-gradient(135deg,#34C759 0%,#30D158 100%)', glow: 'rgba(52,199,89,0.25)' },
  { gradient: 'linear-gradient(135deg,#FF9500 0%,#FFD60A 100%)', glow: 'rgba(255,149,0,0.25)' },
  { gradient: 'linear-gradient(135deg,#30B0C7 0%,#64D2FF 100%)', glow: 'rgba(48,176,199,0.25)' },
  { gradient: 'linear-gradient(135deg,#FF453A 0%,#FF9F0A 100%)', glow: 'rgba(255,69,58,0.25)' },
]

export default function TestPlansPage() {
  const { setItems } = useBreadcrumb()
  const router = useRouter()
  const { success: notifySuccess, error: notifyError } = useNotify()
  const [selectedProject, setSelectedProject] = useState<string>('')
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleteItem, setDeleteItem] = useState<{ id: string; name: string } | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [testPlans, setTestPlans] = useState<TestPlan[]>([])
  const [plansLoading, setPlansLoading] = useState(false)
  const [refreshCounter, setRefreshCounter] = useState(0)
  const { formatDate } = useDateTime()

  useEffect(() => {
    setItems([{ label: 'Test Management', href: '/test-management' }, { label: 'Test Plans' }])
  }, [setItems])

  const getFirstProjectId = async (): Promise<string | null> => {
    try {
      const res = await fetch('/api/projects')
      const data = await res.json()
      if (res.ok && data?.success && Array.isArray(data.data) && data.data.length > 0) return data.data[0]._id as string
    } catch { }
    return null
  }

  useEffect(() => {
    const fetchPlans = async () => {
      try {
        setPlansLoading(true)
        const qs = selectedProject ? `?projectId=${selectedProject}` : ''
        const res = await fetch(`/api/test-plans${qs}`)
        const data = await res.json()
        if (res.ok && data?.success && Array.isArray(data.data)) {
          setTestPlans(data.data.map((p: any) => ({
            _id: p._id,
            name: p.name,
            description: p.description,
            project: typeof p.project === 'object' && p.project?._id ? p.project._id : p.project,
            version: p.version,
            assignedTo: p.assignedTo ? `${p.assignedTo.firstName ?? ''} ${p.assignedTo.lastName ?? ''}`.trim() : undefined,
            startDate: p.startDate ? new Date(p.startDate) : undefined,
            endDate: p.endDate ? new Date(p.endDate) : undefined,
            testCases: Array.isArray(p.testCases) ? p.testCases.map((tc: any) => typeof tc === 'string' ? tc : tc._id) : [],
            tags: p.tags || [],
            customFields: p.customFields || {}
          })))
        } else setTestPlans([])
      } catch { setTestPlans([]) }
      finally { setPlansLoading(false) }
    }
    fetchPlans()
  }, [selectedProject, refreshCounter])

  const handleCreateTestPlan = async () => {
    let effectiveProjectId = selectedProject
    if (!effectiveProjectId) {
      const first = await getFirstProjectId()
      if (first) { setSelectedProject(first); effectiveProjectId = first }
    }
    router.push(`/test-management/plans/new${effectiveProjectId ? `?projectId=${effectiveProjectId}` : ''}`)
  }

  const handleConfirmDelete = async () => {
    if (!deleteItem) return
    setDeleting(true)
    try {
      const response = await fetch(`/api/test-plans/${deleteItem.id}`, { method: 'DELETE' })
      const data = await response.json().catch(() => ({}))
      if (response.ok && (data as any)?.success !== false) {
        notifySuccess({ title: 'Test plan deleted.' })
        setDeleteDialogOpen(false)
        setDeleteItem(null)
        setRefreshCounter(c => c + 1)
      } else {
        notifyError({ title: 'Failed to delete test plan.', message: (data as any)?.error || 'Please try again.' })
      }
    } catch {
      notifyError({ title: 'Failed to delete test plan.', message: 'Please try again.' })
    } finally {
      setDeleting(false)
    }
  }

  const getDaysRemaining = (endDate?: Date) => {
    if (!endDate) return null
    const diff = Math.ceil((endDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    return diff
  }

  return (
    <MainLayout>
      <PermissionGate permission={Permission.TEST_MANAGE}>
        <div className="space-y-8">

          {/* ── Page Header ── */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div
                className="flex-shrink-0 w-14 h-14 rounded-[var(--apple-radius-md)] flex items-center justify-center shadow-lg"
                style={{ background: 'linear-gradient(135deg,#BF5AF2 0%,#FF375F 100%)', boxShadow: '0 4px 16px rgba(191,90,242,0.35)' }}
              >
                <ListChecks className="h-7 w-7 text-white" strokeWidth={1.8} />
              </div>
              <div>
                <h1 className="text-[28px] sm:text-[30px] font-bold tracking-tight text-[var(--apple-label)]">Test Plans</h1>
                <p className="text-[15px] text-[var(--apple-secondary-label)] mt-0.5">
                  Create and manage test plans for your projects
                </p>
              </div>
            </div>
            <Button
              onClick={handleCreateTestPlan}
              className="w-full sm:w-auto h-9 gap-1.5 rounded-[var(--apple-radius-sm)] apple-transition"
              style={{ background: 'linear-gradient(135deg,#BF5AF2 0%,#FF375F 100%)' }}
            >
              <Plus className="h-4 w-4" />
              <span className="text-[13px]">Create Test Plan</span>
            </Button>
          </div>

          {/* ── Content ── */}
          {plansLoading ? (
            <div className="grid gap-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] p-5 animate-pulse">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-[var(--apple-radius-sm)] bg-[var(--apple-tertiary-fill)]" />
                      <div className="space-y-2">
                        <div className="h-4 w-40 rounded bg-[var(--apple-tertiary-fill)]" />
                        <div className="h-3 w-64 rounded bg-[var(--apple-tertiary-fill)]" />
                      </div>
                    </div>
                    <div className="h-6 w-14 rounded-full bg-[var(--apple-tertiary-fill)]" />
                  </div>
                </div>
              ))}
            </div>
          ) : testPlans.length === 0 ? (
            <div className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] p-12 text-center">
              <div className="mx-auto w-14 h-14 rounded-[var(--apple-radius-md)] flex items-center justify-center mb-4"
                style={{ background: 'linear-gradient(135deg,#BF5AF2 0%,#FF375F 100%)', boxShadow: '0 4px 16px rgba(191,90,242,0.25)' }}>
                <ListChecks className="h-7 w-7 text-white" strokeWidth={1.8} />
              </div>
              <h3 className="text-[17px] font-semibold text-[var(--apple-label)] mb-2">No Test Plans Yet</h3>
              <p className="text-[15px] text-[var(--apple-secondary-label)] mb-6 max-w-xs mx-auto">
                Create your first test plan to start organizing test runs.
              </p>
              <Button onClick={handleCreateTestPlan}
                className="rounded-[var(--apple-radius-sm)]"
                style={{ background: 'linear-gradient(135deg,#BF5AF2 0%,#FF375F 100%)' }}>
                <Plus className="h-4 w-4 mr-1.5" />
                Create Test Plan
              </Button>
            </div>
          ) : (
            <div className="grid gap-4 view-transition-container">
              {testPlans.map((plan, index) => {
                const palette = PLAN_PALETTE[index % PLAN_PALETTE.length]
                const daysRemaining = getDaysRemaining(plan.endDate)
                const isOverdue = daysRemaining !== null && daysRemaining < 0
                const isDueSoon = daysRemaining !== null && daysRemaining >= 0 && daysRemaining <= 3
                return (
                  <div
                    key={plan._id}
                    className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] overflow-hidden apple-transition hover:shadow-[0_8px_28px_rgba(0,0,0,0.11)] hover:-translate-y-0.5 dark:hover:shadow-[0_8px_28px_rgba(0,0,0,0.40)]"
                  >
                    {/* Gradient accent bar */}
                    <div className="h-[3px]" style={{ background: palette.gradient }} />
                    <div className="p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3 min-w-0 flex-1">
                          <div className="flex-shrink-0 w-10 h-10 rounded-[var(--apple-radius-sm)] flex items-center justify-center"
                            style={{ background: palette.gradient, boxShadow: `0 4px 10px ${palette.glow}` }}>
                            <ListChecks className="h-5 w-5 text-white" strokeWidth={1.8} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-[17px] font-semibold text-[var(--apple-label)] truncate">{plan.name}</p>
                            {plan.description && (
                              <p className="text-[13px] text-[var(--apple-secondary-label)] mt-0.5 line-clamp-1">{plan.description}</p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-medium border bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-800 animate-[badge-border-pulse_3s_ease-in-out_infinite]">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mr-1.5 animate-[status-pulse_2.4s_ease-in-out_infinite]" />
                            Active
                          </span>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="sm"
                              className="h-8 w-8 p-0 rounded-[var(--apple-radius-sm)] hover:bg-[var(--apple-quaternary-fill)] apple-transition"
                              onClick={() => plan._id && router.push(`/test-management/plans/${plan._id}/edit`)}>
                              <Edit className="h-3.5 w-3.5 text-[var(--apple-secondary-label)]" />
                            </Button>
                            <Button variant="ghost" size="sm"
                              className="h-8 w-8 p-0 rounded-[var(--apple-radius-sm)] hover:bg-red-50 dark:hover:bg-red-950/30 apple-transition"
                              onClick={() => { setDeleteItem({ id: plan._id || '', name: plan.name }); setDeleteDialogOpen(true) }}>
                              <Trash2 className="h-3.5 w-3.5 text-red-500" />
                            </Button>
                          </div>
                        </div>
                      </div>

                      {/* Meta grid */}
                      <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div className="rounded-[var(--apple-radius-sm)] bg-[var(--apple-quaternary-fill)] px-3 py-2 flex items-center gap-2">
                          <CheckSquare className="h-3.5 w-3.5 text-[var(--apple-tertiary-label)] flex-shrink-0" />
                          <div>
                            <p className="text-[11px] text-[var(--apple-tertiary-label)]">Test Cases</p>
                            <p className="text-[13px] font-semibold font-apple-mono text-[var(--apple-label)]">{plan.testCases.length}</p>
                          </div>
                        </div>
                        <div className="rounded-[var(--apple-radius-sm)] bg-[var(--apple-quaternary-fill)] px-3 py-2 flex items-center gap-2">
                          <Calendar className="h-3.5 w-3.5 text-[var(--apple-tertiary-label)] flex-shrink-0" />
                          <div>
                            <p className="text-[11px] text-[var(--apple-tertiary-label)]">Start Date</p>
                            <p className="text-[13px] font-medium text-[var(--apple-label)]">{plan.startDate ? formatDate(plan.startDate) : '—'}</p>
                          </div>
                        </div>
                        <div className={cn('rounded-[var(--apple-radius-sm)] px-3 py-2 flex items-center gap-2',
                          isOverdue ? 'bg-red-50 dark:bg-red-950/20' : isDueSoon ? 'bg-amber-50 dark:bg-amber-950/20' : 'bg-[var(--apple-quaternary-fill)]')}>
                          <Clock className={cn('h-3.5 w-3.5 flex-shrink-0', isOverdue ? 'text-red-500' : isDueSoon ? 'text-amber-500' : 'text-[var(--apple-tertiary-label)]')} />
                          <div>
                            <p className="text-[11px] text-[var(--apple-tertiary-label)]">End Date</p>
                            <p className={cn('text-[13px] font-medium', isOverdue ? 'text-red-600 dark:text-red-400' : isDueSoon ? 'text-amber-600 dark:text-amber-400' : 'text-[var(--apple-label)]')}>
                              {plan.endDate ? formatDate(plan.endDate) : '—'}
                            </p>
                          </div>
                        </div>
                        <div className="rounded-[var(--apple-radius-sm)] bg-[var(--apple-quaternary-fill)] px-3 py-2 flex items-center gap-2">
                          <Hash className="h-3.5 w-3.5 text-[var(--apple-tertiary-label)] flex-shrink-0" />
                          <div>
                            <p className="text-[11px] text-[var(--apple-tertiary-label)]">Version</p>
                            <p className="text-[13px] font-semibold font-apple-mono text-[var(--apple-label)]">{plan.version || '—'}</p>
                          </div>
                        </div>
                      </div>

                      {/* Footer row */}
                      <div className="mt-3 flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-[12px] text-[var(--apple-secondary-label)]">
                          <Users className="h-3.5 w-3.5 text-[var(--apple-tertiary-label)]" />
                          <span>{plan.assignedTo || 'Unassigned'}</span>
                        </div>
                        {plan.tags.length > 0 && (
                          <div className="flex items-center gap-1 overflow-hidden">
                            <Tag className="h-3 w-3 text-[var(--apple-tertiary-label)] flex-shrink-0" />
                            {plan.tags.slice(0, 3).map((tag, i) => (
                              <span key={i} className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-[var(--apple-tertiary-fill)] text-[var(--apple-secondary-label)]">
                                {tag}
                              </span>
                            ))}
                            {plan.tags.length > 3 && (
                              <span className="text-[11px] text-[var(--apple-tertiary-label)]">+{plan.tags.length - 3}</span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          <DeleteConfirmDialog
            isOpen={deleteDialogOpen}
            onClose={() => { setDeleteDialogOpen(false); setDeleteItem(null) }}
            onConfirm={handleConfirmDelete}
            title="Delete Test Plan"
            itemName={deleteItem?.name || ''}
            itemType="Test Plan"
            loading={deleting}
          />
        </div>
      </PermissionGate>
    </MainLayout>
  )
}
