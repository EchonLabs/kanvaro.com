'use client'

import { useEffect, useState } from 'react'
import { Sidebar } from './Sidebar'
import { Header } from './Header'
import { MobileMenu } from '@/components/ui/MobileMenu'
import { Breadcrumb } from '@/components/ui/Breadcrumb'
import { BreadcrumbProvider } from '@/contexts/BreadcrumbContext'
import { useTimeTrackingNotifications } from '@/hooks/useTimeTrackingNotifications'
import { usePermissionContext } from '@/lib/permissions/permission-context'
import { ContentLoader } from '@/components/ui/ContentLoader'
import { DateTimeProvider } from '@/components/providers/DateTimeProvider'

interface MainLayoutProps {
  children: React.ReactNode
  breadcrumbItems?: Array<{ label: string; href?: string }>
}

export function MainLayout({ children, breadcrumbItems }: MainLayoutProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const { loading: permissionsLoading, error: permissionsError, permissions } = usePermissionContext()

  // Listen for time tracking notifications and show toast popups
  useTimeTrackingNotifications()

  // Load user preferences for sidebar collapsed state (non-blocking)
  useEffect(() => {
    const loadUserPreferences = async () => {
      try {
        const response = await fetch('/api/auth/me')
        if (response.ok) {
          const userData = await response.json()
          const sidebarPreference = userData.preferences?.sidebarCollapsed || false
          setSidebarCollapsed(sidebarPreference)
        }
      } catch (error) {
        console.error('Failed to load user preferences:', error)
        // Keep default state (false) on error
      }
    }

    if (mounted) {
      // Load preferences asynchronously without blocking render
      loadUserPreferences()
    }
  }, [mounted])

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <ContentLoader message="Loading..." size="lg" />
      </div>
    )
  }

  // Wait for permissions to load before rendering the layout
  // Only show loading if permissions are actually being fetched (not just initialized)
  if (permissionsLoading && !permissions) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <ContentLoader message="Loading..." size="lg" />
      </div>
    )
  }

  if (permissionsError) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="text-center">
          <p className="text-sm text-destructive">Failed to load permissions</p>
          <p className="text-xs text-muted-foreground mt-1">{permissionsError}</p>
        </div>
      </div>
    )
  }

  return (
    <DateTimeProvider>
      <BreadcrumbProvider>
        <div className="flex h-screen bg-background overflow-x-hidden">
        {/* Desktop Sidebar */}
        <div className="hidden lg:block">
          <Sidebar
            collapsed={sidebarCollapsed}
            onToggle={async () => {
              const newCollapsedState = !sidebarCollapsed
              setSidebarCollapsed(newCollapsedState)

              // Save preference to backend
              try {
                await fetch('/api/settings/user', {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ sidebarCollapsed: newCollapsedState })
                })
              } catch (error) {
                console.error('Failed to save sidebar preference:', error)
              }
            }}
          />
        </div>
        
        {/* Mobile Menu */}
        <MobileMenu 
          isOpen={mobileMenuOpen}
          onClose={() => setMobileMenuOpen(false)}
        />
        
        {/* Main Content */}
        <div className="flex flex-1 flex-col overflow-hidden min-h-0">
          {/* Header */}
          <Header onMobileMenuToggle={() => setMobileMenuOpen(true)} />
          
          {/* Breadcrumb */}
          <div className="mb-4">
            <Breadcrumb items={breadcrumbItems} />
          </div>
          
          {/* Page Content */}
          <main className="flex-1 overflow-auto p-3 sm:p-4 lg:p-6 min-h-0">
            <div className="mx-auto max-w-7xl">
              {children}
            </div>
          </main>
        </div>
      </div>
      </BreadcrumbProvider>
    </DateTimeProvider>
  )
}
