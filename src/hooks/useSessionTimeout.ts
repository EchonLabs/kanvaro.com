'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

interface UseSessionTimeoutOptions {
  /** Total inactivity timeout in milliseconds (default: 30 minutes) */
  timeoutMs?: number
  /** Time before timeout to show warning in milliseconds (default: 5 minutes) */
  warningBeforeMs?: number
  /** Whether session timeout is enabled (default: true) */
  enabled?: boolean
  /** Callback when session expires */
  onTimeout: () => void
}

interface UseSessionTimeoutReturn {
  /** Whether the warning modal should be shown */
  showWarning: boolean
  /** Remaining seconds before timeout */
  remainingSeconds: number
  /** Dismiss warning and reset the timer (user chose to stay) */
  stayLoggedIn: () => void
  /** User manually chose to logout from the warning */
  handleLogout: () => void
}

const ACTIVITY_THROTTLE_MS = 30_000 // 30 seconds
const COUNTDOWN_INTERVAL_MS = 1_000 // 1 second

export function useSessionTimeout({
  timeoutMs = 4 * 60 * 60 * 1000, // 4 hours
  warningBeforeMs = 5 * 60 * 1000, // 5 minutes before
  enabled = true,
  onTimeout,
}: UseSessionTimeoutOptions): UseSessionTimeoutReturn {
  const [showWarning, setShowWarning] = useState(false)
  const [remainingSeconds, setRemainingSeconds] = useState(0)

  const lastActivityRef = useRef<number>(Date.now())
  const warningTimerRef = useRef<NodeJS.Timeout | null>(null)
  const timeoutTimerRef = useRef<NodeJS.Timeout | null>(null)
  const countdownRef = useRef<NodeJS.Timeout | null>(null)
  const throttleRef = useRef<number>(0)
  const onTimeoutRef = useRef(onTimeout)

  // Keep onTimeout ref up to date
  onTimeoutRef.current = onTimeout

  const clearAllTimers = useCallback(() => {
    if (warningTimerRef.current) {
      clearTimeout(warningTimerRef.current)
      warningTimerRef.current = null
    }
    if (timeoutTimerRef.current) {
      clearTimeout(timeoutTimerRef.current)
      timeoutTimerRef.current = null
    }
    if (countdownRef.current) {
      clearInterval(countdownRef.current)
      countdownRef.current = null
    }
  }, [])

  const startTimers = useCallback(() => {
    clearAllTimers()

    const warningDelay = timeoutMs - warningBeforeMs

    // Timer for showing the warning
    warningTimerRef.current = setTimeout(() => {
      setShowWarning(true)
      setRemainingSeconds(Math.floor(warningBeforeMs / 1000))

      // Start countdown
      countdownRef.current = setInterval(() => {
        setRemainingSeconds((prev) => {
          if (prev <= 1) {
            return 0
          }
          return prev - 1
        })
      }, COUNTDOWN_INTERVAL_MS)
    }, warningDelay)

    // Timer for actual timeout
    timeoutTimerRef.current = setTimeout(() => {
      clearAllTimers()
      setShowWarning(false)
      onTimeoutRef.current()
    }, timeoutMs)
  }, [timeoutMs, warningBeforeMs, clearAllTimers])

  const resetTimer = useCallback(() => {
    lastActivityRef.current = Date.now()
    setShowWarning(false)
    setRemainingSeconds(0)
    startTimers()
  }, [startTimers])

  const handleUserActivity = useCallback(() => {
    // Don't reset if warning is already showing
    if (showWarning) return

    const now = Date.now()
    // Throttle activity events
    if (now - throttleRef.current < ACTIVITY_THROTTLE_MS) return
    throttleRef.current = now

    resetTimer()
  }, [showWarning, resetTimer])

  const stayLoggedIn = useCallback(() => {
    setShowWarning(false)
    setRemainingSeconds(0)
    resetTimer()
  }, [resetTimer])

  const handleLogout = useCallback(() => {
    clearAllTimers()
    setShowWarning(false)
    onTimeoutRef.current()
  }, [clearAllTimers])

  // Set up activity listeners
  useEffect(() => {
    if (!enabled) return

    const events = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click']

    events.forEach((event) => {
      window.addEventListener(event, handleUserActivity, { passive: true })
    })

    // Handle visibility change — reset timer when user comes back
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // Check if timeout has passed while tab was hidden
        const elapsed = Date.now() - lastActivityRef.current
        if (elapsed >= timeoutMs) {
          onTimeoutRef.current()
        } else if (elapsed >= timeoutMs - warningBeforeMs) {
          // Show warning with correct remaining time
          const remaining = Math.max(0, timeoutMs - elapsed)
          setShowWarning(true)
          setRemainingSeconds(Math.floor(remaining / 1000))
        }
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    // Start initial timers
    startTimers()

    return () => {
      events.forEach((event) => {
        window.removeEventListener(event, handleUserActivity)
      })
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      clearAllTimers()
    }
  }, [enabled, handleUserActivity, startTimers, clearAllTimers, timeoutMs, warningBeforeMs])

  return {
    showWarning,
    remainingSeconds,
    stayLoggedIn,
    handleLogout,
  }
}
