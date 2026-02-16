import { useState, useEffect, useCallback, useRef } from 'react'
import { INotification } from '@/models/Notification'

interface UseNotificationsOptions {
  limit?: number
  offset?: number
  unreadOnly?: boolean
  type?: string
  autoRefresh?: boolean
  refreshInterval?: number
}

interface NotificationsData {
  notifications: INotification[]
  total: number
  unreadCount: number
  loading: boolean
  error: string | null
}

export function useNotifications(options: UseNotificationsOptions = {}) {
  const {
    limit = 20,
    offset = 0,
    unreadOnly = false,
    type,
    autoRefresh = true,
    refreshInterval = 30000 // 30 seconds
  } = options

  const [data, setData] = useState<NotificationsData>({
    notifications: [],
    total: 0,
    unreadCount: 0,
    loading: true,
    error: null
  })

  // Use refs to avoid recreating callbacks and causing infinite loops
  const optionsRef = useRef({ limit, offset, unreadOnly, type })
  optionsRef.current = { limit, offset, unreadOnly, type }

  const fetchNotifications = useCallback(async () => {
    try {
      setData(prev => ({ ...prev, loading: true, error: null }))

      const { limit, offset, unreadOnly, type } = optionsRef.current
      const params = new URLSearchParams({
        limit: limit.toString(),
        offset: offset.toString(),
        unreadOnly: unreadOnly.toString()
      })

      if (type) {
        params.append('type', type)
      }

      const response = await fetch(`/api/notifications?${params}`)
      
      if (!response.ok) {
        throw new Error('Failed to fetch notifications')
      }

      const result = await response.json()
      
      if (result.success) {
        setData(prev => ({
          ...prev,
          notifications: result.data.notifications,
          total: result.data.total,
          unreadCount: result.data.unreadCount,
          loading: false
        }))
      } else {
        throw new Error(result.error || 'Failed to fetch notifications')
      }
    } catch (error) {
      console.error('Error fetching notifications:', error)
      setData(prev => ({
        ...prev,
        loading: false,
        error: error instanceof Error ? error.message : 'Failed to fetch notifications'
      }))
    }
  }, []) // No dependencies - uses refs instead

  const markAsRead = useCallback(async (notificationId: string) => {
    try {
      const response = await fetch('/api/notifications', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action: 'markAsRead',
          notificationId
        })
      })

      if (response.ok) {
        // Update local state
        setData(prev => ({
          ...prev,
          notifications: prev.notifications.map(n => 
            (n._id as any).toString() === notificationId 
              ? { ...n, isRead: true, readAt: new Date() } as any
              : n
          ),
          unreadCount: Math.max(0, prev.unreadCount - 1)
        }))
      }
    } catch (error) {
      console.error('Error marking notification as read:', error)
    }
  }, [])

  const markAllAsRead = useCallback(async () => {
    try {
      const response = await fetch('/api/notifications', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action: 'markAllRead'
        })
      })

      if (response.ok) {
        // Update local state
        setData(prev => ({
          ...prev,
          notifications: prev.notifications.map(n => ({ ...n, isRead: true, readAt: new Date() } as any)),
          unreadCount: 0
        }))
      }
    } catch (error) {
      console.error('Error marking all notifications as read:', error)
    }
  }, [])

  const deleteNotification = useCallback(async (notificationId: string) => {
    try {
      const response = await fetch('/api/notifications', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action: 'delete',
          notificationId
        })
      })

      if (response.ok) {
        // Update local state
        setData(prev => {
          const notification = prev.notifications.find(n => (n._id as any).toString() === notificationId)
          return {
            ...prev,
            notifications: prev.notifications.filter(n => (n._id as any).toString() !== notificationId),
            total: prev.total - 1,
            unreadCount: notification && !notification.isRead ? prev.unreadCount - 1 : prev.unreadCount
          }
        })
      }
    } catch (error) {
      console.error('Error deleting notification:', error)
    }
  }, [])

  const refresh = useCallback(() => {
    fetchNotifications()
  }, [fetchNotifications])

  // Initial fetch and refetch when options change
  useEffect(() => {
    fetchNotifications()
  }, [fetchNotifications, limit, offset, unreadOnly, type])

  // Smart auto-refresh: only poll when tab is visible
  // Use refs to avoid recreating intervals on every render
  const autoRefreshRef = useRef(autoRefresh)
  const refreshIntervalRef = useRef(refreshInterval)
  autoRefreshRef.current = autoRefresh
  refreshIntervalRef.current = refreshInterval

  useEffect(() => {
    if (!autoRefreshRef.current) return

    let interval: NodeJS.Timeout | null = null
    let isVisible = !document.hidden

    const startPolling = () => {
      if (interval) clearInterval(interval)
      if (isVisible && autoRefreshRef.current) {
        interval = setInterval(() => {
          if (autoRefreshRef.current) {
            fetchNotifications()
          }
        }, refreshIntervalRef.current)
      }
    }

    const handleVisibilityChange = () => {
      isVisible = !document.hidden
      if (isVisible) {
        // Fetch immediately when tab becomes visible
        if (autoRefreshRef.current) {
          fetchNotifications()
        }
        startPolling()
      } else {
        // Stop polling when tab is hidden
        if (interval) {
          clearInterval(interval)
          interval = null
        }
      }
    }

    // Start polling if tab is visible
    startPolling()

    // Listen for visibility changes
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      if (interval) clearInterval(interval)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [fetchNotifications]) // Only depend on stable fetchNotifications

  return {
    ...data,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    refresh
  }
}

export function useNotificationCount() {
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(true)

  const fetchCount = useCallback(async () => {
    try {
      const response = await fetch('/api/notifications?limit=1&offset=0')
      
      if (response.ok) {
        const result = await response.json()
        if (result.success) {
          setUnreadCount(result.data.unreadCount)
        }
      }
    } catch (error) {
      console.error('Error fetching notification count:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchCount()
    
    // Smart polling: only when tab is visible, increased to 60 seconds
    let interval: NodeJS.Timeout | null = null
    
    const startPolling = () => {
      if (interval) clearInterval(interval)
      if (!document.hidden) {
        interval = setInterval(fetchCount, 60000) // 60 seconds instead of 30
      }
    }

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        fetchCount()
        startPolling()
      } else {
        if (interval) {
          clearInterval(interval)
          interval = null
        }
      }
    }

    startPolling()
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      if (interval) clearInterval(interval)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [fetchCount])

  return { unreadCount, loading, refresh: fetchCount }
}
