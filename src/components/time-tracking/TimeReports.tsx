'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { BarChart3, PieChart, TrendingUp, Download, Calendar, Users, DollarSign, Clock, X, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/Badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useOrganization } from '@/hooks/useOrganization'
import { applyRoundingRules } from '@/lib/utils'
import { useOrgCurrency } from '@/hooks/useOrgCurrency'
import { useDateTime } from '@/components/providers/DateTimeProvider'

interface TimeReportsProps {
  userId?: string
  organizationId: string
  projectId?: string
}

interface ReportData {
  summary: {
    totalEntries: number
    totalDuration: number
    totalCost: number
    billableDuration: number
    billableCost: number
    approvedEntries: number
    pendingEntries: number
  }
  dailyBreakdown: Array<{
    _id: string
    duration: number
    cost: number
  }>
  userReport: Array<{
    userId: string
    userName: string
    userEmail: string
    totalDuration: number
    totalCost: number
    billableDuration: number
    billableCost: number
    entryCount: number
  }>
  projectReport: Array<{
    projectId: string
    projectName: string
    totalDuration: number
    totalCost: number
    billableDuration: number
    billableCost: number
    entryCount: number
  }>
  taskReport: Array<{
    taskId: string
    taskTitle: string
    totalDuration: number
    totalCost: number
    billableDuration: number
    billableCost: number
    entryCount: number
  }>
  billableReport: Array<{
    userId: string
    userName: string
    userEmail: string
    projectId: string
    projectName: string
    totalDuration: number
    totalCost: number
    entryCount: number
  }>
  detailedEntries?: Array<{
    _id: string
    userId: string
    userName: string
    userEmail: string
    projectId: string
    projectName: string
    projectCurrency: string
    taskId: string
    taskTitle: string
    date: string
    startTime: string
    endTime: string
    duration: number
    hourlyRate: number
    rateSource: string
    cost: number
    notes: string
    isBillable: boolean
    approvedBy: string
    approvedByName: string
  }>
}

export function TimeReports({ userId, organizationId, projectId }: TimeReportsProps) {
  const { organization } = useOrganization()
  const { formatCurrency } = useOrgCurrency()
  const { formatDate, formatTime, formatDuration: formatDurationUtil } = useDateTime()

  // Function to determine hourly rate source explanation
  const getHourlyRateSource = (entry: any) => {
    switch (entry.rateSource) {
      case 'project-member':
        return 'Project member rate'
      case 'project':
        return 'Project default rate'
      case 'user':
        return 'User default rate'
      case 'organization':
        return 'Organization default rate'
      default:
        return 'Rate applied'
    }
  }
  const [reportData, setReportData] = useState<ReportData | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [orgCurrency, setOrgCurrency] = useState<string>('USD')
  const [projects, setProjects] = useState<Array<{ _id: string; name: string }>>([])
  const [users, setUsers] = useState<Array<{ _id: string; firstName: string; lastName: string; email: string }>>([])
  const [tasks, setTasks] = useState<Array<{ _id: string; title: string }>>([])
  const [projectFilterQuery, setProjectFilterQuery] = useState('')
  const [assignedToFilterQuery, setAssignedToFilterQuery] = useState('')
  const [assignedByFilterQuery, setAssignedByFilterQuery] = useState('')
  const [taskFilterQuery, setTaskFilterQuery] = useState('')
  const [filters, setFilters] = useState({
    startDate: '',
    endDate: '',
    reportType: 'detailed', // Default to detailed entries view
    projectId: projectId || 'all',
    assignedTo: userId || 'all',
    assignedBy: 'all',
    taskId: 'all'
  })

  const [pagination, setPagination] = useState({
    page: 1,
    limit: 50, // Default to 50 entries per page
    total: 0,
    totalPages: 0
  })

  const [detailedEntriesPagination, setDetailedEntriesPagination] = useState({
    page: 1,
    limit: 10, // Default to 10 entries per page for detailed view
    total: 0,
    totalPages: 0
  })

  // Check if any filters are active (not default values)
  const hasActiveFilters = useMemo(() => {
    return filters.startDate !== '' ||
           filters.endDate !== '' ||
           filters.projectId !== (projectId || 'all') ||
           filters.assignedTo !== (userId || 'all') ||
           filters.assignedBy !== 'all' ||
           filters.taskId !== 'all'
  }, [filters, projectId, userId])

  // Reset all filters to default values
  const resetFilters = () => {
    setFilters({
      startDate: '',
      endDate: '',
      reportType: 'detailed',
      projectId: projectId || 'all',
      assignedTo: userId || 'all',
      assignedBy: 'all',
      taskId: 'all'
    })
    setProjectFilterQuery('')
    setAssignedToFilterQuery('')
    setAssignedByFilterQuery('')
    setTaskFilterQuery('')
  }

  const loadReport = useCallback(async () => {
    setIsLoading(true)
    setError('')

    try {
      const params = new URLSearchParams({
        organizationId,
        reportType: filters.reportType,
        page: pagination.page.toString(),
        limit: pagination.limit.toString()
      })

      if (filters.projectId && filters.projectId !== 'all') params.append('projectId', filters.projectId)
      if (filters.assignedTo && filters.assignedTo !== 'all') params.append('userId', filters.assignedTo)
      if (filters.assignedBy && filters.assignedBy !== 'all') params.append('assignedBy', filters.assignedBy)
      if (filters.taskId && filters.taskId !== 'all') params.append('taskId', filters.taskId)
      if (filters.startDate) params.append('startDate', filters.startDate)
      if (filters.endDate) params.append('endDate', filters.endDate)

      const response = await fetch(`/api/time-tracking/reports?${params}`)
      const data = await response.json()

      if (response.ok && data) {
        // Handle different response structures
        if (data.summary || data.userReport || data.projectReport || data.taskReport || data.billableReport) {
          setReportData(data)
        } else if (data.data) {
          setReportData(data.data)
        } else {
          setReportData(data)
        }
        
        // Set organization currency from API response
        if (data.organizationCurrency) {
          setOrgCurrency(data.organizationCurrency)
        }

        // Set pagination from API response
        if (data.pagination) {
          setPagination(data.pagination)
        }
      } else {
        setError(data?.error || 'Failed to load report')
      }
    } catch (error) {
      setError('Failed to load report')
    } finally {
      setIsLoading(false)
    }
  }, [organizationId, filters])

  useEffect(() => {
    loadReport()
  }, [loadReport])

  // Reset pagination to page 1 when filters change
  useEffect(() => {
    setPagination(prev => ({ ...prev, page: 1 }))
    setDetailedEntriesPagination(prev => ({ ...prev, page: 1 }))
  }, [filters.startDate, filters.endDate, filters.projectId, filters.assignedTo, filters.assignedBy, filters.taskId])

  // Update detailed entries pagination when reportData changes
  useEffect(() => {
    if (reportData?.detailedEntries) {
      const total = reportData.detailedEntries.length
      const totalPages = Math.ceil(total / detailedEntriesPagination.limit)
      setDetailedEntriesPagination(prev => ({
        ...prev,
        total,
        totalPages,
        page: Math.min(prev.page, totalPages || 1)
      }))
    }
  }, [reportData?.detailedEntries])

  // Get paginated detailed entries
  const getPaginatedDetailedEntries = useMemo(() => {
    if (!reportData?.detailedEntries) return []

    const startIndex = (detailedEntriesPagination.page - 1) * detailedEntriesPagination.limit
    const endIndex = startIndex + detailedEntriesPagination.limit
    return reportData.detailedEntries.slice(startIndex, endIndex)
  }, [reportData?.detailedEntries, detailedEntriesPagination.page, detailedEntriesPagination.limit])

  // Load organization currency and debug
  useEffect(() => {
    if (organization?.currency) {
      setOrgCurrency(organization.currency)
    }
  }, [organization, orgCurrency])

  // Load projects and users for filters
  useEffect(() => {
    const loadFilterData = async () => {
      try {
        // Load projects
        const projectsRes = await fetch(`/api/projects?all=true`)
        if (projectsRes.ok) {
          const projectsData = await projectsRes.json()
          if (projectsData.success) {
            setProjects(projectsData.data.map((p: any) => ({ _id: p._id, name: p.name })))
          }
        }

        // Load users (team members from organization)
        const usersRes = await fetch(`/api/users`)
        if (usersRes.ok) {
          const usersData = await usersRes.json()
          if (Array.isArray(usersData)) {
            setUsers(usersData.map((u: any) => ({
              _id: u._id,
              firstName: u.firstName || '',
              lastName: u.lastName || '',
              email: u.email || ''
            })))
          }
        }
      } catch (error) {
        console.error('Failed to load filter data:', error)
      }
    }

    loadFilterData()
  }, [organizationId])

  // Load tasks based on selected project
  useEffect(() => {
    const loadTasks = async () => {
      try {
        let tasksUrl = `/api/tasks?limit=1000&page=1`
        
        // If a specific project is selected, filter tasks by that project
        if (filters.projectId && filters.projectId !== 'all') {
          tasksUrl += `&project=${filters.projectId}`
        }

        const tasksRes = await fetch(tasksUrl)
        if (tasksRes.ok) {
          const tasksData = await tasksRes.json()
          if (tasksData.success && Array.isArray(tasksData.data)) {
            setTasks(tasksData.data.map((t: any) => ({ _id: t._id, title: t.title })))
          }
        }
      } catch (error) {
        console.error('Failed to load tasks:', error)
      }
    }

    loadTasks()
  }, [filters.projectId])

  // Reset task filter when project changes
  useEffect(() => {
    setFilters(prev => ({ ...prev, taskId: 'all' }))
    setTaskFilterQuery('')
  }, [filters.projectId])

  const filteredProjectOptions = useMemo(() => {
    const query = projectFilterQuery.trim().toLowerCase()
    if (!query) return projects
    return projects.filter((project) => project.name.toLowerCase().includes(query))
  }, [projects, projectFilterQuery])

  const filteredAssignedToOptions = useMemo(() => {
    const query = assignedToFilterQuery.trim().toLowerCase()
    if (!query) return users
    return users.filter((user) =>
      `${user.firstName} ${user.lastName}`.toLowerCase().includes(query) ||
      user.email.toLowerCase().includes(query)
    )
  }, [users, assignedToFilterQuery])

  const filteredAssignedByOptions = useMemo(() => {
    const query = assignedByFilterQuery.trim().toLowerCase()
    if (!query) return users
    return users.filter((user) =>
      `${user.firstName} ${user.lastName}`.toLowerCase().includes(query) ||
      user.email.toLowerCase().includes(query)
    )
  }, [users, assignedByFilterQuery])

  const filteredTaskOptions = useMemo(() => {
    const query = taskFilterQuery.trim().toLowerCase()
    if (!query) return tasks
    return tasks.filter((task) => task.title.toLowerCase().includes(query))
  }, [tasks, taskFilterQuery])

  const formatDuration = (minutes: number) => {
    // Apply rounding rules if enabled
    let displayMinutes = minutes
    const roundingRules = (organization?.settings as any)?.roundingRules
    if (roundingRules?.enabled) {
      displayMinutes = applyRoundingRules(minutes, {
        enabled: roundingRules.enabled,
        increment: roundingRules.increment || 15,
        roundUp: roundingRules.roundUp ?? true
      })
    }

    const hours = Math.floor(displayMinutes / 60)
    const mins = Math.floor(displayMinutes % 60)
    return `${hours}h ${mins}m`
  }

  // Simple currency conversion rates (you can replace with real-time API later)
  const getCurrencyConversionRate = (fromCurrency: string, toCurrency: string): number => {
    if (fromCurrency === toCurrency) return 1
    
    // Base rates to USD (approximate rates, should be fetched from API in production)
    const ratesToUSD: Record<string, number> = {
      'USD': 1,
      'EUR': 1.09,
      'GBP': 1.27,
      'INR': 0.012,
      'LKR': 0.0034,
      'AUD': 0.66,
      'CAD': 0.73,
      'JPY': 0.0067,
      'CNY': 0.14
    }
    
    const fromRate = ratesToUSD[fromCurrency] || 1
    const toRate = ratesToUSD[toCurrency] || 1
    
    // Convert from source currency to USD, then to target currency
    return fromRate / toRate
  }

  // Calculate summary statistics from detailed entries - just sum costs without conversion
  const summaryStats = useMemo(() => {
    if (!reportData?.detailedEntries || reportData.detailedEntries.length === 0) {
      return {
        totalEntries: 0,
        totalDuration: 0,
        totalCost: 0,
        billableDuration: 0
      }
    }

    return reportData.detailedEntries.reduce((acc, entry) => {
      acc.totalEntries += 1
      acc.totalDuration += entry.duration
      
      // Just sum the costs - no currency conversion
      acc.totalCost += entry.cost
      
      if (entry.isBillable) {
        acc.billableDuration += entry.duration
      }
      return acc
    }, {
      totalEntries: 0,
      totalDuration: 0,
      totalCost: 0,
      billableDuration: 0
    })
  }, [reportData?.detailedEntries])

  const handleExport = async () => {
    try {
      if (reportData?.detailedEntries && reportData.detailedEntries.length > 0) {
        const headers = [
          'Employee Name',
          'Employee Email',
          'Project',
          'Task',
          'Date',
          'Start Time',
          'End Time',
          'Duration',
          'Hourly Rate',
          'Rate Source',
          'Cost',
          'Billable',
          'Notes'
        ]

        const sanitize = (value: string | number | null | undefined) => {
          if (value === null || value === undefined) return ''
          return String(value).replace(/"/g, '""')
        }

        const rows = reportData.detailedEntries.map(entry => [
          sanitize(entry.userName),
          sanitize(entry.userEmail),
          sanitize(entry.projectName),
          sanitize(entry.taskTitle || ''),
          sanitize(formatDate(entry.date)),
          sanitize(entry.startTime ? formatTime(entry.startTime) : '-'),
          sanitize(entry.endTime ? formatTime(entry.endTime) : '-'),
          sanitize(formatDurationUtil(entry.duration)),
          sanitize(`${formatCurrency(entry.hourlyRate, orgCurrency)}/hr`),
          sanitize(getHourlyRateSource(entry)),
          sanitize(formatCurrency(entry.cost, orgCurrency)),
          sanitize(entry.isBillable ? 'Yes' : 'No'),
          sanitize(entry.notes || '')
        ])

        const csvContent = [headers, ...rows]
          .map(row => row.map(value => `"${value}"`).join(','))
          .join('\r\n')

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5)
        a.download = `All_time_log_${timestamp}.csv`
        document.body.appendChild(a)
        a.click()
        window.URL.revokeObjectURL(url)
        document.body.removeChild(a)
        return
      }

      // Fallback to server export if no detailed entries are loaded yet
      const params = new URLSearchParams({
        organizationId,
        reportType: 'detailed',
        format: 'csv'
      })

      if (filters.projectId && filters.projectId !== 'all') params.append('projectId', filters.projectId)
      if (filters.assignedTo && filters.assignedTo !== 'all') params.append('userId', filters.assignedTo)
      if (filters.assignedBy && filters.assignedBy !== 'all') params.append('assignedBy', filters.assignedBy)
      if (filters.taskId && filters.taskId !== 'all') params.append('taskId', filters.taskId)
      if (filters.startDate) params.append('startDate', filters.startDate)
      if (filters.endDate) params.append('endDate', filters.endDate)

      const response = await fetch(`/api/time-tracking/reports?${params}`)

      if (response.ok) {
        const blob = await response.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5)
        a.download = `All_time_log_${timestamp}.csv`
        document.body.appendChild(a)
        a.click()
        window.URL.revokeObjectURL(url)
        document.body.removeChild(a)
      }
    } catch (error) {
      setError('Failed to export report')
    }
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
            <p className="text-muted-foreground mt-2">Loading report...</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-8">
      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Time Tracking Reports
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div>
              <Label htmlFor="startDate">Start Date</Label>
              <Input
                id="startDate"
                type="date"
                value={filters.startDate}
                onChange={(e) => setFilters(prev => ({ ...prev, startDate: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="endDate">End Date</Label>
              <Input
                id="endDate"
                type="date"
                value={filters.endDate}
                onChange={(e) => setFilters(prev => ({ ...prev, endDate: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="projectId">Project</Label>
              <Select value={filters.projectId} onValueChange={(value) => { setFilters(prev => ({ ...prev, projectId: value })); setProjectFilterQuery(''); }}>
                <SelectTrigger>
                  <SelectValue placeholder="All Projects" />
                </SelectTrigger>
                <SelectContent className="p-0">
                  <div className="p-2">
                    <Input
                      value={projectFilterQuery}
                      onChange={(e) => setProjectFilterQuery(e.target.value)}
                      placeholder="Search projects"
                      className="mb-2"
                      onKeyDown={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                    />
                    <div className="max-h-56 overflow-y-auto">
                      <SelectItem value="all">All Projects</SelectItem>
                      {filteredProjectOptions.length === 0 ? (
                        <div className="px-2 py-1 text-xs text-muted-foreground">No matching projects</div>
                      ) : (
                        filteredProjectOptions.map((project) => (
                          <SelectItem key={project._id} value={project._id}>
                            {project.name}
                          </SelectItem>
                        ))
                      )}
                    </div>
                  </div>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="taskId">Task</Label>
              <Select value={filters.taskId} onValueChange={(value) => { setFilters(prev => ({ ...prev, taskId: value })); setTaskFilterQuery(''); }}>
                <SelectTrigger>
                  <SelectValue placeholder={filters.projectId === 'all' ? 'All Tasks' : 'Select Task'} />
                </SelectTrigger>
                <SelectContent className="p-0">
                  <div className="p-2">
                    <Input
                      value={taskFilterQuery}
                      onChange={(e) => setTaskFilterQuery(e.target.value)}
                      placeholder="Search tasks"
                      className="mb-2"
                      onKeyDown={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                    />
                    <div className="max-h-56 overflow-y-auto">
                      {/* Only show "All Tasks" option when no project is selected */}
                      {filters.projectId === 'all' && <SelectItem value="all">All Tasks</SelectItem>}
                      {filteredTaskOptions.length === 0 ? (
                        <div className="px-2 py-1 text-xs text-muted-foreground">
                          {filters.projectId === 'all' ? 'No tasks found' : 'No tasks in this project'}
                        </div>
                      ) : (
                        filteredTaskOptions.map((task) => (
                          <SelectItem key={task._id} value={task._id}>
                            {task.title}
                          </SelectItem>
                        ))
                      )}
                    </div>
                  </div>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="assignedTo">Assigned To</Label>
              <Select value={filters.assignedTo} onValueChange={(value) => { setFilters(prev => ({ ...prev, assignedTo: value })); setAssignedToFilterQuery(''); }}>
                <SelectTrigger>
                  <SelectValue placeholder="All Users" />
                </SelectTrigger>
                <SelectContent className="p-0">
                  <div className="p-2">
                    <Input
                      value={assignedToFilterQuery}
                      onChange={(e) => setAssignedToFilterQuery(e.target.value)}
                      placeholder="Search users"
                      className="mb-2"
                      onKeyDown={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                    />
                    <div className="max-h-56 overflow-y-auto">
                      <SelectItem value="all">All Users</SelectItem>
                      {filteredAssignedToOptions.length === 0 ? (
                        <div className="px-2 py-1 text-xs text-muted-foreground">No matching users</div>
                      ) : (
                        filteredAssignedToOptions.map((user) => (
                          <SelectItem key={user._id} value={user._id}>
                            {user.firstName} {user.lastName} ({user.email})
                          </SelectItem>
                        ))
                      )}
                    </div>
                  </div>
                </SelectContent>
              </Select>
            </div>
            <div className='mb-4'>
              <Label htmlFor="assignedBy">Assigned By</Label>
              <Select value={filters.assignedBy} onValueChange={(value) => { setFilters(prev => ({ ...prev, assignedBy: value })); setAssignedByFilterQuery(''); }}>
                <SelectTrigger>
                  <SelectValue placeholder="All Approvers" />
                </SelectTrigger>
                <SelectContent className="p-0">
                  <div className="p-2">
                    <Input
                      value={assignedByFilterQuery}
                      onChange={(e) => setAssignedByFilterQuery(e.target.value)}
                      placeholder="Search approvers"
                      className="mb-2"
                      onKeyDown={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                    />
                    <div className="max-h-56 overflow-y-auto">
                      <SelectItem value="all">All Approvers</SelectItem>
                      {filteredAssignedByOptions.length === 0 ? (
                        <div className="px-2 py-1 text-xs text-muted-foreground">No matching approvers</div>
                      ) : (
                        filteredAssignedByOptions.map((user) => (
                          <SelectItem key={user._id} value={user._id}>
                            {user.firstName} {user.lastName} ({user.email})
                          </SelectItem>
                        ))
                      )}
                    </div>
                  </div>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2 mb-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setFilters({
                  startDate: '',
                  endDate: '',
                  reportType: 'detailed',
                  projectId: 'all',
                  taskId: 'all',
                  assignedTo: 'all',
                  assignedBy: 'all'
                })
                setProjectFilterQuery('')
                setTaskFilterQuery('')
                setAssignedToFilterQuery('')
                setAssignedByFilterQuery('')
              }}
              title="Clear all filters"
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
            <Button onClick={handleExport}>
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Summary Widgets */}
      {reportData && filters.reportType === 'detailed' && reportData.detailedEntries && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <Clock className="h-8 w-8 text-primary" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-muted-foreground">Total Time</p>
                  <p className="text-2xl font-bold">{formatDuration(summaryStats.totalDuration)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <DollarSign className="h-8 w-8 text-green-600" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-muted-foreground">Total Cost</p>
                  <p className="text-2xl font-bold">{(() => {
                    // Use API summary total cost if available, otherwise fall back to calculated
                    const totalCost = reportData.summary?.totalCost ?? summaryStats.totalCost;
                    return formatCurrency(totalCost, orgCurrency);
                  })()}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <TrendingUp className="h-8 w-8 text-blue-600" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-muted-foreground">Billable Time</p>
                  <p className="text-2xl font-bold">{formatDuration(summaryStats.billableDuration)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <Users className="h-8 w-8 text-purple-600" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-muted-foreground">Total Entries</p>
                  <p className="text-2xl font-bold">{summaryStats.totalEntries}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Detailed Entries Report - Always shown */}
      {reportData && filters.reportType === 'detailed' && reportData.detailedEntries && (
        <Card>
          <CardHeader>
            <CardTitle>Approved Time Entries</CardTitle>
            <CardDescription>
              Shows approved entries and entries from projects that don't require approval
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* Results Count */}
            <div className="flex items-center justify-between mb-4 pb-3 border-b">
              <div className="text-sm text-muted-foreground">
                {reportData.detailedEntries && reportData.detailedEntries.length > 0 ? (
                  <span>
                    Showing <span className="font-medium text-foreground">{getPaginatedDetailedEntries.length}</span> of{' '}
                    <span className="font-medium text-foreground">{reportData.summary?.totalEntries || reportData.detailedEntries.length}</span> time entries
                    {detailedEntriesPagination.page > 1 && (
                      <span className="ml-2 text-xs">
                        (Page {detailedEntriesPagination.page} of {Math.ceil(reportData.detailedEntries.length / detailedEntriesPagination.limit)})
                      </span>
                    )}
                  </span>
                ) : (
                  <span>No time entries found</span>
                )}
              </div>
              {hasActiveFilters && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={resetFilters}
                  className="text-xs"
                >
                  <X className="h-3 w-3 mr-1" />
                  Clear Filters
                </Button>
              )}
            </div>

            {reportData.detailedEntries.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No time entries found for the selected filters.
                <div className="text-sm mt-2">
                  This includes both approved entries and entries from projects that don't require approval.
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <div className="min-w-full">
                  {/* Desktop Table View */}
                  <div className="hidden md:block">
                    <div className="grid grid-cols-11 gap-4 p-4 border-b font-semibold text-sm text-muted-foreground">
                      <div className="col-span-2">Employee</div>
                      <div className="col-span-2">Project (Task)</div>
                      <div className="col-span-1">Date</div>
                      <div className="col-span-1">Start</div>
                      <div className="col-span-1">End</div>
                      <div className="col-span-1">Duration</div>
                      <div className="col-span-1">Rate</div>
                      <div className="col-span-1">Cost</div>
                      <div className="col-span-1">Billable</div>
                    </div>
                    {getPaginatedDetailedEntries.map((entry) => (
                      <div key={entry._id} className="grid grid-cols-11 gap-4 p-4 border-b hover:bg-muted/50">
                        <div className="col-span-2">
                          <div className="font-medium text-sm">{entry.userName}</div>
                          <div className="text-xs text-muted-foreground">{entry.userEmail}</div>
                        </div>
                        <div className="col-span-2">
                          <div className="font-medium text-sm">{entry.projectName}</div>
                          {entry.taskTitle && (
                            <div className="text-xs text-muted-foreground">{entry.taskTitle}</div>
                          )}
                        </div>
                        <div className="col-span-1 text-sm">
                          {formatDate(entry.date)}
                        </div>
                        <div className="col-span-1 text-sm">
                          {entry.startTime ? formatTime(entry.startTime) : '-'}
                        </div>
                        <div className="col-span-1 text-sm">
                          {entry.endTime ? formatTime(entry.endTime) : '-'}
                        </div>
                        <div className="col-span-1 text-sm font-medium">
                          {formatDurationUtil(entry.duration)}
                        </div>
                        <div className="col-span-1 text-sm">
                          <div className="flex flex-col">
                            <span className="font-medium">{formatCurrency(entry.hourlyRate, orgCurrency)}/hr</span>
                            <span className="text-xs text-muted-foreground">
                              {getHourlyRateSource(entry)}
                            </span>
                          </div>
                        </div>
                        <div className="col-span-1 text-sm font-medium">
                          {formatCurrency(entry.cost, orgCurrency)}
                        </div>
                        <div className="col-span-1">
                          {entry.isBillable ? (
                            <Badge variant="outline" className="text-xs bg-green-50 text-green-700 dark:bg-green-900 dark:text-green-400">
                              Yes
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs">No</Badge>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Mobile Card View */}
                  <div className="md:hidden space-y-5">
                    {getPaginatedDetailedEntries.map((entry) => (
                      <div key={entry._id} className="border rounded-lg p-4 space-y-3">
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="font-medium">{entry.userName}</div>
                            <div className="text-xs text-muted-foreground">{entry.userEmail}</div>
                          </div>
                          {entry.isBillable && (
                            <Badge variant="outline" className="text-xs bg-green-50 text-green-700 dark:bg-green-900 dark:text-green-400">
                              Billable
                            </Badge>
                          )}
                        </div>
                        <div>
                          <div className="font-medium text-sm">{entry.projectName}</div>
                          {entry.taskTitle && (
                            <div className="text-xs text-muted-foreground">{entry.taskTitle}</div>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <div>
                            <span className="text-muted-foreground">Date: </span>
                            <span>{formatDate(entry.date)}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Duration: </span>
                            <span className="font-medium">{formatDurationUtil(entry.duration)}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Rate: </span>
                            <span className="font-medium">{formatCurrency(entry.hourlyRate, orgCurrency)}/hr</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Start: </span>
                            <span>{entry.startTime ? formatTime(entry.startTime) : '-'}</span>
                          </div>
                          <div className="col-span-2">
                            <span className="text-muted-foreground">Cost: </span>
                            <span className="font-medium">{formatCurrency(entry.cost, orgCurrency)}</span>
                            <div className="text-xs text-muted-foreground mt-1">
                              Cost = {formatDurationUtil(entry.duration)} × {formatCurrency(entry.hourlyRate, orgCurrency)}/hr
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </CardContent>

          {/* Pagination Controls */}
          {detailedEntriesPagination.total > 0 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-6 pb-6">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Items per page:</span>
                  <Select
                    value={detailedEntriesPagination.limit.toString()}
                    onValueChange={(value) => {
                      const newLimit = parseInt(value)
                      setDetailedEntriesPagination(prev => ({
                        ...prev,
                        limit: newLimit,
                        page: 1 // Reset to first page when changing limit
                      }))
                    }}
                  >
                    <SelectTrigger className="w-16 h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="10">10</SelectItem>
                      <SelectItem value="50">50</SelectItem>
                      <SelectItem value="100">100</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="text-sm text-muted-foreground">
                  Showing {((detailedEntriesPagination.page - 1) * detailedEntriesPagination.limit) + 1} to {Math.min(detailedEntriesPagination.page * detailedEntriesPagination.limit, detailedEntriesPagination.total)} of {detailedEntriesPagination.total}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDetailedEntriesPagination(prev => ({ ...prev, page: prev.page - 1 }))}
                  disabled={detailedEntriesPagination.page === 1}
                >
                  Previous
                </Button>
                <span className="text-sm text-muted-foreground">
                  Page {detailedEntriesPagination.page} of {detailedEntriesPagination.totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDetailedEntriesPagination(prev => ({ ...prev, page: prev.page + 1 }))}
                  disabled={detailedEntriesPagination.page === detailedEntriesPagination.totalPages}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}

    </div>
  )
}
