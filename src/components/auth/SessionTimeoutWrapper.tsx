'use client'

import React from 'react'
import { useAuthContext } from '@/contexts/AuthContext'
import { useSessionTimeout } from '@/hooks/useSessionTimeout'

const SESSION_TIMEOUT_MS = 4 * 60 * 60 * 1000 // 4 hours
const WARNING_BEFORE_MS = 0 // No warning

export function SessionTimeoutWrapper({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, logout } = useAuthContext()

  const { stayLoggedIn, handleLogout } = useSessionTimeout({
    timeoutMs: SESSION_TIMEOUT_MS,
    warningBeforeMs: WARNING_BEFORE_MS,
    enabled: isAuthenticated,
    onTimeout: async () => {
      await logout()
    },
  })

  return (
    <>
      {children}
    </>
  )
}
