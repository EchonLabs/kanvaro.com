'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useTheme } from 'next-themes'
import { Bell, User, Sun, Moon, Monitor, LogOut, UserCircle, X, Check, Menu } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { ConfirmationModal } from '@/components/ui/ConfirmationModal'
import { Badge } from '@/components/ui/Badge'
import { GlobalSearch } from '@/components/search/GlobalSearch'
import { useNotifications } from '@/hooks/useNotifications'
import { GravatarAvatar } from '@/components/ui/GravatarAvatar'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useAuthContext } from '@/contexts/AuthContext'
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
  const { user, logout } = useAuthContext()
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
  const [mounted, setMounted] = useState(false)
  const router = useRouter()
  const { theme, setTheme } = useTheme()
  const { notifications, unreadCount, markAsRead, markAllAsRead, deleteNotification, loading } = useNotifications({
    limit: 10,
    autoRefresh: true,
    refreshInterval: 60000 // Poll every 60 seconds (SSE handles real-time updates)
  })

  useEffect(() => {
    setMounted(true)
  }, [])

  const handleLogout = async () => {
    await logout()
  }

  const getUserDisplayName = () => {
    if (!user) return 'My Account'
    const fullName = `${user.firstName || ''} ${user.lastName || ''}`.trim()
    return fullName || user.email || 'My Account'
  }

  return (
    <>
    <header className="flex h-11 items-center border-b border-[var(--apple-separator)] apple-glass px-3 sm:px-4 sticky top-0 z-30">
      {/* Mobile Menu Button */}
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={onMobileMenuToggle}
              className="lg:hidden h-8 w-8 mr-2 rounded-full"
              aria-label="Toggle Menu"
            >
              <Menu className="h-4 w-4 text-[var(--apple-secondary-label)]" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Toggle Menu</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {/* Global Search - Full Width */}
      <div className="flex-1">
        <GlobalSearch
          placeholder="Search projects, tasks, users, epics, sprints..."
          className="w-full"
        />
      </div>

      {/* Right Side Actions */}
      <div className="flex items-center gap-1.5 ml-3">
        {/* Theme Toggle — Apple pill style */}
        {mounted && (
          <div className="hidden md:flex items-center bg-[var(--apple-tertiary-fill)] rounded-[var(--apple-radius-pill)] p-0.5 gap-0.5">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => setTheme('light')}
                    aria-label="Light Mode"
                    className={cn(
                      'h-7 w-7 flex items-center justify-center rounded-[var(--apple-radius-pill)] apple-transition',
                      theme === 'light'
                        ? 'bg-card shadow-[0_1px_3px_rgba(0,0,0,0.12)] text-[var(--apple-label)]'
                        : 'text-[var(--apple-secondary-label)] hover:text-[var(--apple-label)]'
                    )}
                  >
                    <Sun className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent><p>Light Mode</p></TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => setTheme('dark')}
                    aria-label="Dark Mode"
                    className={cn(
                      'h-7 w-7 flex items-center justify-center rounded-[var(--apple-radius-pill)] apple-transition',
                      theme === 'dark'
                        ? 'bg-card shadow-[0_1px_3px_rgba(0,0,0,0.12)] text-[var(--apple-label)]'
                        : 'text-[var(--apple-secondary-label)] hover:text-[var(--apple-label)]'
                    )}
                  >
                    <Moon className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent><p>Dark Mode</p></TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => setTheme('system')}
                    aria-label="System Theme"
                    className={cn(
                      'h-7 w-7 flex items-center justify-center rounded-[var(--apple-radius-pill)] apple-transition',
                      theme === 'system'
                        ? 'bg-card shadow-[0_1px_3px_rgba(0,0,0,0.12)] text-[var(--apple-label)]'
                        : 'text-[var(--apple-secondary-label)] hover:text-[var(--apple-label)]'
                    )}
                  >
                    <Monitor className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent><p>System Theme</p></TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        )}

        {/* Notifications */}
        <TooltipProvider>
          <Popover>
            <Tooltip>
              <TooltipTrigger asChild>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="icon" className="relative h-8 w-8 rounded-full" aria-label="Notifications">
                    <Bell className="h-4 w-4 text-[var(--apple-secondary-label)]" />
                    {unreadCount > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-[var(--apple-system-red)] text-white text-[10px] flex items-center justify-center font-medium">
                        {unreadCount > 9 ? '9+' : unreadCount}
                      </span>
                    )}
                  </Button>
                </PopoverTrigger>
              </TooltipTrigger>
              <TooltipContent>
                <p>Notifications {unreadCount > 0 && `(${unreadCount} unread)`}</p>
              </TooltipContent>
            </Tooltip>
            <PopoverContent className="w-[calc(100vw-2rem)] sm:w-80 p-0 rounded-[var(--apple-radius-lg)] border-[var(--apple-separator)] overflow-hidden shadow-[0_8px_32px_rgba(0,0,0,0.12)]" align="end">
              <div className="px-4 py-3 border-b border-[var(--apple-separator)] flex items-center justify-between">
                <h4 className="font-semibold text-[15px] text-[var(--apple-label)]">Notifications</h4>
                {unreadCount > 0 && (
                  <Button variant="ghost" size="sm" onClick={markAllAsRead} className="h-7 px-2 text-[13px] text-[var(--apple-system-blue)]">
                    <Check className="h-3 w-3 mr-1" />
                    Mark All Read
                  </Button>
                )}
              </div>
              <div className="max-h-96 overflow-y-auto">
                {loading ? (
                  <div className="flex items-center justify-center py-6">
                    <div className="animate-spin rounded-full h-5 w-5 border-2 border-[var(--apple-system-blue)] border-t-transparent" />
                  </div>
                ) : notifications.length === 0 ? (
                  <div className="text-center py-8 text-sm text-[var(--apple-secondary-label)]">
                    No notifications
                  </div>
                ) : (
                  <div className="p-2 space-y-0.5">
                    {notifications.map((notification) => (
                      <div
                        key={(notification._id as any).toString()}
                        className={cn(
                          'flex items-start gap-3 rounded-[var(--apple-radius-md)] px-3 py-2.5 cursor-pointer apple-transition hover:bg-[var(--apple-quaternary-fill)]',
                          !notification.isRead && 'bg-[var(--apple-system-blue)]/8 border-l-2 border-[var(--apple-system-blue)]/50'
                        )}
                      >
                        <div className="h-7 w-7 rounded-full bg-[var(--apple-tertiary-fill)] flex items-center justify-center flex-shrink-0 mt-0.5">
                          <span className="text-[13px] font-semibold text-[var(--apple-secondary-label)]">
                            {notification.type.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={cn('text-sm font-medium break-words text-[var(--apple-label)]', !notification.isRead && 'font-semibold')}>{notification.title}</p>
                          <p className="text-[13px] text-[var(--apple-secondary-label)] break-words mt-0.5 line-clamp-2">
                            {notification.message}
                          </p>
                          <p className="text-xs text-[var(--apple-tertiary-label)] mt-0.5">
                            {new Date(notification.createdAt).toLocaleString()}
                          </p>
                        </div>
                        <div className="flex items-center gap-0.5 flex-shrink-0">
                          {!notification.isRead && (
                            <button
                              className="h-6 w-6 flex items-center justify-center rounded-full hover:bg-[var(--apple-quaternary-fill)]"
                              onClick={() => markAsRead((notification._id as any).toString())}
                            >
                              <Check className="h-3 w-3 text-[var(--apple-system-blue)]" />
                            </button>
                          )}
                          <button
                            className="h-6 w-6 flex items-center justify-center rounded-full hover:bg-[var(--apple-quaternary-fill)]"
                            onClick={() => deleteNotification((notification._id as any).toString())}
                          >
                            <X className="h-3 w-3 text-[var(--apple-tertiary-label)]" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </PopoverContent>
          </Popover>
        </TooltipProvider>

        {/* User Profile Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="h-8 w-8 p-0 rounded-full overflow-hidden"
              title={getUserDisplayName()}
            >
              {user ? (
                <GravatarAvatar
                  user={{
                    avatar: user.avatar,
                    firstName: user.firstName,
                    lastName: user.lastName,
                    email: user.email
                  }}
                  size={32}
                  className="flex-shrink-0"
                />
              ) : (
                <div className="h-8 w-8 rounded-full bg-[var(--apple-tertiary-fill)] flex items-center justify-center flex-shrink-0">
                  <User className="h-4 w-4 text-[var(--apple-secondary-label)]" />
                </div>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 rounded-[var(--apple-radius-md)] border-[var(--apple-separator)]">
            <DropdownMenuLabel className="text-[var(--apple-label)]">
              {user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email : 'User'}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => router.push('/profile')}>
              <UserCircle className="mr-2 h-4 w-4" />
              Profile
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setShowLogoutConfirm(true)} className="text-[var(--apple-system-red)]">
              <LogOut className="mr-2 h-4 w-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
    <ConfirmationModal
      isOpen={showLogoutConfirm}
      onClose={() => setShowLogoutConfirm(false)}
      onConfirm={handleLogout}
      title="Logout Confirmation"
      description="You are about to log out from the system. This will end your current session and you will need to log in again to access your account. Any unsaved work will be lost."
      confirmText="Logout"
      cancelText="Cancel"
    />
    </>
  )
}
