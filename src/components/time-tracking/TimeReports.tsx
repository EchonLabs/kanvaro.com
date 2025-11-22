'use client'

import { useState, useEffect, useCallback } from 'react'
import { BarChart3, PieChart, TrendingUp, Download, Calendar, Users, DollarSign, Clock } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/Badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useOrganization } from '@/hooks/useOrganization'
import { applyRoundingRules } from '@/lib/utils'

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
}

export function TimeReports({ userId, organizationId, projectId }: TimeReportsProps) {
  const { organization } = useOrganization()
  const [reportData, setReportData] = useState<ReportData | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [projects, setProjects] = useState<Array<{ _id: string; name: string }>>([])
  const [users, setUsers] = useState<Array<{ _id: string; firstName: string; lastName: string; email: string }>>([])
  const [filters, setFilters] = useState({
    startDate: '',
    endDate: '',
    reportType: 'summary',
    projectId: projectId || 'all',
    assignedTo: userId || 'all',
    assignedBy: 'all'
  })

  const loadReport = useCallback(async () => {
    setIsLoading(true)
    setError('')

    try {
      const params = new URLSearchParams({
        organizationId,
        reportType: filters.reportType
      })

      if (filters.projectId && filters.projectId !== 'all') params.append('projectId', filters.projectId)
      if (filters.assignedTo && filters.assignedTo !== 'all') params.append('userId', filters.assignedTo)
      if (filters.assignedBy && filters.assignedBy !== 'all') params.append('assignedBy', filters.assignedBy)
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

  // Load projects and users for filters
  useEffect(() => {
    const loadFilterData = async () => {
      try {
        // Load projects
        const projectsRes = await fetch(`/api/projects?limit=1000&page=1`)
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

  const formatDuration = (minutes: number) => {
    // Apply rounding rules if enabled
    let displayMinutes = minutes
    const roundingRules = organization?.settings?.timeTracking?.roundingRules
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

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount)
  }

  const handleExport = async () => {
    try {
      const params = new URLSearchParams({
        organizationId,
        reportType: filters.reportType,
        format: 'csv'
      })

      if (filters.projectId && filters.projectId !== 'all') params.append('projectId', filters.projectId)
      if (filters.assignedTo && filters.assignedTo !== 'all') params.append('userId', filters.assignedTo)
      if (filters.assignedBy && filters.assignedBy !== 'all') params.append('assignedBy', filters.assignedBy)
      if (filters.startDate) params.append('startDate', filters.startDate)
      if (filters.endDate) params.append('endDate', filters.endDate)

      const response = await fetch(`/api/time-tracking/reports?${params}`)
      
      if (response.ok) {
        const blob = await response.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `time-report-${new Date().toISOString().split('T')[0]}.csv`
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
    <div className="space-y-6">
      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Time Tracking Reports
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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
              <Select value={filters.projectId} onValueChange={(value) => setFilters(prev => ({ ...prev, projectId: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="All Projects" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Projects</SelectItem>
                  {projects.map((project) => (
                    <SelectItem key={project._id} value={project._id}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="assignedTo">Assigned To</Label>
              <Select value={filters.assignedTo} onValueChange={(value) => setFilters(prev => ({ ...prev, assignedTo: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="All Users" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Users</SelectItem>
                  {users.map((user) => (
                    <SelectItem key={user._id} value={user._id}>
                      {user.firstName} {user.lastName} ({user.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="assignedBy">Assigned By</Label>
              <Select value={filters.assignedBy} onValueChange={(value) => setFilters(prev => ({ ...prev, assignedBy: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="All Approvers" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Approvers</SelectItem>
                  {users.map((user) => (
                    <SelectItem key={user._id} value={user._id}>
                      {user.firstName} {user.lastName} ({user.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="reportType">Report Type</Label>
              <Select value={filters.reportType} onValueChange={(value) => setFilters(prev => ({ ...prev, reportType: value }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="summary">Summary</SelectItem>
                  <SelectItem value="byUser">By User</SelectItem>
                  <SelectItem value="byProject">By Project</SelectItem>
                  <SelectItem value="byTask">By Task</SelectItem>
                  <SelectItem value="billable">Billable Time</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end">
            <Button onClick={handleExport}>
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Summary Report */}
      {reportData && filters.reportType === 'summary' && reportData.summary && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <Clock className="h-8 w-8 text-primary" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-muted-foreground">Total Time</p>
                  <p className="text-2xl font-bold">{formatDuration(reportData.summary.totalDuration || 0)}</p>
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
                  <p className="text-2xl font-bold">{formatCurrency(reportData.summary.totalCost || 0)}</p>
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
                  <p className="text-2xl font-bold">{formatDuration(reportData.summary.billableDuration || 0)}</p>
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
                  <p className="text-2xl font-bold">{reportData.summary.totalEntries || 0}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* User Report */}
      {reportData && filters.reportType === 'byUser' && reportData.userReport && (
        <Card>
          <CardHeader>
            <CardTitle>Time by User</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {reportData.userReport.map((user) => (
                <div key={user.userId} className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <div className="font-medium">{user.userName}</div>
                    <div className="text-sm text-muted-foreground">{user.userEmail}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-medium">{formatDuration(user.totalDuration)}</div>
                    <div className="text-sm text-muted-foreground">{formatCurrency(user.totalCost)}</div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Project Report */}
      {reportData && filters.reportType === 'byProject' && reportData.projectReport && (
        <Card>
          <CardHeader>
            <CardTitle>Time by Project</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {reportData.projectReport.map((project) => (
                <div key={project.projectId} className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <div className="font-medium">{project.projectName}</div>
                    <div className="text-sm text-muted-foreground">{project.entryCount} entries</div>
                  </div>
                  <div className="text-right">
                    <div className="font-medium">{formatDuration(project.totalDuration)}</div>
                    <div className="text-sm text-muted-foreground">{formatCurrency(project.totalCost)}</div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Task Report */}
      {reportData && filters.reportType === 'byTask' && reportData.taskReport && (
        <Card>
          <CardHeader>
            <CardTitle>Time by Task</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {reportData.taskReport.map((task) => (
                <div key={task.taskId} className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <div className="font-medium">{task.taskTitle}</div>
                    <div className="text-sm text-muted-foreground">{task.entryCount} entries</div>
                  </div>
                  <div className="text-right">
                    <div className="font-medium">{formatDuration(task.totalDuration)}</div>
                    <div className="text-sm text-muted-foreground">{formatCurrency(task.totalCost)}</div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Billable Report */}
      {reportData && filters.reportType === 'billable' && reportData.billableReport && (
        <Card>
          <CardHeader>
            <CardTitle>Billable Time Report</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {reportData.billableReport.map((item, index) => (
                <div key={index} className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <div className="font-medium">{item.userName}</div>
                    <div className="text-sm text-muted-foreground">{item.projectName}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-medium">{formatDuration(item.totalDuration)}</div>
                    <div className="text-sm text-muted-foreground">{formatCurrency(item.totalCost)}</div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
