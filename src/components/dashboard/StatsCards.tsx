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
    if (minutes === 0) return '0h'
    
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
    
    const days = Math.floor(displayMinutes / (60 * 8)) // 8-hour work days
    const hours = Math.floor((displayMinutes % (60 * 8)) / 60)
    const mins = Math.floor(displayMinutes % 60)
    
    if (days > 0) {
      return `${days}d ${hours}h`
    } else if (hours > 0) {
      return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`
    } else {
      return `${mins}m`
    }
  }

  const formatChange = (change: number, currentValue: number, isDuration: boolean = false) => {
    if (change === 0) {
      return null // Return null to hide change indicator when no change
    }
    
    if (isDuration) {
      const hours = Math.floor(Math.abs(change) / 60)
      const mins = Math.floor(Math.abs(change) % 60)
      const sign = change > 0 ? '+' : '-'
      if (hours > 0) {
        return `${sign}${hours}h ${mins}m`
      }
      return `${sign}${mins}m`
    }
    
    return change > 0 ? `+${change}` : `${change}`
  }

  const getChangeType = (change: number) => {
    if (change === 0) return 'neutral'
    return change > 0 ? 'positive' : 'negative'
  }

  const getChangePercentage = (change: number, lastMonthValue: number) => {
    if (change === 0 || lastMonthValue === 0 || Math.abs(change) < 0.01) return null
    const percentage = Math.round((change / lastMonthValue) * 100)
    // Only show percentage if it's meaningful (at least 1% change)
    return Math.abs(percentage) >= 1 ? `${Math.abs(percentage)}%` : null
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

  // Calculate last month values for percentage calculation
  const lastMonthActiveProjects = stats.activeProjects - changes.activeProjects
  const lastMonthCompletedTasks = stats.completedTasks - changes.completedTasks
  const lastMonthTeamMembers = stats.teamMembers - changes.teamMembers
  const lastMonthHoursTracked = stats.hoursTracked - changes.hoursTracked

  const statsData = [
    {
      title: 'Active Projects',
      value: stats.activeProjects,
      formattedValue: stats.activeProjects.toString(),
      change: formatChange(changes.activeProjects, lastMonthActiveProjects),
      changePercentage: getChangePercentage(changes.activeProjects, lastMonthActiveProjects),
      changeType: getChangeType(changes.activeProjects),
      icon: FolderOpen,
      description: stats.activeProjects === 0 
        ? 'No active projects. Start a new project to begin tracking progress.'
        : stats.activeProjects === 1 
        ? '1 project currently in progress'
        : `${stats.activeProjects} projects currently in progress`,
      emptyMessage: 'No active projects'
    },
    {
      title: 'Completed Tasks',
      value: stats.completedTasks,
      formattedValue: stats.completedTasks.toString(),
      change: formatChange(changes.completedTasks, lastMonthCompletedTasks),
      changePercentage: getChangePercentage(changes.completedTasks, lastMonthCompletedTasks),
      changeType: getChangeType(changes.completedTasks),
      icon: CheckSquare,
      description: stats.completedTasks === 0
        ? 'No tasks completed this month. Keep pushing forward!'
        : stats.completedTasks === 1
        ? '1 task completed this month'
        : `${stats.completedTasks} tasks completed this month`,
      emptyMessage: 'No completed tasks this month'
    },
    {
      title: 'Team Members',
      value: stats.teamMembers,
      formattedValue: stats.teamMembers.toString(),
      change: formatChange(changes.teamMembers, lastMonthTeamMembers),
      changePercentage: getChangePercentage(changes.teamMembers, lastMonthTeamMembers),
      changeType: getChangeType(changes.teamMembers),
      icon: Users,
      description: stats.teamMembers === 0
        ? 'No active team members. Invite members to collaborate.'
        : stats.teamMembers === 1
        ? '1 active team member'
        : `${stats.teamMembers} active team members in your organization`,
      emptyMessage: 'No team members'
    },
    {
      title: 'Hours Tracked',
      value: stats.hoursTracked,
      formattedValue: formatDuration(stats.hoursTracked),
      change: formatChange(changes.hoursTracked, lastMonthHoursTracked, true),
      changePercentage: getChangePercentage(changes.hoursTracked, lastMonthHoursTracked),
      changeType: getChangeType(changes.hoursTracked),
      icon: Clock,
      description: stats.hoursTracked === 0
        ? 'No time logged this month. Start tracking time to see productivity insights.'
        : `Total time logged this month across all projects`,
      emptyMessage: 'No time tracked this month',
      isDuration: true
    }
  ]

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
      {statsData.map((stat, index) => {
        const Icon = stat.icon
        const hasChange = stat.change !== null
        const ChangeIcon = stat.changeType === 'positive' ? TrendingUp : 
                         stat.changeType === 'negative' ? TrendingDown : 
                         TrendingUp
        const isEmpty = stat.value === 0
        
        return (
          <Card key={index} className={`overflow-x-hidden transition-all hover:shadow-md ${isEmpty ? 'opacity-75' : ''}`}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-4 sm:p-6">
              <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground truncate flex-1 min-w-0">
                {stat.title}
              </CardTitle>
              <div className={`p-1.5 sm:p-2 rounded-lg flex-shrink-0 ml-2 ${
                isEmpty 
                  ? 'bg-muted/50' 
                  : index === 0 ? 'bg-blue-100 dark:bg-blue-900/20' :
                    index === 1 ? 'bg-green-100 dark:bg-green-900/20' :
                    index === 2 ? 'bg-purple-100 dark:bg-purple-900/20' :
                    'bg-orange-100 dark:bg-orange-900/20'
              }`}>
                <Icon className={`h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0 ${
                  isEmpty 
                    ? 'text-muted-foreground' 
                    : index === 0 ? 'text-blue-600 dark:text-blue-400' :
                      index === 1 ? 'text-green-600 dark:text-green-400' :
                      index === 2 ? 'text-purple-600 dark:text-purple-400' :
                      'text-orange-600 dark:text-orange-400'
                }`} />
              </div>
            </CardHeader>
            <CardContent className="p-4 sm:p-6 pt-0">
              <div className={`text-2xl sm:text-3xl font-bold break-words mb-2 ${
                isEmpty ? 'text-muted-foreground' : ''
              }`}>
                {stat.formattedValue}
              </div>
              
              {hasChange && (
                <div className="flex items-center space-x-1.5 text-xs mt-2 mb-2 flex-wrap gap-1">
                  <ChangeIcon className={`h-3.5 w-3.5 flex-shrink-0 ${
                    stat.changeType === 'positive' ? 'text-green-600 dark:text-green-400' : 
                    stat.changeType === 'negative' ? 'text-red-600 dark:text-red-400' : 
                    'text-gray-600 dark:text-gray-400'
                  }`} />
                  <span className={`font-medium ${
                    stat.changeType === 'positive' ? 'text-green-600 dark:text-green-400' : 
                    stat.changeType === 'negative' ? 'text-red-600 dark:text-red-400' : 
                    'text-gray-600 dark:text-gray-400'
                  }`}>
                    {stat.change}
                  </span>
                  {stat.changePercentage && (
                    <span className={`font-medium ${
                      stat.changeType === 'positive' ? 'text-green-600 dark:text-green-400' : 
                      stat.changeType === 'negative' ? 'text-red-600 dark:text-red-400' : 
                      'text-gray-600 dark:text-gray-400'
                    }`}>
                      ({stat.changePercentage})
                    </span>
                  )}
                  <span className="text-muted-foreground whitespace-nowrap">vs last month</span>
                </div>
              )}
              
              {!hasChange && stat.value > 0 && (
                <div className="flex items-center space-x-1 text-xs text-muted-foreground mt-2 mb-2">
                  <span>No change from last month</span>
                </div>
              )}
              
              <p className={`text-xs mt-2 break-words leading-relaxed ${
                isEmpty ? 'text-muted-foreground italic' : 'text-muted-foreground'
              }`}>
                {stat.description}
              </p>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
