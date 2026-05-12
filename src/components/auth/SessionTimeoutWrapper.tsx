'use client'

import React, { useMemo } from 'react'
import { useAuthContext } from '@/contexts/AuthContext'
import { useSessionTimeout } from '@/hooks/useSessionTimeout'
import { useToast } from '@/components/ui/Toast'

export function SessionTimeoutWrapper({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated, logout } = useAuthContext()
  const { showToast } = useToast()

  // Get timeout from user settings or fallback to 4 hours (240 minutes)
  const timeoutMinutes = user?.security?.sessionTimeout ?? 240
  const timeoutMs = useMemo(() => timeoutMinutes * 60 * 1000, [timeoutMinutes])
  
  // Warn 1 minute before if timeout is more than 5 minutes, otherwise no warning
  const warningBeforeMs = timeoutMinutes > 5 ? 60 * 1000 : 0

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
