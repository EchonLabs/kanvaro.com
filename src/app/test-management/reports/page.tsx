'use client'

import { MainLayout } from '@/components/layout/MainLayout'
import { useEffect, useMemo, useState } from 'react'
import { useBreadcrumb } from '@/contexts/BreadcrumbContext'
import { Button } from '@/components/ui/Button'
import { useDateTime } from '@/components/providers/DateTimeProvider'
import { Permission } from '@/lib/permissions'
import { PermissionGate } from '@/lib/permissions/permission-components'
import {
  BarChart3, Download, TrendingUp, CheckCircle, XCircle,
  AlertCircle, Clock, Target, FileText, Activity
} from 'lucide-react'
import { cn } from '@/lib/utils'

const EXEC_STATUS_CONFIG = {
  passed:  { bg: 'bg-emerald-50 dark:bg-emerald-950/30', text: 'text-emerald-600 dark:text-emerald-400', dot: 'bg-emerald-500', border: 'border-emerald-200 dark:border-emerald-800', label: 'Passed',  bar: 'linear-gradient(90deg,#34C759,#30D158)', icon: CheckCircle },
  failed:  { bg: 'bg-red-50 dark:bg-red-950/30',         text: 'text-red-600 dark:text-red-400',         dot: 'bg-red-500',    border: 'border-red-200 dark:border-red-800',   label: 'Failed',  bar: 'linear-gradient(90deg,#FF3B30,#FF453A)', icon: XCircle },
  blocked: { bg: 'bg-amber-50 dark:bg-amber-950/30',     text: 'text-amber-600 dark:text-amber-400',     dot: 'bg-amber-500',  border: 'border-amber-200 dark:border-amber-800', label: 'Blocked', bar: 'linear-gradient(90deg,#FF9500,#FFD60A)', icon: AlertCircle },
  skipped: { bg: 'bg-gray-50 dark:bg-gray-900/40',       text: 'text-gray-500 dark:text-gray-400',       dot: 'bg-gray-400',   border: 'border-gray-200 dark:border-gray-700',  label: 'Skipped', bar: 'linear-gradient(90deg,#8E8E93,#AEAEB2)', icon: Clock },
} as const

function GradientProgress({ value, gradient, glow }: { value: number; gradient: string; glow: string }) {
  return (
    <div className="relative h-[6px] rounded-full bg-[var(--apple-tertiary-fill)] overflow-hidden">
      {value > 2 && (
        <div className="progress-bar-animated absolute inset-y-0 left-0 rounded-full overflow-hidden" style={{
          width: `${value}%`,
          background: gradient,
          boxShadow: `0 0 8px ${glow}`,
          transformOrigin: 'left'
        }}>
          <span className="progress-shimmer absolute inset-0" />
        </div>
      )}
    </div>
  )
}

export default function TestReportsPage() {
  const { setItems } = useBreadcrumb()
  const [cases, setCases] = useState<any[]>([])
  const [executions, setExecutions] = useState<any[]>([])
  const [projects, setProjects] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const { formatDate } = useDateTime()

  useEffect(() => {
    setItems([{ label: 'Test Management', href: '/test-management' }, { label: 'Test Reports' }])
  }, [setItems])

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true)
        const [casesRes, execsRes, projectsRes] = await Promise.all([
          fetch('/api/test-cases'),
          fetch('/api/test-executions?limit=500'),
          fetch('/api/projects')
        ])
        const [casesData, execsData, projectsData] = await Promise.all([
          casesRes.json().catch(() => ({})),
          execsRes.json().catch(() => ({})),
          projectsRes.json().catch(() => ({}))
        ])
        if (casesRes.ok && casesData?.success && Array.isArray(casesData.data)) setCases(casesData.data)
        else setCases([])
        if (execsRes.ok && execsData?.success && Array.isArray(execsData.data)) setExecutions(execsData.data)
        else setExecutions([])
        if (projectsRes.ok && projectsData?.success && Array.isArray(projectsData.data)) setProjects(projectsData.data)
        else setProjects([])
      } catch {
        setCases([]); setExecutions([]); setProjects([])
      } finally { setLoading(false) }
    }
    fetchData()
  }, [])

  const summary = useMemo(() => {
    const totalTestCases = cases.length
    const passed = executions.filter(e => e.status === 'passed').length
    const failed = executions.filter(e => e.status === 'failed').length
    const blocked = executions.filter(e => e.status === 'blocked').length
    const actionable = passed + failed
    const passRate = actionable === 0 ? 0 : Math.round((passed / actionable) * 100)
    const uniqueExecutedCases = new Set(executions.map(e => String(e?.testCase?._id || e?.testCase)).filter(Boolean)).size
    const executionRate = totalTestCases === 0 ? 0 : Math.round((uniqueExecutedCases / totalTestCases) * 100)
    return { totalTestCases, passed, failed, blocked, passRate, executionRate }
  }, [cases, executions])

  const projectStats = useMemo(() => {
    return projects.map(project => {
      const pid = project._id || project.id
      const projectCases = cases.filter(c => (c.project?._id || c.project) === pid)
      const projectExecutions = executions.filter(e => (e.project?._id || e.project) === pid)
      const totalCases = projectCases.length
      const executed = projectExecutions.length
      const passed = projectExecutions.filter(e => e.status === 'passed').length
      const failed = projectExecutions.filter(e => e.status === 'failed').length
      const blocked = projectExecutions.filter(e => e.status === 'blocked').length
      const actionable = passed + failed
      const passRate = actionable === 0 ? 0 : Math.round((passed / actionable) * 100)
      return { name: project.name, totalCases, executed, passed, failed, blocked, passRate }
    }).filter(p => p.totalCases > 0)
  }, [projects, cases, executions])

  const recentExecutions = useMemo(() => {
    return executions.slice(0, 10).map(execution => ({
      testCase: execution.testCase?.title || 'Unknown Test Case',
      project: execution.project?.name || 'Unknown Project',
      status: execution.status as keyof typeof EXEC_STATUS_CONFIG,
      executedBy: execution.executedBy
        ? (`${execution.executedBy.firstName || ''} ${execution.executedBy.lastName || ''}`.trim() || execution.executedBy.email || 'Unknown')
        : 'Unknown',
      executedAt: execution.executedAt || execution.createdAt
    }))
  }, [executions])

  const SUMMARY_STATS = [
    {
      label: 'Total Test Cases',
      value: loading ? null : summary.totalTestCases,
      sub: 'Across all projects',
      icon: FileText,
      gradient: 'var(--apple-card-gradient)',
      glow: 'var(--apple-chart-glow)',
    },
    {
      label: 'Execution Rate',
      value: loading ? null : `${summary.executionRate}%`,
      sub: 'Cases executed at least once',
      icon: TrendingUp,
      gradient: 'linear-gradient(135deg,#007AFF 0%,#5AC8FA 100%)',
      glow: 'rgba(0,122,255,0.25)',
      progress: summary.executionRate,
    },
    {
      label: 'Pass Rate',
      value: loading ? null : `${summary.passRate}%`,
      sub: 'Passed vs. actionable runs',
      icon: CheckCircle,
      gradient: 'linear-gradient(135deg,#34C759 0%,#30D158 100%)',
      glow: 'rgba(52,199,89,0.25)',
      progress: summary.passRate,
    },
    {
      label: 'Failed Tests',
      value: loading ? null : summary.failed,
      sub: loading ? '—' : `${summary.blocked} blocked`,
      icon: XCircle,
      gradient: 'var(--apple-card-gradient)',
      glow: 'var(--apple-chart-glow)',
    },
  ]

  const buildCsv = (headers: string[], rows: (string | number | null | undefined)[][]) => {
    const escape = (val: any) => {
      if (val === null || val === undefined) return ''
      const s = String(val)
      return (s.includes('"') || s.includes(',') || s.includes('\n')) ? '"' + s.replace(/"/g, '""') + '"' : s
    }
    return [[...headers.map(escape)], ...rows.map(r => r.map(escape))].map(r => r.join(',')).join('\n')
  }

  const handleExport = () => {
    const parts = [
      '# Summary',
      buildCsv(['metric', 'value'], [
        ['totalTestCases', summary.totalTestCases],
        ['passed', summary.passed], ['failed', summary.failed], ['blocked', summary.blocked],
        ['passRate', `${summary.passRate}%`], ['executionRate', `${summary.executionRate}%`],
      ]),
      '', '# Project Statistics',
      buildCsv(['name', 'totalCases', 'executed', 'passed', 'failed', 'blocked', 'passRate'],
        projectStats.map(p => [p.name, p.totalCases, p.executed, p.passed, p.failed, p.blocked, `${p.passRate}%`])),
      '', '# Recent Executions',
      buildCsv(['testCase', 'project', 'status', 'executedBy', 'executedAt'],
        recentExecutions.map(e => [e.testCase, e.project, e.status, e.executedBy, new Date(e.executedAt).toISOString()])),
    ]
    const blob = new Blob([parts.join('\n') + '\n'], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `test-reports-${new Date().toISOString().split('T')[0]}.csv`
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url)
  }

  return (
    <MainLayout>
      <PermissionGate permission={Permission.TEST_MANAGE}>
        <div className="space-y-8">

          {/* ── Page Header ── */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <BarChart3 className="h-8 w-8 flex-shrink-0" strokeWidth={1.5} style={{ color: 'var(--apple-card-gradient)' }} />
              <div>
                <h1 className="text-[28px] sm:text-[30px] font-bold tracking-tight text-[var(--apple-label)]">Test Reports</h1>
                <p className="text-[15px] text-[var(--apple-secondary-label)] mt-0.5">
                  Comprehensive test execution reports and analytics
                </p>
              </div>
            </div>
            <Button
              onClick={handleExport}
              className="w-full sm:w-auto h-9 gap-1.5 rounded-[var(--apple-radius-sm)] apple-transition"
              style={{ background: 'var(--apple-card-gradient)' }}
            >
              <Download className="h-4 w-4" />
              <span className="text-[13px]">Export CSV</span>
            </Button>
          </div>

          {/* ── Summary Stats Bar ── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {SUMMARY_STATS.map((stat) => (
              <div key={stat.label} className="card-fade-in rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] p-4 apple-transition hover:shadow-[0_4px_16px_rgba(0,0,0,0.09)]">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[12px] text-[var(--apple-tertiary-label)]">{stat.label}</p>
                  <div className="w-7 h-7 rounded-[8px] flex items-center justify-center flex-shrink-0"
                    style={{ background: stat.gradient, boxShadow: `0 2px 8px ${stat.glow}` }}>
                    <stat.icon className="h-3.5 w-3.5 text-white" strokeWidth={2} />
                  </div>
                </div>
                {loading ? (
                  <div className="h-7 w-16 rounded bg-[var(--apple-tertiary-fill)] animate-pulse" />
                ) : (
                  <p className="text-[26px] font-bold font-apple-mono tabular-nums tracking-tight text-[var(--apple-label)] leading-none">{stat.value}</p>
                )}
                {stat.progress !== undefined && !loading && (
                  <div className="mt-2">
                    <GradientProgress value={stat.progress} gradient={stat.gradient} glow={stat.glow} />
                  </div>
                )}
                <p className="text-[11px] text-[var(--apple-tertiary-label)] mt-1.5">{stat.sub}</p>
              </div>
            ))}
          </div>

          {/* ── Project Statistics ── */}
          <div className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] overflow-hidden">
            <div className="px-5 py-4 border-b border-[var(--apple-separator)]">
              <p className="text-[17px] font-semibold text-[var(--apple-label)]">Project Test Statistics</p>
              <p className="text-[12px] text-[var(--apple-tertiary-label)] mt-0.5">Execution breakdown per project</p>
            </div>
            <div className="px-5 py-4">
              {loading ? (
                <div className="space-y-5">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="h-4 w-36 rounded bg-[var(--apple-tertiary-fill)] animate-pulse" />
                        <div className="h-5 w-20 rounded-full bg-[var(--apple-tertiary-fill)] animate-pulse" />
                      </div>
                      <div className="h-[6px] rounded-full bg-[var(--apple-tertiary-fill)] animate-pulse" />
                    </div>
                  ))}
                </div>
              ) : projectStats.length === 0 ? (
                <div className="py-12 flex flex-col items-center gap-3 text-center text-[var(--apple-tertiary-label)]">
                  <div className="w-14 h-14 rounded-[var(--apple-radius-md)] flex items-center justify-center"
                    style={{ background: 'var(--apple-card-gradient)', boxShadow: '0 4px 16px var(--apple-chart-glow)' }}>
                    <Target className="h-7 w-7 text-white" strokeWidth={1.8} />
                  </div>
                  <div>
                    <p className="text-[15px] font-medium text-[var(--apple-label)]">No Test Data Found</p>
                    <p className="text-[13px] text-[var(--apple-secondary-label)] mt-1 max-w-xs">
                      Create test cases for your projects to see statistics here.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-5">
                  {projectStats.map((project, index) => (
                    <div key={index} className="space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-[15px] font-semibold text-[var(--apple-label)]">{project.name}</p>
                        <span className={cn('inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-medium border',
                          project.passRate >= 80 ? 'bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800' :
                          project.passRate >= 50 ? 'bg-amber-50 text-amber-600 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800' :
                          'bg-red-50 text-red-600 border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-800'
                        )}>
                          {project.passRate}% pass
                        </span>
                      </div>
                      <GradientProgress
                        value={project.passRate}
                        gradient={project.passRate >= 80 ? 'linear-gradient(90deg,#34C759,#30D158)' : project.passRate >= 50 ? 'linear-gradient(90deg,#FF9500,#FFD60A)' : 'linear-gradient(90deg,#FF3B30,#FF453A)'}
                        glow={project.passRate >= 80 ? 'rgba(52,199,89,0.3)' : project.passRate >= 50 ? 'rgba(255,149,0,0.3)' : 'rgba(255,59,48,0.3)'}
                      />
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {[
                          { label: 'Total Cases', value: project.totalCases, icon: Target, color: 'text-[var(--apple-tertiary-label)]' },
                          { label: 'Executed', value: project.executed, icon: Activity, color: 'text-[var(--apple-tertiary-label)]' },
                          { label: 'Passed', value: project.passed, icon: CheckCircle, color: 'text-emerald-500' },
                          { label: 'Failed', value: project.failed, icon: XCircle, color: 'text-red-500' },
                        ].map(({ label, value, icon: Icon, color }) => (
                          <div key={label} className="flex items-center gap-1.5">
                            <Icon className={cn('h-3.5 w-3.5 flex-shrink-0', color)} />
                            <span className="text-[12px] text-[var(--apple-secondary-label)]">{label}:</span>
                            <span className="text-[12px] font-semibold font-apple-mono text-[var(--apple-label)]">{value}</span>
                          </div>
                        ))}
                      </div>
                      {index < projectStats.length - 1 && <div className="border-b border-[var(--apple-separator)]" />}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ── Recent Executions Timeline ── */}
          <div className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] overflow-hidden">
            <div className="px-5 py-4 border-b border-[var(--apple-separator)]">
              <p className="text-[17px] font-semibold text-[var(--apple-label)]">Recent Test Executions</p>
              <p className="text-[12px] text-[var(--apple-tertiary-label)] mt-0.5">Latest 10 executions across all projects</p>
            </div>
            <div className="divide-y divide-[var(--apple-separator)]">
              {loading ? (
                [...Array(4)].map((_, i) => (
                  <div key={i} className="px-5 py-3 flex items-center gap-3">
                    <div className="w-7 h-7 rounded-full bg-[var(--apple-tertiary-fill)] animate-pulse flex-shrink-0" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-3.5 w-48 rounded bg-[var(--apple-tertiary-fill)] animate-pulse" />
                      <div className="h-3 w-32 rounded bg-[var(--apple-tertiary-fill)] animate-pulse" />
                    </div>
                    <div className="h-5 w-16 rounded-full bg-[var(--apple-tertiary-fill)] animate-pulse" />
                  </div>
                ))
              ) : recentExecutions.length === 0 ? (
                <div className="px-5 py-12 flex flex-col items-center gap-3 text-center text-[var(--apple-tertiary-label)]">
                  <Clock className="h-8 w-8 opacity-40" />
                  <div>
                    <p className="text-[15px] font-medium text-[var(--apple-label)]">No Test Executions Found</p>
                    <p className="text-[13px] text-[var(--apple-secondary-label)] mt-1">Execute some test cases to see recent activity here.</p>
                  </div>
                </div>
              ) : recentExecutions.map((execution, index) => {
                const cfg = EXEC_STATUS_CONFIG[execution.status] ?? EXEC_STATUS_CONFIG.skipped
                const Icon = cfg.icon
                return (
                  <div key={index} className="px-5 py-3 flex items-center gap-3 apple-transition hover:bg-[var(--apple-quaternary-fill)]">
                    <div className={cn('flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center', cfg.bg)}>
                      <Icon className={cn('h-3.5 w-3.5', cfg.text)} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium text-[var(--apple-label)] truncate">{execution.testCase}</p>
                      <p className="text-[11px] text-[var(--apple-tertiary-label)] mt-0.5 truncate">
                        {execution.project} · {execution.executedBy}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border animate-[badge-border-pulse_3s_ease-in-out_infinite]', cfg.bg, cfg.text, cfg.border)}>
                        <span className={cn('w-1.5 h-1.5 rounded-full animate-[status-pulse_2.4s_ease-in-out_infinite]', cfg.dot)} />
                        {cfg.label}
                      </span>
                      <span className="text-[11px] text-[var(--apple-tertiary-label)] whitespace-nowrap hidden sm:block">
                        {formatDate(execution.executedAt)}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </PermissionGate>
    </MainLayout>
  )
}
