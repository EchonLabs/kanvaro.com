'use client'

import { useEffect, useRef } from 'react'
import { useToast } from '@/components/ui/Toast'
import { useNotifications } from './useNotifications'

/**
 * Hook to listen for time tracking notifications and show toast popups
 * Only shows toasts for time_tracking type notifications
 */
export function useTimeTrackingNotifications() {
  const { showToast } = useToast()
  const { notifications, refresh } = useNotifications({
    limit: 10,
    unreadOnly: true,
    type: 'time_tracking',
    autoRefresh: true,
    refreshInterval: 5000 // Check every 5 seconds for new notifications
  })

  const processedNotificationIds = useRef<Set<string>>(new Set())

  useEffect(() => {
    // Process new notifications
    notifications.forEach((notification) => {
      const notificationId = (notification._id as any).toString()
      
      // Skip if already processed
      if (processedNotificationIds.current.has(notificationId)) {
        return
      }

      // Mark as processed
      processedNotificationIds.current.add(notificationId)

      // Filter out notifications for 0 duration time entries
      // Check if message contains "0h 0m" or "0h" which indicates no time was logged
      const message = notification.message || ''
      const hasZeroDuration = /0h\s*0m|\(0h\s*0m\)|\(0h\)|0h\s+0m/i.test(message)
      
      if (hasZeroDuration && (notification.title.includes('Stopped') || notification.title.includes('Submitted'))) {
        // Skip notifications for 0 duration entries
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
      showToast({
        type: toastType,
        title: notification.title,
        message: notification.message,
        duration: toastType === 'warning' || toastType === 'error' ? 7000 : 5000
      })
    })
  }, [notifications, showToast])

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

