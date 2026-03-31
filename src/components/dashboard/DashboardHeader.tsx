'use client'

import { Calendar, Clock } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { formatToTitleCase } from '@/lib/utils'

interface DashboardHeaderProps {
  user: any
}

export function DashboardHeader({ user }: DashboardHeaderProps) {
  const currentDate = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })

  const currentTime = new Date().toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit'
  })

  const lastLoginText = user?.lastLogin
    ? new Date(user.lastLogin).toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })
    : 'Not available'

  return (
    <div className="space-y-1">
      <div className="flex flex-col sm:flex-row items-start sm:items-baseline justify-between gap-1 sm:gap-4">
        <div className="flex-1 min-w-0">
          <h1 className="text-lg sm:text-xl font-bold">
            <span className="block sm:inline">Welcome back,</span>
            <span className="block sm:inline sm:ml-2">{user?.firstName || 'User'}!</span>
          </h1>
        </div>
        
        <div className="text-right space-y-0.5 flex-shrink-0 w-full sm:w-auto">
          <div className="text-xs text-muted-foreground whitespace-nowrap">
            Last login: {lastLoginText}
          </div>
          <div className="flex sm:justify-end">
            <Badge variant="secondary" className="text-xs hover:bg-secondary dark:hover:bg-secondary">
              {user?.customRole?.name || formatToTitleCase(user?.role) || 'Team Member'}
            </Badge>
          </div>
        </div>
      </div>
      
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4 text-xs text-muted-foreground">
        <div className="flex items-center whitespace-nowrap">
          <Calendar className="h-3.5 w-3.5 mr-1.5 flex-shrink-0" />
          <span className="truncate">{currentDate}</span>
        </div>
        <div className="flex items-center whitespace-nowrap">
          <Clock className="h-3.5 w-3.5 mr-1.5 flex-shrink-0" />
          <span>{currentTime}</span>
        </div>
      </div>
    </div>
  )
}
