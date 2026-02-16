'use client'

import { useEffect, useRef, useCallback, useState } from 'react'
import { useToast } from '@/components/ui/Toast'
import { useNotifications } from './useNotifications'
import { useNotificationSSE } from './useNotificationSSE'
import { INotification } from '@/models/Notification'

/**
 * Hook to listen for time tracking notifications and show toast popups
 * Uses SSE for real-time notifications with fallback polling at 60 seconds
 * (previously polled every 5 seconds which caused performance issues)
 */
export function useTimeTrackingNotifications() {
  const { showToast } = useToast()
  const [sseConnected, setSseConnected] = useState(false)
  
  // Only use polling as fallback when SSE is NOT connected
  // When SSE is connected, disable autoRefresh completely
  const { notifications, refresh, markAsRead } = useNotifications({
    limit: 10,
    unreadOnly: true,
    type: 'time_tracking',
    autoRefresh: !sseConnected, // Disable polling when SSE is connected
    refreshInterval: 60000 // Fallback polling every 60 seconds (was 5 seconds)
  })

  const processedNotificationIds = useRef<Set<string>>(new Set())
  const markAsReadRef = useRef(markAsRead)
  const showToastRef = useRef(showToast)
  const lastRefreshRef = useRef<number>(0)

  // Keep refs updated
  useEffect(() => {
    markAsReadRef.current = markAsRead
  }, [markAsRead])

  useEffect(() => {
    showToastRef.current = showToast
  }, [showToast])

  /**
   * Process a notification and show toast
   */
  const processNotification = useCallback((notification: INotification) => {
    const notificationId = (notification._id as any).toString()
    
    // Skip if already processed
    if (processedNotificationIds.current.has(notificationId)) {
      return
    }

    // Only process time_tracking notifications
    if (notification.type !== 'time_tracking') {
      return
    }

    // Mark as processed
    processedNotificationIds.current.add(notificationId)

    // Filter out notifications for 0 duration time entries
    const message = notification.message || ''
    const hasZeroDuration = /0h\s*0m|\(0h\s*0m\)|\(0h\)|0h\s+0m/i.test(message)
    
    if (hasZeroDuration && (
      notification.title.includes('Stopped') || 
      notification.title.includes('Submitted') || 
      notification.title.includes('Approval Required')
    )) {
      // Skip notifications for 0 duration entries
      markAsReadRef.current(notificationId)
      return
    }

    // Determine toast type based on notification priority and title
    let toastType: 'success' | 'error' | 'info' | 'warning' = 'info'
    
    if (notification.title.includes('Overtime') || notification.title.includes('Alert')) {
      toastType = 'warning'
    } else if (notification.title.includes('Approval Required')) {
      toastType = 'warning'
    } else if (notification.title.includes('Error') || notification.data?.priority === 'critical') {
      toastType = 'error'
    } else if (notification.title.includes('Submitted') || notification.title.includes('Stopped')) {
      toastType = 'success'
    } else {
      toastType = 'info'
    }

    // Show toast popup
    showToastRef.current({
      type: toastType,
      title: notification.title,
      message: notification.message,
      duration: toastType === 'warning' || toastType === 'error' ? 7000 : 5000
    })

    // Mark notification as read after showing toast
    markAsReadRef.current(notificationId)
  }, [])

  // Handle SSE connection state changes
  const handleConnectionChange = useCallback((connected: boolean) => {
    setSseConnected(connected)
    
    // If disconnected, trigger a throttled refresh as fallback
    // Only refresh if enough time has passed since last refresh (min 30 seconds)
    if (!connected) {
      const now = Date.now()
      if (now - lastRefreshRef.current > 30000) {
        lastRefreshRef.current = now
        refresh()
      }
    }
  }, [refresh])

  // Use SSE for real-time notifications (primary method)
  const { isConnected: sseIsConnected } = useNotificationSSE({
    enabled: true,
    onNotification: processNotification,
    onConnectionChange: handleConnectionChange
  })

  // Sync SSE connected state
  useEffect(() => {
    setSseConnected(sseIsConnected)
  }, [sseIsConnected])

  // Process notifications from fallback polling
  useEffect(() => {
    notifications.forEach((notification) => {
      processNotification(notification)
    })
  }, [notifications, processNotification])

  // Clean up old processed IDs to prevent memory leak
  useEffect(() => {
    const interval = setInterval(() => {
      // Keep only the last 100 processed IDs
      if (processedNotificationIds.current.size > 100) {
        const idsArray = Array.from(processedNotificationIds.current)
        processedNotificationIds.current = new Set(idsArray.slice(-50))
      }
    }, 60000) // Clean up every minute

    return () => clearInterval(interval)
  }, [])

  return { refresh }
}

