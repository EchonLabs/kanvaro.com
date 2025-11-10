'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Progress } from '@/components/ui/Progress'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/Avatar'
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
  Users, 
  TrendingUp, 
  Target,
  Award,
  Clock,
  Activity
} from 'lucide-react'

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

interface TeamPerformanceReportProps {
  members: TeamMember[]
  productivityTrends: {
    date: string
    productivity: number
    workload: number
    hours: number
  }[]
  filters: any
}

export function TeamPerformanceReport({ members, productivityTrends, filters }: TeamPerformanceReportProps) {
  // Calculate performance metrics
  const averageProductivity = members.length > 0 
    ? members.reduce((sum, member) => sum + member.stats.productivityScore, 0) / members.length 
    : 0
  const averageWorkload = members.length > 0 
    ? members.reduce((sum, member) => sum + member.stats.workloadScore, 0) / members.length 
    : 0
  const totalHoursLogged = members.reduce((sum, member) => sum + member.stats.hoursLogged, 0)
  const totalTasksCompleted = members.reduce((sum, member) => sum + member.stats.tasksCompleted, 0)

  // Prepare data for charts
  const performanceData = members.map(member => ({
    name: `${member.firstName} ${member.lastName}`.length > 15 
      ? `${member.firstName} ${member.lastName}`.substring(0, 15) + '...' 
      : `${member.firstName} ${member.lastName}`,
    productivity: member.stats.productivityScore,
    workload: member.stats.workloadScore,
    completion: member.stats.completionRate,
    hours: member.stats.hoursLogged
  }))

  const departmentPerformance = members.reduce((acc, member) => {
    if (!acc[member.department]) {
      acc[member.department] = {
        department: member.department,
        members: 0,
        totalProductivity: 0,
        totalWorkload: 0,
        totalHours: 0,
        totalTasks: 0
      }
    }
    acc[member.department].members += 1
    acc[member.department].totalProductivity += member.stats.productivityScore
    acc[member.department].totalWorkload += member.stats.workloadScore
    acc[member.department].totalHours += member.stats.hoursLogged
    acc[member.department].totalTasks += member.stats.tasksCompleted
    return acc
  }, {} as Record<string, any>)

  const departmentData = Object.values(departmentPerformance).map((dept: any) => ({
    department: dept.department,
    members: dept.members,
    avgProductivity: dept.members > 0 ? dept.totalProductivity / dept.members : 0,
    avgWorkload: dept.members > 0 ? dept.totalWorkload / dept.members : 0,
    totalHours: dept.totalHours,
    totalTasks: dept.totalTasks
  }))

  const topPerformers = members
    .sort((a, b) => b.stats.productivityScore - a.stats.productivityScore)
    .slice(0, 5)

  return (
    <div className="space-y-6">
      {/* Performance Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium truncate flex-1 min-w-0">Team Members</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground flex-shrink-0 ml-2" />
          </CardHeader>
          <CardContent>
            <div className="text-xl sm:text-2xl font-bold">{members.length}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Active team members
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium truncate flex-1 min-w-0">Avg Productivity</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground flex-shrink-0 ml-2" />
          </CardHeader>
          <CardContent>
            <div className="text-xl sm:text-2xl font-bold">
              {averageProductivity.toFixed(1)}%
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Team productivity score
            </p>
            <Progress value={averageProductivity} className="mt-2" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium truncate flex-1 min-w-0">Total Hours</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground flex-shrink-0 ml-2" />
          </CardHeader>
          <CardContent>
            <div className="text-xl sm:text-2xl font-bold break-words">
              {totalHoursLogged.toFixed(0)}h
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Logged across team
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
              {totalTasksCompleted}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Total completed tasks
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Individual Performance */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base sm:text-lg">Individual Performance</CardTitle>
            <CardDescription className="text-xs sm:text-sm">Productivity and workload by team member</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={performanceData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-45} textAnchor="end" height={80} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip formatter={(value) => [`${value}%`, 'Percentage']} />
                <Bar dataKey="productivity" fill="#00C49F" name="Productivity" />
                <Bar dataKey="workload" fill="#FFBB28" name="Workload" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Department Performance */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base sm:text-lg">Department Performance</CardTitle>
            <CardDescription className="text-xs sm:text-sm">Average performance by department</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={departmentData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="department" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip formatter={(value) => [`${value}%`, 'Percentage']} />
                <Bar dataKey="avgProductivity" fill="#00C49F" name="Avg Productivity" />
                <Bar dataKey="avgWorkload" fill="#FFBB28" name="Avg Workload" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Productivity Trends */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base sm:text-lg">Productivity Trends</CardTitle>
            <CardDescription className="text-xs sm:text-sm">Team productivity over time</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={productivityTrends}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip formatter={(value) => [`${value}%`, 'Percentage']} />
                <Area 
                  type="monotone" 
                  dataKey="productivity" 
                  stackId="1" 
                  stroke="#00C49F" 
                  fill="#00C49F" 
                  fillOpacity={0.6}
                  name="Productivity"
                />
                <Area 
                  type="monotone" 
                  dataKey="workload" 
                  stackId="2" 
                  stroke="#FFBB28" 
                  fill="#FFBB28" 
                  fillOpacity={0.6}
                  name="Workload"
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Hours vs Performance */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base sm:text-lg">Hours vs Performance</CardTitle>
            <CardDescription className="text-xs sm:text-sm">Hours logged vs productivity correlation</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={performanceData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-45} textAnchor="end" height={80} />
                <YAxis yAxisId="left" tick={{ fontSize: 10 }} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} />
                <Tooltip />
                <Line 
                  yAxisId="left"
                  type="monotone" 
                  dataKey="productivity" 
                  stroke="#00C49F" 
                  strokeWidth={2}
                  name="Productivity %"
                />
                <Line 
                  yAxisId="right"
                  type="monotone" 
                  dataKey="hours" 
                  stroke="#8884d8" 
                  strokeWidth={2}
                  name="Hours Logged"
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Top Performers */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2 text-base sm:text-lg">
            <Award className="h-4 w-4 sm:h-5 sm:w-5 flex-shrink-0" />
            <span className="truncate">Top Performers</span>
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm">Team members with highest productivity scores</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {topPerformers.map((performer, index) => (
              <div key={performer._id} className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 border rounded-lg gap-4">
                <div className="flex items-center space-x-3 sm:space-x-4 flex-1 min-w-0">
                  <div className="flex items-center space-x-2 flex-shrink-0">
                    <Badge variant="outline" className="w-6 h-6 rounded-full flex items-center justify-center">
                      {index + 1}
                    </Badge>
                    <Avatar className="h-8 w-8 sm:h-10 sm:w-10 flex-shrink-0">
                      <AvatarImage src={performer.avatar} />
                      <AvatarFallback className="text-xs sm:text-sm">
                        {performer.firstName.charAt(0)}{performer.lastName.charAt(0)}
                      </AvatarFallback>
                    </Avatar>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-sm sm:text-base truncate">
                      {performer.firstName} {performer.lastName}
                    </h3>
                    <p className="text-xs sm:text-sm text-muted-foreground truncate">
                      {performer.role} • {performer.department}
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:flex sm:items-center sm:space-x-4 sm:space-x-6 gap-3 sm:gap-0 w-full sm:w-auto flex-shrink-0">
                  <div className="text-center">
                    <div className="text-xs sm:text-sm font-medium">
                      {performer.stats.productivityScore.toFixed(1)}%
                    </div>
                    <div className="text-xs text-muted-foreground">Productivity</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xs sm:text-sm font-medium">
                      {performer.stats.tasksCompleted}
                    </div>
                    <div className="text-xs text-muted-foreground">Tasks Done</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xs sm:text-sm font-medium">
                      {performer.stats.hoursLogged.toFixed(1)}h
                    </div>
                    <div className="text-xs text-muted-foreground">Hours Logged</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xs sm:text-sm font-medium">
                      {performer.stats.completionRate.toFixed(1)}%
                    </div>
                    <div className="text-xs text-muted-foreground">Completion</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Team Performance Details */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base sm:text-lg">Team Performance Details</CardTitle>
          <CardDescription className="text-xs sm:text-sm">Detailed performance metrics for all team members</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {members.map((member) => (
              <div key={member._id} className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 border rounded-lg gap-4">
                <div className="flex-1 min-w-0 w-full sm:w-auto">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center space-y-2 sm:space-y-0 sm:space-x-3 flex-wrap gap-2">
                    <div className="flex items-center space-x-2">
                      <Avatar className="h-8 w-8 flex-shrink-0">
                        <AvatarImage src={member.avatar} />
                        <AvatarFallback className="text-xs sm:text-sm">
                          {member.firstName.charAt(0)}{member.lastName.charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-sm sm:text-base truncate">
                          {member.firstName} {member.lastName}
                        </h3>
                        <p className="text-xs sm:text-sm text-muted-foreground truncate">
                          {member.role} • {member.department}
                        </p>
                      </div>
                    </div>
                    <Badge variant={member.stats.productivityScore > 80 ? 'default' : 
                                   member.stats.productivityScore > 60 ? 'secondary' : 'outline'} className="flex-shrink-0">
                      {member.stats.productivityScore.toFixed(1)}% productivity
                    </Badge>
                  </div>
                  
                  <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 text-xs sm:text-sm">
                    <div>
                      <div className="text-muted-foreground">Tasks Completed</div>
                      <div className="font-medium break-words">{member.stats.tasksCompleted}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Hours Logged</div>
                      <div className="font-medium break-words">{member.stats.hoursLogged.toFixed(1)}h</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Completion Rate</div>
                      <div className="font-medium">{member.stats.completionRate.toFixed(1)}%</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Workload</div>
                      <div className="font-medium">{member.stats.workloadScore.toFixed(1)}%</div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}