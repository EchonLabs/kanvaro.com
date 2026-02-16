'use client'

import { useState } from 'react'
import { Bell, Check, X, Loader2, ExternalLink } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { useNotifications } from '@/hooks/useNotifications'
import { useRouter } from 'next/navigation'
import { formatDistanceToNow } from 'date-fns'

export function NotificationsWidget() {
  const router = useRouter()
  const { notifications, unreadCount, loading, markAsRead, markAllAsRead, deleteNotification } = useNotifications({
    limit: 10,
    unreadOnly: false,
    autoRefresh: true,
    refreshInterval: 60000 // Refresh every 60 seconds (SSE handles real-time)
  })

  const handleNotificationClick = (notification: any) => {
    // Mark as read
    if (!notification.isRead) {
      markAsRead((notification._id as any).toString())
    }

    // Navigate to URL if available
    if (notification.data?.url) {
      router.push(notification.data.url)
    }
  }

  const handleMarkAllAsRead = async () => {
    await markAllAsRead()
  }

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'time_tracking':
        return '⏱️'
      case 'task':
        return '✓'
      case 'project':
        return '📁'
      case 'team':
        return '👥'
      default:
        return '🔔'
    }
  }

  const getNotificationColor = (priority?: string) => {
    switch (priority) {
      case 'high':
      case 'critical':
        return 'text-red-600 dark:text-red-400'
      case 'medium':
        return 'text-yellow-600 dark:text-yellow-400'
      default:
        return 'text-blue-600 dark:text-blue-400'
    }
  }

  return (
    <Card className="overflow-x-hidden">
      <CardHeader className="p-4 sm:p-6">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base sm:text-lg truncate flex items-center gap-2">
            <Bell className="h-4 w-4 sm:h-5 sm:w-5" />
            Notifications
            {unreadCount > 0 && (
              <Badge variant="destructive" className="ml-2">
                {unreadCount}
              </Badge>
            )}
          </CardTitle>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleMarkAllAsRead}
              className="h-8 text-xs"
            >
              Mark All as Read
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-4 sm:p-6 pt-0">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : notifications.length === 0 ? (
          <div className="text-center py-8 text-sm text-muted-foreground">
            No notifications
          </div>
        ) : (
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {notifications.map((notification) => {
              const notificationId = (notification._id as any).toString()
              const isUnread = !notification.isRead
              const createdAt = notification.createdAt ? new Date(notification.createdAt) : new Date()

              return (
                <div
                  key={notificationId}
                  className={`group border rounded-lg p-3 cursor-pointer hover:bg-muted/50 transition-colors ${
                    isUnread ? 'bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800' : ''
                  }`}
                  onClick={() => handleNotificationClick(notification)}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 mt-0.5">
                      <span className="text-lg">{getNotificationIcon(notification.type || '')}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <h4 className={`text-sm font-medium ${isUnread ? 'font-semibold' : ''} ${getNotificationColor(notification.data?.priority)}`}>
                          {notification.title}
                        </h4>
                        {isUnread && (
                          <div className="h-2 w-2 rounded-full bg-blue-600 dark:bg-blue-400 flex-shrink-0 mt-1.5" />
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
                        {notification.message}
                      </p>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">
                          {formatDistanceToNow(createdAt, { addSuffix: true })}
                        </span>
                        {notification.data?.url && (
                          <ExternalLink className="h-3 w-3 text-muted-foreground" />
                        )}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation()
                        deleteNotification(notificationId)
                      }}
                      className="h-6 w-6 p-0 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
        {notifications.length > 0 && (
          <div className="mt-4 pt-4 border-t">
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push('/notifications')}
              className="w-full text-xs"
            >
              View All Notifications
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

