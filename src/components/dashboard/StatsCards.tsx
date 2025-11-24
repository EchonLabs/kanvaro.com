'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { FolderOpen, CheckSquare, Users, Clock, TrendingUp, TrendingDown, Loader2 } from 'lucide-react'
import { useOrganization } from '@/hooks/useOrganization'
import { applyRoundingRules } from '@/lib/utils'

interface StatsCardsProps {
  stats?: {
    activeProjects: number
    completedTasks: number
    teamMembers: number
    hoursTracked: number
    projectsCount: number
    tasksCount: number
    timeEntriesCount: number
  }
  changes?: {
    activeProjects: number
    completedTasks: number
    teamMembers: number
    hoursTracked: number
  }
  isLoading?: boolean
}

export function StatsCards({ stats, changes, isLoading }: StatsCardsProps) {
  const { organization } = useOrganization()
  
  const formatDuration = (minutes: number) => {
    // Apply rounding rules if enabled
    let displayMinutes = minutes
    const roundingRules = organization?.settings?.timeTracking?.roundingRules
    if (roundingRules?.enabled) {
      displayMinutes = applyRoundingRules(minutes, {
        enabled: roundingRules.enabled,
        increment: roundingRules.increment || 15,
        roundUp: roundingRules.roundUp ?? true
      })
    }
    
    const hours = Math.floor(displayMinutes / 60)
    const mins = Math.floor(displayMinutes % 60)
    return `${hours}h ${mins}m`
  }

  const formatChange = (change: number) => {
    if (change === 0) return '0'
    return change > 0 ? `+${change}` : `${change}`
  }

  const getChangeType = (change: number) => {
    if (change === 0) return 'neutral'
    return change > 0 ? 'positive' : 'negative'
  }

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-4 sm:p-6">
              <div className="h-3 w-20 sm:w-24 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
              <div className="h-3 w-3 sm:h-4 sm:w-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
            </CardHeader>
            <CardContent className="p-4 sm:p-6 pt-0">
              <div className="h-6 w-12 sm:h-8 sm:w-16 bg-gray-200 dark:bg-gray-700 rounded animate-pulse mb-2" />
              <div className="h-3 w-16 sm:h-4 sm:w-20 bg-gray-200 dark:bg-gray-700 rounded animate-pulse mb-1" />
              <div className="h-3 w-24 sm:w-32 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  if (!stats || !changes) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        <Card>
          <CardContent className="p-4 sm:p-6 text-center">
            <p className="text-xs sm:text-sm text-muted-foreground">No data available</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const statsData = [
    {
      title: 'Active Projects',
      value: stats.activeProjects.toString(),
      change: formatChange(changes.activeProjects),
      changeType: getChangeType(changes.activeProjects),
      icon: FolderOpen,
      description: 'Projects in progress'
    },
    {
      title: 'Completed Tasks',
      value: stats.completedTasks.toString(),
      change: formatChange(changes.completedTasks),
      changeType: getChangeType(changes.completedTasks),
      icon: CheckSquare,
      description: 'Tasks completed this month'
    },
    {
      title: 'Team Members',
      value: stats.teamMembers.toString(),
      change: formatChange(changes.teamMembers),
      changeType: getChangeType(changes.teamMembers),
      icon: Users,
      description: 'Active team members'
    },
    {
      title: 'Hours Tracked',
      value: formatDuration(stats.hoursTracked),
      change: formatChange(changes.hoursTracked),
      changeType: getChangeType(changes.hoursTracked),
      icon: Clock,
      description: 'Hours logged this month'
    }
  ]

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
      {statsData.map((stat, index) => {
        const Icon = stat.icon
        const ChangeIcon = stat.changeType === 'positive' ? TrendingUp : 
                         stat.changeType === 'negative' ? TrendingDown : 
                         TrendingUp
        
        return (
          <Card key={index} className="overflow-x-hidden">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-4 sm:p-6">
              <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground truncate flex-1 min-w-0">
                {stat.title}
              </CardTitle>
              <Icon className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground flex-shrink-0 ml-2" />
            </CardHeader>
            <CardContent className="p-4 sm:p-6 pt-0">
              <div className="text-xl sm:text-2xl font-bold break-words">{stat.value}</div>
              <div className="flex items-center space-x-1 text-xs text-muted-foreground mt-1 flex-wrap gap-1">
                <ChangeIcon className="h-3 w-3 flex-shrink-0" />
                <span className={
                  stat.changeType === 'positive' ? 'text-green-600' : 
                  stat.changeType === 'negative' ? 'text-red-600' : 
                  'text-gray-600'
                }>
                  {stat.change}
                </span>
                <span className="whitespace-nowrap">from last month</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1 break-words">
                {stat.description}
              </p>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
