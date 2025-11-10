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
  const [reportData, setReportData] = useState<ReportData | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [filters, setFilters] = useState({
    startDate: '',
    endDate: '',
    reportType: 'summary'
  })

  const loadReport = useCallback(async () => {
    setIsLoading(true)
    setError('')

    try {
      const params = new URLSearchParams({
        organizationId,
        reportType: filters.reportType
      })

      if (userId) params.append('userId', userId)
      if (projectId) params.append('projectId', projectId)
      if (filters.startDate) params.append('startDate', filters.startDate)
      if (filters.endDate) params.append('endDate', filters.endDate)

      const response = await fetch(`/api/time-tracking/reports?${params}`)
      const data = await response.json()

      if (response.ok) {
        setReportData(data)
      } else {
        setError(data.error || 'Failed to load report')
      }
    } catch (error) {
      setError('Failed to load report')
    } finally {
      setIsLoading(false)
    }
  }, [organizationId, userId, projectId, filters])

  useEffect(() => {
    loadReport()
  }, [loadReport])

  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60)
    const mins = Math.floor(minutes % 60)
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

      if (userId) params.append('userId', userId)
      if (projectId) params.append('projectId', projectId)
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

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
            <div className="flex items-end">
              <Button onClick={handleExport} className="w-full">
                <Download className="h-4 w-4 mr-2" />
                Export CSV
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Report */}
      {reportData && filters.reportType === 'summary' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <Clock className="h-8 w-8 text-primary" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-muted-foreground">Total Time</p>
                  <p className="text-2xl font-bold">{formatDuration(reportData.summary.totalDuration)}</p>
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
                  <p className="text-2xl font-bold">{formatCurrency(reportData.summary.totalCost)}</p>
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
                  <p className="text-2xl font-bold">{formatDuration(reportData.summary.billableDuration)}</p>
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
                  <p className="text-2xl font-bold">{reportData.summary.totalEntries}</p>
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
