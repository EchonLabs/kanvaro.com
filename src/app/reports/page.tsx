'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { MainLayout } from '@/components/layout/MainLayout'
import { useBreadcrumb } from '@/contexts/BreadcrumbContext'
import { PageWrapper } from '@/components/layout/PageWrapper'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Progress } from '@/components/ui/Progress'
import { 
  DollarSign, 
  TrendingUp, 
  Clock, 
  Users, 
  Calendar,
  BarChart3,
  PieChart,
  Activity,
  Target,
  Zap
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
  recentBurnRates: any[]
}

export default function ReportsPage() {
  const params = useParams()
  const projectId = params.id as string
  const { setItems } = useBreadcrumb()
  const [reportData, setReportData] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('overview')

  useEffect(() => {
    // Set breadcrumb
    setItems([
      { label: 'Reports' }
    ])
  }, [setItems])

  useEffect(() => {
    if (projectId) {
      fetchReportData()
    }
  }, [projectId])

  const fetchReportData = async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/reports?projectId=${projectId}&type=overview`)
      if (response.ok) {
        const data = await response.json()
        setReportData(data)
      }
    } catch (error) {
      console.error('Error fetching report data:', error)
    } finally {
      setLoading(false)
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
          <p className="text-muted-foreground">No report data available</p>
        </div>
      </MainLayout>
    )
  }

  return (
    <MainLayout>
      <PageWrapper>
        <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Project Reports</h1>
          <p className="text-muted-foreground">
            Comprehensive analytics and insights for {reportData.project.name}
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Badge variant={reportData.project.status === 'active' ? 'default' : 'secondary'}>
            {reportData.project.status}
          </Badge>
          <Button variant="outline" size="sm">
            <BarChart3 className="h-4 w-4 mr-2" />
            Export Report
          </Button>
        </div>
      </div>

      {/* Key Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Budget Utilization</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {reportData.budget.utilizationRate.toFixed(1)}%
            </div>
            <p className="text-xs text-muted-foreground">
              ${reportData.budget.spent.toLocaleString()} of ${reportData.budget.total.toLocaleString()}
            </p>
            <Progress 
              value={reportData.budget.utilizationRate} 
              className="mt-2"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Task Completion</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {reportData.tasks.completionRate.toFixed(1)}%
            </div>
            <p className="text-xs text-muted-foreground">
              {reportData.tasks.completed} of {reportData.tasks.total} tasks
            </p>
            <Progress 
              value={reportData.tasks.completionRate} 
              className="mt-2"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Time Logged</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {reportData.timeTracking.totalHours.toFixed(1)}h
            </div>
            <p className="text-xs text-muted-foreground">
              {reportData.timeTracking.entries} entries
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Sprints</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {reportData.sprints.active}
            </div>
            <p className="text-xs text-muted-foreground">
              {reportData.sprints.total} total sprints
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Report Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="budget">Budget</TabsTrigger>
          <TabsTrigger value="burn-rate">Burn Rate</TabsTrigger>
          <TabsTrigger value="velocity">Velocity</TabsTrigger>
          <TabsTrigger value="sprint">Sprints</TabsTrigger>
          <TabsTrigger value="team">Team</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <OverviewReport projectId={projectId} />
        </TabsContent>

        <TabsContent value="budget">
          <BudgetReport projectId={projectId} />
        </TabsContent>

        <TabsContent value="burn-rate">
          <BurnRateReport projectId={projectId} />
        </TabsContent>

        <TabsContent value="velocity">
          <VelocityReport projectId={projectId} />
        </TabsContent>

        <TabsContent value="sprint">
          <SprintReport projectId={projectId} />
        </TabsContent>

        <TabsContent value="team">
          <TeamPerformanceReport 
            members={[]} 
            productivityTrends={[]} 
            filters={{}} 
          />
        </TabsContent>
      </Tabs>
        </div>
      </PageWrapper>
    </MainLayout>
  )
}
