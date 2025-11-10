'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Progress } from '@/components/ui/Progress'
import { Button } from '@/components/ui/Button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/Avatar'
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
  Users, 
  Clock, 
  DollarSign,
  TrendingUp,
  Target,
  AlertTriangle
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

interface ProjectResourceReportProps {
  projects: Project[]
  filters: any
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82CA9D']

export function ProjectResourceReport({ projects, filters }: ProjectResourceReportProps) {
  // Calculate resource metrics
  const totalTeamMembers = projects.reduce((sum, project) => sum + (project.team?.length || 0), 0)
  const totalHoursLogged = projects.reduce((sum, project) => sum + project.stats.timeTracking.totalHours, 0)
  const totalBudget = projects.reduce((sum, project) => sum + project.stats.budget.total, 0)
  const totalSpent = projects.reduce((sum, project) => sum + project.stats.budget.spent, 0)

  // Prepare data for charts
  const resourceData = projects.map(project => ({
    name: project.name.length > 15 ? project.name.substring(0, 15) + '...' : project.name,
    teamSize: project.team?.length || 0,
    hoursLogged: project.stats.timeTracking.totalHours,
    budget: project.stats.budget.total,
    spent: project.stats.budget.spent,
    utilization: project.stats.budget.utilizationRate
  }))

  const teamDistribution = projects.reduce((acc, project) => {
    const teamSize = project.team?.length || 0
    if (teamSize === 0) {
      acc['No Team'] = (acc['No Team'] || 0) + 1
    } else if (teamSize <= 2) {
      acc['Small Team (1-2)'] = (acc['Small Team (1-2)'] || 0) + 1
    } else if (teamSize <= 5) {
      acc['Medium Team (3-5)'] = (acc['Medium Team (3-5)'] || 0) + 1
    } else {
      acc['Large Team (6+)'] = (acc['Large Team (6+)'] || 0) + 1
    }
    return acc
  }, {} as Record<string, number>)

  const teamSizeData = Object.entries(teamDistribution).map(([size, count]) => ({
    size,
    count,
    percentage: (count / projects.length) * 100
  }))

  const budgetData = projects.map(project => ({
    name: project.name.length > 15 ? project.name.substring(0, 15) + '...' : project.name,
    budget: project.stats.budget.total,
    spent: project.stats.budget.spent,
    remaining: project.stats.budget.remaining
  }))

  const timeData = projects.map(project => ({
    name: project.name.length > 15 ? project.name.substring(0, 15) + '...' : project.name,
    hours: project.stats.timeTracking.totalHours,
    entries: project.stats.timeTracking.entries,
    avgSession: project.stats.timeTracking.entries > 0 
      ? project.stats.timeTracking.totalHours / project.stats.timeTracking.entries 
      : 0
  }))

  return (
    <div className="space-y-6">
      {/* Resource Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium truncate flex-1 min-w-0">Total Team Members</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground flex-shrink-0 ml-2" />
          </CardHeader>
          <CardContent>
            <div className="text-xl sm:text-2xl font-bold">{totalTeamMembers}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Across all projects
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium truncate flex-1 min-w-0">Total Hours Logged</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground flex-shrink-0 ml-2" />
          </CardHeader>
          <CardContent>
            <div className="text-xl sm:text-2xl font-bold">
              {totalHoursLogged.toFixed(0)}h
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Time investment
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium truncate flex-1 min-w-0">Total Budget</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground flex-shrink-0 ml-2" />
          </CardHeader>
          <CardContent>
            <div className="text-xl sm:text-2xl font-bold">
              ${totalBudget.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground mt-1 break-words">
              Allocated budget
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium truncate flex-1 min-w-0">Budget Utilization</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground flex-shrink-0 ml-2" />
          </CardHeader>
          <CardContent>
            <div className="text-xl sm:text-2xl font-bold">
              {totalBudget > 0 ? ((totalSpent / totalBudget) * 100).toFixed(1) : 0}%
            </div>
            <p className="text-xs text-muted-foreground mt-1 break-words">
              ${totalSpent.toLocaleString()} spent
            </p>
            <Progress 
              value={totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0} 
              className="mt-2"
            />
          </CardContent>
        </Card>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Team Size Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base sm:text-lg">Team Size Distribution</CardTitle>
            <CardDescription className="text-xs sm:text-sm">Distribution of team sizes across projects</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={teamSizeData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ size, count, percentage }) => `${size}: ${count} (${percentage.toFixed(0)}%)`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="count"
                >
                  {teamSizeData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => [`${value} projects`, 'Count']} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Resource Allocation by Project */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base sm:text-lg">Resource Allocation</CardTitle>
            <CardDescription className="text-xs sm:text-sm">Team size and hours logged by project</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={resourceData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis yAxisId="left" tick={{ fontSize: 10 }} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar yAxisId="left" dataKey="teamSize" fill="#8884d8" name="Team Size" />
                <Bar yAxisId="right" dataKey="hoursLogged" fill="#82ca9d" name="Hours Logged" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Budget vs Spent */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base sm:text-lg">Budget vs Spent by Project</CardTitle>
            <CardDescription className="text-xs sm:text-sm">Budget allocation vs actual spending</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={budgetData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip formatter={(value) => [`$${value.toLocaleString()}`, 'Amount']} />
                <Bar dataKey="budget" fill="#8884d8" name="Budget" />
                <Bar dataKey="spent" fill="#82ca9d" name="Spent" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Time Tracking Efficiency */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base sm:text-lg">Time Tracking Efficiency</CardTitle>
            <CardDescription className="text-xs sm:text-sm">Hours logged vs time entries by project</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={timeData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Line 
                  type="monotone" 
                  dataKey="hours" 
                  stroke="#8884d8" 
                  strokeWidth={2}
                  name="Hours Logged"
                />
                <Line 
                  type="monotone" 
                  dataKey="avgSession" 
                  stroke="#82ca9d" 
                  strokeWidth={2}
                  name="Avg Session Length"
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Project Resource Details */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base sm:text-lg">Project Resource Details</CardTitle>
          <CardDescription className="text-xs sm:text-sm">Detailed resource allocation for each project</CardDescription>
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
                    {project.stats.budget.utilizationRate > 80 && (
                      <Badge variant="destructive" className="flex items-center space-x-1 flex-shrink-0">
                        <AlertTriangle className="h-3 w-3" />
                        <span className="text-xs sm:text-sm">Over Budget</span>
                      </Badge>
                    )}
                  </div>
                  
                  {/* Resource Metrics */}
                  <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <div className="flex items-center space-x-2 mb-2">
                        <Users className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground flex-shrink-0" />
                        <span className="text-xs sm:text-sm font-medium">Team</span>
                      </div>
                      <div className="text-base sm:text-lg font-bold">
                        {project.team?.length || 0} members
                      </div>
                      {project.team && project.team.length > 0 && (
                        <div className="flex -space-x-2 mt-2">
                          {project.team.slice(0, 3).map((member, index) => (
                            <Avatar key={index} className="h-5 w-5 sm:h-6 sm:w-6 border-2 border-background">
                              <AvatarImage src={member.avatar} />
                              <AvatarFallback className="text-xs">
                                {member.firstName?.charAt(0)}{member.lastName?.charAt(0)}
                              </AvatarFallback>
                            </Avatar>
                          ))}
                          {project.team.length > 3 && (
                            <div className="h-5 w-5 sm:h-6 sm:w-6 rounded-full bg-muted flex items-center justify-center text-xs border-2 border-background">
                              +{project.team.length - 3}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    
                    <div>
                      <div className="flex items-center space-x-2 mb-2">
                        <Clock className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground flex-shrink-0" />
                        <span className="text-xs sm:text-sm font-medium">Time</span>
                      </div>
                      <div className="text-base sm:text-lg font-bold">
                        {project.stats.timeTracking.totalHours.toFixed(1)}h
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {project.stats.timeTracking.entries} entries
                      </div>
                    </div>
                    
                    <div>
                      <div className="flex items-center space-x-2 mb-2">
                        <DollarSign className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground flex-shrink-0" />
                        <span className="text-xs sm:text-sm font-medium">Budget</span>
                      </div>
                      <div className="text-base sm:text-lg font-bold break-words">
                        ${project.stats.budget.spent.toLocaleString()}
                      </div>
                      <div className="text-xs text-muted-foreground break-words">
                        of ${project.stats.budget.total.toLocaleString()}
                      </div>
                      <Progress 
                        value={project.stats.budget.utilizationRate} 
                        className="mt-1 h-1"
                      />
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
                      {project.stats.tasks.completionRate.toFixed(1)}%
                    </div>
                    <div className="text-xs text-muted-foreground">Complete</div>
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
