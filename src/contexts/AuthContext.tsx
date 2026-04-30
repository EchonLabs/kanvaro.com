'use client'

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'

export interface AuthUser {
  id: string
  firstName: string
  lastName: string
  memberId?: string
  email: string
  role: string
  customRole?: {
    _id: string
    name: string
  } | null
  organization: string
  isActive: boolean
  emailVerified: boolean
  avatar?: string
  timezone: string
  language: string
  currency: string
  preferences: {
    theme: string
    sidebarCollapsed: boolean
    dateFormat?: string
    timeFormat?: string
    notifications: {
      email: boolean
      inApp: boolean
      push: boolean
    }
  }
  twoFactorEnabled?: boolean
  security?: {
    loginAlerts: boolean
    sessionTimeout: number
    requirePasswordChange: boolean
  }
  lastLogin?: string
}

interface AuthContextType {
  user: AuthUser | null
  isLoading: boolean
  isAuthenticated: boolean
  error: string
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>
  logout: () => Promise<void>
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

// In-flight request deduplication
let pendingAuthRequest: Promise<AuthUser | null> | null = null

async function fetchCurrentUser(): Promise<AuthUser | null> {
  // Deduplicate concurrent requests
  if (pendingAuthRequest) {
    return pendingAuthRequest
  }

  pendingAuthRequest = (async () => {
    try {
      const response = await fetch('/api/auth/me')

      if (response.ok) {
        const userData = await response.json()
        return userData as AuthUser
      } else if (response.status === 401) {
        // Try to refresh token
        const refreshResponse = await fetch('/api/auth/refresh', {
          method: 'POST'
        })

        if (refreshResponse.ok) {
          const refreshData = await refreshResponse.json()
          return refreshData.user as AuthUser
        }
      }
      return null
    } catch (error) {
      console.error('Auth fetch failed:', error)
      return null
    } finally {
      // Clear the pending request after a short delay to batch near-simultaneous calls
      setTimeout(() => {
        pendingAuthRequest = null
      }, 100)
    }
  })()

  return pendingAuthRequest
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const router = useRouter()
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const hasFetchedRef = useRef(false)

  const loadUser = useCallback(async () => {
    try {
      const userData = await fetchCurrentUser()
      if (userData) {
        setUser(userData)
        setError('')
      } else {
        setUser(null)
      }
    } catch (err) {
      console.error('Failed to load user:', err)
      setUser(null)
      setError('Authentication failed')
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Initial auth check — runs once
  useEffect(() => {
    if (!hasFetchedRef.current) {
      hasFetchedRef.current = true
      loadUser()
    }
  }, [loadUser])

  // Periodic background refresh (every 5 minutes) to handle token expiry
  useEffect(() => {
    refreshIntervalRef.current = setInterval(() => {
      // Only refresh if user is already authenticated
      if (user) {
        fetchCurrentUser().then((userData) => {
          if (userData) {
            setUser(userData)
          }
          // If null, don't clear the user here — let session timeout handle it
        }).catch(() => {
          // Silently ignore periodic refresh errors
        })
      }
    }, 5 * 60 * 1000) // 5 minutes

    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current)
      }
    }
  }, [user])

  const login = useCallback(async (email: string, password: string) => {
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      })

      const data = await response.json()

      if (response.ok && data.success) {
        setUser(data.user)
        setError('')
        return { success: true }
      } else {
        setError(data.error || 'Login failed')
        return { success: false, error: data.error || 'Login failed' }
      }
    } catch (err) {
      console.error('Login failed:', err)
      const errorMessage = 'Login failed. Please check your connection and try again.'
      setError(errorMessage)
      return { success: false, error: errorMessage }
    }
  }, [])

  const logout = useCallback(async () => {
    try {
      // Clear permission cache
      if (typeof window !== 'undefined') {
        try {
          sessionStorage.removeItem('kanvaro_permissions')
          sessionStorage.removeItem('kanvaro_permissions_timestamp')
          sessionStorage.removeItem('user_date_preferences')
        } catch (cacheError) {
          console.error('Error clearing cache:', cacheError)
        }
      }

      await fetch('/api/auth/logout', { method: 'POST' })
    } catch (err) {
      console.error('Logout failed:', err)
    } finally {
      setUser(null)
      setError('')
      hasFetchedRef.current = false
      router.push('/login')
    }
  }, [router])

  const refreshUser = useCallback(async () => {
    const userData = await fetchCurrentUser()
    if (userData) {
      setUser(userData)
      setError('')
    }
  }, [])

  const value: AuthContextType = {
    user,
    isLoading,
    isAuthenticated: !!user,
    error,
    login,
    logout,
    refreshUser,
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuthContext() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuthContext must be used within an AuthProvider')
  }
  return context
}
