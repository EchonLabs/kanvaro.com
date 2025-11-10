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
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Area,
  AreaChart
} from 'recharts'
import { 
  Users, 
  TrendingUp, 
  Clock,
  Target,
  Award,
  Activity
} from 'lucide-react'

interface TeamOverviewReportProps {
  overview: {
    totalMembers: number
    activeMembers: number
    averageProductivity: number
    averageWorkload: number
    totalHoursLogged: number
    totalTasksCompleted: number
  }
  departmentBreakdown: {
    department: string
    members: number
    averageProductivity: number
    averageWorkload: number
  }[]
  topPerformers: {
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
  }[]
  filters: any
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82CA9D']

export function TeamOverviewReport({ overview, departmentBreakdown, topPerformers, filters }: TeamOverviewReportProps) {
  // Prepare data for charts
  const departmentData = departmentBreakdown.map(dept => ({
    name: dept.department,
    members: dept.members,
    productivity: dept.averageProductivity,
    workload: dept.averageWorkload
  }))

  const departmentPieData = departmentBreakdown.map((dept, index) => ({
    name: dept.department,
    value: dept.members,
    color: COLORS[index % COLORS.length]
  }))

  const productivityData = departmentBreakdown.map(dept => ({
    name: dept.department,
    productivity: dept.averageProductivity,
    workload: dept.averageWorkload
  }))

  return (
    <div className="space-y-6">
      {/* Team Health Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium truncate flex-1 min-w-0">Team Size</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground flex-shrink-0 ml-2" />
          </CardHeader>
          <CardContent>
            <div className="text-xl sm:text-2xl font-bold">{overview.totalMembers}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {overview.activeMembers} active members
            </p>
            <Progress 
              value={overview.totalMembers > 0 ? (overview.activeMembers / overview.totalMembers) * 100 : 0} 
              className="mt-2"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium truncate flex-1 min-w-0">Average Productivity</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground flex-shrink-0 ml-2" />
          </CardHeader>
          <CardContent>
            <div className="text-xl sm:text-2xl font-bold">
              {overview.averageProductivity.toFixed(1)}%
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Team productivity score
            </p>
            <Progress value={overview.averageProductivity} className="mt-2" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium truncate flex-1 min-w-0">Total Hours</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground flex-shrink-0 ml-2" />
          </CardHeader>
          <CardContent>
            <div className="text-xl sm:text-2xl font-bold break-words">
              {overview.totalHoursLogged.toFixed(0)}h
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
              {overview.totalTasksCompleted}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Total completed tasks
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Department Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base sm:text-lg">Team by Department</CardTitle>
            <CardDescription className="text-xs sm:text-sm">Distribution of team members across departments</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={departmentPieData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, value, percent }) => `${name}: ${value} (${(percent * 100).toFixed(0)}%)`}
                  outerRadius={60}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {departmentPieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => [`${value} members`, 'Count']} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Department Productivity */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base sm:text-lg">Productivity by Department</CardTitle>
            <CardDescription className="text-xs sm:text-sm">Average productivity and workload by department</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={productivityData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip formatter={(value) => [`${value}%`, 'Percentage']} />
                <Bar dataKey="productivity" fill="#00C49F" name="Productivity" />
                <Bar dataKey="workload" fill="#FFBB28" name="Workload" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Department Size vs Productivity */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base sm:text-lg">Department Size vs Productivity</CardTitle>
            <CardDescription className="text-xs sm:text-sm">Team size and productivity correlation</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={departmentData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis yAxisId="left" tick={{ fontSize: 10 }} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar yAxisId="left" dataKey="members" fill="#8884d8" name="Members" />
                <Bar yAxisId="right" dataKey="productivity" fill="#82ca9d" name="Productivity %" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Workload Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base sm:text-lg">Workload Distribution</CardTitle>
            <CardDescription className="text-xs sm:text-sm">Average workload across departments</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={productivityData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip formatter={(value) => [`${value}%`, 'Workload']} />
                <Area 
                  type="monotone" 
                  dataKey="workload" 
                  stroke="#FF8042" 
                  fill="#FF8042" 
                  fillOpacity={0.3}
                  name="Workload %"
                />
              </AreaChart>
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

      {/* Department Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base sm:text-lg">Department Performance</CardTitle>
          <CardDescription className="text-xs sm:text-sm">Detailed performance metrics by department</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {departmentBreakdown.map((dept, index) => (
              <div key={dept.department} className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 border rounded-lg gap-4">
                <div className="flex-1 min-w-0 w-full sm:w-auto">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center space-y-2 sm:space-y-0 sm:space-x-3 flex-wrap gap-2">
                    <div className="flex items-center space-x-2">
                      <div 
                        className="w-3 h-3 sm:w-4 sm:h-4 rounded-full flex-shrink-0" 
                        style={{ backgroundColor: COLORS[index % COLORS.length] }}
                      />
                      <h3 className="font-semibold text-sm sm:text-base truncate">{dept.department}</h3>
                    </div>
                    <Badge variant="outline" className="flex-shrink-0">{dept.members} members</Badge>
                  </div>
                  <div className="mt-2 space-y-2">
                    <div>
                      <div className="flex items-center justify-between text-xs sm:text-sm mb-1">
                        <span>Productivity</span>
                        <span className="flex-shrink-0 ml-2">{dept.averageProductivity.toFixed(1)}%</span>
                      </div>
                      <Progress value={dept.averageProductivity} className="h-2" />
                    </div>
                    <div>
                      <div className="flex items-center justify-between text-xs sm:text-sm mb-1">
                        <span>Workload</span>
                        <span className="flex-shrink-0 ml-2">{dept.averageWorkload.toFixed(1)}%</span>
                      </div>
                      <Progress value={dept.averageWorkload} className="h-2" />
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
