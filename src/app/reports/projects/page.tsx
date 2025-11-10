'use client'

import { useState, useEffect } from 'react'
import { MainLayout } from '@/components/layout/MainLayout'
import { PageWrapper } from '@/components/layout/PageWrapper'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Progress } from '@/components/ui/Progress'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/Popover'
import { CalendarIcon, Download, Filter, RefreshCw, Search } from 'lucide-react'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'
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
  budget?: {
    total: number
    spent: number
    remaining: number
  }
  team?: any[]
  stats: {
    tasks: {
      total: number
      completed: number
      completionRate: number
    }
    sprints: {
      total: number
      active: number
    }
    timeTracking: {
      totalHours: number
      entries: number
    }
    budget: {
      total: number
      spent: number
      remaining: number
      utilizationRate: number
    }
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
  dateRange: {
    from: Date | undefined
    to: Date | undefined
  }
  sortBy: string
  sortOrder: 'asc' | 'desc'
}

export default function ProjectReportsPage() {
  const [reportData, setReportData] = useState<ProjectReportData | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('overview')
  const [filters, setFilters] = useState<FilterState>({
    search: '',
    status: 'all',
    dateRange: {
      from: undefined,
      to: undefined
    },
    sortBy: 'name',
    sortOrder: 'asc'
  })
  const [showFilters, setShowFilters] = useState(false)

  useEffect(() => {
    fetchProjectReports()
  }, [filters])

  const fetchProjectReports = async () => {
    try {
      setLoading(true)
      const queryParams = new URLSearchParams()
      
      if (filters.search) queryParams.append('search', filters.search)
      if (filters.status !== 'all') queryParams.append('status', filters.status)
      if (filters.dateRange.from) queryParams.append('startDate', filters.dateRange.from.toISOString())
      if (filters.dateRange.to) queryParams.append('endDate', filters.dateRange.to.toISOString())
      queryParams.append('sortBy', filters.sortBy)
      queryParams.append('sortOrder', filters.sortOrder)

      const response = await fetch(`/api/reports/projects?${queryParams.toString()}`)
      if (response.ok) {
        const data = await response.json()
        setReportData(data)
      }
    } catch (error) {
      console.error('Error fetching project reports:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleFilterChange = (key: keyof FilterState, value: any) => {
    setFilters(prev => ({
      ...prev,
      [key]: value
    }))
  }

  const handleDateRangeChange = (key: 'from' | 'to', date: Date | undefined) => {
    setFilters(prev => ({
      ...prev,
      dateRange: {
        ...prev.dateRange,
        [key]: date
      }
    }))
  }

  const clearFilters = () => {
    setFilters({
      search: '',
      status: 'all',
      dateRange: {
        from: undefined,
        to: undefined
      },
      sortBy: 'name',
      sortOrder: 'asc'
    })
  }

  const exportReport = async (format: 'pdf' | 'excel' | 'csv') => {
    try {
      const queryParams = new URLSearchParams()
      queryParams.append('format', format)
      queryParams.append('type', activeTab)
      
      if (filters.search) queryParams.append('search', filters.search)
      if (filters.status !== 'all') queryParams.append('status', filters.status)
      if (filters.dateRange.from) queryParams.append('startDate', filters.dateRange.from.toISOString())
      if (filters.dateRange.to) queryParams.append('endDate', filters.dateRange.to.toISOString())

      const response = await fetch(`/api/reports/projects/export?${queryParams.toString()}`)
      if (response.ok) {
        const blob = await response.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `project-reports-${format}-${new Date().toISOString().split('T')[0]}.${format}`
        document.body.appendChild(a)
        a.click()
        window.URL.revokeObjectURL(url)
        document.body.removeChild(a)
      }
    } catch (error) {
      console.error('Error exporting report:', error)
    }
  }

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </MainLayout>
    )
  }

  if (!reportData) {
    return (
      <MainLayout>
        <div className="text-center py-8">
          <p className="text-muted-foreground">No project data available</p>
        </div>
      </MainLayout>
    )
  }

  return (
    <MainLayout>
      <PageWrapper>
        <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex-1 min-w-0">
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold truncate">Project Reports</h1>
          <p className="text-sm sm:text-base text-muted-foreground mt-1">
            Comprehensive analytics and insights for all projects
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
          <Button variant="outline" size="sm" onClick={() => setShowFilters(!showFilters)} className="w-full sm:w-auto">
            <Filter className="h-4 w-4 mr-2" />
            Filters
          </Button>
          <Button variant="outline" size="sm" onClick={fetchProjectReports} className="w-full sm:w-auto">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={() => exportReport('pdf')} className="w-full sm:w-auto">
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Filters */}
      {showFilters && (
        <Card>
          <CardHeader>
            <CardTitle>Filters</CardTitle>
            <CardDescription>Filter and sort project reports</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label htmlFor="search">Search Projects</Label>
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="search"
                    placeholder="Search projects..."
                    value={filters.search}
                    onChange={(e) => handleFilterChange('search', e.target.value)}
                    className="pl-8"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Select value={filters.status} onValueChange={(value) => handleFilterChange('status', value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="on-hold">On Hold</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Date Range</Label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn("w-full sm:w-auto justify-start text-left font-normal", !filters.dateRange.from && "text-muted-foreground")}>
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {filters.dateRange.from ? format(filters.dateRange.from, "PPP") : "From"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={filters.dateRange.from}
                        onSelect={(date) => handleDateRangeChange('from', date)}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn("w-full sm:w-auto justify-start text-left font-normal", !filters.dateRange.to && "text-muted-foreground")}>
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {filters.dateRange.to ? format(filters.dateRange.to, "PPP") : "To"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={filters.dateRange.to}
                        onSelect={(date) => handleDateRangeChange('to', date)}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="sortBy">Sort By</Label>
                <Select value={filters.sortBy} onValueChange={(value) => handleFilterChange('sortBy', value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Sort by" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="name">Name</SelectItem>
                    <SelectItem value="status">Status</SelectItem>
                    <SelectItem value="startDate">Start Date</SelectItem>
                    <SelectItem value="budget">Budget</SelectItem>
                    <SelectItem value="completion">Completion</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
              <Button variant="outline" onClick={clearFilters} className="w-full sm:w-auto">
                Clear Filters
              </Button>
              <div className="flex items-center space-x-2 w-full sm:w-auto">
                <Label htmlFor="sortOrder" className="text-xs sm:text-sm whitespace-nowrap flex-shrink-0">Order</Label>
                <Select value={filters.sortOrder} onValueChange={(value: 'asc' | 'desc') => handleFilterChange('sortOrder', value)}>
                  <SelectTrigger className="w-full sm:w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="asc">Ascending</SelectItem>
                    <SelectItem value="desc">Descending</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium truncate flex-1 min-w-0">Total Projects</CardTitle>
            <Badge variant="outline" className="flex-shrink-0 ml-2 text-xs">{reportData.summary.totalProjects}</Badge>
          </CardHeader>
          <CardContent>
            <div className="text-xl sm:text-2xl font-bold">{reportData.summary.totalProjects}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {reportData.summary.activeProjects} active, {reportData.summary.completedProjects} completed
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium truncate flex-1 min-w-0">Budget Utilization</CardTitle>
            <Badge variant="outline" className="flex-shrink-0 ml-2 text-xs">
              {reportData.summary.totalBudget > 0 
                ? `${((reportData.summary.totalSpent / reportData.summary.totalBudget) * 100).toFixed(1)}%`
                : '0%'
              }
            </Badge>
          </CardHeader>
          <CardContent>
            <div className="text-xl sm:text-2xl font-bold">
              ${reportData.summary.totalSpent.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground mt-1 break-words">
              of ${reportData.summary.totalBudget.toLocaleString()} total budget
            </p>
            <Progress 
              value={reportData.summary.totalBudget > 0 ? (reportData.summary.totalSpent / reportData.summary.totalBudget) * 100 : 0} 
              className="mt-2"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium truncate flex-1 min-w-0">Average Completion</CardTitle>
            <Badge variant="outline" className="flex-shrink-0 ml-2 text-xs">{reportData.summary.averageCompletionRate.toFixed(1)}%</Badge>
          </CardHeader>
          <CardContent>
            <div className="text-xl sm:text-2xl font-bold">
              {reportData.summary.averageCompletionRate.toFixed(1)}%
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Across all projects
            </p>
            <Progress 
              value={reportData.summary.averageCompletionRate} 
              className="mt-2"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium truncate flex-1 min-w-0">Project Velocity</CardTitle>
            <Badge variant="outline" className="flex-shrink-0 ml-2 text-xs">{reportData.trends.projectVelocity.toFixed(1)}</Badge>
          </CardHeader>
          <CardContent>
            <div className="text-xl sm:text-2xl font-bold">
              {reportData.trends.projectVelocity.toFixed(1)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Projects per month
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Report Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 gap-1 overflow-x-auto">
          <TabsTrigger value="overview" className="text-xs sm:text-sm">Overview</TabsTrigger>
          <TabsTrigger value="progress" className="text-xs sm:text-sm">Progress</TabsTrigger>
          <TabsTrigger value="timeline" className="text-xs sm:text-sm">Timeline</TabsTrigger>
          <TabsTrigger value="resources" className="text-xs sm:text-sm">Resources</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <ProjectOverviewReport 
            projects={reportData.projects}
            summary={reportData.summary}
            trends={reportData.trends}
            filters={filters}
          />
        </TabsContent>

        <TabsContent value="progress">
          <ProjectProgressReport 
            projects={reportData.projects}
            filters={filters}
          />
        </TabsContent>

        <TabsContent value="timeline">
          <ProjectTimelineReport 
            projects={reportData.projects}
            filters={filters}
          />
        </TabsContent>

        <TabsContent value="resources">
          <ProjectResourceReport 
            projects={reportData.projects}
            filters={filters}
          />
        </TabsContent>
      </Tabs>
        </div>
      </PageWrapper>
    </MainLayout>
  )
}
