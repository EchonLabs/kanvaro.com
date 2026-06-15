'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { MainLayout } from '@/components/layout/MainLayout'
import { useBreadcrumb } from '@/contexts/BreadcrumbContext'
import { PageWrapper } from '@/components/layout/PageWrapper'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/Button'
import {
  DollarSign, Clock, Zap, Target, BarChart3,
  Activity, TrendingUp, Users, BookOpen,
} from 'lucide-react'
import { OverviewReport } from '@/components/reports/OverviewReport'
import { BudgetReport } from '@/components/reports/BudgetReport'
import { BurnRateReport } from '@/components/reports/BurnRateReport'
import { VelocityReport } from '@/components/reports/VelocityReport'
import { SprintReport } from '@/components/reports/SprintReport'
import { TeamPerformanceReport } from '@/components/reports/TeamPerformanceReport'

interface Project {
  _id: string
  name: string
  status: string
  startDate: string
  endDate?: string
}

interface ReportData {
  project: Project
  tasks: { total: number; completed: number; completionRate: number }
  sprints: { total: number; active: number }
  timeTracking: { totalHours: number; entries: number }
  budget: { total: number; spent: number; remaining: number; utilizationRate: number }
  recentBurnRates: any[]
}

const TABS = [
  { value: 'overview',  label: 'Overview',  icon: BookOpen   },
  { value: 'budget',    label: 'Budget',    icon: DollarSign },
  { value: 'burn-rate', label: 'Burn Rate', icon: Activity   },
  { value: 'velocity',  label: 'Velocity',  icon: TrendingUp },
  { value: 'sprint',    label: 'Sprints',   icon: Zap        },
  { value: 'team',      label: 'Team',      icon: Users      },
]

export default function ReportsPage() {
  const params = useParams()
  const projectId = params.id as string
  const { setItems } = useBreadcrumb()
  const [reportData, setReportData] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('overview')

  useEffect(() => { setItems([{ label: 'Reports' }]) }, [setItems])

  useEffect(() => {
    if (projectId) fetchReportData()
    else setLoading(false)
  }, [projectId])

  const fetchReportData = async () => {
    try {
      setLoading(true)
      const res = await fetch(`/api/reports?projectId=${projectId}&type=overview`)
      if (res.ok) setReportData(await res.json())
    } catch (e) {
      console.error('Error fetching report data:', e)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <MainLayout>
        <PageWrapper>
          <div className="space-y-6 animate-pulse">
            <div className="flex items-center gap-4">
              <div className="h-14 w-14 rounded-[var(--apple-radius-md)] bg-[var(--apple-tertiary-fill)]" />
              <div className="space-y-2">
                <div className="h-7 w-48 rounded-full bg-[var(--apple-tertiary-fill)]" />
                <div className="h-4 w-64 rounded-full bg-[var(--apple-tertiary-fill)]" />
              </div>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-28 rounded-[var(--apple-radius-lg)] bg-[var(--apple-tertiary-fill)]" />
              ))}
            </div>
            <div className="h-96 rounded-[var(--apple-radius-lg)] bg-[var(--apple-tertiary-fill)]" />
          </div>
        </PageWrapper>
      </MainLayout>
    )
  }

  if (!reportData) {
    return (
      <MainLayout>
        <PageWrapper>
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <BarChart3 className="h-10 w-10 text-[var(--apple-chart-to)]" strokeWidth={1.5} />
            <p className="text-[17px] font-semibold text-[var(--apple-label)]">No report data available</p>
            <p className="text-[13px] text-[var(--apple-secondary-label)]">Report data will appear here once a project is selected.</p>
          </div>
        </PageWrapper>
      </MainLayout>
    )
  }

  const statusColor = reportData.project.status === 'active'
    ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800'
    : 'bg-[var(--apple-quaternary-fill)] text-[var(--apple-secondary-label)] border border-[var(--apple-separator)]'

  return (
    <MainLayout>
      <PageWrapper>
        <div className="space-y-6">

          {/* ── Header ── */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <BarChart3 className="h-8 w-8 flex-shrink-0 text-[var(--apple-chart-to)]" strokeWidth={1.5} />
              <div>
                <h1 className="text-[28px] sm:text-[30px] font-bold tracking-tight text-[var(--apple-label)]">
                  Project Reports
                </h1>
                <p className="text-[15px] text-[var(--apple-secondary-label)] mt-0.5">
                  Analytics and insights for {reportData.project.name}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[12px] font-semibold ${statusColor}`}>
                {reportData.project.status}
              </span>
              <Button
                variant="outline" size="sm"
                className="rounded-full h-8 px-4 text-[13px] border-[var(--apple-separator)] apple-transition"
              >
                <BarChart3 className="h-3.5 w-3.5 mr-1.5" strokeWidth={1.5} />
                Export Report
              </Button>
            </div>
          </div>

          {/* ── Stat Cards ── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              {
                label: 'Budget Utilization',
                value: `${reportData.budget.utilizationRate.toFixed(1)}%`,
                sub: `$${reportData.budget.spent.toLocaleString()} of $${reportData.budget.total.toLocaleString()}`,
                icon: DollarSign,
                progress: reportData.budget.utilizationRate,
              },
              {
                label: 'Task Completion',
                value: `${reportData.tasks.completionRate.toFixed(1)}%`,
                sub: `${reportData.tasks.completed} of ${reportData.tasks.total} tasks`,
                icon: Target,
                progress: reportData.tasks.completionRate,
              },
              {
                label: 'Time Logged',
                value: `${reportData.timeTracking.totalHours.toFixed(1)}h`,
                sub: `${reportData.timeTracking.entries} time entries`,
                icon: Clock,
                progress: null,
              },
              {
                label: 'Active Sprints',
                value: String(reportData.sprints.active),
                sub: `${reportData.sprints.total} total sprints`,
                icon: Zap,
                progress: null,
              },
            ].map(({ label, value, sub, icon: Icon, progress }) => (
              <div key={label}
                className="card-fade-in rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] p-5 space-y-2.5 apple-transition hover:shadow-[0_8px_28px_rgba(0,0,0,0.11)] hover:-translate-y-0.5">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-bold text-[var(--apple-secondary-label)] uppercase tracking-[0.06em]">{label}</p>
                  <Icon className="h-5 w-5 flex-shrink-0 text-[var(--apple-chart-to)]" strokeWidth={1.5} />
                </div>
                <p className="text-[28px] font-bold tracking-tight text-[var(--apple-label)] font-apple-mono leading-none">{value}</p>
                <p className="text-[11px] text-[var(--apple-tertiary-label)]">{sub}</p>
                {progress !== null && (
                  <div className="h-1.5 rounded-full bg-[var(--apple-tertiary-fill)] overflow-hidden">
                    <div
                      className="progress-bar-animated h-full rounded-full"
                      style={{
                        width: `${Math.min(100, progress)}%`,
                        background: 'var(--apple-card-gradient)',
                        boxShadow: '0 0 6px var(--apple-chart-glow)',
                        transformOrigin: 'left',
                      }}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* ── Tabs ── */}
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="w-full h-10 rounded-full bg-[var(--apple-tertiary-fill)] border border-[var(--apple-separator)] p-1 gap-0.5 mb-5">
              {TABS.map((tab) => (
                <TabsTrigger
                  key={tab.value}
                  value={tab.value}
                  className="flex-1 h-8 px-2 gap-1.5 text-[13px] rounded-full data-[state=active]:bg-card data-[state=active]:shadow-sm data-[state=active]:text-[var(--apple-chart-color)] apple-transition"
                >
                  <tab.icon className="h-3.5 w-3.5 flex-shrink-0" strokeWidth={1.5} />
                  <span className="hidden sm:inline">{tab.label}</span>
                </TabsTrigger>
              ))}
            </TabsList>

            <TabsContent value="overview"  className="mt-0"><OverviewReport projectId={projectId} /></TabsContent>
            <TabsContent value="budget"    className="mt-0"><BudgetReport projectId={projectId} /></TabsContent>
            <TabsContent value="burn-rate" className="mt-0"><BurnRateReport projectId={projectId} /></TabsContent>
            <TabsContent value="velocity"  className="mt-0"><VelocityReport projectId={projectId} /></TabsContent>
            <TabsContent value="sprint"    className="mt-0"><SprintReport projectId={projectId} /></TabsContent>
            <TabsContent value="team"      className="mt-0">
              <TeamPerformanceReport members={[]} productivityTrends={[]} filters={{}} />
            </TabsContent>
          </Tabs>

        </div>
      </PageWrapper>
    </MainLayout>
  )
}
