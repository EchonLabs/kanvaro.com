'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { MainLayout } from '@/components/layout/MainLayout'
import { useBreadcrumb } from '@/contexts/BreadcrumbContext'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/DropdownMenu'
import { TestExecutionForm } from '@/components/test-management/TestExecutionForm'
import { DeleteConfirmDialog } from '@/components/test-management/DeleteConfirmDialog'
import { ResponsiveDialog } from '@/components/ui/ResponsiveDialog'
import { useDateTime } from '@/components/providers/DateTimeProvider'
import {
  Play, Clock, CheckCircle, XCircle, AlertCircle, SkipForward,
  Edit, Eye, Trash2, MoreVertical, ChevronDown, Activity
} from 'lucide-react'
import { Permission } from '@/lib/permissions'
import { PermissionGate } from '@/lib/permissions/permission-components'
import { useNotify } from '@/lib/notify'
import { cn } from '@/lib/utils'

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

interface Project {
  _id: string
  name: string
  description?: string
  status?: string
}

interface ExecutionRow {
  _id: string
  testCase?: { _id: string; title: string } | string
  testPlan?: { _id: string; name: string; version?: string } | string
  project?: { _id: string; name: string } | string
  executedBy?: { firstName?: string; lastName?: string; email?: string }
  status: TestExecution['status']
  actualResult: string
  comments: string
  executionTime: number
  environment: string
  version: string
  attachments?: string[]
  executedAt?: string
}

type ApiResponse<T> = { success?: boolean; data?: T; error?: string }

const EXEC_STATUS_CONFIG = {
  passed:  { bg: 'bg-emerald-50 dark:bg-emerald-950/30', text: 'text-emerald-600 dark:text-emerald-400', dot: 'bg-emerald-500', border: 'border-emerald-200 dark:border-emerald-800', label: 'Passed',  icon: CheckCircle,  iconColor: 'text-emerald-500' },
  failed:  { bg: 'bg-red-50 dark:bg-red-950/30',         text: 'text-red-600 dark:text-red-400',         dot: 'bg-red-500',    border: 'border-red-200 dark:border-red-800',   label: 'Failed',  icon: XCircle,      iconColor: 'text-red-500' },
  blocked: { bg: 'bg-amber-50 dark:bg-amber-950/30',     text: 'text-amber-600 dark:text-amber-400',     dot: 'bg-amber-500',  border: 'border-amber-200 dark:border-amber-800', label: 'Blocked', icon: AlertCircle,  iconColor: 'text-amber-500' },
  skipped: { bg: 'bg-gray-50 dark:bg-gray-900/40',       text: 'text-gray-500 dark:text-gray-400',       dot: 'bg-gray-400',   border: 'border-gray-200 dark:border-gray-700',  label: 'Skipped', icon: SkipForward,  iconColor: 'text-gray-400' },
} as const

export default function TestExecutionsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { setItems } = useBreadcrumb()
  const { success: notifySuccess, error: notifyError } = useNotify()

  const [projects, setProjects] = useState<Project[]>([])
  const [selectedProject, setSelectedProject] = useState<string>('')
  const [projectQuery, setProjectQuery] = useState('')
  const [projectsLoading, setProjectsLoading] = useState(true)
  const projectSearchInputRef = useRef<HTMLInputElement | null>(null)

  const focusSearchInput = (el: HTMLInputElement | null) => {
    if (!el || el.disabled) return
    const doFocus = () => { el.focus({ preventScroll: true }); try { el.select?.() } catch { } }
    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') window.requestAnimationFrame(doFocus)
    else setTimeout(doFocus, 0)
  }

  const [testExecutionDialogOpen, setTestExecutionDialogOpen] = useState(false)
  const [selectedTestExecution, setSelectedTestExecution] = useState<TestExecution | null>(null)
  const [saving, setSaving] = useState(false)
  const [executions, setExecutions] = useState<ExecutionRow[]>([])
  const [loading, setLoading] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const { formatDate, formatTime } = useDateTime()

  useEffect(() => {
    setItems([{ label: 'Test Management', href: '/test-management' }, { label: 'Test Executions' }])
  }, [setItems])

  useEffect(() => {
    const fetchProjects = async () => {
      try {
        setProjectsLoading(true)
        const res = await fetch('/api/projects')
        const data = await res.json().catch(() => ({}))
        if (res.ok && data?.success && Array.isArray(data.data)) setProjects(data.data)
        else setProjects([])
      } catch { setProjects([]) }
      finally { setProjectsLoading(false) }
    }
    fetchProjects()
  }, [])

  useEffect(() => {
    if (projectsLoading || selectedProject) return
    const fromQuery = searchParams.get('projectId')
    if (!fromQuery || !projects.some(p => p._id === fromQuery)) return
    setSelectedProject(fromQuery)
  }, [searchParams, projectsLoading, projects, selectedProject])

  useEffect(() => {
    const fetchExecutions = async () => {
      if (!selectedProject) { setExecutions([]); setLoading(false); return }
      try {
        setLoading(true)
        const res = await fetch(`/api/test-executions?projectId=${encodeURIComponent(selectedProject)}&page=1&limit=200`)
        const data = (await res.json().catch(() => ({}))) as ApiResponse<ExecutionRow[]>
        if (res.ok && data?.success && Array.isArray(data.data)) setExecutions(data.data as ExecutionRow[])
        else setExecutions([])
      } catch { setExecutions([]) }
      finally { setLoading(false) }
    }
    fetchExecutions()
  }, [selectedProject])

  const formatDuration = (seconds: number) => {
    if (seconds === 0) return 'N/A'
    return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
  }
  const formatDateTime = (ds: string) => `${formatDate(ds)} ${formatTime(ds)}`

  const handleSaveTestExecution = async (executionData: TestExecution) => {
    if (!selectedTestExecution?._id) return
    setSaving(true)
    try {
      const response = await fetch(`/api/test-executions/${selectedTestExecution._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: executionData.status, actualResult: executionData.actualResult, comments: executionData.comments, executionTime: executionData.executionTime, environment: executionData.environment, version: executionData.version, attachments: executionData.attachments || [] })
      })
      const data = await response.json().catch(() => ({}))
      if (response.ok && (data as any)?.success !== false) {
        notifySuccess({ title: 'Test execution updated.' })
        setTestExecutionDialogOpen(false)
        setSelectedTestExecution(null)
        const res = await fetch(`/api/test-executions?projectId=${encodeURIComponent(selectedProject)}&page=1&limit=200`)
        const refreshed = (await res.json().catch(() => ({}))) as ApiResponse<ExecutionRow[]>
        if (res.ok && refreshed?.success && Array.isArray(refreshed.data)) setExecutions(refreshed.data as ExecutionRow[])
      } else {
        notifyError({ title: 'Failed to update test execution.', message: (data as any)?.error || 'Please try again.' })
      }
    } catch {
      notifyError({ title: 'Failed to update test execution.', message: 'Please try again.' })
    } finally { setSaving(false) }
  }

  const deleteExecution = deleteId ? executions.find(e => e._id === deleteId) : undefined

  // Summary counts
  const statusCounts = executions.reduce((acc, e) => {
    acc[e.status] = (acc[e.status] ?? 0) + 1
    return acc
  }, {} as Record<string, number>)

  return (
    <MainLayout>
      <PermissionGate permission={Permission.TEST_MANAGE}>
        <div className="space-y-8">

          {/* ── Page Header ── */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div
                className="flex-shrink-0 w-14 h-14 rounded-[var(--apple-radius-md)] flex items-center justify-center shadow-lg"
                style={{ background: 'var(--apple-card-gradient)', boxShadow: '0 4px 16px var(--apple-chart-glow)' }}
              >
                <Activity className="h-7 w-7 text-white" strokeWidth={1.8} />
              </div>
              <div>
                <h1 className="text-[28px] sm:text-[30px] font-bold tracking-tight text-[var(--apple-label)]">Test Executions</h1>
                <p className="text-[15px] text-[var(--apple-secondary-label)] mt-0.5">
                  Track and manage test execution results
                </p>
              </div>
            </div>
            <Button
              onClick={() => { if (!selectedProject) return; router.push(`/test-management/executions/new?projectId=${encodeURIComponent(selectedProject)}`) }}
              disabled={!selectedProject}
              className="w-full sm:w-auto h-9 gap-1.5 rounded-[var(--apple-radius-sm)] apple-transition"
              style={{ background: 'var(--apple-card-gradient)' }}
            >
              <Play className="h-4 w-4" />
              <span className="text-[13px]">Execute Test</span>
            </Button>
          </div>

          {/* ── Project Selector Toolbar ── */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 px-4 py-3 rounded-[var(--apple-radius-md)] border border-[var(--apple-separator)] bg-[var(--apple-quaternary-fill)]">
            <span className="apple-section-label whitespace-nowrap">Project</span>
            <Select
              value={selectedProject}
              onValueChange={setSelectedProject}
              onOpenChange={(open) => { if (open) { setProjectQuery(''); focusSearchInput(projectSearchInputRef.current) } }}
              disabled={projectsLoading}
            >
              <SelectTrigger id="project-select" className="h-8 w-full sm:w-72 text-[13px] rounded-[var(--apple-radius-sm)] border-[var(--apple-separator)] bg-card">
                <SelectValue placeholder={projectsLoading ? 'Loading projects…' : 'Select a project'} />
              </SelectTrigger>
              <SelectContent className="p-0">
                <div className="p-2">
                  <Input
                    ref={projectSearchInputRef}
                    value={projectQuery}
                    onChange={(e) => setProjectQuery(e.target.value)}
                    placeholder="Search projects"
                    className="mb-2 h-8 text-[13px]"
                    onKeyDown={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <div className="max-h-56 overflow-y-auto">
                    {(projects.filter(p => !projectQuery.trim() || p.name.toLowerCase().includes(projectQuery.toLowerCase()))).length === 0 ? (
                      <div className="px-2 py-2 text-[13px] text-[var(--apple-tertiary-label)]">No matching projects</div>
                    ) : projects
                        .filter(p => !projectQuery.trim() || p.name.toLowerCase().includes(projectQuery.toLowerCase()))
                        .map(p => <SelectItem key={p._id} value={p._id} className="text-[13px]">{p.name}</SelectItem>)
                    }
                  </div>
                </div>
              </SelectContent>
            </Select>
            {!selectedProject && (
              <p className="text-[12px] text-amber-500 flex items-center gap-1.5">
                <ChevronDown className="h-3 w-3" />
                Select a project to view executions
              </p>
            )}
          </div>

          {/* ── Status Mini-Summary (only when data) ── */}
          {executions.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {(Object.entries(EXEC_STATUS_CONFIG) as [string, typeof EXEC_STATUS_CONFIG[keyof typeof EXEC_STATUS_CONFIG]][]).map(([key, cfg]) => {
                const count = statusCounts[key] ?? 0
                const Icon = cfg.icon
                return (
                  <div key={key} className="card-fade-in rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] px-4 py-3 flex items-center gap-3">
                    <Icon className={cn('h-4 w-4', cfg.iconColor)} />
                    <div>
                      <p className="text-[20px] font-bold font-apple-mono tabular-nums text-[var(--apple-label)] leading-none">{count}</p>
                      <p className="text-[11px] text-[var(--apple-tertiary-label)] mt-0.5">{cfg.label}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* ── Executions Table ── */}
          <div className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] overflow-hidden">
            <div className="px-5 py-4 border-b border-[var(--apple-separator)]">
              <p className="text-[17px] font-semibold text-[var(--apple-label)]">Recent Test Executions</p>
              <p className="text-[12px] text-[var(--apple-tertiary-label)] mt-0.5">
                {selectedProject ? 'Latest execution results for the selected project' : 'Select a project to see executions'}
              </p>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-[var(--apple-separator)]">
                    {['Test Case', 'Test Plan', 'Status', 'Tester', 'Duration', 'Executed', 'Version', ''].map(h => (
                      <TableHead key={h} className="text-[11px] font-semibold tracking-wide uppercase text-[var(--apple-tertiary-label)] h-10">{h}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    [...Array(5)].map((_, i) => (
                      <TableRow key={i} className="border-[var(--apple-separator)]">
                        {[...Array(8)].map((_, j) => (
                          <TableCell key={j}><div className="h-4 rounded bg-[var(--apple-tertiary-fill)] animate-pulse" style={{ width: `${55 + j * 5}%` }} /></TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : executions.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="py-14 text-center">
                        <div className="flex flex-col items-center gap-2 text-[var(--apple-tertiary-label)]">
                          <Activity className="h-8 w-8 opacity-40" />
                          <p className="text-[13px]">{selectedProject ? 'No test executions found' : 'Select a project to view executions'}</p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : executions.map((execution) => {
                    const cfg = EXEC_STATUS_CONFIG[execution.status] ?? EXEC_STATUS_CONFIG.skipped
                    const testerName = ((execution?.executedBy?.firstName || '') + ' ' + (execution?.executedBy?.lastName || '')).trim() || execution?.executedBy?.email || '—'
                    return (
                      <TableRow key={execution._id} className="border-[var(--apple-separator)] apple-transition hover:bg-[var(--apple-quaternary-fill)]">
                        <TableCell className="text-[13px] font-medium text-[var(--apple-label)] max-w-[180px] truncate">
                          {typeof execution.testCase === 'string' ? execution.testCase : execution.testCase?.title || '—'}
                        </TableCell>
                        <TableCell className="text-[13px] text-[var(--apple-secondary-label)] max-w-[140px] truncate">
                          {typeof execution.testPlan === 'string' ? execution.testPlan : execution.testPlan?.name || '—'}
                        </TableCell>
                        <TableCell>
                          <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border animate-[badge-border-pulse_3s_ease-in-out_infinite]', cfg.bg, cfg.text, cfg.border)}>
                            <span className={cn('w-1.5 h-1.5 rounded-full animate-[status-pulse_2.4s_ease-in-out_infinite]', cfg.dot)} />
                            {cfg.label}
                          </span>
                        </TableCell>
                        <TableCell className="text-[13px] text-[var(--apple-secondary-label)] max-w-[120px] truncate">{testerName}</TableCell>
                        <TableCell className="text-[13px] font-apple-mono tabular-nums text-[var(--apple-secondary-label)]">{formatDuration(execution.executionTime)}</TableCell>
                        <TableCell className="text-[13px] text-[var(--apple-tertiary-label)] whitespace-nowrap">
                          {execution?.executedAt ? formatDateTime(execution.executedAt) : '—'}
                        </TableCell>
                        <TableCell className="text-[13px] font-apple-mono tabular-nums text-[var(--apple-secondary-label)]">{execution.version || '—'}</TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 rounded-[var(--apple-radius-sm)]" aria-label="Actions">
                                <MoreVertical className="h-3.5 w-3.5" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-36 rounded-[var(--apple-radius-sm)]">
                              <DropdownMenuItem className="text-[13px] gap-2 rounded-[6px]" onClick={() => router.push(`/test-management/executions/${execution._id}`)}>
                                <Eye className="h-3.5 w-3.5" /> View
                              </DropdownMenuItem>
                              <DropdownMenuItem className="text-[13px] gap-2 rounded-[6px]" onClick={() => {
                                setSelectedTestExecution({
                                  _id: execution._id,
                                  testCase: typeof execution.testCase === 'string' ? execution.testCase : execution.testCase?._id ?? '',
                                  testPlan: typeof execution.testPlan === 'string' ? execution.testPlan : execution.testPlan?._id,
                                  status: execution.status,
                                  actualResult: execution.actualResult,
                                  comments: execution.comments,
                                  executionTime: execution.executionTime,
                                  environment: execution.environment,
                                  version: execution.version,
                                  attachments: execution.attachments || [],
                                })
                                setTestExecutionDialogOpen(true)
                              }}>
                                <Edit className="h-3.5 w-3.5" /> Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem className="text-[13px] gap-2 rounded-[6px] text-red-600 focus:text-red-700" onClick={() => { setDeleteId(execution._id); setDeleteDialogOpen(true) }}>
                                <Trash2 className="h-3.5 w-3.5" /> Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* ── Dialogs ── */}
          <ResponsiveDialog
            open={testExecutionDialogOpen}
            onOpenChange={setTestExecutionDialogOpen}
            title="Edit Test Execution"
            dismissible={false}
          >
            <TestExecutionForm
              testExecution={selectedTestExecution || undefined}
              projectId={selectedProject}
              onSave={handleSaveTestExecution}
              onCancel={() => { setTestExecutionDialogOpen(false); setSelectedTestExecution(null) }}
              loading={saving}
            />
          </ResponsiveDialog>

          <DeleteConfirmDialog
            isOpen={deleteDialogOpen}
            onClose={() => { setDeleteDialogOpen(false); setDeleteId(null) }}
            onConfirm={async () => {
              if (!deleteId) return
              try {
                const res = await fetch(`/api/test-executions/${deleteId}`, { method: 'DELETE' })
                const data = await res.json().catch(() => ({}))
                if (res.ok && (data as any)?.success !== false) {
                  notifySuccess({ title: 'Test execution deleted.' })
                  const refreshed = await fetch(`/api/test-executions?projectId=${encodeURIComponent(selectedProject)}&page=1&limit=200`)
                  const rd = (await refreshed.json().catch(() => ({}))) as ApiResponse<ExecutionRow[]>
                  if (refreshed.ok && rd?.success && Array.isArray(rd.data)) setExecutions(rd.data as ExecutionRow[])
                  else setExecutions(prev => prev.filter(e => e._id !== deleteId))
                } else {
                  notifyError({ title: 'Failed to delete test execution.', message: (data as any)?.error || 'Please try again.' })
                }
              } catch {
                notifyError({ title: 'Failed to delete test execution.', message: 'Please try again.' })
              } finally { setDeleteDialogOpen(false); setDeleteId(null) }
            }}
            title="Delete Test Execution"
            itemName={String(typeof deleteExecution?.testCase === 'string' ? deleteExecution.testCase : deleteExecution?.testCase?.title || 'this execution')}
            itemType="Test Execution"
          />
        </div>
      </PermissionGate>
    </MainLayout>
  )
}
