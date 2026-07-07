'use client'

import React, { useMemo } from 'react'
import { useAuthContext } from '@/contexts/AuthContext'
import { useSessionTimeout } from '@/hooks/useSessionTimeout'
import { useToast } from '@/components/ui/Toast'

export function SessionTimeoutWrapper({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated, logout } = useAuthContext()
  const { showToast } = useToast()

  // Enforce a minimum of 4 hours (240 min) regardless of what's stored in user settings,
  // so that low legacy DB values or manual mis-configurations can't shorten sessions below 4 h.
  const MIN_TIMEOUT_MINUTES = 240
  const timeoutMinutes = Math.max(user?.security?.sessionTimeout ?? MIN_TIMEOUT_MINUTES, MIN_TIMEOUT_MINUTES)
  const timeoutMs = useMemo(() => timeoutMinutes * 60 * 1000, [timeoutMinutes])

  // Warn 5 minutes before expiry
  const warningBeforeMs = 5 * 60 * 1000

  useSessionTimeout({
    timeoutMs,
    warningBeforeMs,
    enabled: isAuthenticated,
    onTimeout: async () => {
      // Show snackbar message
      showToast({
        type: 'warning',
        title: 'Session Expired',
        message: 'Your session has timed out due to inactivity. Please log in again.',
        duration: 10000 // Show for 10 seconds
      })
      
      // Perform logout
      await logout()
    },
  })

  return (
    <>
      {children}
    </>
  )
}
