'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { INotification } from '@/models/Notification'

interface SSEMessage {
  type: 'connected' | 'heartbeat' | 'notification'
  data?: INotification
  timestamp?: number
  userId?: string
}

interface UseNotificationSSEOptions {
  enabled?: boolean
  onNotification?: (notification: INotification) => void
  onConnectionChange?: (connected: boolean) => void
  reconnectInterval?: number
  maxReconnectAttempts?: number
}

interface UseNotificationSSEReturn {
  isConnected: boolean
  lastHeartbeat: number | null
  connectionAttempts: number
  reconnect: () => void
}

/**
 * Hook for Server-Sent Events (SSE) based real-time notifications
 * Provides efficient push-based notifications without constant polling
 */
export function useNotificationSSE(
  options: UseNotificationSSEOptions = {}
): UseNotificationSSEReturn {
  const {
    enabled = true,
    onNotification,
    onConnectionChange,
    reconnectInterval = 5000, // Retry connection every 5 seconds on disconnect
    maxReconnectAttempts = 10
  } = options

  const [isConnected, setIsConnected] = useState(false)
  const [lastHeartbeat, setLastHeartbeat] = useState<number | null>(null)
  const [connectionAttempts, setConnectionAttempts] = useState(0)

  const eventSourceRef = useRef<EventSource | null>(null)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const onNotificationRef = useRef(onNotification)
  const onConnectionChangeRef = useRef(onConnectionChange)

  // Keep refs updated
  useEffect(() => {
    onNotificationRef.current = onNotification
  }, [onNotification])

  useEffect(() => {
    onConnectionChangeRef.current = onConnectionChange
  }, [onConnectionChange])

  const connect = useCallback(() => {
    // Clean up existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }

    if (!enabled) return

    // Check if EventSource is supported
    if (typeof EventSource === 'undefined') {
      console.warn('EventSource (SSE) is not supported in this browser')
      return
    }

    try {
      const eventSource = new EventSource('/api/notifications/stream', {
        withCredentials: true
      })

      eventSource.onopen = () => {
        setIsConnected(true)
        setConnectionAttempts(0)
        onConnectionChangeRef.current?.(true)
      }

      eventSource.onmessage = (event) => {
        try {
          const message: SSEMessage = JSON.parse(event.data)

          switch (message.type) {
            case 'connected':
              console.log('SSE connection established')
              break

            case 'heartbeat':
              setLastHeartbeat(message.timestamp || Date.now())
              break

            case 'notification':
              if (message.data && onNotificationRef.current) {
                onNotificationRef.current(message.data)
              }
              break

            default:
              console.warn('Unknown SSE message type:', message.type)
          }
        } catch (error) {
          console.error('Failed to parse SSE message:', error)
        }
      }

      eventSource.onerror = () => {
        setIsConnected(false)
        onConnectionChangeRef.current?.(false)
        eventSource.close()
        eventSourceRef.current = null

        // Attempt reconnection with exponential backoff
        setConnectionAttempts((prev) => {
          const attempts = prev + 1
          if (attempts <= maxReconnectAttempts) {
            const delay = Math.min(
              reconnectInterval * Math.pow(1.5, attempts - 1),
              60000 // Max 60 seconds
            )
            console.log(`SSE reconnecting in ${delay}ms (attempt ${attempts})`)
            
            reconnectTimeoutRef.current = setTimeout(() => {
              connect()
            }, delay)
          } else {
            console.warn('Max SSE reconnection attempts reached')
          }
          return attempts
        })
      }

      eventSourceRef.current = eventSource
    } catch (error) {
      console.error('Failed to create EventSource:', error)
    }
  }, [enabled, reconnectInterval, maxReconnectAttempts])

  // Connect on mount and when enabled changes
  useEffect(() => {
    if (enabled) {
      connect()
    }

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
        eventSourceRef.current = null
      }
    }
  }, [enabled, connect])

  // Handle page visibility changes to reconnect when tab becomes active
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && !isConnected && enabled) {
        setConnectionAttempts(0)
        connect()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [isConnected, enabled, connect])

  const reconnect = useCallback(() => {
    setConnectionAttempts(0)
    connect()
  }, [connect])

  return {
    isConnected,
    lastHeartbeat,
    connectionAttempts,
    reconnect
  }
}
