'use client'

import { useState } from 'react'
import { Sidebar } from './Sidebar'
import { Header } from './Header'
import { MobileMenu } from '@/components/ui/MobileMenu'
import { useTimeTrackingNotifications } from '@/hooks/useTimeTrackingNotifications'

interface MainLayoutProps {
  children: React.ReactNode
}

export function MainLayout({ children }: MainLayoutProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  
  // Listen for time tracking notifications and show toast popups
  useTimeTrackingNotifications()

  return (
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
        
        {/* Page Content */}
        <main className="flex-1 overflow-auto p-3 sm:p-4 lg:p-6">
          <div className="mx-auto max-w-7xl">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
