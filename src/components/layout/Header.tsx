'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useTheme } from 'next-themes'
import { Bell, User, Sun, Moon, Monitor, LogOut, UserCircle, X, Check, Menu } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { ConfirmationModal } from '@/components/ui/ConfirmationModal'
import { Badge } from '@/components/ui/Badge'
import { OrganizationLogo } from '@/components/ui/OrganizationLogo'
import { GlobalSearch } from '@/components/search/GlobalSearch'
import { useNotifications } from '@/hooks/useNotifications'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/DropdownMenu'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/Popover'

interface HeaderProps {
  onMobileMenuToggle?: () => void
}

export function Header({ onMobileMenuToggle }: HeaderProps) {
  const [user, setUser] = useState<any>(null)
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
  const [mounted, setMounted] = useState(false)
  const router = useRouter()
  const { theme, setTheme } = useTheme()
  const { notifications, unreadCount, markAsRead, markAllAsRead, deleteNotification, loading } = useNotifications({
    limit: 10,
    autoRefresh: true
  })

  useEffect(() => {
    setMounted(true)
  }, [])

  // Load user data
  useEffect(() => {
    const loadUser = async () => {
      try {
        const response = await fetch('/api/auth/me')
        if (response.ok) {
          const userData = await response.json()
          setUser(userData)
        }
      } catch (error) {
        console.error('Failed to load user data:', error)
      }
    }

    loadUser()
  }, [])

  const handleLogout = async () => {
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST' })
      if (response.ok) {
        // Clear any client-side state if needed
        router.push('/login')
      } else {
        console.error('Logout failed:', await response.text())
        // Still redirect to login even if logout API fails
        router.push('/login')
      }
    } catch (error) {
      console.error('Logout failed:', error)
      // Still redirect to login even if logout API fails
      router.push('/login')
    }
  }

  return (
    <>
    <header className="flex h-14 lg:h-16 items-center border-b bg-background px-3 sm:px-4">
      {/* Mobile Menu Button */}
      <Button
        variant="ghost"
        size="icon"
        onClick={onMobileMenuToggle}
        className="lg:hidden h-9 w-9 mr-2"
        title="Toggle Menu"
      >
        <Menu className="h-4 w-4" />
      </Button>

      {/* Global Search - Full Width */}
      <div className="flex-1">
        <GlobalSearch 
          placeholder="Search projects, tasks, users, epics, sprints..."
          className="w-full"
        />
      </div>

      {/* Right Side Actions */}
      <div className="flex items-center space-x-1 sm:space-x-2 ml-2 sm:ml-4">
        {/* Theme Toggle Buttons - Hidden on mobile */}
        {mounted && (
              <div className="hidden md:flex items-center border rounded-md">
            <Button
              variant={theme === 'light' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setTheme('light')}
              className="h-8 px-3 rounded-r-none border-r"
              title="Light Mode"
            >
              <Sun className="h-4 w-4" />
            </Button>
            <Button
              variant={theme === 'dark' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setTheme('dark')}
              className="h-8 px-3 rounded-none border-r"
              title="Dark Mode"
            >
              <Moon className="h-4 w-4" />
            </Button>
            <Button
              variant={theme === 'system' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setTheme('system')}
              className="h-8 px-3 rounded-l-none"
              title="System Theme"
            >
              <Monitor className="h-4 w-4" />
            </Button>
          </div>
        )}

        {/* Notifications */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="relative h-9 w-9" title="Notifications">
              <Bell className="h-4 w-4" />
              {unreadCount > 0 && (
                <Badge className="absolute -top-1 -right-1 h-5 w-5 rounded-full p-0 text-xs flex items-center justify-center">
                  {unreadCount}
                </Badge>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[calc(100vw-2rem)] sm:w-80" align="end">
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-0">
                <h4 className="font-medium text-sm sm:text-base">Notifications</h4>
                {unreadCount > 0 && (
                  <Button variant="ghost" size="sm" onClick={markAllAsRead} className="w-full sm:w-auto text-xs sm:text-sm">
                    <Check className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
                    Mark All as Read
                  </Button>
                )}
              </div>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {loading ? (
                  <div className="flex items-center justify-center py-4">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                  </div>
                ) : notifications.length === 0 ? (
                  <div className="text-center py-4 text-xs sm:text-sm text-muted-foreground">
                    No notifications
                  </div>
                ) : (
                  notifications.map((notification) => (
                    <div
                      key={(notification._id as any).toString()}
                      className={`flex items-start space-x-2 sm:space-x-3 rounded-lg p-2 sm:p-3 hover:bg-accent ${
                        !notification.isRead ? 'bg-primary/5 border-l-2 border-primary' : ''
                      }`}
                    >
                      <div className="h-7 w-7 sm:h-8 sm:w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <span className="text-xs font-medium">
                          {notification.type.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-xs sm:text-sm font-medium break-words flex-1 min-w-0">{notification.title}</p>
                          <div className="flex items-center space-x-1 flex-shrink-0">
                            {!notification.isRead && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0"
                                onClick={() => markAsRead((notification._id as any).toString())}
                                title="Mark as read"
                              >
                                <Check className="h-3 w-3" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0"
                              onClick={() => deleteNotification((notification._id as any).toString())}
                              title="Delete notification"
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground break-words">
                          {notification.message}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(notification.createdAt).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </PopoverContent>
        </Popover>

        {/* User Profile Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-9 px-2 sm:px-3" title="My Account">
              <User className="h-4 w-4 mr-1 sm:mr-2" />
              <span className="hidden sm:inline">
                {user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email : 'User'}
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              {user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email : 'User'}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => router.push('/profile')}>
              <UserCircle className="mr-2 h-4 w-4" />
              Profile
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setShowLogoutConfirm(true)}>
              <LogOut className="mr-2 h-4 w-4" />
              Logout
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
    <ConfirmationModal
      isOpen={showLogoutConfirm}
      onClose={() => setShowLogoutConfirm(false)}
      onConfirm={handleLogout}
      title="Logout"
      description="Are you sure you want to log out?"
      confirmText="Logout"
      cancelText="Cancel"
    />
    </>
  )
}
