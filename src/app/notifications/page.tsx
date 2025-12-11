'use client'

import { useMemo, useState } from 'react'
import { MainLayout } from '@/components/layout/MainLayout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useNotifications } from '@/hooks/useNotifications'
import { formatDistanceToNow } from 'date-fns'
import { Bell, RefreshCw, Filter } from 'lucide-react'

type DateRangeKey = 'all' | '24h' | '7d' | '30d'

const dateRangeOptions: { label: string; value: DateRangeKey }[] = [
  { label: 'All time', value: 'all' },
  { label: 'Last 24h', value: '24h' },
  { label: 'Last 7 days', value: '7d' },
  { label: 'Last 30 days', value: '30d' }
]

const typeOptions = [
  { label: 'All types', value: 'all' },
  { label: 'Task', value: 'task' },
  { label: 'Project', value: 'project' },
  { label: 'Team', value: 'team' },
  { label: 'Time Tracking', value: 'time_tracking' },
  { label: 'Other', value: 'other' }
]

export default function NotificationsPage() {
  const [typeFilter, setTypeFilter] = useState('all')
  const [dateRange, setDateRange] = useState<DateRangeKey>('all')

  const {
    notifications,
    loading,
    error,
    refresh,
    markAllAsRead,
    deleteNotification,
    markAsRead
  } = useNotifications({
    limit: 200,
    unreadOnly: false,
    type: typeFilter !== 'all' ? typeFilter : undefined,
    autoRefresh: false
  })

  const filteredNotifications = useMemo(() => {
    const now = new Date()
    const withinRange = (createdAt?: string) => {
      if (!createdAt) return false
      const created = new Date(createdAt)
      const diffMs = now.getTime() - created.getTime()
      const oneDay = 24 * 60 * 60 * 1000
      switch (dateRange) {
        case '24h':
          return diffMs <= oneDay
        case '7d':
          return diffMs <= 7 * oneDay
        case '30d':
          return diffMs <= 30 * oneDay
        default:
          return true
      }
    }

    return notifications.filter((n: any) => withinRange(n.createdAt))
  }, [notifications, dateRange])

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
    <MainLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            <h1 className="text-xl font-semibold">Notifications</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refresh()}
              disabled={loading}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => markAllAsRead()}
              disabled={loading}
            >
              Mark all read
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Filter className="h-4 w-4" />
              Filters
            </CardTitle>
            <div className="flex flex-wrap gap-3">
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-44 h-9">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  {typeOptions.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={dateRange} onValueChange={(val: DateRangeKey) => setDateRange(val)}>
                <SelectTrigger className="w-44 h-9">
                  <SelectValue placeholder="Date range" />
                </SelectTrigger>
                <SelectContent>
                  {dateRangeOptions.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="py-10 text-center text-sm text-muted-foreground">Loading notifications...</div>
            ) : error ? (
              <div className="py-10 text-center text-sm text-destructive">{error}</div>
            ) : filteredNotifications.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">No notifications</div>
            ) : (
              <div className="space-y-3">
                {filteredNotifications.map((n: any) => {
                  const id = (n._id as any).toString()
                  const createdAt = n.createdAt ? new Date(n.createdAt) : new Date()
                  const isUnread = !n.isRead
                  return (
                    <div
                      key={id}
                      className={`border rounded-lg p-3 flex flex-col gap-1 ${isUnread ? 'bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800' : ''}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className={`text-sm font-medium ${getNotificationColor(n.data?.priority)}`}>{n.title}</h3>
                            {isUnread && <Badge variant="secondary" className="text-[10px]">Unread</Badge>}
                            {n.type && <Badge variant="outline" className="text-[10px]">{n.type}</Badge>}
                          </div>
                          <p className="text-xs text-muted-foreground">{n.message}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-muted-foreground">
                            {formatDistanceToNow(createdAt, { addSuffix: true })}
                          </span>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7"
                            onClick={() => markAsRead(id)}
                            disabled={!isUnread}
                          >
                            Mark read
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-destructive"
                            onClick={() => deleteNotification(id)}
                          >
                            Delete
                          </Button>
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                        {n.data?.url ? (
                          <a className="text-primary hover:underline" href={n.data.url}>
                            Open
                          </a>
                        ) : <span />}
                        <span>{n.data?.priority ? `Priority: ${n.data.priority}` : ''}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  )
}

