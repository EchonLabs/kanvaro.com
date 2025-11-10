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
import { CalendarIcon, Download, Filter, RefreshCw, Search, Users, Clock, Target, TrendingUp } from 'lucide-react'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'
import { TeamOverviewReport } from '@/components/reports/TeamOverviewReport'
import { TeamPerformanceReport } from '@/components/reports/TeamPerformanceReport'
import { TeamProductivityReport } from '@/components/reports/TeamProductivityReport'
import { TeamWorkloadReport } from '@/components/reports/TeamWorkloadReport'

interface TeamMember {
  _id: string
  firstName: string
  lastName: string
  email: string
  role: string
  department: string
  avatar?: string
  stats: {
    tasksCompleted: number
    totalTasks: number
    completionRate: number
    hoursLogged: number
    averageSessionLength: number
    productivityScore: number
    workloadScore: number
  }
  recentActivity: {
    date: string
    activity: string
    type: 'task' | 'time' | 'project'
  }[]
}

interface TeamReportData {
  overview: {
    totalMembers: number
    activeMembers: number
    averageProductivity: number
    averageWorkload: number
    totalHoursLogged: number
    totalTasksCompleted: number
  }
  members: TeamMember[]
  departmentBreakdown: {
    department: string
    members: number
    averageProductivity: number
    averageWorkload: number
  }[]
  productivityTrends: {
    date: string
    productivity: number
    workload: number
    hours: number
  }[]
  topPerformers: TeamMember[]
  workloadDistribution: {
    member: string
    currentTasks: number
    completedTasks: number
    hoursLogged: number
    workloadScore: number
  }[]
}

interface FilterState {
  search: string
  department: string
  role: string
  dateRange: {
    from: Date | undefined
    to: Date | undefined
  }
  sortBy: string
  sortOrder: 'asc' | 'desc'
}

export default function TeamReportsPage() {
  const [reportData, setReportData] = useState<TeamReportData | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('overview')
  const [filters, setFilters] = useState<FilterState>({
    search: '',
    department: 'all',
    role: 'all',
    dateRange: {
      from: undefined,
      to: undefined
    },
    sortBy: 'productivity',
    sortOrder: 'desc'
  })
  const [showFilters, setShowFilters] = useState(false)

  useEffect(() => {
    fetchTeamReports()
  }, [filters])

  const fetchTeamReports = async () => {
    try {
      setLoading(true)
      const queryParams = new URLSearchParams()
      
      if (filters.search) queryParams.append('search', filters.search)
      if (filters.department !== 'all') queryParams.append('department', filters.department)
      if (filters.role !== 'all') queryParams.append('role', filters.role)
      if (filters.dateRange.from) queryParams.append('startDate', filters.dateRange.from.toISOString())
      if (filters.dateRange.to) queryParams.append('endDate', filters.dateRange.to.toISOString())
      queryParams.append('sortBy', filters.sortBy)
      queryParams.append('sortOrder', filters.sortOrder)

      const response = await fetch(`/api/reports/team?${queryParams.toString()}`)
      if (response.ok) {
        const data = await response.json()
        setReportData(data)
      }
    } catch (error) {
      console.error('Error fetching team reports:', error)
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
      department: 'all',
      role: 'all',
      dateRange: {
        from: undefined,
        to: undefined
      },
      sortBy: 'productivity',
      sortOrder: 'desc'
    })
  }

  const exportReport = async (format: 'pdf' | 'excel' | 'csv') => {
    try {
      const queryParams = new URLSearchParams()
      queryParams.append('format', format)
      queryParams.append('type', activeTab)
      
      if (filters.search) queryParams.append('search', filters.search)
      if (filters.department !== 'all') queryParams.append('department', filters.department)
      if (filters.role !== 'all') queryParams.append('role', filters.role)
      if (filters.dateRange.from) queryParams.append('startDate', filters.dateRange.from.toISOString())
      if (filters.dateRange.to) queryParams.append('endDate', filters.dateRange.to.toISOString())

      const response = await fetch(`/api/reports/team/export?${queryParams.toString()}`)
      if (response.ok) {
        const blob = await response.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `team-reports-${format}-${new Date().toISOString().split('T')[0]}.${format}`
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
          <p className="text-muted-foreground">No team data available</p>
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
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold truncate">Team Reports</h1>
          <p className="text-sm sm:text-base text-muted-foreground mt-1">
            Team performance analytics and productivity insights
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
          <Button type="button" variant="outline" size="sm" onClick={() => setShowFilters(!showFilters)} className="w-full sm:w-auto">
            <Filter className="h-4 w-4 mr-2" />
            Filters
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={fetchTeamReports} className="w-full sm:w-auto">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => exportReport('csv')} className="w-full sm:w-auto">
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Filters */}
      {showFilters && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base sm:text-lg">Filters</CardTitle>
            <CardDescription className="text-xs sm:text-sm">Filter and sort team reports</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label htmlFor="search" className="text-xs sm:text-sm">Search Team Members</Label>
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="search"
                    placeholder="Search members..."
                    value={filters.search}
                    onChange={(e) => handleFilterChange('search', e.target.value)}
                    className="pl-8 w-full"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="department" className="text-xs sm:text-sm">Department</Label>
                <Select value={filters.department} onValueChange={(value) => handleFilterChange('department', value)}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select department" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Departments</SelectItem>
                    <SelectItem value="engineering">Engineering</SelectItem>
                    <SelectItem value="design">Design</SelectItem>
                    <SelectItem value="marketing">Marketing</SelectItem>
                    <SelectItem value="sales">Sales</SelectItem>
                    <SelectItem value="operations">Operations</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="role" className="text-xs sm:text-sm">Role</Label>
                <Select value={filters.role} onValueChange={(value) => handleFilterChange('role', value)}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Roles</SelectItem>
                    <SelectItem value="developer">Developer</SelectItem>
                    <SelectItem value="designer">Designer</SelectItem>
                    <SelectItem value="manager">Manager</SelectItem>
                    <SelectItem value="analyst">Analyst</SelectItem>
                    <SelectItem value="lead">Lead</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-xs sm:text-sm">Date Range</Label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !filters.dateRange.from && "text-muted-foreground")}>
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
                      <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !filters.dateRange.to && "text-muted-foreground")}>
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
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
              <Button variant="outline" onClick={clearFilters} className="w-full sm:w-auto">
                Clear Filters
              </Button>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:space-x-2">
                <Label htmlFor="sortBy" className="text-xs sm:text-sm whitespace-nowrap flex-shrink-0">Sort By</Label>
                <Select value={filters.sortBy} onValueChange={(value) => handleFilterChange('sortBy', value)}>
                  <SelectTrigger className="w-full sm:w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="productivity">Productivity</SelectItem>
                    <SelectItem value="workload">Workload</SelectItem>
                    <SelectItem value="completion">Completion Rate</SelectItem>
                    <SelectItem value="hours">Hours Logged</SelectItem>
                    <SelectItem value="name">Name</SelectItem>
                  </SelectContent>
                </Select>
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

      {/* Key Team Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium truncate flex-1 min-w-0">Team Size</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground flex-shrink-0 ml-2" />
          </CardHeader>
          <CardContent>
            <div className="text-xl sm:text-2xl font-bold">{reportData.overview.totalMembers}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {reportData.overview.activeMembers} active members
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium truncate flex-1 min-w-0">Average Productivity</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground flex-shrink-0 ml-2" />
          </CardHeader>
          <CardContent>
            <div className="text-xl sm:text-2xl font-bold">
              {reportData.overview.averageProductivity.toFixed(1)}%
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Team productivity score
            </p>
            <Progress value={reportData.overview.averageProductivity} className="mt-2" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium truncate flex-1 min-w-0">Total Hours Logged</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground flex-shrink-0 ml-2" />
          </CardHeader>
          <CardContent>
            <div className="text-xl sm:text-2xl font-bold break-words">
              {reportData.overview.totalHoursLogged.toFixed(0)}h
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Across all team members
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium truncate flex-1 min-w-0">Tasks Completed</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground flex-shrink-0 ml-2" />
          </CardHeader>
          <CardContent>
            <div className="text-xl sm:text-2xl font-bold">
              {reportData.overview.totalTasksCompleted}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Total completed tasks
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Report Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 gap-1 overflow-x-auto">
          <TabsTrigger value="overview" className="text-xs sm:text-sm">Overview</TabsTrigger>
          <TabsTrigger value="performance" className="text-xs sm:text-sm">Performance</TabsTrigger>
          <TabsTrigger value="productivity" className="text-xs sm:text-sm">Productivity</TabsTrigger>
          <TabsTrigger value="workload" className="text-xs sm:text-sm">Workload</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <TeamOverviewReport 
            overview={reportData.overview}
            departmentBreakdown={reportData.departmentBreakdown}
            topPerformers={reportData.topPerformers}
            filters={filters}
          />
        </TabsContent>

        <TabsContent value="performance">
          <TeamPerformanceReport 
            members={reportData.members}
            productivityTrends={reportData.productivityTrends}
            filters={filters}
          />
        </TabsContent>

        <TabsContent value="productivity">
          <TeamProductivityReport 
            members={reportData.members}
            productivityTrends={reportData.productivityTrends}
            filters={filters}
          />
        </TabsContent>

        <TabsContent value="workload">
          <TeamWorkloadReport 
            workloadDistribution={reportData.workloadDistribution}
            members={reportData.members}
            filters={filters}
          />
        </TabsContent>
      </Tabs>
        </div>
      </PageWrapper>
    </MainLayout>
  )
}
