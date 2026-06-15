'use client'

import { Bell, Check, X, Loader2, Clock, CheckSquare, Folder, Users, ArrowRight } from 'lucide-react'
import { useNotifications } from '@/hooks/useNotifications'
import { useRouter } from 'next/navigation'
import { formatDistanceToNow } from 'date-fns'
import { cn } from '@/lib/utils'

const TYPE_CONFIG: Record<string, { Icon: any; color: string; bg: string }> = {
  time_tracking: { Icon: Clock,        color: 'var(--apple-system-purple)', bg: 'rgba(175,82,222,0.13)' },
  task:          { Icon: CheckSquare,  color: 'var(--apple-system-green)',  bg: 'rgba(52,199,89,0.13)' },
  project:       { Icon: Folder,       color: 'var(--apple-chart-to)',      bg: 'color-mix(in srgb, var(--apple-chart-to) 13%, transparent)' },
  team:          { Icon: Users,        color: 'var(--apple-system-orange)', bg: 'rgba(255,149,0,0.13)' },
}
const DEFAULT_TYPE = { Icon: Bell, color: 'var(--apple-system-gray)', bg: 'rgba(142,142,147,0.13)' }

export function NotificationsWidget() {
  const router = useRouter()
  const { notifications, unreadCount, loading, markAsRead, markAllAsRead, deleteNotification } = useNotifications({
    limit: 10,
    unreadOnly: false,
    autoRefresh: true,
    refreshInterval: 60000,
  })

  const handleNotificationClick = (notification: any) => {
    if (!notification.isRead) markAsRead((notification._id as any).toString())
    if (notification.data?.url) router.push(notification.data.url)
  }

  return (
    <div className="rounded-[var(--apple-radius-xl)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] dark:shadow-none overflow-hidden">

      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-[var(--apple-separator)]">
        <div className="flex items-center gap-3">
          <Bell className="h-5 w-5 text-[var(--apple-chart-to)]" strokeWidth={1.5} />
          <div className="flex items-center gap-2">
            <p className="text-[15px] font-semibold text-[var(--apple-label)]">Notifications</p>
            {unreadCount > 0 && (
              <span className="h-5 min-w-[20px] px-1 rounded-full bg-[var(--apple-system-red)] text-white text-[10px] font-bold flex items-center justify-center tabular-nums">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </div>
        </div>
        {unreadCount > 0 && (
          <button
            onClick={markAllAsRead}
            className="flex items-center gap-1 text-[12px] font-medium apple-transition hover:opacity-70"
            style={{ color: 'var(--apple-chart-to)' }}
          >
            <Check className="h-3 w-3" strokeWidth={1.5} />
            Mark all read
          </button>
        )}
      </div>

      {/* Body */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-[var(--apple-tertiary-label)]" strokeWidth={1.5} />
        </div>
      ) : notifications.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-12 px-6 text-center">
          <Bell className="h-6 w-6 text-[var(--apple-tertiary-label)]" strokeWidth={1.5} />
          <div className="space-y-0.5">
            <p className="text-[14px] font-semibold text-[var(--apple-label)]">All caught up</p>
            <p className="text-[12px] text-[var(--apple-secondary-label)]">No notifications right now</p>
          </div>
        </div>
      ) : (
        <div className="divide-y divide-[var(--apple-separator)] max-h-[380px] overflow-y-auto">
          {notifications.map((notification) => {
            const id = (notification._id as any).toString()
            const isUnread = !notification.isRead
            const cfg = TYPE_CONFIG[notification.type || ''] ?? DEFAULT_TYPE
            const TypeIcon = cfg.Icon
            const createdAt = notification.createdAt ? new Date(notification.createdAt) : new Date()

            return (
              <div
                key={id}
                className={cn(
                  'group relative flex items-start gap-3 px-5 py-3.5 cursor-pointer apple-transition hover:bg-[var(--apple-quaternary-fill)]',
                  isUnread && 'bg-[color-mix(in_srgb,var(--apple-chart-to)_4%,transparent)]',
                )}
                onClick={() => handleNotificationClick(notification)}
              >
                {/* Unread left accent bar */}
                {isUnread && (
                  <div
                    className="absolute left-0 top-4 bottom-4 w-[3px] rounded-r-full"
                    style={{ background: 'var(--apple-card-gradient)' }}
                  />
                )}

                {/* Type icon */}
                <TypeIcon className="h-4 w-4 mt-0.5 shrink-0" style={{ color: cfg.color }} strokeWidth={1.5} />

                {/* Text content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start gap-2 justify-between">
                    <p className={cn(
                      'text-[13px] text-[var(--apple-label)] break-words leading-snug',
                      isUnread ? 'font-semibold' : 'font-medium',
                    )}>
                      {notification.title}
                    </p>
                    {isUnread && (
                      <div className="h-2 w-2 rounded-full shrink-0 mt-1.5" style={{ background: 'var(--apple-chart-to)' }} />
                    )}
                  </div>
                  {notification.message && (
                    <p className="text-[12px] text-[var(--apple-secondary-label)] mt-0.5 line-clamp-2 leading-relaxed">
                      {notification.message}
                    </p>
                  )}
                  <p className="text-[11px] text-[var(--apple-tertiary-label)] mt-1">
                    {formatDistanceToNow(createdAt, { addSuffix: true })}
                  </p>
                </div>

                {/* Delete button (on hover) */}
                <button
                  onClick={(e) => { e.stopPropagation(); deleteNotification(id) }}
                  className="h-6 w-6 flex items-center justify-center rounded-full shrink-0 opacity-0 group-hover:opacity-100 apple-transition hover:bg-[var(--apple-secondary-fill)] mt-0.5"
                >
                  <X className="h-3 w-3 text-[var(--apple-secondary-label)]" strokeWidth={1.5} />
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* Footer */}
      {notifications.length > 0 && (
        <div className="border-t border-[var(--apple-separator)] px-5 py-3">
          <button
            onClick={() => router.push('/notifications')}
            className="flex items-center justify-center gap-1.5 w-full text-[12px] font-medium apple-transition hover:opacity-70"
            style={{ color: 'var(--apple-chart-to)' }}
          >
            View all notifications
            <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.5} />
          </button>
        </div>
      )}
    </div>
  )
}
