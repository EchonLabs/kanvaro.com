'use client'

import React, { useState, useEffect } from 'react'
import { MainLayout } from '@/components/layout/MainLayout'
import { useBreadcrumb } from '@/contexts/BreadcrumbContext'
import { PageWrapper } from '@/components/layout/PageWrapper'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/Popover'
import {
  CalendarIcon, Download, Filter, RefreshCw, Search,
  BarChart3, FolderKanban, DollarSign, CheckCircle2, Gauge, X,
  LayoutGrid, TrendingUp, Calendar as CalendarTab, Layers
} from 'lucide-react'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'
import { useOrgCurrency } from '@/hooks/useOrgCurrency'
import { ProjectOverviewReport } from '@/components/reports/ProjectOverviewReport'
import { ProjectProgressReport } from '@/components/reports/ProjectProgressReport'
import { ProjectTimelineReport } from '@/components/reports/ProjectTimelineReport'
import { ProjectResourceReport } from '@/components/reports/ProjectResourceReport'

interface Project {
  _id: string
  name: string
  status: string
  startDate: string
  endDate?: string
  description?: string
  budget?: { total: number; spent: number; remaining: number }
  team?: any[]
  stats: {
    tasks: { total: number; completed: number; completionRate: number }
    sprints: { total: number; active: number }
    timeTracking: { totalHours: number; entries: number }
    budget: { total: number; spent: number; remaining: number; utilizationRate: number }
  }
}

interface ProjectReportData {
  projects: Project[]
  summary: {
    totalProjects: number
    activeProjects: number
    completedProjects: number
    totalBudget: number
    totalSpent: number
    averageCompletionRate: number
  }
  trends: {
    projectVelocity: number
    budgetUtilization: number
    teamUtilization: number
  }
}

interface FilterState {
  search: string
  status: string
  dateRange: { from: Date | undefined; to: Date | undefined }
  sortBy: string
  sortOrder: 'asc' | 'desc'
}

const STAT_ACCENTS = [
  { gradient: 'var(--apple-card-gradient)', glow: 'var(--apple-chart-glow)' },
  { gradient: 'var(--apple-card-gradient)', glow: 'var(--apple-chart-glow)' },
  { gradient: 'var(--apple-card-gradient)', glow: 'var(--apple-chart-glow)' },
  { gradient: 'var(--apple-card-gradient)', glow: 'var(--apple-chart-glow)' },
]

function StatCard({
  label, value, sub, icon: Icon, accent,
}: {
  label: string; value: string; sub: string; icon: React.ElementType; accent: typeof STAT_ACCENTS[0]
}) {
  return (
    <div className="card-fade-in rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] dark:shadow-none p-5 flex items-center gap-4 apple-transition hover:shadow-[0_8px_28px_rgba(0,0,0,0.11)] dark:hover:shadow-[0_8px_28px_rgba(0,0,0,0.40)] hover:-translate-y-0.5">
      <div
        className="flex h-11 w-11 items-center justify-center rounded-[var(--apple-radius-sm)] flex-shrink-0"
        style={{ background: accent.gradient, boxShadow: `0 4px 14px ${accent.glow}` }}
      >
        <Icon className="h-5 w-5 text-white" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="apple-section-label text-[var(--apple-secondary-label)]">{label}</p>
        <p className="text-[24px] font-bold tracking-tight leading-tight font-apple-mono">{value}</p>
        <p className="text-[12px] text-[var(--apple-tertiary-label)] truncate mt-0.5">{sub}</p>
      </div>
    </div>
  )
}

export default function ProjectReportsPage() {
  const { setItems } = useBreadcrumb()
  const { formatCurrency } = useOrgCurrency()
  const [reportData, setReportData] = useState<ProjectReportData | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('overview')
  const [showFilters, setShowFilters] = useState(false)
  const [filters, setFilters] = useState<FilterState>({
    search: '',
    status: 'all',
    dateRange: { from: undefined, to: undefined },
    sortBy: 'name',
    sortOrder: 'asc',
  })

  useEffect(() => {
    setItems([
      { label: 'Reports', href: '/reports' },
      { label: 'Project Reports' },
    ])
  }, [setItems])

  useEffect(() => { fetchProjectReports() }, [filters])

  const fetchProjectReports = async () => {
    try {
      setLoading(true)
      const q = new URLSearchParams()
      if (filters.search) q.append('search', filters.search)
      if (filters.status !== 'all') q.append('status', filters.status)
      if (filters.dateRange.from) q.append('startDate', filters.dateRange.from.toISOString())
      if (filters.dateRange.to) q.append('endDate', filters.dateRange.to.toISOString())
      q.append('sortBy', filters.sortBy)
      q.append('sortOrder', filters.sortOrder)
      const res = await fetch(`/api/reports/projects?${q}`)
      if (res.ok) setReportData(await res.json())
    } catch (e) {
      console.error('Error fetching project reports:', e)
    } finally {
      setLoading(false)
    }
  }

  const handleFilter = (key: keyof FilterState, value: any) =>
    setFilters(prev => ({ ...prev, [key]: value }))

  const handleDateRange = (key: 'from' | 'to', date: Date | undefined) =>
    setFilters(prev => ({ ...prev, dateRange: { ...prev.dateRange, [key]: date } }))

  const clearFilters = () =>
    setFilters({ search: '', status: 'all', dateRange: { from: undefined, to: undefined }, sortBy: 'name', sortOrder: 'asc' })

  const exportReport = async (fmt: 'pdf' | 'excel' | 'csv') => {
    try {
      const q = new URLSearchParams({ format: fmt, type: activeTab })
      if (filters.search) q.append('search', filters.search)
      if (filters.status !== 'all') q.append('status', filters.status)
      const res = await fetch(`/api/reports/projects/export?${q}`)
      if (res.ok) {
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        const a = Object.assign(document.createElement('a'), { href: url, download: `project-reports-${fmt}-${new Date().toISOString().split('T')[0]}.${fmt}` })
        document.body.appendChild(a); a.click(); URL.revokeObjectURL(url); a.remove()
      }
    } catch (e) { console.error('Export error:', e) }
  }

  if (loading) {
    return (
      <MainLayout>
        <PageWrapper>
          <div className="space-y-6 animate-pulse">
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 rounded-[var(--apple-radius-md)] bg-[var(--apple-tertiary-fill)]" />
              <div className="space-y-2">
                <div className="h-7 w-48 rounded-full bg-[var(--apple-tertiary-fill)]" />
                <div className="h-4 w-64 rounded-full bg-[var(--apple-tertiary-fill)]" />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-24 rounded-[var(--apple-radius-lg)] bg-[var(--apple-tertiary-fill)]" />
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
            <div className="flex h-16 w-16 items-center justify-center rounded-[var(--apple-radius-lg)]" style={{ background: 'var(--apple-card-gradient)', boxShadow: '0 4px 20px var(--apple-chart-glow)' }}>
              <FolderKanban className="h-7 w-7 text-white" />
            </div>
            <p className="text-[17px] font-semibold">No project data available</p>
            <p className="text-[13px] text-[var(--apple-secondary-label)]">Projects will appear here once data is available.</p>
          </div>
        </PageWrapper>
      </MainLayout>
    )
  }

  const budgetPct = reportData.summary.totalBudget > 0
    ? (reportData.summary.totalSpent / reportData.summary.totalBudget) * 100
    : 0

  return (
    <MainLayout>
      <PageWrapper>
        <div className="space-y-6">

          {/* ── Header ── */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <BarChart3 className="h-8 w-8 flex-shrink-0" strokeWidth={1.5} style={{ color: 'var(--apple-card-gradient)' }} />
              <div>
                <h1 className="text-[28px] sm:text-[30px] font-bold tracking-tight leading-tight">Project Reports</h1>
                <p className="text-[13px] text-[var(--apple-secondary-label)]">Comprehensive analytics and insights for all projects</p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Button
                variant="outline" size="sm"
                onClick={() => setShowFilters(v => !v)}
                className={cn("rounded-full h-8 px-4 text-[13px] border-[var(--apple-separator)] apple-transition", showFilters && "bg-[var(--apple-tertiary-fill)]")}
              >
                <Filter className="h-3.5 w-3.5 mr-1.5" />Filters
              </Button>
              <Button variant="outline" size="sm" onClick={fetchProjectReports} className="rounded-full h-8 px-3 border-[var(--apple-separator)] apple-transition">
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="sm" onClick={() => exportReport('csv')}
                className="rounded-full h-8 px-4 text-[13px] apple-transition"
                style={{ background: 'var(--apple-card-gradient)' }}
              >
                <Download className="h-3.5 w-3.5 mr-1.5" />Export
              </Button>
            </div>
          </div>

          {/* ── Filter Panel ── */}
          {showFilters && (
            <div className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] p-5 space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-[13px] font-semibold text-[var(--apple-secondary-label)] uppercase tracking-[0.06em]">Filters</p>
                <Button variant="ghost" size="sm" onClick={clearFilters} className="h-7 px-3 text-[12px] rounded-full text-[var(--apple-secondary-label)] hover:text-[var(--apple-label)]">
                  <X className="h-3 w-3 mr-1" />Clear
                </Button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--apple-tertiary-label)]" />
                  <Input
                    placeholder="Search projects…"
                    value={filters.search}
                    onChange={e => handleFilter('search', e.target.value)}
                    className="pl-9 h-9 rounded-full text-[13px] border-[var(--apple-separator)] bg-[var(--apple-tertiary-fill)]"
                  />
                </div>
                <Select value={filters.status} onValueChange={v => handleFilter('status', v)}>
                  <SelectTrigger className="h-9 rounded-full text-[13px] border-[var(--apple-separator)] bg-[var(--apple-tertiary-fill)]">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent className="rounded-[var(--apple-radius-md)]">
                    {['all','active','completed','on-hold','cancelled'].map(s => (
                      <SelectItem key={s} value={s} className="text-[13px]">{s === 'all' ? 'All Status' : s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("h-9 rounded-full text-[13px] border-[var(--apple-separator)] bg-[var(--apple-tertiary-fill)] justify-start font-normal w-full", !filters.dateRange.from && "text-[var(--apple-tertiary-label)]")}>
                      <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                      {filters.dateRange.from ? format(filters.dateRange.from, "PPP") : "From date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 rounded-[var(--apple-radius-md)]">
                    <Calendar mode="single" selected={filters.dateRange.from} onSelect={d => handleDateRange('from', d)} initialFocus />
                  </PopoverContent>
                </Popover>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("h-9 rounded-full text-[13px] border-[var(--apple-separator)] bg-[var(--apple-tertiary-fill)] justify-start font-normal w-full", !filters.dateRange.to && "text-[var(--apple-tertiary-label)]")}>
                      <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                      {filters.dateRange.to ? format(filters.dateRange.to, "PPP") : "To date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 rounded-[var(--apple-radius-md)]">
                    <Calendar mode="single" selected={filters.dateRange.to} onSelect={d => handleDateRange('to', d)} initialFocus />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="flex items-center gap-3">
                <p className="text-[12px] text-[var(--apple-tertiary-label)] flex-shrink-0">Sort by</p>
                <Select value={filters.sortBy} onValueChange={v => handleFilter('sortBy', v)}>
                  <SelectTrigger className="h-8 rounded-full text-[12px] border-[var(--apple-separator)] w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-[var(--apple-radius-md)]">
                    {[['name','Name'],['status','Status'],['startDate','Start Date'],['budget','Budget'],['completion','Completion']].map(([v,l]) => (
                      <SelectItem key={v} value={v} className="text-[12px]">{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={filters.sortOrder} onValueChange={v => handleFilter('sortOrder', v as 'asc'|'desc')}>
                  <SelectTrigger className="h-8 rounded-full text-[12px] border-[var(--apple-separator)] w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-[var(--apple-radius-md)]">
                    <SelectItem value="asc" className="text-[12px]">Ascending</SelectItem>
                    <SelectItem value="desc" className="text-[12px]">Descending</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* ── Stats Bar ── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="Total Projects" icon={FolderKanban} accent={STAT_ACCENTS[0]}
              value={String(reportData.summary.totalProjects)}
              sub={`${reportData.summary.activeProjects} active · ${reportData.summary.completedProjects} done`}
            />
            <StatCard
              label="Budget Utilization" icon={DollarSign} accent={STAT_ACCENTS[1]}
              value={formatCurrency(reportData.summary.totalSpent)}
              sub={`${budgetPct.toFixed(1)}% of ${formatCurrency(reportData.summary.totalBudget)}`}
            />
            <StatCard
              label="Avg Completion" icon={CheckCircle2} accent={STAT_ACCENTS[2]}
              value={`${reportData.summary.averageCompletionRate.toFixed(1)}%`}
              sub="Across all projects"
            />
            <StatCard
              label="Project Velocity" icon={Gauge} accent={STAT_ACCENTS[3]}
              value={reportData.trends.projectVelocity.toFixed(1)}
              sub="Projects per month"
            />
          </div>

          {/* ── Tabs ── */}
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="flex w-full h-10 p-1 rounded-full bg-[var(--apple-tertiary-fill)] gap-0.5 mb-5">
              {([
                ['overview',  'Overview',  LayoutGrid],
                ['progress',  'Progress',  TrendingUp],
                ['timeline',  'Timeline',  CalendarTab],
                ['resources', 'Resources', Layers],
              ] as [string, string, React.ElementType][]).map(([v, l, Icon]) => (
                <TabsTrigger
                  key={v} value={v}
                  className="flex-1 flex items-center justify-center gap-1.5 rounded-full py-1.5 text-[13px] font-medium apple-transition data-[state=active]:bg-card data-[state=active]:shadow-sm data-[state=active]:text-[var(--apple-chart-color)] text-[var(--apple-secondary-label)]"
                >
                  <Icon className="h-4 w-4 flex-shrink-0" />
                  <span className="hidden sm:inline">{l}</span>
                </TabsTrigger>
              ))}
            </TabsList>

            <TabsContent value="overview" className="mt-0">
              <ProjectOverviewReport projects={reportData.projects} summary={reportData.summary} trends={reportData.trends} filters={filters} />
            </TabsContent>
            <TabsContent value="progress" className="mt-0">
              <ProjectProgressReport projects={reportData.projects} filters={filters} />
            </TabsContent>
            <TabsContent value="timeline" className="mt-0">
              <ProjectTimelineReport projects={reportData.projects} filters={filters} />
            </TabsContent>
            <TabsContent value="resources" className="mt-0">
              <ProjectResourceReport projects={reportData.projects} filters={filters} />
            </TabsContent>
          </Tabs>
        </div>
      </PageWrapper>
    </MainLayout>
  )
}
