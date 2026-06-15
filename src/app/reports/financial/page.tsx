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
  TrendingUp, TrendingDown, DollarSign, PiggyBank, X, Wallet,
  LayoutGrid, Receipt, BarChart2
} from 'lucide-react'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'
import { FinancialOverviewReport } from '@/components/reports/FinancialOverviewReport'
import { BudgetAnalysisReport } from '@/components/reports/BudgetAnalysisReport'
import { ExpenseReport } from '@/components/reports/ExpenseReport'
import { RevenueReport } from '@/components/reports/RevenueReport'
import { useOrgCurrency } from '@/hooks/useOrgCurrency'
import { validateAndCorrectDateRange } from '@/lib/dateRangeValidation'

interface FinancialReportData {
  overview: {
    totalBudget: number
    totalSpent: number
    totalRevenue: number
    netProfit: number
    budgetUtilization: number
    profitMargin: number
  }
  budgetBreakdown: {
    category: string; budgeted: number; spent: number; remaining: number; utilizationRate: number
  }[]
  monthlyTrends: {
    month: string; budget: number; spent: number; revenue: number; profit: number
  }[]
  topExpenses: {
    description: string; amount: number; category: string; project: string; date: string
  }[]
  revenueSources: { source: string; amount: number; percentage: number }[]
}

interface FilterState {
  search: string; category: string; project: string
  dateRange: { from: Date | undefined; to: Date | undefined }
  sortBy: string; sortOrder: 'asc' | 'desc'
}

const STAT_ACCENTS = [
  { gradient: 'var(--apple-card-gradient)', glow: 'var(--apple-chart-glow)' },
  { gradient: 'var(--apple-card-gradient)', glow: 'var(--apple-chart-glow)' },
  { gradient: 'var(--apple-card-gradient)', glow: 'var(--apple-chart-glow)' },
  { gradient: 'var(--apple-card-gradient)', glow: 'var(--apple-chart-glow)' },
]

function StatCard({
  label, value, sub, icon: Icon, valueColor,
}: {
  label: string; value: string; sub: string; icon: React.ElementType; valueColor?: string
}) {
  return (
    <div className="card-fade-in rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] dark:shadow-none p-5 flex items-center gap-4 apple-transition hover:shadow-[0_8px_28px_rgba(0,0,0,0.11)] dark:hover:shadow-[0_8px_28px_rgba(0,0,0,0.40)] hover:-translate-y-0.5">
      <Icon className="h-6 w-6 flex-shrink-0 text-[var(--apple-chart-to)]" strokeWidth={1.5} />
      <div className="min-w-0 flex-1">
        <p className="apple-section-label text-[var(--apple-secondary-label)]">{label}</p>
        <p className={cn("text-[22px] font-bold tracking-tight leading-tight font-apple-mono", valueColor)}>{value}</p>
        <p className="text-[12px] text-[var(--apple-tertiary-label)] truncate mt-0.5">{sub}</p>
      </div>
    </div>
  )
}

export default function FinancialReportsPage() {
  const { setItems } = useBreadcrumb()
  const { formatCurrency } = useOrgCurrency()
  const [reportData, setReportData] = useState<FinancialReportData | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('overview')
  const [projects, setProjects] = useState<Array<{ _id: string; name: string }>>([])
  const [showFilters, setShowFilters] = useState(false)
  const [filters, setFilters] = useState<FilterState>({
    search: '', category: 'all', project: 'all',
    dateRange: { from: undefined, to: undefined },
    sortBy: 'date', sortOrder: 'desc',
  })

  useEffect(() => {
    setItems([
      { label: 'Reports', href: '/reports' },
      { label: 'Financial Reports' },
    ])
  }, [setItems])

  useEffect(() => { fetchFinancialReports() }, [filters])

  useEffect(() => {
    fetch('/api/projects?limit=1000&page=1')
      .then(r => r.ok ? r.json() : null)
      .then(d => d && setProjects((d?.data || []).map((p: any) => ({ _id: p._id, name: p.name }))))
      .catch(() => {})
  }, [])

  const fetchFinancialReports = async () => {
    try {
      setLoading(true)
      const q = new URLSearchParams()
      if (filters.search) q.append('search', filters.search)
      if (filters.category !== 'all') q.append('category', filters.category)
      if (filters.project !== 'all') q.append('project', filters.project)
      if (filters.dateRange.from) q.append('startDate', filters.dateRange.from.toISOString())
      if (filters.dateRange.to) q.append('endDate', filters.dateRange.to.toISOString())
      q.append('sortBy', filters.sortBy); q.append('sortOrder', filters.sortOrder)
      const res = await fetch(`/api/reports/financial?${q}`)
      if (res.ok) setReportData(await res.json())
    } catch (e) {
      console.error('Error fetching financial reports:', e)
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
    setFilters({ search: '', category: 'all', project: 'all', dateRange: { from: undefined, to: undefined }, sortBy: 'date', sortOrder: 'desc' })

  const exportReport = async (fmt: 'pdf' | 'excel' | 'csv') => {
    try {
      const q = new URLSearchParams({ format: fmt, type: activeTab })
      if (filters.search) q.append('search', filters.search)
      if (filters.category !== 'all') q.append('category', filters.category)
      if (filters.project !== 'all') q.append('project', filters.project)
      const res = await fetch(`/api/reports/financial/export?${q}`)
      if (res.ok) {
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        const a = Object.assign(document.createElement('a'), { href: url, download: `financial-reports-${fmt}-${new Date().toISOString().split('T')[0]}.${fmt}` })
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
            <DollarSign className="h-10 w-10 text-[var(--apple-chart-to)]" strokeWidth={1.5} />
            <p className="text-[17px] font-semibold">No financial data available</p>
            <p className="text-[13px] text-[var(--apple-secondary-label)]">Financial data will appear here once available.</p>
          </div>
        </PageWrapper>
      </MainLayout>
    )
  }

  const isProfit = reportData.overview.netProfit >= 0

  return (
    <MainLayout>
      <PageWrapper>
        <div className="space-y-6">

          {/* ── Header ── */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <DollarSign className="h-8 w-8 flex-shrink-0 text-[var(--apple-chart-to)]" strokeWidth={1.5} />
              <div>
                <h1 className="text-[28px] sm:text-[30px] font-bold tracking-tight leading-tight">Financial Reports</h1>
                <p className="text-[13px] text-[var(--apple-secondary-label)]">Comprehensive financial analytics and budget insights</p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Button
                variant="outline" size="sm"
                onClick={() => setShowFilters(v => !v)}
                className={cn("rounded-full h-8 px-4 text-[13px] border-[var(--apple-separator)] apple-transition", showFilters && "bg-[var(--apple-tertiary-fill)]")}
              >
                <Filter className="h-3.5 w-3.5 mr-1.5" strokeWidth={1.5} />Filters
              </Button>
              <Button variant="outline" size="sm" onClick={fetchFinancialReports} className="rounded-full h-8 px-3 border-[var(--apple-separator)] apple-transition">
                <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.5} />
              </Button>
              <Button
                size="sm" onClick={() => exportReport('csv')}
                className="rounded-full h-8 px-4 text-[13px] apple-transition"
                style={{ background: 'var(--apple-card-gradient)' }}
              >
                <Download className="h-3.5 w-3.5 mr-1.5" strokeWidth={1.5} />Export
              </Button>
            </div>
          </div>

          {/* ── Filter Panel ── */}
          {showFilters && (
            <div className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] p-5 space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-[13px] font-semibold text-[var(--apple-secondary-label)] uppercase tracking-[0.06em]">Filters</p>
                <Button variant="ghost" size="sm" onClick={clearFilters} className="h-7 px-3 text-[12px] rounded-full text-[var(--apple-secondary-label)]">
                  <X className="h-3 w-3 mr-1" strokeWidth={1.5} />Clear
                </Button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--apple-tertiary-label)]" strokeWidth={1.5} />
                  <Input
                    placeholder="Search transactions…"
                    value={filters.search}
                    onChange={e => handleFilter('search', e.target.value)}
                    className="pl-9 h-9 rounded-full text-[13px] border-[var(--apple-separator)] bg-[var(--apple-tertiary-fill)]"
                  />
                </div>
                <Select value={filters.category} onValueChange={v => handleFilter('category', v)}>
                  <SelectTrigger className="h-9 rounded-full text-[13px] border-[var(--apple-separator)] bg-[var(--apple-tertiary-fill)]">
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent className="rounded-[var(--apple-radius-md)]">
                    {[['all','All Categories'],['development','Development'],['marketing','Marketing'],['operations','Operations'],['infrastructure','Infrastructure'],['other','Other']].map(([v,l]) => (
                      <SelectItem key={v} value={v} className="text-[13px]">{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={filters.project} onValueChange={v => handleFilter('project', v)}>
                  <SelectTrigger className="h-9 rounded-full text-[13px] border-[var(--apple-separator)] bg-[var(--apple-tertiary-fill)]">
                    <SelectValue placeholder="Project" />
                  </SelectTrigger>
                  <SelectContent className="rounded-[var(--apple-radius-md)]">
                    <SelectItem value="all" className="text-[13px]">All Projects</SelectItem>
                    {projects.map(p => (
                      <SelectItem key={p._id} value={p._id} className="text-[13px]">{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex gap-2">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn("h-9 rounded-full text-[13px] border-[var(--apple-separator)] bg-[var(--apple-tertiary-fill)] justify-start font-normal flex-1", !filters.dateRange.from && "text-[var(--apple-tertiary-label)]")}>
                        <CalendarIcon className="mr-1.5 h-3.5 w-3.5" strokeWidth={1.5} />
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
                        <CalendarIcon className="mr-1.5 h-3.5 w-3.5" strokeWidth={1.5} />
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
                  <SelectTrigger className="h-8 rounded-full text-[12px] border-[var(--apple-separator)] w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-[var(--apple-radius-md)]">
                    {[['date','Date'],['amount','Amount'],['category','Category'],['project','Project']].map(([v,l]) => (
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
              label="Total Budget" icon={Wallet}
              value={formatCurrency(reportData.overview.totalBudget)}
              sub="Across all projects"
            />
            <StatCard
              label="Total Spent" icon={TrendingDown}
              value={formatCurrency(reportData.overview.totalSpent)}
              sub={`${reportData.overview.budgetUtilization.toFixed(1)}% of budget`}
            />
            <StatCard
              label="Total Revenue" icon={TrendingUp}
              value={formatCurrency(reportData.overview.totalRevenue)}
              sub="Generated revenue"
              valueColor="text-emerald-500"
            />
            <StatCard
              label="Net Profit" icon={PiggyBank}
              value={`${isProfit ? '+' : ''}${formatCurrency(reportData.overview.netProfit)}`}
              sub={`${reportData.overview.profitMargin.toFixed(1)}% profit margin`}
              valueColor={isProfit ? 'text-emerald-500' : 'text-red-500'}
            />
          </div>

          {/* ── Tabs ── */}
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="flex w-full h-10 p-1 rounded-full bg-[var(--apple-tertiary-fill)] gap-0.5 mb-5">
              {([
                ['overview',  'Overview',        LayoutGrid],
                ['budget',    'Budget Analysis', Wallet],
                ['expenses',  'Expenses',        Receipt],
                ['revenue',   'Revenue',         TrendingUp],
              ] as [string, string, React.ElementType][]).map(([v, l, Icon]) => (
                <TabsTrigger
                  key={v} value={v}
                  className="flex-1 flex items-center justify-center gap-1.5 rounded-full py-1.5 text-[13px] font-medium apple-transition data-[state=active]:bg-card data-[state=active]:shadow-sm data-[state=active]:text-[var(--apple-chart-color)] text-[var(--apple-secondary-label)]"
                >
                  <Icon className="h-4 w-4 flex-shrink-0" strokeWidth={1.5} />
                  <span className="hidden sm:inline">{l}</span>
                </TabsTrigger>
              ))}
            </TabsList>

            <TabsContent value="overview" className="mt-0">
              <FinancialOverviewReport overview={reportData.overview} budgetBreakdown={reportData.budgetBreakdown} monthlyTrends={reportData.monthlyTrends} filters={filters} />
            </TabsContent>
            <TabsContent value="budget" className="mt-0">
              <BudgetAnalysisReport budgetBreakdown={reportData.budgetBreakdown} monthlyTrends={reportData.monthlyTrends} filters={filters} />
            </TabsContent>
            <TabsContent value="expenses" className="mt-0">
              <ExpenseReport topExpenses={reportData.topExpenses} budgetBreakdown={reportData.budgetBreakdown} filters={filters} />
            </TabsContent>
            <TabsContent value="revenue" className="mt-0">
              <RevenueReport revenueSources={reportData.revenueSources} monthlyTrends={reportData.monthlyTrends} filters={filters} />
            </TabsContent>
          </Tabs>
        </div>
      </PageWrapper>
    </MainLayout>
  )
}
