'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useDateTime } from '@/components/providers/DateTimeProvider'
import { 
  BarChart3, 
  TrendingUp, 
  Clock, 
  Target, 
  Users, 
  Calendar,
  CheckCircle,
  AlertTriangle,
  Play,
  Pause,
  XCircle,
  Loader2,
  Download,
  RefreshCw
} from 'lucide-react'

interface Task {
  _id: string
  title: string
  description: string
  status: 'todo' | 'in_progress' | 'review' | 'testing' | 'done' | 'cancelled'
  priority: 'low' | 'medium' | 'high' | 'critical'
  type: 'bug' | 'feature' | 'improvement' | 'task' | 'subtask'
  assignedTo?: {
    firstName: string
    lastName: string
    email: string
  }
  createdBy: {
    firstName: string
    lastName: string
    email: string
  }
  storyPoints?: number
  dueDate?: string
  estimatedHours?: number
  actualHours?: number
  labels: string[]
  createdAt: string
  updatedAt: string
}

interface ReportsViewProps {
  projectId: string
}

export default function ReportsView({ projectId }: ReportsViewProps) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [timeRange, setTimeRange] = useState('30d')
  const { formatDate } = useDateTime()

  useEffect(() => {
    fetchTasks()
  }, [projectId])

  const fetchTasks = async () => {
    try {
      setLoading(true)
      const url = projectId === 'all' ? '/api/tasks' : `/api/tasks?project=${projectId}`
      const response = await fetch(url)
      const data = await response.json()

      if (data.success) {
        setTasks(data.data)
      } else {
        setError(data.error || 'Failed to fetch tasks')
      }
    } catch (err) {
      setError('Failed to fetch tasks')
    } finally {
      setLoading(false)
    }
  }

  const getTaskStats = () => {
    const totalTasks = tasks.length
    const completedTasks = tasks.filter(task => task.status === 'done').length
    const inProgressTasks = tasks.filter(task => task.status === 'in_progress').length
    const todoTasks = tasks.filter(task => task.status === 'todo').length
    const cancelledTasks = tasks.filter(task => task.status === 'cancelled').length

    const totalStoryPoints = tasks.reduce((sum, task) => sum + (task.storyPoints || 0), 0)
    const completedStoryPoints = tasks
      .filter(task => task.status === 'done')
      .reduce((sum, task) => sum + (task.storyPoints || 0), 0)

    const totalEstimatedHours = tasks.reduce((sum, task) => sum + (task.estimatedHours || 0), 0)
    const totalActualHours = tasks.reduce((sum, task) => sum + (task.actualHours || 0), 0)

    const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0
    const storyPointsCompletion = totalStoryPoints > 0 ? Math.round((completedStoryPoints / totalStoryPoints) * 100) : 0

    return {
      totalTasks,
      completedTasks,
      inProgressTasks,
      todoTasks,
      cancelledTasks,
      totalStoryPoints,
      completedStoryPoints,
      totalEstimatedHours,
      totalActualHours,
      completionRate,
      storyPointsCompletion
    }
  }

  const getTasksByType = () => {
    const types = ['feature', 'bug', 'improvement', 'task', 'subtask']
    return types.map(type => ({
      type,
      count: tasks.filter(task => task.type === type).length,
      percentage: tasks.length > 0 ? Math.round((tasks.filter(task => task.type === type).length / tasks.length) * 100) : 0
    }))
  }

  const getTasksByPriority = () => {
    const priorities = ['critical', 'high', 'medium', 'low']
    return priorities.map(priority => ({
      priority,
      count: tasks.filter(task => task.priority === priority).length,
      percentage: tasks.length > 0 ? Math.round((tasks.filter(task => task.priority === priority).length / tasks.length) * 100) : 0
    }))
  }

  const getTasksByStatus = () => {
    const statuses = ['todo', 'in_progress', 'review', 'testing', 'done', 'cancelled']
    return statuses.map(status => ({
      status,
      count: tasks.filter(task => task.status === status).length,
      percentage: tasks.length > 0 ? Math.round((tasks.filter(task => task.status === status).length / tasks.length) * 100) : 0
    }))
  }

  const getVelocityData = () => {
    // This would typically come from sprint data
    // For now, we'll simulate some velocity data
    const weeks = ['Week 1', 'Week 2', 'Week 3', 'Week 4']
    const completedStoryPoints = [8, 12, 10, 15]
    const plannedStoryPoints = [10, 12, 12, 15]

    return {
      weeks,
      completedStoryPoints,
      plannedStoryPoints
    }
  }

  const getOverdueTasks = () => {
    const now = new Date()
    return tasks.filter(task => {
      if (!task.dueDate || task.status === 'done' || task.status === 'cancelled') return false
      return new Date(task.dueDate) < now
    })
  }

  const getUpcomingDeadlines = () => {
    const now = new Date()
    const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
    
    return tasks.filter(task => {
      if (!task.dueDate || task.status === 'done' || task.status === 'cancelled') return false
      const dueDate = new Date(task.dueDate)
      return dueDate >= now && dueDate <= nextWeek
    })
  }

  const stats = getTaskStats()
  const tasksByType = getTasksByType()
  const tasksByPriority = getTasksByPriority()
  const tasksByStatus = getTasksByStatus()
  const velocityData = getVelocityData()
  const overdueTasks = getOverdueTasks()
  const upcomingDeadlines = getUpcomingDeadlines()

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-muted-foreground">Loading reports...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Reports & Analytics</h3>
          <p className="text-sm text-muted-foreground">
            Project performance insights and metrics
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="90d">Last 90 days</SelectItem>
              <SelectItem value="1y">Last year</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={fetchTasks}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button variant="outline" size="sm">
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Key Metrics */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg">
                <Target className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Tasks</p>
                <p className="text-2xl font-bold text-foreground">{stats.totalTasks}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <div className="p-2 bg-green-100 dark:bg-green-900 rounded-lg">
                <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Completed</p>
                <p className="text-2xl font-bold text-foreground">{stats.completedTasks}</p>
                <p className="text-xs text-muted-foreground">{stats.completionRate}% completion rate</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <div className="p-2 bg-purple-100 dark:bg-purple-900 rounded-lg">
                <BarChart3 className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Story Points</p>
                <p className="text-2xl font-bold text-foreground">
                  {stats.completedStoryPoints}/{stats.totalStoryPoints}
                </p>
                <p className="text-xs text-muted-foreground">{stats.storyPointsCompletion}% completed</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <div className="p-2 bg-orange-100 dark:bg-orange-900 rounded-lg">
                <Clock className="h-5 w-5 text-orange-600 dark:text-orange-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Time Tracking</p>
                <p className="text-2xl font-bold text-foreground">
                  {stats.totalActualHours}h/{stats.totalEstimatedHours}h
                </p>
                <p className="text-xs text-muted-foreground">actual/estimated</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Tasks by Status */}
        <Card>
          <CardHeader>
            <CardTitle>Tasks by Status</CardTitle>
            <CardDescription>Distribution of tasks across different statuses</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {tasksByStatus.map(({ status, count, percentage }) => (
                <div key={status} className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <div className="w-3 h-3 rounded-full bg-gray-300" />
                    <span className="text-sm font-medium capitalize">{status.replace('_', ' ')}</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="text-sm text-muted-foreground">{count} tasks</span>
                    <Badge variant="secondary">{percentage}%</Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Tasks by Type */}
        <Card>
          <CardHeader>
            <CardTitle>Tasks by Type</CardTitle>
            <CardDescription>Breakdown of tasks by type</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {tasksByType.map(({ type, count, percentage }) => (
                <div key={type} className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <div className="w-3 h-3 rounded-full bg-gray-300" />
                    <span className="text-sm font-medium capitalize">{type}</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="text-sm text-muted-foreground">{count} tasks</span>
                    <Badge variant="secondary">{percentage}%</Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Overdue Tasks */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              <span>Overdue Tasks</span>
            </CardTitle>
            <CardDescription>Tasks that are past their due date</CardDescription>
          </CardHeader>
          <CardContent>
            {overdueTasks.length > 0 ? (
              <div className="space-y-2">
                {overdueTasks.slice(0, 5).map(task => (
                  <div key={task._id} className="flex items-center justify-between p-2 bg-red-50 dark:bg-red-900/20 rounded">
                    <div>
                      <p className="text-sm font-medium">{task.title}</p>
                      <p className="text-xs text-muted-foreground">
                        Due {formatDate(task.dueDate!)}
                      </p>
                    </div>
                    <Badge variant="destructive">Overdue</Badge>
                  </div>
                ))}
                {overdueTasks.length > 5 && (
                  <p className="text-xs text-muted-foreground text-center">
                    +{overdueTasks.length - 5} more overdue tasks
                  </p>
                )}
              </div>
            ) : (
              <div className="text-center py-4">
                <CheckCircle className="h-8 w-8 mx-auto mb-2 text-green-500" />
                <p className="text-sm text-muted-foreground">No overdue tasks</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Upcoming Deadlines */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Calendar className="h-5 w-5 text-blue-500" />
              <span>Upcoming Deadlines</span>
            </CardTitle>
            <CardDescription>Tasks due in the next 7 days</CardDescription>
          </CardHeader>
          <CardContent>
            {upcomingDeadlines.length > 0 ? (
              <div className="space-y-2">
                {upcomingDeadlines.slice(0, 5).map(task => (
                  <div key={task._id} className="flex items-center justify-between p-2 bg-blue-50 dark:bg-blue-900/20 rounded">
                    <div>
                      <p className="text-sm font-medium">{task.title}</p>
                      <p className="text-xs text-muted-foreground">
                        Due {formatDate(task.dueDate!)}
                      </p>
                    </div>
                    <Badge variant="outline">Due Soon</Badge>
                  </div>
                ))}
                {upcomingDeadlines.length > 5 && (
                  <p className="text-xs text-muted-foreground text-center">
                    +{upcomingDeadlines.length - 5} more tasks due soon
                  </p>
                )}
              </div>
            ) : (
              <div className="text-center py-4">
                <Calendar className="h-8 w-8 mx-auto mb-2 text-blue-500" />
                <p className="text-sm text-muted-foreground">No upcoming deadlines</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Velocity Chart Placeholder */}
      <Card>
        <CardHeader>
          <CardTitle>Sprint Velocity</CardTitle>
          <CardDescription>Story points completed per sprint</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <TrendingUp className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground">Velocity chart will be implemented here</p>
            <p className="text-xs text-muted-foreground mt-2">
              This would show sprint velocity data and burndown charts
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
