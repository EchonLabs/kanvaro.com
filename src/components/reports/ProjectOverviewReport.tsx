'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Progress } from '@/components/ui/Progress'
import { Button } from '@/components/ui/Button'
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line
} from 'recharts'
import { 
  FolderOpen, 
  CheckCircle, 
  Clock, 
  DollarSign, 
  TrendingUp,
  Users,
  Calendar,
  Target
} from 'lucide-react'

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

interface ProjectOverviewReportProps {
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
  filters: any
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8']

export function ProjectOverviewReport({ projects, summary, trends, filters }: ProjectOverviewReportProps) {
  // Prepare data for charts
  const statusData = [
    { name: 'Active', value: summary.activeProjects, color: '#00C49F' },
    { name: 'Completed', value: summary.completedProjects, color: '#0088FE' },
    { name: 'On Hold', value: projects.filter(p => p.status === 'on-hold').length, color: '#FFBB28' },
    { name: 'Cancelled', value: projects.filter(p => p.status === 'cancelled').length, color: '#FF8042' }
  ]

  const budgetData = projects.map(project => ({
    name: project.name.length > 15 ? project.name.substring(0, 15) + '...' : project.name,
    budget: project.stats.budget.total,
    spent: project.stats.budget.spent,
    remaining: project.stats.budget.remaining
  }))

  const completionData = projects.map(project => ({
    name: project.name.length > 15 ? project.name.substring(0, 15) + '...' : project.name,
    completion: project.stats.tasks.completionRate,
    tasks: project.stats.tasks.total
  }))

  const timeTrackingData = projects.map(project => ({
    name: project.name.length > 15 ? project.name.substring(0, 15) + '...' : project.name,
    hours: project.stats.timeTracking.totalHours,
    entries: project.stats.timeTracking.entries
  }))

  return (
    <div className="space-y-6">
      {/* Key Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium truncate flex-1 min-w-0">Project Status</CardTitle>
            <FolderOpen className="h-4 w-4 text-muted-foreground flex-shrink-0 ml-2" />
          </CardHeader>
          <CardContent>
            <div className="text-xl sm:text-2xl font-bold">{summary.totalProjects}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {summary.activeProjects} active, {summary.completedProjects} completed
            </p>
            <div className="mt-2 flex flex-wrap gap-1">
              <Badge variant="default" className="text-xs">
                {summary.activeProjects} Active
              </Badge>
              <Badge variant="secondary" className="text-xs">
                {summary.completedProjects} Done
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium truncate flex-1 min-w-0">Budget Utilization</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground flex-shrink-0 ml-2" />
          </CardHeader>
          <CardContent>
            <div className="text-xl sm:text-2xl font-bold">
              {trends.budgetUtilization.toFixed(1)}%
            </div>
            <p className="text-xs text-muted-foreground mt-1 break-words">
              ${summary.totalSpent.toLocaleString()} of ${summary.totalBudget.toLocaleString()}
            </p>
            <Progress value={trends.budgetUtilization} className="mt-2" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium truncate flex-1 min-w-0">Average Completion</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground flex-shrink-0 ml-2" />
          </CardHeader>
          <CardContent>
            <div className="text-xl sm:text-2xl font-bold">
              {summary.averageCompletionRate.toFixed(1)}%
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Across all projects
            </p>
            <Progress value={summary.averageCompletionRate} className="mt-2" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium truncate flex-1 min-w-0">Project Velocity</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground flex-shrink-0 ml-2" />
          </CardHeader>
          <CardContent>
            <div className="text-xl sm:text-2xl font-bold">
              {trends.projectVelocity.toFixed(1)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Projects completed per month
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Project Status Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base sm:text-lg">Project Status Distribution</CardTitle>
            <CardDescription className="text-xs sm:text-sm">Breakdown of projects by status</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={statusData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, value, percent }) => `${name}: ${value} (${(percent * 100).toFixed(0)}%)`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {statusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Budget Utilization */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base sm:text-lg">Budget Utilization by Project</CardTitle>
            <CardDescription className="text-xs sm:text-sm">Budget vs spent across projects</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={budgetData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} className="sm:text-xs" />
                <YAxis tick={{ fontSize: 10 }} className="sm:text-xs" />
                <Tooltip />
                <Bar dataKey="budget" fill="#8884d8" name="Total Budget" />
                <Bar dataKey="spent" fill="#82ca9d" name="Spent" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Completion Rates */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base sm:text-lg">Task Completion Rates</CardTitle>
            <CardDescription className="text-xs sm:text-sm">Completion percentage by project</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={completionData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} className="sm:text-xs" />
                <YAxis tick={{ fontSize: 10 }} className="sm:text-xs" />
                <Tooltip formatter={(value) => [`${value}%`, 'Completion Rate']} />
                <Bar dataKey="completion" fill="#00C49F" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Time Tracking */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base sm:text-lg">Time Tracking by Project</CardTitle>
            <CardDescription className="text-xs sm:text-sm">Hours logged per project</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={timeTrackingData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} className="sm:text-xs" />
                <YAxis tick={{ fontSize: 10 }} className="sm:text-xs" />
                <Tooltip formatter={(value) => [`${value}h`, 'Hours']} />
                <Bar dataKey="hours" fill="#FFBB28" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Projects List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base sm:text-lg">Project Details</CardTitle>
          <CardDescription className="text-xs sm:text-sm">Detailed view of all projects</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {projects.map((project) => (
              <div key={project._id} className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 border rounded-lg gap-4">
                <div className="flex-1 min-w-0 w-full sm:w-auto">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center space-y-2 sm:space-y-0 sm:space-x-3">
                    <h3 className="font-semibold text-sm sm:text-base truncate">{project.name}</h3>
                    <Badge variant={project.status === 'active' ? 'default' : 'secondary'} className="flex-shrink-0">
                      {project.status}
                    </Badge>
                  </div>
                  {project.description && (
                    <p className="text-xs sm:text-sm text-muted-foreground mt-1 break-words">
                      {project.description}
                    </p>
                  )}
                  <div className="flex flex-wrap items-center gap-2 sm:gap-4 mt-2 text-xs sm:text-sm text-muted-foreground">
                    <div className="flex items-center space-x-1">
                      <CheckCircle className="h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0" />
                      <span>{project.stats.tasks.completed}/{project.stats.tasks.total} tasks</span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <Clock className="h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0" />
                      <span>{project.stats.timeTracking.totalHours.toFixed(1)}h logged</span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <Users className="h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0" />
                      <span>{project.team?.length || 0} members</span>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-4 w-full sm:w-auto">
                  <div className="flex items-center sm:items-end sm:flex-col sm:text-right gap-2 sm:gap-0">
                    <div className="text-xs sm:text-sm font-medium">
                      {project.stats.tasks.completionRate.toFixed(1)}%
                    </div>
                    <div className="text-xs text-muted-foreground">Complete</div>
                  </div>
                  <div className="flex items-center sm:items-end sm:flex-col sm:text-right gap-2 sm:gap-0">
                    <div className="text-xs sm:text-sm font-medium">
                      {project.stats.budget.utilizationRate.toFixed(1)}%
                    </div>
                    <div className="text-xs text-muted-foreground">Budget Used</div>
                  </div>
                  <Button variant="outline" size="sm" className="w-full sm:w-auto flex-shrink-0">
                    View Details
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
