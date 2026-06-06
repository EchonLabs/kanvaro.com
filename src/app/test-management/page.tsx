'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { MainLayout } from '@/components/layout/MainLayout'
import { useBreadcrumb } from '@/contexts/BreadcrumbContext'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Permission } from '@/lib/permissions'
import { PermissionGate } from '@/lib/permissions/permission-components'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ResponsiveDialog } from '@/components/ui/ResponsiveDialog'
import { TestSuiteForm } from '@/components/test-management/TestSuiteForm'
import {
  TestTube,
  Play,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  BarChart3,
  Folder,
  FileText,
  TrendingUp,
  ArrowRight,
  ChevronRight,
  Layers,
  FlaskConical,
  ListChecks,
  Activity,
} from 'lucide-react'
import TestSuiteCards from '@/components/test-management/TestSuiteCards'
import TestCaseList from '@/components/test-management/TestCaseList'
import { DeleteConfirmDialog } from '@/components/test-management/DeleteConfirmDialog'
import { TestSuiteDetailDialog } from '@/components/test-management/TestSuiteDetailDialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useNotify } from '@/lib/notify'
import { cn } from '@/lib/utils'

interface TestSummary {
  totalTestCases: number
  totalTestSuites: number
  totalTestPlans: number
  totalExecutions: number
  passRate: number
  statusCounts: Record<string, number>
}

interface Project {
  _id: string
  name: string
  description: string
  status: string
  testSummary?: TestSummary
}

const EXEC_STATUS_CONFIG = {
  passed:  { bg: 'bg-emerald-50 dark:bg-emerald-950/30', text: 'text-emerald-600 dark:text-emerald-400', dot: 'bg-emerald-500', border: 'border-emerald-200 dark:border-emerald-800', label: 'Passed' },
  failed:  { bg: 'bg-red-50 dark:bg-red-950/30',         text: 'text-red-600 dark:text-red-400',         dot: 'bg-red-500',    border: 'border-red-200 dark:border-red-800',   label: 'Failed' },
  blocked: { bg: 'bg-amber-50 dark:bg-amber-950/30',     text: 'text-amber-600 dark:text-amber-400',     dot: 'bg-amber-500',  border: 'border-amber-200 dark:border-amber-800', label: 'Blocked' },
  skipped: { bg: 'bg-gray-50 dark:bg-gray-900/40',       text: 'text-gray-500 dark:text-gray-400',       dot: 'bg-gray-400',   border: 'border-gray-200 dark:border-gray-700',  label: 'Skipped' },
  in_progress: { bg: 'bg-blue-50 dark:bg-blue-950/30',   text: 'text-blue-600 dark:text-blue-400',       dot: 'bg-blue-500',   border: 'border-blue-200 dark:border-blue-800',  label: 'In Progress' },
} as const

const QUICK_LINKS = [
  { label: 'Test Suites', icon: Folder, href: '/test-management/suites', gradient: 'linear-gradient(135deg,#007AFF 0%,#5AC8FA 100%)', glow: 'rgba(0,122,255,0.20)', description: 'Organize cases into suites' },
  { label: 'Test Cases', icon: FileText, href: '/test-management/cases', gradient: 'linear-gradient(135deg,#34C759 0%,#30D158 100%)', glow: 'rgba(52,199,89,0.20)', description: 'Manage individual test cases' },
  { label: 'Test Plans', icon: ListChecks, href: '/test-management/plans', gradient: 'linear-gradient(135deg,#BF5AF2 0%,#FF375F 100%)', glow: 'rgba(191,90,242,0.20)', description: 'Plan and schedule test runs' },
  { label: 'Executions', icon: Play, href: '/test-management/executions', gradient: 'linear-gradient(135deg,#FF9500 0%,#FFD60A 100%)', glow: 'rgba(255,149,0,0.20)', description: 'Track execution results' },
  { label: 'Reports', icon: BarChart3, href: '/test-management/reports', gradient: 'linear-gradient(135deg,#30B0C7 0%,#64D2FF 100%)', glow: 'rgba(48,176,199,0.20)', description: 'Analytics and insights' },
]

export default function TestManagementPage() {
  const router = useRouter()
  const { setItems } = useBreadcrumb()
  const { success: notifySuccess } = useNotify()
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedProject, setSelectedProject] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('overview')
  const [suiteDialogOpen, setSuiteDialogOpen] = useState(false)
  const [suiteSaving, setSuiteSaving] = useState(false)
  const [editingSuite, setEditingSuite] = useState<any | null>(null)
  const [parentSuiteIdForCreate, setParentSuiteIdForCreate] = useState<string | undefined>(undefined)
  const [suitesRefreshCounter, setSuitesRefreshCounter] = useState(0)
  const [selectedSuiteId, setSelectedSuiteId] = useState<string | null>(null)
  const [suiteDetailDialogOpen, setSuiteDetailDialogOpen] = useState(false)
  const [detailSuiteId, setDetailSuiteId] = useState<string | null>(null)
  const [suiteDetailRefreshKey, setSuiteDetailRefreshKey] = useState(0)
  const [testCasesRefreshCounter, setTestCasesRefreshCounter] = useState(0)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleteItem, setDeleteItem] = useState<{ id: string; name: string } | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [executions, setExecutions] = useState<any[]>([])
  const [executionsTotal, setExecutionsTotal] = useState(0)
  const [executionsLoading, setExecutionsLoading] = useState(false)
  const [executionsRefreshCounter, setExecutionsRefreshCounter] = useState(0)
  const [suiteCount, setSuiteCount] = useState(0)
  const [caseCount, setCaseCount] = useState(0)

  const executionStatusCounts = useMemo(() => {
    const counts: Record<string, number> = { passed: 0, failed: 0, blocked: 0, skipped: 0 }
    for (const e of executions) {
      if (e?.status && typeof counts[e.status] === 'number') counts[e.status] += 1
    }
    return counts
  }, [executions])

  useEffect(() => {
    setItems([
      { label: 'Test Management', href: '/test-management' },
      { label: 'Dashboard' }
    ])
  }, [setItems])

  useEffect(() => { fetchProjects() }, [])

  const fetchProjects = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/projects')
      const data = await response.json()
      if (data.success) setProjects(Array.isArray(data.data) ? data.data : [])
    } catch (error) {
      console.error('Error fetching projects:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const fetchExecutions = async () => {
      if (!selectedProject) { setExecutions([]); setExecutionsTotal(0); return }
      try {
        setExecutionsLoading(true)
        const res = await fetch(`/api/test-executions?projectId=${encodeURIComponent(selectedProject)}&page=1&limit=20`)
        const data = await res.json().catch(() => ({}))
        if (res.ok && data?.success && Array.isArray(data.data)) {
          setExecutions(data.data)
          const t = Number(data?.pagination?.total)
          setExecutionsTotal(Number.isFinite(t) ? t : data.data.length)
        } else { setExecutions([]); setExecutionsTotal(0) }
      } catch { setExecutions([]); setExecutionsTotal(0) }
      finally { setExecutionsLoading(false) }
    }
    fetchExecutions()
  }, [selectedProject, executionsRefreshCounter])

  useEffect(() => {
    const fetchCounts = async () => {
      if (!selectedProject) { setSuiteCount(0); setCaseCount(0); return }
      try {
        const [sr, cr] = await Promise.all([
          fetch(`/api/test-suites?projectId=${encodeURIComponent(selectedProject)}&page=1&limit=1`),
          fetch(`/api/test-cases?projectId=${encodeURIComponent(selectedProject)}&page=1&limit=1`)
        ])
        const [sd, cd] = await Promise.all([sr.json().catch(() => ({})), cr.json().catch(() => ({}))])
        setSuiteCount(sr.ok && sd?.success ? (Number.isFinite(Number(sd?.pagination?.total)) ? Number(sd.pagination.total) : (Array.isArray(sd.data) ? sd.data.length : 0)) : 0)
        setCaseCount(cr.ok && cd?.success ? (Number.isFinite(Number(cd?.pagination?.total)) ? Number(cd.pagination.total) : (Array.isArray(cd.data) ? cd.data.length : 0)) : 0)
      } catch { setSuiteCount(0); setCaseCount(0) }
    }
    fetchCounts()
  }, [selectedProject])

  const handleDeleteSuite = async (suiteId: string) => {
    try {
      const res = await fetch(`/api/test-suites/${suiteId}`, { method: 'DELETE' })
      if (res.ok) {
        notifySuccess({ title: 'Test Suite deleted successfully.' })
        setSuitesRefreshCounter(c => c + 1)
        if (selectedSuiteId === suiteId) { setSelectedSuiteId(null) }
      }
    } catch (err) { console.error('Error deleting test suite:', err) }
  }

  const passRate = useMemo(() => {
    if (executions.length === 0) return 0
    return Math.round((executions.filter(e => e.status === 'passed').length / executions.length) * 100)
  }, [executions])

  const formatDuration = (seconds: number) => {
    if (!seconds || seconds <= 0) return 'N/A'
    return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
  }

  const formatDate = (dateString?: string) => {
    if (!dateString) return '—'
    return new Date(dateString).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  const STATS = [
    { label: 'Test Suites', value: suiteCount, icon: Folder, gradient: 'linear-gradient(135deg,#007AFF 0%,#5AC8FA 100%)', glow: 'rgba(0,122,255,0.25)', loading: !selectedProject },
    { label: 'Test Cases', value: caseCount, icon: FileText, gradient: 'linear-gradient(135deg,#34C759 0%,#30D158 100%)', glow: 'rgba(52,199,89,0.25)', loading: !selectedProject },
    { label: 'Executions', value: executionsTotal, icon: Play, gradient: 'linear-gradient(135deg,#FF9500 0%,#FFD60A 100%)', glow: 'rgba(255,149,0,0.25)', loading: executionsLoading },
    { label: 'Pass Rate', value: selectedProject ? `${passRate}%` : '—', icon: TrendingUp, gradient: 'linear-gradient(135deg,#30B0C7 0%,#64D2FF 100%)', glow: 'rgba(48,176,199,0.25)', loading: executionsLoading },
  ]

  if (loading) {
    return (
      <MainLayout>
        <div className="space-y-8">
          {/* Header skeleton */}
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-[var(--apple-radius-md)] bg-[var(--apple-tertiary-fill)] animate-pulse" />
            <div className="space-y-2">
              <div className="h-7 w-52 rounded-lg bg-[var(--apple-tertiary-fill)] animate-pulse" />
              <div className="h-4 w-80 rounded-md bg-[var(--apple-tertiary-fill)] animate-pulse" />
            </div>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card p-5 h-24 animate-pulse" />
            ))}
          </div>
        </div>
      </MainLayout>
    )
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
                style={{ background: 'linear-gradient(135deg,#007AFF 0%,#5AC8FA 100%)', boxShadow: '0 4px 16px rgba(0,122,255,0.35)' }}
              >
                <FlaskConical className="h-7 w-7 text-white" strokeWidth={1.8} />
              </div>
              <div>
                <h1 className="text-[28px] sm:text-[30px] font-bold tracking-tight text-[var(--apple-label)]">Dashboard</h1>
                <p className="text-[15px] text-[var(--apple-secondary-label)] mt-0.5">
                  Select a project to manage test suites, cases, and executions
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Button
                variant="outline"
                onClick={() => router.push('/test-management/reports')}
                className="flex-1 sm:flex-none h-9 gap-1.5 rounded-[var(--apple-radius-sm)] border-[var(--apple-separator)] apple-transition"
              >
                <BarChart3 className="h-4 w-4" />
                <span className="text-[13px]">Reports</span>
              </Button>
              <Button
                onClick={() => { const qs = selectedProject ? `?projectId=${encodeURIComponent(selectedProject)}` : ''; router.push(`/test-management/plans/new${qs}`) }}
                className="flex-1 sm:flex-none h-9 gap-1.5 rounded-[var(--apple-radius-sm)] apple-transition"
                disabled={!selectedProject}
                style={{ background: 'linear-gradient(135deg,#007AFF 0%,#5AC8FA 100%)' }}
              >
                <TestTube className="h-4 w-4" />
                <span className="text-[13px]">New Test Plan</span>
              </Button>
            </div>
          </div>

          {projects.length === 0 ? (
            /* ── Empty state ── */
            <div className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] p-12 text-center">
              <div className="mx-auto w-16 h-16 rounded-[var(--apple-radius-md)] flex items-center justify-center mb-4"
                style={{ background: 'linear-gradient(135deg,#007AFF 0%,#5AC8FA 100%)', boxShadow: '0 4px 16px rgba(0,122,255,0.30)' }}>
                <TestTube className="h-8 w-8 text-white" strokeWidth={1.8} />
              </div>
              <h3 className="text-[17px] font-semibold text-[var(--apple-label)] mb-2">No Projects Found</h3>
              <p className="text-[15px] text-[var(--apple-secondary-label)] mb-6 max-w-xs mx-auto">
                You need to be assigned to a project to access test management features.
              </p>
              <Button onClick={() => router.push('/projects/create')} className="rounded-[var(--apple-radius-sm)]"
                style={{ background: 'linear-gradient(135deg,#007AFF 0%,#5AC8FA 100%)' }}>
                Create Project
              </Button>
            </div>
          ) : (
            <div className="space-y-6">

              {/* ── Project Selector Toolbar ── */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 px-4 py-3 rounded-[var(--apple-radius-md)] border border-[var(--apple-separator)] bg-[var(--apple-quaternary-fill)]">
                <span className="apple-section-label whitespace-nowrap">Project</span>
                <Select
                  value={selectedProject || undefined}
                  onValueChange={(value) => { setSelectedProject(value); setActiveTab('overview') }}
                >
                  <SelectTrigger className="h-8 w-full sm:w-72 text-[13px] rounded-[var(--apple-radius-sm)] border-[var(--apple-separator)] bg-card">
                    <SelectValue placeholder="Select a project…" />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map((p) => (
                      <SelectItem key={p._id} value={p._id} className="text-[13px]">{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {!selectedProject ? (
                /* ── Quick-link hub (no project selected) ── */
                <div className="space-y-6">
                  <div className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] p-8 text-center">
                    <TestTube className="h-10 w-10 mx-auto mb-3 text-[var(--apple-tertiary-label)]" />
                    <h3 className="text-[17px] font-semibold text-[var(--apple-label)] mb-1">Select a Project</h3>
                    <p className="text-[15px] text-[var(--apple-secondary-label)]">Choose a project above to view its test data.</p>
                  </div>
                  <div>
                    <p className="apple-section-label mb-3 px-1">Quick Access</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
                      {QUICK_LINKS.map((link) => (
                        <button
                          key={link.href}
                          onClick={() => router.push(link.href)}
                          className="group relative rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] p-4 text-left apple-transition hover:shadow-[0_8px_28px_rgba(0,0,0,0.11)] hover:-translate-y-0.5 dark:hover:shadow-[0_8px_28px_rgba(0,0,0,0.40)] focus:outline-none"
                        >
                          <div className="w-10 h-10 rounded-[var(--apple-radius-sm)] flex items-center justify-center mb-3"
                            style={{ background: link.gradient, boxShadow: `0 4px 12px ${link.glow}` }}>
                            <link.icon className="h-5 w-5 text-white" strokeWidth={1.8} />
                          </div>
                          <p className="text-[15px] font-semibold text-[var(--apple-label)]">{link.label}</p>
                          <p className="text-[12px] text-[var(--apple-tertiary-label)] mt-0.5">{link.description}</p>
                          <ArrowRight className="absolute top-4 right-4 h-4 w-4 text-[var(--apple-tertiary-label)] opacity-0 group-hover:opacity-100 apple-transition" />
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                /* ── Project-scoped content ── */
                <div className="space-y-6">

                  {/* Stats Bar */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    {STATS.map((stat) => (
                      <div key={stat.label}
                        className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] p-4 flex items-center gap-3 apple-transition hover:shadow-[0_4px_16px_rgba(0,0,0,0.09)]">
                        <div className="flex-shrink-0 w-10 h-10 rounded-[var(--apple-radius-sm)] flex items-center justify-center"
                          style={{ background: stat.gradient, boxShadow: `0 4px 12px ${stat.glow}` }}>
                          <stat.icon className="h-5 w-5 text-white" strokeWidth={1.8} />
                        </div>
                        <div>
                          {stat.loading ? (
                            <div className="h-6 w-10 rounded bg-[var(--apple-tertiary-fill)] animate-pulse" />
                          ) : (
                            <p className="text-[22px] font-bold tracking-tight text-[var(--apple-label)] font-apple-mono tabular-nums leading-none">{stat.value}</p>
                          )}
                          <p className="text-[12px] text-[var(--apple-tertiary-label)] mt-0.5">{stat.label}</p>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Apple-style Tabs */}
                  <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-5">
                    <div className="flex items-center">
                      <TabsList className="h-9 rounded-[var(--apple-radius-sm)] bg-[var(--apple-tertiary-fill)] p-0.5 gap-0.5">
                        {[
                          { value: 'overview', label: 'Overview', icon: Activity },
                          { value: 'suites', label: 'Suites', icon: Layers },
                          { value: 'cases', label: 'Cases', icon: FileText },
                          { value: 'executions', label: 'Executions', icon: Play },
                        ].map((tab) => (
                          <TabsTrigger
                            key={tab.value}
                            value={tab.value}
                            className="h-8 px-3 gap-1.5 text-[13px] rounded-[8px] data-[state=active]:bg-card data-[state=active]:shadow-sm apple-transition"
                          >
                            <tab.icon className="h-3.5 w-3.5" />
                            {tab.label}
                          </TabsTrigger>
                        ))}
                      </TabsList>
                    </div>

                    {/* Overview Tab */}
                    <TabsContent value="overview" className="space-y-5 mt-0">
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                        {/* Recent Executions */}
                        <div className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] overflow-hidden">
                          <div className="px-5 py-4 border-b border-[var(--apple-separator)] flex items-center justify-between">
                            <div>
                              <p className="text-[17px] font-semibold text-[var(--apple-label)]">Recent Executions</p>
                              <p className="text-[12px] text-[var(--apple-tertiary-label)] mt-0.5">Latest 5 test runs</p>
                            </div>
                            <Button size="sm" variant="ghost"
                              className="h-7 px-2 text-[12px] text-[var(--apple-system-blue)] hover:bg-[var(--apple-quaternary-fill)] rounded-[var(--apple-radius-sm)]"
                              onClick={() => router.push(`/test-management/executions?projectId=${encodeURIComponent(selectedProject)}`)}>
                              View all <ChevronRight className="h-3 w-3 ml-0.5" />
                            </Button>
                          </div>
                          <div className="divide-y divide-[var(--apple-separator)]">
                            {executionsLoading ? (
                              [...Array(3)].map((_, i) => (
                                <div key={i} className="px-5 py-3 flex items-center gap-3">
                                  <div className="h-5 w-5 rounded-full bg-[var(--apple-tertiary-fill)] animate-pulse" />
                                  <div className="flex-1 space-y-1.5">
                                    <div className="h-3.5 w-48 rounded bg-[var(--apple-tertiary-fill)] animate-pulse" />
                                    <div className="h-3 w-32 rounded bg-[var(--apple-tertiary-fill)] animate-pulse" />
                                  </div>
                                  <div className="h-5 w-14 rounded-full bg-[var(--apple-tertiary-fill)] animate-pulse" />
                                </div>
                              ))
                            ) : executions.length === 0 ? (
                              <div className="px-5 py-10 text-center text-[var(--apple-tertiary-label)]">
                                <Play className="h-7 w-7 mx-auto mb-2 opacity-40" />
                                <p className="text-[13px]">No executions yet</p>
                              </div>
                            ) : (
                              executions.slice(0, 5).map((exe: any) => {
                                const cfg = EXEC_STATUS_CONFIG[exe.status as keyof typeof EXEC_STATUS_CONFIG] ?? EXEC_STATUS_CONFIG.skipped
                                return (
                                  <div key={exe._id} className="px-5 py-3 flex items-center gap-3 apple-transition hover:bg-[var(--apple-quaternary-fill)]">
                                    <div className={cn('flex-shrink-0 w-2 h-2 rounded-full animate-[status-pulse_2.4s_ease-in-out_infinite]', cfg.dot)} />
                                    <div className="flex-1 min-w-0">
                                      <p className="text-[13px] font-medium text-[var(--apple-label)] truncate">{exe?.testCase?.title || exe.testCase}</p>
                                      <p className="text-[11px] text-[var(--apple-tertiary-label)] truncate mt-0.5">
                                        {exe?.testPlan?.name || 'No Plan'} · {exe.environment || '—'}
                                      </p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border animate-[badge-border-pulse_3s_ease-in-out_infinite]', cfg.bg, cfg.text, cfg.border)}>
                                        {cfg.label}
                                      </span>
                                      <Button size="sm" variant="ghost"
                                        className="h-6 px-2 text-[11px] rounded-[var(--apple-radius-sm)] text-[var(--apple-system-blue)]"
                                        onClick={() => router.push(`/test-management/executions/${exe._id}`)}>
                                        View
                                      </Button>
                                    </div>
                                  </div>
                                )
                              })
                            )}
                          </div>
                        </div>

                        {/* Execution Status Summary */}
                        <div className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] overflow-hidden">
                          <div className="px-5 py-4 border-b border-[var(--apple-separator)]">
                            <p className="text-[17px] font-semibold text-[var(--apple-label)]">Execution Status</p>
                            <p className="text-[12px] text-[var(--apple-tertiary-label)] mt-0.5">Distribution across last 20 runs</p>
                          </div>
                          <div className="px-5 py-4 space-y-3">
                            {[
                              { key: 'passed',  icon: CheckCircle,  color: 'text-emerald-500', label: 'Passed',  cfg: EXEC_STATUS_CONFIG.passed },
                              { key: 'failed',  icon: XCircle,      color: 'text-red-500',     label: 'Failed',  cfg: EXEC_STATUS_CONFIG.failed },
                              { key: 'blocked', icon: AlertTriangle, color: 'text-amber-500',   label: 'Blocked', cfg: EXEC_STATUS_CONFIG.blocked },
                              { key: 'skipped', icon: Clock,        color: 'text-gray-400',    label: 'Skipped', cfg: EXEC_STATUS_CONFIG.skipped },
                            ].map(({ key, icon: Icon, color, label, cfg }) => {
                              const count = executionStatusCounts[key] ?? 0
                              const total = executions.length
                              const pct = total > 0 ? Math.round((count / total) * 100) : 0
                              return (
                                <div key={key} className="space-y-1">
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                      <Icon className={cn('h-3.5 w-3.5', color)} />
                                      <span className="text-[13px] text-[var(--apple-label)]">{label}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span className="text-[13px] font-medium font-apple-mono tabular-nums text-[var(--apple-secondary-label)]">{count}</span>
                                      <span className={cn('text-[11px] font-medium px-2 py-0.5 rounded-full border', cfg.bg, cfg.text, cfg.border)}>
                                        {pct}%
                                      </span>
                                    </div>
                                  </div>
                                  {total > 0 && (
                                    <div className="relative h-[5px] rounded-full bg-[var(--apple-tertiary-fill)] overflow-hidden">
                                      <div className="absolute inset-y-0 left-0 rounded-full" style={{
                                        width: `${pct}%`,
                                        background: key === 'passed' ? 'linear-gradient(90deg,#34C759,#30D158)' :
                                                    key === 'failed' ? 'linear-gradient(90deg,#FF3B30,#FF453A)' :
                                                    key === 'blocked' ? 'linear-gradient(90deg,#FF9500,#FFD60A)' :
                                                    'linear-gradient(90deg,#8E8E93,#AEAEB2)',
                                        transition: 'width 0.5s cubic-bezier(0.25, 0.46, 0.45, 0.94)'
                                      }} />
                                    </div>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                          <div className="px-5 pb-4">
                            <div className="rounded-[var(--apple-radius-sm)] bg-[var(--apple-quaternary-fill)] px-4 py-3 flex items-center justify-between">
                              <span className="text-[12px] text-[var(--apple-secondary-label)]">Overall Pass Rate</span>
                              <span className="text-[22px] font-bold text-[var(--apple-label)] font-apple-mono tabular-nums">{passRate}%</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </TabsContent>

                    {/* Suites Tab */}
                    <TabsContent value="suites" className="mt-0">
                      <TestSuiteCards
                        key={`${selectedProject}-${suitesRefreshCounter}`}
                        projectId={selectedProject}
                        onSuiteView={(suite) => { setDetailSuiteId(suite._id); setSuiteDetailDialogOpen(true) }}
                        onSuiteCreate={(parentSuiteId) => { setEditingSuite(null); setParentSuiteIdForCreate(parentSuiteId); setSuiteDialogOpen(true) }}
                        onSuiteEdit={(suite) => { setEditingSuite(suite); setParentSuiteIdForCreate(undefined); setSuiteDialogOpen(true) }}
                        onSuiteDelete={(suiteId) => handleDeleteSuite(suiteId)}
                      />
                    </TabsContent>

                    {/* Cases Tab */}
                    <TabsContent value="cases" className="mt-0">
                      <TestCaseList
                        projectId={selectedProject}
                        key={`${selectedProject}-${testCasesRefreshCounter}-${selectedSuiteId ?? 'all'}`}
                        onTestCaseSelect={(testCase) => console.log('Selected test case:', testCase)}
                        onTestCaseCreate={(testSuiteId) => {
                          const qp = new URLSearchParams({ projectId: selectedProject })
                          if (testSuiteId) qp.set('testSuiteId', testSuiteId)
                          router.push(`/test-management/cases/new?${qp.toString()}`)
                        }}
                        onTestCaseEdit={(testCase) => router.push(`/test-management/cases/${encodeURIComponent(testCase._id)}/edit?projectId=${encodeURIComponent(selectedProject)}`)}
                        onTestCaseDelete={(testCaseId, testCaseTitle) => { setDeleteItem({ id: testCaseId, name: testCaseTitle || '' }); setDeleteDialogOpen(true) }}
                        onTestCaseExecute={(testCase) => {
                          if (!selectedProject) return
                          router.push(`/test-management/executions/new?projectId=${encodeURIComponent(selectedProject)}&testCaseId=${encodeURIComponent(testCase._id)}`)
                        }}
                      />
                    </TabsContent>

                    {/* Executions Tab */}
                    <TabsContent value="executions" className="mt-0">
                      <div className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] overflow-hidden">
                        <div className="px-5 py-4 border-b border-[var(--apple-separator)] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                          <div>
                            <p className="text-[17px] font-semibold text-[var(--apple-label)]">Test Executions</p>
                            <p className="text-[12px] text-[var(--apple-tertiary-label)] mt-0.5">Latest execution results for this project</p>
                          </div>
                          <div className="flex gap-2">
                            <Button variant="outline" size="sm"
                              className="h-8 text-[12px] rounded-[var(--apple-radius-sm)] border-[var(--apple-separator)]"
                              onClick={() => router.push(`/test-management/executions?projectId=${encodeURIComponent(selectedProject)}`)}>
                              View All
                            </Button>
                            <Button size="sm"
                              className="h-8 text-[12px] rounded-[var(--apple-radius-sm)] gap-1"
                              style={{ background: 'linear-gradient(135deg,#FF9500 0%,#FFD60A 100%)' }}
                              onClick={() => router.push(`/test-management/executions/new?projectId=${encodeURIComponent(selectedProject)}`)}>
                              <Play className="h-3 w-3" /> Record
                            </Button>
                          </div>
                        </div>
                        <div className="overflow-x-auto">
                          <Table>
                            <TableHeader>
                              <TableRow className="border-[var(--apple-separator)]">
                                {['Test Case', 'Test Plan', 'Status', 'Tester', 'Duration', 'Executed', ''].map(h => (
                                  <TableHead key={h} className="text-[11px] font-semibold tracking-wide uppercase text-[var(--apple-tertiary-label)] h-10">{h}</TableHead>
                                ))}
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {executionsLoading ? (
                                [...Array(4)].map((_, i) => (
                                  <TableRow key={i} className="border-[var(--apple-separator)]">
                                    {[...Array(7)].map((_, j) => (
                                      <TableCell key={j}><div className="h-4 rounded bg-[var(--apple-tertiary-fill)] animate-pulse" style={{ width: `${60 + j * 8}%` }} /></TableCell>
                                    ))}
                                  </TableRow>
                                ))
                              ) : executions.length === 0 ? (
                                <TableRow>
                                  <TableCell colSpan={7} className="text-center py-10 text-[var(--apple-tertiary-label)] text-[13px]">No test executions found</TableCell>
                                </TableRow>
                              ) : executions.map((execution: any) => {
                                const cfg = EXEC_STATUS_CONFIG[execution.status as keyof typeof EXEC_STATUS_CONFIG] ?? EXEC_STATUS_CONFIG.skipped
                                return (
                                  <TableRow key={execution._id} className="border-[var(--apple-separator)] apple-transition hover:bg-[var(--apple-quaternary-fill)]">
                                    <TableCell className="text-[13px] font-medium text-[var(--apple-label)] max-w-[180px] truncate">{execution?.testCase?.title || execution.testCase}</TableCell>
                                    <TableCell className="text-[13px] text-[var(--apple-secondary-label)] max-w-[140px] truncate">{execution?.testPlan?.name || '—'}</TableCell>
                                    <TableCell>
                                      <span className={cn('inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium border animate-[badge-border-pulse_3s_ease-in-out_infinite]', cfg.bg, cfg.text, cfg.border)}>
                                        <span className={cn('w-1.5 h-1.5 rounded-full animate-[status-pulse_2.4s_ease-in-out_infinite]', cfg.dot)} />
                                        {cfg.label}
                                      </span>
                                    </TableCell>
                                    <TableCell className="text-[13px] text-[var(--apple-secondary-label)]">
                                      {((execution?.executedBy?.firstName || '') + ' ' + (execution?.executedBy?.lastName || '')).trim() || execution?.executedBy?.email || '—'}
                                    </TableCell>
                                    <TableCell className="text-[13px] font-apple-mono tabular-nums text-[var(--apple-secondary-label)]">{formatDuration(execution.executionTime)}</TableCell>
                                    <TableCell className="text-[13px] text-[var(--apple-tertiary-label)] whitespace-nowrap">{formatDate(execution.executedAt)}</TableCell>
                                    <TableCell>
                                      <Button variant="ghost" size="sm"
                                        className="h-7 px-2 text-[12px] rounded-[var(--apple-radius-sm)] text-[var(--apple-system-blue)]"
                                        onClick={() => router.push(`/test-management/executions/${encodeURIComponent(execution._id)}`)}>
                                        View
                                      </Button>
                                    </TableCell>
                                  </TableRow>
                                )
                              })}
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                    </TabsContent>
                  </Tabs>
                </div>
              )}
            </div>
          )}

          {/* ── Dialogs ── */}
          <ResponsiveDialog
            open={suiteDialogOpen}
            onOpenChange={setSuiteDialogOpen}
            title={editingSuite ? 'Edit Test Suite' : 'Create Test Suite'}
            dismissible={false}
          >
            <TestSuiteForm
              testSuite={editingSuite || (parentSuiteIdForCreate ? { name: '', description: '', parentSuite: parentSuiteIdForCreate, project: selectedProject } as any : undefined)}
              projectId={editingSuite?.project || selectedProject}
              projectName={projects.find(p => p._id === (editingSuite?.project || selectedProject))?.name}
              onSave={async (suiteData) => {
                setSuiteSaving(true)
                try {
                  const isEdit = !!editingSuite?._id
                  const projectIdToUse = isEdit ? (editingSuite?.project || selectedProject) : selectedProject
                  const res = await fetch('/api/test-suites', {
                    method: isEdit ? 'PUT' : 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      ...(isEdit ? { suiteId: editingSuite._id } : {}),
                      name: suiteData.name,
                      description: suiteData.description,
                      projectId: projectIdToUse,
                      parentSuiteId: suiteData.parentSuite || parentSuiteIdForCreate,
                    })
                  })
                  if (res.ok) {
                    notifySuccess({ title: isEdit ? 'Test Suite updated successfully.' : 'Test Suite created successfully.' })
                    setSuiteDialogOpen(false)
                    setEditingSuite(null)
                    setParentSuiteIdForCreate(undefined)
                    setSuitesRefreshCounter(c => c + 1)
                    if (detailSuiteId) { setSuiteDetailRefreshKey(k => k + 1); setSuiteDetailDialogOpen(true) }
                  }
                } catch (e) { console.error('Error saving test suite:', e) }
                finally { setSuiteSaving(false) }
              }}
              onCancel={() => {
                setSuiteDialogOpen(false)
                setEditingSuite(null)
                setParentSuiteIdForCreate(undefined)
                if (detailSuiteId) setSuiteDetailDialogOpen(true)
              }}
              loading={suiteSaving}
            />
          </ResponsiveDialog>

          <TestSuiteDetailDialog
            suiteId={detailSuiteId}
            open={suiteDetailDialogOpen}
            onOpenChange={setSuiteDetailDialogOpen}
            refreshKey={suiteDetailRefreshKey}
            onEdit={(suite) => {
              setSuiteDetailDialogOpen(false)
              setEditingSuite({ _id: suite._id, name: suite.name, description: suite.description, parentSuite: suite.parentSuite?._id, project: selectedProject })
              setParentSuiteIdForCreate(undefined)
              setSuiteDialogOpen(true)
            }}
            onDelete={(suiteId) => { setSuiteDetailDialogOpen(false); handleDeleteSuite(suiteId) }}
            onCreateChild={(parentSuiteId) => {
              setSuiteDetailDialogOpen(false)
              setEditingSuite(null)
              setParentSuiteIdForCreate(parentSuiteId)
              setSuiteDialogOpen(true)
            }}
            onCreateTestCase={(suiteId) => {
              setSuiteDetailDialogOpen(false)
              const qp = new URLSearchParams({ projectId: selectedProject })
              if (suiteId) qp.set('testSuiteId', suiteId)
              router.push(`/test-management/cases/new?${qp.toString()}`)
            }}
            onChildSuiteClick={(childSuiteId) => { setDetailSuiteId(childSuiteId) }}
          />

          <DeleteConfirmDialog
            isOpen={deleteDialogOpen}
            onClose={() => { setDeleteDialogOpen(false); setDeleteItem(null) }}
            onConfirm={async () => {
              if (!deleteItem) return
              setDeleting(true)
              try {
                const res = await fetch(`/api/test-cases/${deleteItem.id}`, { method: 'DELETE' })
                if (res.ok) { setDeleteDialogOpen(false); setDeleteItem(null); setTestCasesRefreshCounter(c => c + 1) }
              } catch (e) { console.error('Error deleting test case:', e) }
              finally { setDeleting(false) }
            }}
            title="Delete Test Case"
            itemName={deleteItem?.name || ''}
            itemType="Test Case"
            loading={deleting}
          />
        </div>
      </PermissionGate>
    </MainLayout>
  )
}
