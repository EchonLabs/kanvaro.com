'use client'

import React, { useEffect, useState, useCallback } from 'react'
import {
  MessageSquare,
  Plus,
  Edit,
  ArrowRightLeft,
  UserPlus,
  UserMinus,
  Paperclip,
  Calendar,
  Tag,
  FileText,
  Hash,
  Clock,
  Layers,
  BookOpen,
  Target,
  Type,
  AlertCircle,
  Loader2
} from 'lucide-react'
import { GravatarAvatar } from '@/components/ui/GravatarAvatar'

interface ActivityUser {
  _id: string
  firstName?: string
  lastName?: string
  email?: string
  avatar?: string
}

interface Activity {
  _id: string
  task: string
  user: ActivityUser
  action: string
  field?: string
  oldValue?: string
  newValue?: string
  metadata?: Record<string, any>
  createdAt: string
}

function getInitials(user: ActivityUser): string {
  const first = user.firstName?.charAt(0) || ''
  const last = user.lastName?.charAt(0) || ''
  return (first + last).toUpperCase() || user.email?.charAt(0)?.toUpperCase() || '?'
}

function getUserName(user: ActivityUser): string {
  if (user.firstName || user.lastName) {
    return `${user.firstName || ''} ${user.lastName || ''}`.trim()
  }
  return user.email || 'Unknown User'
}

function getActionIcon(action: string) {
  const iconClass = 'h-3.5 w-3.5'
  switch (action) {
    case 'created': return <Plus className={iconClass} />
    case 'status_changed': return <ArrowRightLeft className={iconClass} />
    case 'priority_changed': return <AlertCircle className={iconClass} />
    case 'assigned': return <UserPlus className={iconClass} />
    case 'unassigned': return <UserMinus className={iconClass} />
    case 'comment_added': return <MessageSquare className={iconClass} />
    case 'comment_updated': return <Edit className={iconClass} />
    case 'comment_deleted': return <MessageSquare className={iconClass} />
    case 'attachment_added':
    case 'attachment_removed': return <Paperclip className={iconClass} />
    case 'due_date_changed': return <Calendar className={iconClass} />
    case 'labels_changed': return <Tag className={iconClass} />
    case 'type_changed': return <Type className={iconClass} />
    case 'title_changed': return <FileText className={iconClass} />
    case 'description_changed': return <FileText className={iconClass} />
    case 'story_points_changed': return <Hash className={iconClass} />
    case 'estimated_hours_changed': return <Clock className={iconClass} />
    case 'sprint_changed': return <Layers className={iconClass} />
    case 'story_changed': return <BookOpen className={iconClass} />
    case 'epic_changed': return <Target className={iconClass} />
    case 'subtask_added':
    case 'subtask_removed':
    case 'subtask_updated': return <Layers className={iconClass} />
    default: return <Edit className={iconClass} />
  }
}

function getActionColor(action: string): string {
  switch (action) {
    case 'created': return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
    case 'status_changed': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
    case 'priority_changed': return 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'
    case 'assigned':
    case 'unassigned': return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
    case 'comment_added':
    case 'comment_updated':
    case 'comment_deleted': return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
    default: return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400'
  }
}

function formatActivityDate(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`

  return date.toLocaleDateString('en-US', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }) + ' ' + date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  })
}

function getStatusBadge(value: string) {
  return (
    <span className="inline-flex items-center rounded-full bg-neutral-800 px-2.5 py-0.5 text-xs font-medium text-white capitalize">
      {value.replace(/_/g, ' ')}
    </span>
  )
}

function getActivityDescription(activity: Activity): React.ReactNode {
  const userName = getUserName(activity.user)

  switch (activity.action) {
    case 'created':
      return (
        <span>
          Task is created by <strong>{userName}</strong> {activity.newValue && getStatusBadge(activity.newValue)}
        </span>
      )
    case 'status_changed':
      return (
        <span>
          Status changed{' '}
          {activity.oldValue && <>{getStatusBadge(activity.oldValue)} → </>}
          {activity.newValue && getStatusBadge(activity.newValue)}{' '}
          by <strong>{userName}</strong>
        </span>
      )
    case 'priority_changed':
      return (
        <span>
          Priority changed{' '}
          {activity.oldValue && <><span className="font-medium capitalize">{activity.oldValue}</span> → </>}
          {activity.newValue && <span className="font-medium capitalize">{activity.newValue}</span>}{' '}
          by <strong>{userName}</strong>
        </span>
      )
    case 'assigned':
      return (
        <span>
          Member assigned by <strong>{userName}</strong>
        </span>
      )
    case 'unassigned':
      return (
        <span>
          Member unassigned by <strong>{userName}</strong>
        </span>
      )
    case 'comment_added':
      return (
        <span>
          Comment added by <strong>{userName}</strong>
        </span>
      )
    case 'comment_updated':
      return (
        <span>
          Comment updated by <strong>{userName}</strong>
        </span>
      )
    case 'comment_deleted':
      return (
        <span>
          Comment deleted by <strong>{userName}</strong>
        </span>
      )
    case 'title_changed':
      return (
        <span>
          Title updated by <strong>{userName}</strong>
        </span>
      )
    case 'description_changed':
      return (
        <span>
          Description updated by <strong>{userName}</strong>
        </span>
      )
    case 'due_date_changed':
      return (
        <span>
          Due date changed by <strong>{userName}</strong>
        </span>
      )
    case 'type_changed':
      return (
        <span>
          Type changed{' '}
          {activity.oldValue && <><span className="font-medium capitalize">{activity.oldValue}</span> → </>}
          {activity.newValue && <span className="font-medium capitalize">{activity.newValue}</span>}{' '}
          by <strong>{userName}</strong>
        </span>
      )
    case 'labels_changed':
      return (
        <span>
          Labels updated by <strong>{userName}</strong>
        </span>
      )
    case 'sprint_changed':
      return (
        <span>
          Sprint changed by <strong>{userName}</strong>
        </span>
      )
    case 'story_points_changed':
      return (
        <span>
          Story points changed{' '}
          {activity.oldValue && <><span className="font-medium">{activity.oldValue}</span> → </>}
          {activity.newValue && <span className="font-medium">{activity.newValue}</span>}{' '}
          by <strong>{userName}</strong>
        </span>
      )
    case 'estimated_hours_changed':
      return (
        <span>
          Estimated hours changed{' '}
          {activity.oldValue && <><span className="font-medium">{activity.oldValue}h</span> → </>}
          {activity.newValue && <span className="font-medium">{activity.newValue}h</span>}{' '}
          by <strong>{userName}</strong>
        </span>
      )
    default:
      return (
        <span>
          Task details are updated by <strong>{userName}</strong>{' '}
          {activity.field && getStatusBadge(activity.field)}
        </span>
      )
  }
}

interface TaskActivityLogProps {
  taskId: string
}

export default function TaskActivityLog({ taskId }: TaskActivityLogProps) {
  const [activities, setActivities] = useState<Activity[]>([])
  const [loading, setLoading] = useState(true)
  const [hasMore, setHasMore] = useState(false)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)

  const fetchActivities = useCallback(async (cursor?: string) => {
    try {
      const params = new URLSearchParams({ limit: '20' })
      if (cursor) params.set('cursor', cursor)

      const res = await fetch(`/api/tasks/${taskId}/activities?${params}`)
      if (!res.ok) return

      const json = await res.json()
      if (json.success) {
        if (cursor) {
          setActivities(prev => [...prev, ...json.data])
        } else {
          setActivities(json.data)
        }
        setHasMore(json.hasMore)
        setNextCursor(json.nextCursor)
      }
    } catch (error) {
      console.error('Failed to fetch activities:', error)
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [taskId])

  useEffect(() => {
    fetchActivities()
  }, [fetchActivities])

  const loadMore = () => {
    if (!nextCursor || loadingMore) return
    setLoadingMore(true)
    fetchActivities(nextCursor)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (activities.length === 0) {
    return (
      <div className="py-6 text-center text-sm text-muted-foreground">
        No activity yet
      </div>
    )
  }

  return (
    <div className="space-y-0">
      <div className="relative">
        {/* Timeline line */}
        <div className="absolute left-[17px] top-0 bottom-0 w-0.5 bg-border" />

        {activities.map((activity, index) => (
          <div key={activity._id} className="relative flex gap-3 pb-6 last:pb-0">
            {/* Avatar */}
            <div className="relative z-10 flex-shrink-0">
              <GravatarAvatar
                user={{
                  avatar: activity.user.avatar,
                  firstName: activity.user.firstName,
                  lastName: activity.user.lastName,
                  email: activity.user.email
                }}
                size={36}
                className="border-2 border-background"
              />
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0 pt-0.5">
              <div className="text-sm leading-relaxed">
                {getActivityDescription(activity)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {formatActivityDate(activity.createdAt)}
              </p>
            </div>
          </div>
        ))}
      </div>

      {hasMore && (
        <button
          onClick={loadMore}
          disabled={loadingMore}
          className="mt-4 w-full text-center text-sm text-primary hover:underline disabled:opacity-50"
        >
          {loadingMore ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Loading...
            </span>
          ) : (
            'Load more activity'
          )}
        </button>
      )}
    </div>
  )
}
