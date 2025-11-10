'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { MainLayout } from '@/components/layout/MainLayout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { OrganizationSettings } from '@/components/settings/OrganizationSettings'
import { EmailSettings } from '@/components/settings/EmailSettings'
import { DatabaseSettings } from '@/components/settings/DatabaseSettings'
import { 
  Building2, 
  Mail, 
  Database,
  Settings as SettingsIcon,
  Loader2
} from 'lucide-react'

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('organization')
  const [isLoading, setIsLoading] = useState(true)
  const [user, setUser] = useState<any>(null)
  const [authError, setAuthError] = useState('')
  const router = useRouter()

  const checkAuth = useCallback(async () => {
    try {
      console.log('Settings: Checking authentication...')
      const response = await fetch('/api/auth/me')
      console.log('Settings: Auth response status:', response.status)
      
      if (response.ok) {
        const userData = await response.json()
        console.log('Settings: User data received:', userData)
        setUser(userData)
        setAuthError('')
      } else if (response.status === 401) {
        console.log('Settings: 401 response, trying refresh token')
        // Try to refresh token
        const refreshResponse = await fetch('/api/auth/refresh', {
          method: 'POST'
        })
        
        if (refreshResponse.ok) {
          const refreshData = await refreshResponse.json()
          setUser(refreshData.user)
          setAuthError('')
        } else {
          // Both access and refresh tokens are invalid
          setAuthError('Session expired')
          setTimeout(() => {
            router.push('/login')
          }, 2000)
        }
      } else {
        // Other error, redirect to login
        router.push('/login')
      }
    } catch (error) {
      console.error('Auth check failed:', error)
      setAuthError('Authentication failed')
      setTimeout(() => {
        router.push('/login')
      }, 2000)
    } finally {
      setIsLoading(false)
    }
  }, [router])

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

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="text-center">
          <Loader2 className="h-6 w-6 sm:h-8 sm:w-8 animate-spin mx-auto mb-3 sm:mb-4 text-primary" />
          <p className="text-xs sm:text-sm text-muted-foreground">Loading settings...</p>
        </div>
      </div>
    )
  }

  if (authError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="text-center">
          <p className="text-xs sm:text-sm text-destructive mb-3 sm:mb-4 break-words">{authError}</p>
          <p className="text-xs sm:text-sm text-muted-foreground">Redirecting to login...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="text-center">
          <p className="text-xs sm:text-sm text-muted-foreground">No user data available</p>
        </div>
      </div>
    )
  }

  return (
    <MainLayout>
      <div className="space-y-6 sm:space-y-8 px-4 sm:px-6">
        {/* Settings Header */}
        <div className="border-b border-border pb-4 sm:pb-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4">
            <div className="flex h-8 w-8 sm:h-10 sm:w-10 items-center justify-center rounded-lg bg-primary/10 flex-shrink-0">
              <SettingsIcon className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight truncate">
                Application Settings
              </h1>
              <p className="text-xs sm:text-sm text-muted-foreground mt-1 break-words">
                Configure your organization settings, email system, and database management.
              </p>
            </div>
          </div>
        </div>

        {/* Settings Content */}
        <div className="space-y-4 sm:space-y-6">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4 sm:space-y-6">
            <TabsList className="grid w-full grid-cols-3 gap-1 overflow-x-auto">
              <TabsTrigger value="organization" className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm">
                <Building2 className="h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0" />
                <span className="truncate">Organization</span>
              </TabsTrigger>
              <TabsTrigger value="email" className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm">
                <Mail className="h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0" />
                <span className="truncate">Email</span>
              </TabsTrigger>
              <TabsTrigger value="database" className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm">
                <Database className="h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0" />
                <span className="truncate">Database</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="organization" className="space-y-4 sm:space-y-6">
              <OrganizationSettings />
            </TabsContent>

            <TabsContent value="email" className="space-y-4 sm:space-y-6">
              <EmailSettings />
            </TabsContent>

            <TabsContent value="database" className="space-y-4 sm:space-y-6">
              <DatabaseSettings />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </MainLayout>
  )
}
