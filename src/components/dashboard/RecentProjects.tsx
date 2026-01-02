'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { formatToTitleCase } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { useDateTime } from '@/components/providers/DateTimeProvider'
import { Progress } from '@/components/ui/Progress'
import { Calendar, Users, ArrowRight, Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'

interface RecentProjectsProps {
  projects?: any[]
  isLoading?: boolean
}

const getStatusColor = (status: string) => {
  switch (status) {
    case 'active':
      return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 hover:bg-green-100 dark:hover:bg-green-900'
    case 'planning':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 hover:bg-blue-100 dark:hover:bg-blue-900'
    case 'on_hold':
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200 hover:bg-yellow-100 dark:hover:bg-yellow-900'
    case 'completed':
      return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-900'
    case 'cancelled':
      return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 hover:bg-red-100 dark:hover:bg-red-900'
    default:
      return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-900'
  }
}

export function RecentProjects({ projects, isLoading }: RecentProjectsProps) {
  const router = useRouter()
  const { formatDate } = useDateTime()

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Recent Projects</CardTitle>
            <div className="h-8 w-20 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="border rounded-lg p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <div className="h-5 w-32 bg-gray-200 dark:bg-gray-700 rounded animate-pulse mb-2" />
                    <div className="h-4 w-48 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                  </div>
                  <div className="flex space-x-2">
                    <div className="h-6 w-16 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                    <div className="h-6 w-16 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="h-4 w-24 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                  <div className="h-2 w-full bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!projects || projects.length === 0) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Recent Projects</CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push('/projects')}
            >
              View All
              <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <p className="text-muted-foreground">No projects found</p>
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => router.push('/projects/create')}
            >
              Create Your First Project
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="overflow-x-hidden">
      <CardHeader className="p-4 sm:p-6">
        <div className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-base sm:text-lg truncate">Recent Projects</CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push('/projects')}
            className="flex-shrink-0"
          >
            View All
            <ArrowRight className="h-3 w-3 sm:h-4 sm:w-4 ml-1" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-4 sm:p-6 pt-0">
        <div className="space-y-3 sm:space-y-4">
          {projects.map((project) => (
            <div
              key={project._id}
              className="border rounded-lg p-3 sm:p-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors cursor-pointer overflow-x-hidden"
              onClick={() => router.push(`/projects/${project._id}`)}
            >
              <div className="flex flex-col sm:flex-row items-start sm:items-start justify-between gap-3 sm:gap-0 mb-3">
                <div className="flex-1 min-w-0">
                  <h3
                    className="text-sm sm:text-base font-semibold text-gray-900 dark:text-white truncate"
                    title={project.name}
                  >
                    {project.name}
                  </h3>
                  <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-1 break-words line-clamp-2">
                    {project.description || 'No description available'}
                  </p>
                </div>
                <div className="flex flex-shrink-0">
                  <Badge className={`${getStatusColor(project.status)} text-xs`}>
                    {formatToTitleCase(project.status)}
                  </Badge>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs sm:text-sm">
                  <span className="text-gray-600 dark:text-gray-400">Progress</span>
                  <span className="font-medium">{project.progress || 0}%</span>
                </div>
                <Progress value={project.progress || 0} className="h-2" />
              </div>

              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-0 mt-3 text-xs sm:text-sm text-gray-600 dark:text-gray-400">
                <div className="flex flex-wrap items-center gap-2 sm:gap-4">
                  {project.endDate && (
                    <div className="flex items-center whitespace-nowrap">
                      <Calendar className="h-3 w-3 sm:h-4 sm:w-4 mr-1 flex-shrink-0" />
                      <span className="truncate">{formatDate(project.endDate)}</span>
                    </div>
                  )}
                  <div className="flex items-center whitespace-nowrap">
                    <Users className="h-3 w-3 sm:h-4 sm:w-4 mr-1 flex-shrink-0" />
                    <span>{project.teamMembers?.length || 0} members</span>
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => router.push(`/projects/${project._id}`)} className="w-full sm:w-auto flex-shrink-0">
                  View Details
                </Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
