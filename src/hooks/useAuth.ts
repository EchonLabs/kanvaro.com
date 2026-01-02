'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'

interface User {
  id: string
  firstName: string
  lastName: string
  email: string
  role: string
  organization: string
  isActive: boolean
  emailVerified: boolean
  timezone: string
  language: string
  currency: string
  preferences: {
    theme: string
    sidebarCollapsed: boolean
    notifications: {
      email: boolean
      inApp: boolean
      push: boolean
    }
  }
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const router = useRouter()

  const checkAuth = useCallback(async () => {
    try {
      const response = await fetch('/api/auth/me')
      
      if (response.ok) {
        const userData = await response.json()
        setUser(userData)
        setError('')
        return true
      } else if (response.status === 401) {
        // Try to refresh token
        const refreshResponse = await fetch('/api/auth/refresh', {
          method: 'POST'
        })
        
        if (refreshResponse.ok) {
          const refreshData = await refreshResponse.json()
          setUser(refreshData.user)
          setError('')
          return true
        } else {
          // Both access and refresh tokens are invalid
          setUser(null)
          setError('Session expired')
          return false
        }
      } else {
        setUser(null)
        setError('Authentication failed')
        return false
      }
    } catch (error) {
      console.error('Auth check failed:', error)
      setUser(null)
      setError('Authentication failed')
      return false
    } finally {
      setIsLoading(false)
    }
  }, [])

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
    } catch (error) {
      console.error('Login failed:', error)
      const errorMessage = 'Login failed. Please check your connection and try again.'
      setError(errorMessage)
      return { success: false, error: errorMessage }
    }
  }, [])

  const logout = useCallback(async () => {
    try {
      // Clear permission cache before logout
      if (typeof window !== 'undefined') {
        try {
          sessionStorage.removeItem('kanvaro_permissions')
          sessionStorage.removeItem('kanvaro_permissions_timestamp')
        } catch (cacheError) {
          console.error('Error clearing permission cache:', cacheError)
        }
      }

      await fetch('/api/auth/logout', { method: 'POST' })
    } catch (error) {
      console.error('Logout failed:', error)
    } finally {
      setUser(null)
      setError('')
      router.push('/login')
    }
  }, [router])

  const refreshAuth = useCallback(async () => {
    setIsLoading(true)
    const success = await checkAuth()
    return success
  }, [checkAuth])

  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  // Set up periodic auth check to handle token expiration
  useEffect(() => {
    const interval = setInterval(() => {
      checkAuth()
    }, 5 * 60 * 1000) // Check every 5 minutes

    return () => clearInterval(interval)
  }, [checkAuth])

  return {
    user,
    isLoading,
    error,
    isAuthenticated: !!user,
    login,
    logout,
    refreshAuth,
    checkAuth
  }
}
