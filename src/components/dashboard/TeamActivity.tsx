'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { GravatarAvatar } from '@/components/ui/GravatarAvatar'
import { Button } from '@/components/ui/Button'
import { CheckCircle, Plus, MessageSquare, Timer, ArrowRight, Users, TrendingUp } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'

interface TeamActivityProps {
  activities?: any[]
  isLoading?: boolean
}

/* Color-coded activity dot colors (matching mockup) */
const ACTION_DOT_COLORS: Record<string, string> = {
  completed: 'var(--apple-system-blue)',
  created:   'var(--apple-system-green)',
  started:   'var(--apple-system-green)',
  commented: 'var(--apple-system-orange)',
  logged:    'var(--apple-system-purple)',
  updated:   'var(--apple-system-teal)',
  deadline:  'var(--apple-system-red)',
}

const getActionDotColor = (action: string) => ACTION_DOT_COLORS[action] || 'var(--apple-system-gray)'

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
    case 'created':   return 'created'
    case 'started':   return 'started'
    case 'commented': return 'commented on'
    case 'logged':    return 'logged time for'
    case 'updated':   return 'updated'
    default:          return action
  }
}

export function TeamActivity({ activities, isLoading }: TeamActivityProps) {
  const router = useRouter()

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="h-4 w-28 bg-[var(--apple-tertiary-fill)] rounded animate-pulse" />
            <div className="h-4 w-24 bg-[var(--apple-tertiary-fill)] rounded animate-pulse" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-1">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center gap-3 px-3 py-2.5">
                <div className="h-3 w-3 rounded-full bg-[var(--apple-tertiary-fill)] animate-pulse flex-shrink-0" />
                <div className="h-4 w-48 bg-[var(--apple-tertiary-fill)] rounded animate-pulse flex-1" />
                <div className="h-3 w-12 bg-[var(--apple-tertiary-fill)] rounded animate-pulse" />
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
            <CardTitle>Recent Activity</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => router.push('/projects')}>
              View Projects <ArrowRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-center py-10">
            <Users className="h-8 w-8 text-[var(--apple-tertiary-label)] mx-auto mb-3" />
            <p className="text-sm font-medium text-[var(--apple-label)] mb-1">No recent activity</p>
            <p className="text-xs text-[var(--apple-secondary-label)]">Team activity will appear here as members work on projects and tasks.</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="overflow-x-hidden">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Recent Activity</CardTitle>
          <button
            onClick={() => router.push('/activity')}
            className="text-sm text-[var(--apple-system-blue)] hover:opacity-80 apple-transition flex items-center gap-1"
          >
            View all activity <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-0 -mx-1 px-1">
          {activities.map((activity, index) => (
            <div
              key={activity.id || index}
              className="flex items-start gap-3 px-3 py-2.5 rounded-[var(--apple-radius-md)] hover:bg-[var(--apple-quaternary-fill)] apple-transition overflow-x-hidden"
            >
              {/* Colored activity dot (matching mockup) */}
              <div className="flex-shrink-0 mt-1.5">
                <div
                  className="h-3 w-3 rounded-full"
                  style={{ backgroundColor: getActionDotColor(activity.action) }}
                />
              </div>

              {/* Activity text */}
              <div className="flex-1 min-w-0">
                <p className="text-sm text-[var(--apple-label)] leading-snug">
                  <span className="font-medium">
                    {activity.user?.firstName} {activity.user?.lastName}
                  </span>{' '}
                  <span className="text-[var(--apple-secondary-label)]">{getActionText(activity.action)}</span>{' '}
                  <span className="font-medium truncate">
                    {activity.target ? `"${activity.target}"` : ''}
                  </span>
                </p>
                {(activity.project) && (
                  <p className="text-[11px] text-[var(--apple-secondary-label)] mt-0.5 truncate">
                    {activity.project}
                  </p>
                )}
              </div>

              {/* Timestamp — right-aligned */}
              <span className="text-[11px] text-[var(--apple-secondary-label)] whitespace-nowrap flex-shrink-0 mt-0.5">
                {formatTimestamp(activity.timestamp)}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
