'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { formatToTitleCase } from '@/lib/utils'
import { Calendar, User, ArrowRight, CheckCircle } from 'lucide-react'
import { useRouter } from 'next/navigation'

interface RecentTasksProps {
  tasks?: any[]
  isLoading?: boolean
  onTaskUpdate?: () => void
}

const getStatusColor = (status: string) => {
  switch (status) {
    case 'todo':
      return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-900'
    case 'in_progress':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 hover:bg-blue-100 dark:hover:bg-blue-900'
    case 'review':
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200 hover:bg-yellow-100 dark:hover:bg-yellow-900'
    case 'testing':
      return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200 hover:bg-purple-100 dark:hover:bg-purple-900'
    case 'done':
      return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 hover:bg-green-100 dark:hover:bg-green-900'
    case 'cancelled':
      return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 hover:bg-red-100 dark:hover:bg-red-900'
    default:
      return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-900'
  }
}

const getPriorityColor = (priority: string) => {
  switch (priority) {
    case 'critical':
      return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 hover:bg-red-100 dark:hover:bg-red-900'
    case 'high':
      return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200 hover:bg-orange-100 dark:hover:bg-orange-900'
    case 'medium':
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200 hover:bg-yellow-100 dark:hover:bg-yellow-900'
    case 'low':
      return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 hover:bg-green-100 dark:hover:bg-green-900'
    default:
      return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-900'
  }
}

export function RecentTasks({ tasks, isLoading, onTaskUpdate }: RecentTasksProps) {
  const router = useRouter()
  const { showToast } = useToast()
  // Selection controls removed per request; tasks are view-only here.

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Recent Tasks</CardTitle>
            <div className="h-8 w-20 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center space-x-3 p-3 border rounded-lg">
                <div className="h-4 w-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-2 mb-1">
                    <div className="h-4 w-32 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                    <div className="h-5 w-16 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                    <div className="h-5 w-16 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                  </div>
                  <div className="flex items-center space-x-4">
                    <div className="h-3 w-20 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                    <div className="h-3 w-16 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                    <div className="h-3 w-16 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                  </div>
                </div>
                <div className="h-8 w-12 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!tasks || tasks.length === 0) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Recent Tasks</CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push('/tasks')}
            >
              View All
              <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <p className="text-muted-foreground">No tasks found</p>
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => router.push('/tasks/create')}
            >
              Create Your First Task
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="overflow-x-hidden">
      <CardHeader className="p-4 sm:p-6">
        <div className="flex flex-col space-y-1.5">
          <div className="flex flex-row items-center justify-between gap-2">
            <CardTitle className="text-base sm:text-lg truncate">Recent Tasks</CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                router.push('/tasks')
              }}
              className="flex-shrink-0"
            >
              View All
              <ArrowRight className="h-3 w-3 sm:h-4 sm:w-4 ml-1" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-4 sm:p-6 pt-0">
        <div className="space-y-2 sm:space-y-3">
          {tasks.map((task) => (
            <div
              key={task._id}
              className="flex items-start sm:items-center gap-3 p-3 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors overflow-x-hidden"
            >
              <div className="flex-1 min-w-0">
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-1 min-w-0">
                  <h4
                    className={`text-xs sm:text-sm font-medium truncate ${task.status === 'done' ? 'line-through text-gray-500' : 'text-gray-900 dark:text-white'}`}
                    title={task.title}
                  >
                    {task.title}
                  </h4>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Badge className={`${getStatusColor(task.status)} text-xs whitespace-nowrap`}>
                      {formatToTitleCase(task.status)}
                    </Badge>
                    <Badge className={`${getPriorityColor(task.priority)} text-xs whitespace-nowrap`}>
                      {formatToTitleCase(task.priority)}
                    </Badge>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-xs text-gray-600 dark:text-gray-400">
                  <span
                    className="font-medium truncate"
                    title={task.project?.name}
                  >
                    {task.project?.name || 'No Project'}
                  </span>
                  {task.assignedTo && (
                    <div className="flex items-center whitespace-nowrap">
                      <User className="h-3 w-3 mr-1 flex-shrink-0" />
                      <span className="truncate">{task.assignedTo.firstName} {task.assignedTo.lastName}</span>
                    </div>
                  )}
                  {task.dueDate && (
                    <div className="flex items-center whitespace-nowrap">
                      <Calendar className="h-3 w-3 mr-1 flex-shrink-0" />
                      <span className="truncate">{new Date(task.dueDate).toLocaleDateString()}</span>
                    </div>
                  )}
                </div>
              </div>

              <Button 
                variant="ghost" 
                size="sm" 
                className="flex-shrink-0 hidden sm:inline-flex"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  router.push(`/tasks/${task._id}`)
                }}
              >
                View
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
