'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { GravatarAvatar } from '@/components/ui/GravatarAvatar'
import { Button } from '@/components/ui/Button'
import { CheckCircle, Plus, MessageSquare, Timer, ArrowRight, Activity, Users, TrendingUp } from 'lucide-react'
import { useRouter } from 'next/navigation'

interface TeamActivityProps {
  activities?: any[]
  isLoading?: boolean
}

const getActionIcon = (action: string) => {
  if (action === 'completed') return CheckCircle
  if (action === 'created' || action === 'started') return Plus
  if (action === 'commented') return MessageSquare
  if (action === 'logged') return Timer
  return Plus
}

const formatTimestamp = (timestamp: string) => {
  const now = new Date()
  const activityTime = new Date(timestamp)
  const diffInMinutes = Math.floor((now.getTime() - activityTime.getTime()) / (1000 * 60))
  
  if (diffInMinutes < 1) return 'Just now'
  if (diffInMinutes < 60) return `${diffInMinutes}m ago`
  
  const diffInHours = Math.floor(diffInMinutes / 60)
  if (diffInHours < 24) return `${diffInHours}h ago`
  
  const diffInDays = Math.floor(diffInHours / 24)
  if (diffInDays < 7) return `${diffInDays}d ago`
  
  return activityTime.toLocaleDateString()
}

const getActionText = (action: string) => {
  switch (action) {
    case 'completed': return 'completed'
    case 'created': return 'created'
    case 'started': return 'started'
    case 'commented': return 'commented on'
    case 'logged': return 'logged time for'
    case 'updated': return 'updated'
    default: return action
  }
}

export function TeamActivity({ activities, isLoading }: TeamActivityProps) {
  const router = useRouter()

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Team Activity</CardTitle>
            <div className="h-8 w-20 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center space-x-3 p-3 border rounded-lg">
                <div className="h-8 w-8 bg-gray-200 dark:bg-gray-700 rounded-full animate-pulse" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-2 mb-1">
                    <div className="h-4 w-24 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                    <div className="h-4 w-16 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                  </div>
                  <div className="h-3 w-32 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                </div>
                <div className="h-4 w-12 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!activities || activities.length === 0) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Team Activity</CardTitle>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => router.push('/projects')}
            >
              View Projects
              <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <div className="p-3 bg-muted/50 rounded-full w-12 h-12 mx-auto mb-4 flex items-center justify-center">
              <Users className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-2">No recent activity</h3>
            <p className="text-muted-foreground mb-4">Team activity will appear here as members work on projects and tasks.</p>
            <Button onClick={() => router.push('/projects')} className="gap-2">
              <TrendingUp className="h-4 w-4" />
              View Projects
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="overflow-x-hidden">
      <CardHeader className="p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-0">
          <CardTitle className="text-base sm:text-lg truncate">Team Activity</CardTitle>
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => router.push('/activity')}
            className="w-full sm:w-auto flex-shrink-0"
          >
            View All
            <ArrowRight className="h-3 w-3 sm:h-4 sm:w-4 ml-1" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-4 sm:p-6 pt-0">
        <div className="space-y-2 sm:space-y-3">
          {activities.map((activity, index) => {
            const ActionIcon = getActionIcon(activity.action)
            
            return (
              <div 
                key={activity.id} 
                className="flex items-start sm:items-center gap-3 p-3 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors overflow-x-hidden"
              >
                <div className="relative flex-shrink-0">
                  <GravatarAvatar 
                    user={{
                      avatar: activity.user.avatar,
                      firstName: activity.user.firstName || activity.user.name?.split(' ')[0] || 'User',
                      lastName: activity.user.lastName || activity.user.name?.split(' ')[1] || '',
                      email: activity.user.email || `${activity.user.name?.toLowerCase().replace(' ', '.')}@example.com`
                    }}
                    size={32}
                    className="h-7 w-7 sm:h-8 sm:w-8"
                  />
                  <div className="absolute -bottom-1 -right-1 p-0.5 sm:p-1 bg-background border border-border rounded-full">
                    <ActionIcon className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-muted-foreground" />
                  </div>
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-1 sm:gap-2 mb-1">
                    <span className="text-xs sm:text-sm font-medium text-foreground truncate">
                      {activity.user.firstName} {activity.user.lastName}
                    </span>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {getActionText(activity.action)}
                    </span>
                  </div>
                  
                  <p className="text-xs text-muted-foreground truncate">
                    {activity.target}
                  </p>
                  
                  <div className="flex flex-wrap items-center gap-1 sm:gap-2 mt-1">
                    <span className="text-xs text-muted-foreground truncate">
                      {activity.project}
                    </span>
                    <span className="text-xs text-muted-foreground hidden sm:inline">•</span>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatTimestamp(activity.timestamp)}
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
