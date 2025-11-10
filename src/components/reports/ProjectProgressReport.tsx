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
  LineChart,
  Line,
  Area,
  AreaChart
} from 'recharts'
import { 
  FolderOpen, 
  CheckCircle, 
  Clock, 
  Target,
  TrendingUp,
  Calendar
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

interface ProjectProgressReportProps {
  projects: Project[]
  filters: any
}

export function ProjectProgressReport({ projects, filters }: ProjectProgressReportProps) {
  // Prepare data for charts
  const progressData = projects.map(project => ({
    name: project.name.length > 15 ? project.name.substring(0, 15) + '...' : project.name,
    completion: project.stats.tasks.completionRate,
    budget: project.stats.budget.utilizationRate,
    tasks: project.stats.tasks.total,
    completed: project.stats.tasks.completed
  }))

  const timelineData = projects.map(project => {
    const startDate = new Date(project.startDate)
    const endDate = project.endDate ? new Date(project.endDate) : new Date()
    const duration = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
    
    return {
      name: project.name,
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0],
      duration,
      completion: project.stats.tasks.completionRate,
      status: project.status
    }
  })

  const statusData = projects.reduce((acc, project) => {
    acc[project.status] = (acc[project.status] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  const statusChartData = Object.entries(statusData).map(([status, count]) => ({
    status: status.charAt(0).toUpperCase() + status.slice(1),
    count,
    percentage: (count / projects.length) * 100
  }))

  return (
    <div className="space-y-6">
      {/* Progress Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium truncate flex-1 min-w-0">Total Projects</CardTitle>
            <FolderOpen className="h-4 w-4 text-muted-foreground flex-shrink-0 ml-2" />
          </CardHeader>
          <CardContent>
            <div className="text-xl sm:text-2xl font-bold">{projects.length}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Active and completed
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium truncate flex-1 min-w-0">Average Completion</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground flex-shrink-0 ml-2" />
          </CardHeader>
          <CardContent>
            <div className="text-xl sm:text-2xl font-bold">
              {projects.length > 0 
                ? (projects.reduce((sum, p) => sum + p.stats.tasks.completionRate, 0) / projects.length).toFixed(1)
                : 0}%
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Across all projects
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium truncate flex-1 min-w-0">Active Projects</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground flex-shrink-0 ml-2" />
          </CardHeader>
          <CardContent>
            <div className="text-xl sm:text-2xl font-bold">
              {projects.filter(p => p.status === 'active').length}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Currently in progress
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium truncate flex-1 min-w-0">Completed</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground flex-shrink-0 ml-2" />
          </CardHeader>
          <CardContent>
            <div className="text-xl sm:text-2xl font-bold">
              {projects.filter(p => p.status === 'completed').length}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Successfully finished
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Project Completion Rates */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base sm:text-lg">Project Completion Rates</CardTitle>
            <CardDescription className="text-xs sm:text-sm">Task completion percentage by project</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={progressData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip formatter={(value) => [`${value}%`, 'Completion Rate']} />
                <Bar dataKey="completion" fill="#00C49F" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Project Status Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base sm:text-lg">Project Status Distribution</CardTitle>
            <CardDescription className="text-xs sm:text-sm">Breakdown of projects by status</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={statusChartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="status" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip formatter={(value) => [`${value}`, 'Count']} />
                <Bar dataKey="count" fill="#8884d8" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Budget vs Completion */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base sm:text-lg">Budget Utilization vs Completion</CardTitle>
            <CardDescription className="text-xs sm:text-sm">Budget usage vs project completion correlation</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={progressData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Area 
                  type="monotone" 
                  dataKey="completion" 
                  stackId="1" 
                  stroke="#00C49F" 
                  fill="#00C49F" 
                  fillOpacity={0.6}
                  name="Completion %"
                />
                <Area 
                  type="monotone" 
                  dataKey="budget" 
                  stackId="2" 
                  stroke="#FFBB28" 
                  fill="#FFBB28" 
                  fillOpacity={0.6}
                  name="Budget %"
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Task Progress Trends */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base sm:text-lg">Task Progress Trends</CardTitle>
            <CardDescription className="text-xs sm:text-sm">Completed vs total tasks by project</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={progressData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="tasks" fill="#8884d8" name="Total Tasks" />
                <Bar dataKey="completed" fill="#82ca9d" name="Completed Tasks" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Project Progress Details */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base sm:text-lg">Project Progress Details</CardTitle>
          <CardDescription className="text-xs sm:text-sm">Detailed progress tracking for each project</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {projects.map((project) => (
              <div key={project._id} className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 border rounded-lg gap-4">
                <div className="flex-1 min-w-0 w-full sm:w-auto">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center space-y-2 sm:space-y-0 sm:space-x-3 flex-wrap gap-2">
                    <h3 className="font-semibold text-sm sm:text-base truncate">{project.name}</h3>
                    <Badge variant={project.status === 'active' ? 'default' : 'secondary'} className="flex-shrink-0">
                      {project.status}
                    </Badge>
                    {project.endDate && (
                      <Badge variant="outline" className="flex items-center space-x-1 flex-shrink-0">
                        <Calendar className="h-3 w-3" />
                        <span className="text-xs sm:text-sm">Due: {new Date(project.endDate).toLocaleDateString()}</span>
                      </Badge>
                    )}
                  </div>
                  {project.description && (
                    <p className="text-xs sm:text-sm text-muted-foreground mt-1 break-words">
                      {project.description}
                    </p>
                  )}
                  
                  {/* Progress Bars */}
                  <div className="mt-4 space-y-3">
                    <div>
                      <div className="flex items-center justify-between text-xs sm:text-sm mb-1">
                        <span className="flex items-center space-x-1">
                          <CheckCircle className="h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0" />
                          <span>Task Completion</span>
                        </span>
                        <span className="flex-shrink-0 ml-2">{project.stats.tasks.completionRate.toFixed(1)}%</span>
                      </div>
                      <Progress value={project.stats.tasks.completionRate} className="h-2" />
                      <div className="text-xs text-muted-foreground mt-1 break-words">
                        {project.stats.tasks.completed} of {project.stats.tasks.total} tasks completed
                      </div>
                    </div>
                    
                    <div>
                      <div className="flex items-center justify-between text-xs sm:text-sm mb-1">
                        <span className="flex items-center space-x-1">
                          <Clock className="h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0" />
                          <span>Budget Utilization</span>
                        </span>
                        <span className="flex-shrink-0 ml-2">{project.stats.budget.utilizationRate.toFixed(1)}%</span>
                      </div>
                      <Progress value={project.stats.budget.utilizationRate} className="h-2" />
                      <div className="text-xs text-muted-foreground mt-1 break-words">
                        ${project.stats.budget.spent.toLocaleString()} of ${project.stats.budget.total.toLocaleString()} spent
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4 w-full sm:w-auto sm:ml-6">
                  <div className="flex sm:flex-col items-center sm:items-center text-center gap-2 sm:gap-0">
                    <div className="text-xs sm:text-sm font-medium">
                      {project.stats.sprints.active}
                    </div>
                    <div className="text-xs text-muted-foreground">Active Sprints</div>
                  </div>
                  <div className="flex sm:flex-col items-center sm:items-center text-center gap-2 sm:gap-0">
                    <div className="text-xs sm:text-sm font-medium">
                      {project.stats.timeTracking.totalHours.toFixed(1)}h
                    </div>
                    <div className="text-xs text-muted-foreground">Hours Logged</div>
                  </div>
                  <div className="flex sm:flex-col items-center sm:items-center text-center gap-2 sm:gap-0">
                    <div className="text-xs sm:text-sm font-medium">
                      {project.team?.length || 0}
                    </div>
                    <div className="text-xs text-muted-foreground">Team Members</div>
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
