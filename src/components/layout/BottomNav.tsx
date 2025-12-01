'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { 
  Home, 
  Calendar, 
  Kanban, 
  BarChart3, 
  Plus,
  Menu,
  Clock,
  Bell
} from 'lucide-react'
import { cn } from '@/lib/utils'

const navItems = [
  {
    href: '/dashboard',
    icon: Home,
    label: 'Dashboard'
  },
  {
    href: '/kanban',
    icon: Kanban,
    label: 'Kanban'
  },
  {
    href: '/calendar',
    icon: Calendar,
    label: 'Calendar'
  },
  {
    href: '/reports',
    icon: BarChart3,
    label: 'Reports'
  }
]

export function BottomNav() {
  const pathname = usePathname()
  const [showQuickActions, setShowQuickActions] = useState(false)

  const isActive = (href: string) => {
    if (href === '/dashboard') {
      return pathname === '/dashboard'
    }
    return pathname.startsWith(href)
  }

  const quickActions = [
    {
      href: '/tasks/create',
      icon: Plus,
      label: 'New Task'
    },
    {
      href: '/projects/create',
      icon: Plus,
      label: 'New Project'
    },
    {
      href: '/sprints/create',
      icon: Plus,
      label: 'New Sprint'
    }
  ]

  return (
    <>
      {/* Mobile Bottom Navigation */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-background border-t z-50">
        <div className="flex items-center justify-around py-2">
          {navItems.map((item) => {
            const Icon = item.icon
            return (
              <Link key={item.href} href={item.href}>
                <Button
                  variant={isActive(item.href) ? 'default' : 'ghost'}
                  size="sm"
                  className={cn(
                    'flex flex-col items-center space-y-1 h-auto py-2 px-3',
                    isActive(item.href) && 'bg-primary text-primary-foreground'
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span className="text-xs">{item.label}</span>
                </Button>
              </Link>
            )
          })}
          
          {/* Quick Actions Button */}
          <div className="relative">
            <Button
              variant="ghost"
              size="sm"
              className="flex flex-col items-center space-y-1 h-auto py-2 px-3"
              onClick={() => setShowQuickActions(!showQuickActions)}
            >
              <Plus className="h-4 w-4" />
              <span className="text-xs">More</span>
            </Button>

            {/* Quick Actions Dropdown */}
            {showQuickActions && (
              <div className="absolute bottom-full right-0 mb-2 w-48 bg-background border rounded-lg shadow-lg">
                <div className="p-2 space-y-1">
                  {quickActions.map((action) => {
                    const Icon = action.icon
                    return (
                      <Link key={action.href} href={action.href}>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-full justify-start"
                          onClick={() => setShowQuickActions(false)}
                        >
                          <Icon className="h-4 w-4 mr-2" />
                          {action.label}
                        </Button>
                      </Link>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile Timer Widget */}
      <div className="md:hidden fixed top-4 right-4 z-40">
        <div className="flex space-x-2">
          <Button
            variant="outline"
            size="sm"
            className="h-11 w-11 p-0 min-h-[44px] min-w-[44px]"
          >
            <Clock className="h-5 w-5" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-11 w-11 p-0 min-h-[44px] min-w-[44px]"
          >
            <Bell className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Spacer for mobile content */}
      <div className="md:hidden h-16" />
    </>
  )
}
