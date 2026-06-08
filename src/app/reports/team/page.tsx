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
  Users, Clock, Target, TrendingUp, X, Activity,
  LayoutGrid, Star, Zap, Scale
} from 'lucide-react'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'
import { TeamOverviewReport } from '@/components/reports/TeamOverviewReport'
import { TeamPerformanceReport } from '@/components/reports/TeamPerformanceReport'
import { TeamProductivityReport } from '@/components/reports/TeamProductivityReport'
import { TeamWorkloadReport } from '@/components/reports/TeamWorkloadReport'
import { validateAndCorrectDateRange } from '@/lib/dateRangeValidation'

interface TeamMember {
  _id: string; firstName: string; lastName: string; email: string
  role: string; department: string; avatar?: string
  stats: {
    tasksCompleted: number; totalTasks: number; completionRate: number
    hoursLogged: number; averageSessionLength: number; productivityScore: number; workloadScore: number
  }
  recentActivity: { date: string; activity: string; type: 'task' | 'time' | 'project' }[]
}

interface TeamReportData {
  overview: {
    totalMembers: number; activeMembers: number; averageProductivity: number
    averageWorkload: number; totalHoursLogged: number; totalTasksCompleted: number
  }
  members: TeamMember[]
  departmentBreakdown: {
    department: string; members: number; averageProductivity: number; averageWorkload: number
  }[]
  productivityTrends: { date: string; productivity: number; workload: number; hours: number }[]
  topPerformers: TeamMember[]
  workloadDistribution: {
    member: string; currentTasks: number; completedTasks: number; hoursLogged: number; workloadScore: number
  }[]
}

interface FilterState {
  search: string; department: string; role: string
  dateRange: { from: Date | undefined; to: Date | undefined }
  sortBy: string; sortOrder: 'asc' | 'desc'
}

const STAT_ACCENTS = [
  { gradient: 'linear-gradient(135deg,#007AFF 0%,#5AC8FA 100%)', glow: 'rgba(0,122,255,0.22)' },
  { gradient: 'linear-gradient(135deg,#BF5AF2 0%,#FF375F 100%)', glow: 'rgba(191,90,242,0.22)' },
  { gradient: 'linear-gradient(135deg,#30B0C7 0%,#64D2FF 100%)', glow: 'rgba(48,176,199,0.22)' },
  { gradient: 'linear-gradient(135deg,#34C759 0%,#30D158 100%)', glow: 'rgba(52,199,89,0.22)' },
]

function StatCard({
  label, value, sub, icon: Icon, accent,
}: {
  label: string; value: string; sub: string; icon: React.ElementType; accent: typeof STAT_ACCENTS[0]
}) {
  return (
    <div className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] dark:shadow-none p-5 flex items-center gap-4 apple-transition hover:shadow-[0_8px_28px_rgba(0,0,0,0.11)] dark:hover:shadow-[0_8px_28px_rgba(0,0,0,0.40)] hover:-translate-y-0.5">
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

export default function TeamReportsPage() {
  const { setItems } = useBreadcrumb()
  const [reportData, setReportData] = useState<TeamReportData | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('overview')
  const [organizationRoles, setOrganizationRoles] = useState<Array<{ id: string; name: string }>>([])
  const [showFilters, setShowFilters] = useState(false)
  const [filters, setFilters] = useState<FilterState>({
    search: '', department: 'all', role: 'all',
    dateRange: { from: undefined, to: undefined },
    sortBy: 'productivity', sortOrder: 'desc',
  })

  useEffect(() => {
    setItems([
      { label: 'Reports', href: '/reports' },
      { label: 'Team Reports' },
    ])
  }, [setItems])

  useEffect(() => {
    fetch('/api/roles')
      .then(r => r.ok ? r.json() : null)
      .then(d => d?.success && Array.isArray(d.data) && setOrganizationRoles(
        d.data.map((r: any) => ({ id: r._id, name: r.name }))
      ))
      .catch(() => {})
  }, [])

  useEffect(() => { fetchTeamReports() }, [filters])

  const fetchTeamReports = async () => {
    try {
      setLoading(true)
      const q = new URLSearchParams()
      if (filters.search) q.append('search', filters.search)
      if (filters.department !== 'all') q.append('department', filters.department)
      if (filters.role !== 'all') q.append('role', filters.role)
      if (filters.dateRange.from) q.append('startDate', filters.dateRange.from.toISOString())
      if (filters.dateRange.to) q.append('endDate', filters.dateRange.to.toISOString())
      q.append('sortBy', filters.sortBy); q.append('sortOrder', filters.sortOrder)
      const res = await fetch(`/api/reports/team?${q}`)
      if (res.ok) setReportData(await res.json())
    } catch (e) {
      console.error('Error fetching team reports:', e)
    } finally {
      setLoading(false)
    }
  }

  const handleFilter = (key: keyof FilterState, value: any) =>
    setFilters(prev => ({ ...prev, [key]: value }))

  const handleDateRange = (key: 'from' | 'to', date: Date | undefined) => {
    setFilters(prev => {
      const updated = { ...prev, dateRange: { ...prev.dateRange, [key]: date } }
      if (updated.dateRange.from && updated.dateRange.to) {
        const corrected = validateAndCorrectDateRange(updated.dateRange.from, updated.dateRange.to)
        updated.dateRange = corrected as { from: Date | undefined; to: Date | undefined }
      }
      return updated
    })
  }

  const clearFilters = () =>
    setFilters({ search: '', department: 'all', role: 'all', dateRange: { from: undefined, to: undefined }, sortBy: 'productivity', sortOrder: 'desc' })

  const exportReport = async (fmt: 'pdf' | 'excel' | 'csv') => {
    try {
      const q = new URLSearchParams({ format: fmt, type: activeTab })
      if (filters.search) q.append('search', filters.search)
      if (filters.department !== 'all') q.append('department', filters.department)
      if (filters.role !== 'all') q.append('role', filters.role)
      const res = await fetch(`/api/reports/team/export?${q}`)
      if (res.ok) {
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        const a = Object.assign(document.createElement('a'), { href: url, download: `team-reports-${fmt}-${new Date().toISOString().split('T')[0]}.${fmt}` })
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
                <div className="h-7 w-40 rounded-full bg-[var(--apple-tertiary-fill)]" />
                <div className="h-4 w-60 rounded-full bg-[var(--apple-tertiary-fill)]" />
              </div>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
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
            <div className="flex h-16 w-16 items-center justify-center rounded-[var(--apple-radius-lg)]" style={{ background: 'linear-gradient(135deg,#007AFF 0%,#5AC8FA 100%)' }}>
              <Users className="h-7 w-7 text-white" />
            </div>
            <p className="text-[17px] font-semibold">No team data available</p>
            <p className="text-[13px] text-[var(--apple-secondary-label)]">Team data will appear here once available.</p>
          </div>
        </PageWrapper>
      </MainLayout>
    )
  }

  return (
    <MainLayout>
      <PageWrapper>
        <div className="space-y-6">

          {/* ── Header ── */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div
                className="flex h-11 w-11 items-center justify-center rounded-[var(--apple-radius-md)] shadow-sm flex-shrink-0"
                style={{ background: 'linear-gradient(135deg,#007AFF 0%,#5AC8FA 100%)', boxShadow: '0 4px 14px rgba(0,122,255,0.30)' }}
              >
                <Activity className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-[28px] sm:text-[30px] font-bold tracking-tight leading-tight">Team Reports</h1>
                <p className="text-[13px] text-[var(--apple-secondary-label)]">Team performance analytics and productivity insights</p>
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
              <Button variant="outline" size="sm" onClick={fetchTeamReports} className="rounded-full h-8 px-3 border-[var(--apple-separator)] apple-transition">
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="sm" onClick={() => exportReport('csv')}
                className="rounded-full h-8 px-4 text-[13px] apple-transition"
                style={{ background: 'linear-gradient(135deg,#007AFF 0%,#5AC8FA 100%)' }}
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
                <Button variant="ghost" size="sm" onClick={clearFilters} className="h-7 px-3 text-[12px] rounded-full text-[var(--apple-secondary-label)]">
                  <X className="h-3 w-3 mr-1" />Clear
                </Button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--apple-tertiary-label)]" />
                  <Input
                    placeholder="Search members…"
                    value={filters.search}
                    onChange={e => handleFilter('search', e.target.value)}
                    className="pl-9 h-9 rounded-full text-[13px] border-[var(--apple-separator)] bg-[var(--apple-tertiary-fill)]"
                  />
                </div>
                <Select value={filters.department} onValueChange={v => handleFilter('department', v)}>
                  <SelectTrigger className="h-9 rounded-full text-[13px] border-[var(--apple-separator)] bg-[var(--apple-tertiary-fill)]">
                    <SelectValue placeholder="Department" />
                  </SelectTrigger>
                  <SelectContent className="rounded-[var(--apple-radius-md)]">
                    {[['all','All Departments'],['engineering','Engineering'],['design','Design'],['marketing','Marketing'],['sales','Sales'],['operations','Operations']].map(([v,l]) => (
                      <SelectItem key={v} value={v} className="text-[13px]">{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={filters.role} onValueChange={v => handleFilter('role', v)}>
                  <SelectTrigger className="h-9 rounded-full text-[13px] border-[var(--apple-separator)] bg-[var(--apple-tertiary-fill)]">
                    <SelectValue placeholder="Role" />
                  </SelectTrigger>
                  <SelectContent className="rounded-[var(--apple-radius-md)]">
                    <SelectItem value="all" className="text-[13px]">All Roles</SelectItem>
                    {organizationRoles.map(r => (
                      <SelectItem key={r.id} value={r.name.toLowerCase().replace(/\s+/g,'_')} className="text-[13px]">{r.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex gap-2">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn("h-9 rounded-full text-[13px] border-[var(--apple-separator)] bg-[var(--apple-tertiary-fill)] justify-start font-normal flex-1", !filters.dateRange.from && "text-[var(--apple-tertiary-label)]")}>
                        <CalendarIcon className="mr-1.5 h-3.5 w-3.5" />
                        {filters.dateRange.from ? format(filters.dateRange.from, "MMM d") : "From"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0 rounded-[var(--apple-radius-md)]">
                      <Calendar mode="single" selected={filters.dateRange.from} onSelect={d => handleDateRange('from', d)} initialFocus />
                    </PopoverContent>
                  </Popover>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn("h-9 rounded-full text-[13px] border-[var(--apple-separator)] bg-[var(--apple-tertiary-fill)] justify-start font-normal flex-1", !filters.dateRange.to && "text-[var(--apple-tertiary-label)]")}>
                        <CalendarIcon className="mr-1.5 h-3.5 w-3.5" />
                        {filters.dateRange.to ? format(filters.dateRange.to, "MMM d") : "To"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0 rounded-[var(--apple-radius-md)]">
                      <Calendar mode="single" selected={filters.dateRange.to} onSelect={d => handleDateRange('to', d)} initialFocus />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <p className="text-[12px] text-[var(--apple-tertiary-label)] flex-shrink-0">Sort by</p>
                <Select value={filters.sortBy} onValueChange={v => handleFilter('sortBy', v)}>
                  <SelectTrigger className="h-8 rounded-full text-[12px] border-[var(--apple-separator)] w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-[var(--apple-radius-md)]">
                    {[['productivity','Productivity'],['workload','Workload'],['completion','Completion Rate'],['hours','Hours Logged'],['name','Name']].map(([v,l]) => (
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
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="Team Size" icon={Users} accent={STAT_ACCENTS[0]}
              value={String(reportData.overview.totalMembers)}
              sub={`${reportData.overview.activeMembers} active members`}
            />
            <StatCard
              label="Avg Productivity" icon={TrendingUp} accent={STAT_ACCENTS[1]}
              value={`${reportData.overview.averageProductivity.toFixed(1)}%`}
              sub="Team productivity score"
            />
            <StatCard
              label="Hours Logged" icon={Clock} accent={STAT_ACCENTS[2]}
              value={`${reportData.overview.totalHoursLogged.toFixed(0)}h`}
              sub="Across all members"
            />
            <StatCard
              label="Tasks Completed" icon={Target} accent={STAT_ACCENTS[3]}
              value={String(reportData.overview.totalTasksCompleted)}
              sub="Total completed tasks"
            />
          </div>

          {/* ── Tabs ── */}
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="flex w-full h-10 p-1 rounded-full bg-[var(--apple-tertiary-fill)] gap-0.5 mb-5">
              {([
                ['overview',     'Overview',     LayoutGrid],
                ['performance',  'Performance',  Star],
                ['productivity', 'Productivity', Zap],
                ['workload',     'Workload',     Scale],
              ] as [string, string, React.ElementType][]).map(([v, l, Icon]) => (
                <TabsTrigger
                  key={v} value={v}
                  className="flex-1 flex items-center justify-center gap-1.5 rounded-full py-1.5 text-[13px] font-medium apple-transition data-[state=active]:bg-white dark:data-[state=active]:bg-[rgba(255,255,255,0.12)] data-[state=active]:shadow-sm data-[state=active]:text-[var(--apple-label)] text-[var(--apple-secondary-label)]"
                >
                  <Icon className="h-4 w-4 flex-shrink-0" />
                  <span className="hidden sm:inline">{l}</span>
                </TabsTrigger>
              ))}
            </TabsList>

            <TabsContent value="overview" className="mt-0">
              <TeamOverviewReport overview={reportData.overview} departmentBreakdown={reportData.departmentBreakdown} topPerformers={reportData.topPerformers} filters={filters} />
            </TabsContent>
            <TabsContent value="performance" className="mt-0">
              <TeamPerformanceReport members={reportData.members} productivityTrends={reportData.productivityTrends} filters={filters} />
            </TabsContent>
            <TabsContent value="productivity" className="mt-0">
              <TeamProductivityReport members={reportData.members} productivityTrends={reportData.productivityTrends} filters={filters} />
            </TabsContent>
            <TabsContent value="workload" className="mt-0">
              <TeamWorkloadReport workloadDistribution={reportData.workloadDistribution} members={reportData.members} filters={filters} />
            </TabsContent>
          </Tabs>
        </div>
      </PageWrapper>
    </MainLayout>
  )
}
