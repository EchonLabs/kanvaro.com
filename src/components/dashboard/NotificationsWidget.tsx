'use client'

import { Bell, Check, X, Loader2, ExternalLink } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { useNotifications } from '@/hooks/useNotifications'
import { useRouter } from 'next/navigation'
import { formatDistanceToNow } from 'date-fns'
import { cn } from '@/lib/utils'

export function NotificationsWidget() {
  const router = useRouter()
  const { notifications, unreadCount, loading, markAsRead, markAllAsRead, deleteNotification } = useNotifications({
    limit: 10,
    unreadOnly: false,
    autoRefresh: true,
    refreshInterval: 60000
  })

  const handleNotificationClick = (notification: any) => {
    if (!notification.isRead) {
      markAsRead((notification._id as any).toString())
    }
    if (notification.data?.url) {
      router.push(notification.data.url)
    }
  }

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'time_tracking': return '⏱️'
      case 'task':          return '✓'
      case 'project':       return '📁'
      case 'team':          return '👥'
      default:              return '🔔'
    }
  }

  return (
    <Card className="overflow-x-hidden">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-[var(--apple-secondary-label)]" />
            <CardTitle>Notifications</CardTitle>
            {unreadCount > 0 && (
              <span className="h-5 w-5 rounded-full bg-[var(--apple-system-red)] text-white text-[10px] font-semibold flex items-center justify-center">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </div>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={markAllAsRead}
              className="h-7 px-2 text-[11px] text-[var(--apple-system-blue)]"
            >
              <Check className="h-3 w-3 mr-1" />
              Mark All Read
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-[var(--apple-secondary-label)]" />
          </div>
        ) : notifications.length === 0 ? (
          <div className="text-center py-8 text-sm text-[var(--apple-secondary-label)]">
            No notifications
          </div>
        ) : (
          <div className="space-y-0.5 max-h-[360px] overflow-y-auto -mx-1 px-1">
            {notifications.map((notification) => {
              const notificationId = (notification._id as any).toString()
              const isUnread = !notification.isRead
              const createdAt = notification.createdAt ? new Date(notification.createdAt) : new Date()

              return (
                <div
                  key={notificationId}
                  className={cn(
                    'group flex items-start gap-3 rounded-[var(--apple-radius-md)] px-3 py-2.5 cursor-pointer apple-transition hover:bg-[var(--apple-quaternary-fill)]',
                    isUnread && 'bg-[var(--apple-system-blue)]/8 border-l-2 border-[var(--apple-system-blue)]/50'
                  )}
                  onClick={() => handleNotificationClick(notification)}
                >
                  <span className="text-base flex-shrink-0 mt-0.5">{getNotificationIcon(notification.type || '')}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-0.5">
                      <h4 className={cn(
                        'text-xs text-[var(--apple-label)] break-words',
                        isUnread ? 'font-semibold' : 'font-medium'
                      )}>
                        {notification.title}
                      </h4>
                      {isUnread && (
                        <div className="h-2 w-2 rounded-full bg-[var(--apple-system-blue)] flex-shrink-0 mt-1" />
                      )}
                    </div>
                    <p className="text-[11px] text-[var(--apple-secondary-label)] line-clamp-2 mb-1">
                      {notification.message}
                    </p>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-[var(--apple-tertiary-label)]">
                        {formatDistanceToNow(createdAt, { addSuffix: true })}
                      </span>
                      {notification.data?.url && (
                        <ExternalLink className="h-3 w-3 text-[var(--apple-tertiary-label)]" />
                      )}
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      deleteNotification(notificationId)
                    }}
                    className="h-6 w-6 flex items-center justify-center rounded-full flex-shrink-0 opacity-0 group-hover:opacity-100 apple-transition hover:bg-[var(--apple-secondary-fill)]"
                  >
                    <X className="h-3 w-3 text-[var(--apple-secondary-label)]" />
                  </button>
                </div>
              )
            })}
          </div>
        )}
        {notifications.length > 0 && (
          <div className="mt-3 pt-3 border-t border-[var(--apple-separator)]">
            <button
              onClick={() => router.push('/notifications')}
              className="w-full text-sm text-[var(--apple-system-blue)] hover:opacity-80 apple-transition text-center"
            >
              View all notifications →
            </button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
