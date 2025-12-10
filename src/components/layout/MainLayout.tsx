'use client'

import { useState } from 'react'
import { Sidebar } from './Sidebar'
import { Header } from './Header'
import { MobileMenu } from '@/components/ui/MobileMenu'
import { Breadcrumb } from '@/components/ui/Breadcrumb'
import { BreadcrumbProvider } from '@/contexts/BreadcrumbContext'
import { useTimeTrackingNotifications } from '@/hooks/useTimeTrackingNotifications'
import { usePermissionContext } from '@/lib/permissions/permission-context'
import { ContentLoader } from '@/components/ui/ContentLoader'

interface MainLayoutProps {
  children: React.ReactNode
}

export function MainLayout({ children }: MainLayoutProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const { loading: permissionsLoading, error: permissionsError, permissions } = usePermissionContext()
  
  // Listen for time tracking notifications and show toast popups
  useTimeTrackingNotifications()

  // Wait for permissions to load before rendering the layout
  // Only show loading if permissions are actually being fetched (not just initialized)
  if (permissionsLoading && !permissions) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <ContentLoader message="Loading permissions..." size="lg" />
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
    <BreadcrumbProvider>
      <div className="flex h-screen bg-background overflow-x-hidden">
        {/* Desktop Sidebar */}
        <div className="hidden lg:block">
          <Sidebar 
            collapsed={sidebarCollapsed}
            onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
          />
        </div>
        
        {/* Mobile Menu */}
        <MobileMenu 
          isOpen={mobileMenuOpen}
          onClose={() => setMobileMenuOpen(false)}
        />
        
        {/* Main Content */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Header */}
          <Header onMobileMenuToggle={() => setMobileMenuOpen(true)} />
          
          {/* Breadcrumb */}
          <Breadcrumb />
          
          {/* Page Content */}
          <main className="flex-1 overflow-auto p-3 sm:p-4 lg:p-6">
            <div className="mx-auto max-w-7xl">
              {children}
            </div>
          </main>
        </div>
      </div>
    </BreadcrumbProvider>
  )
}
