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
    <div>
      {/* Welcome text */}
      <h1 className="text-lg sm:text-xl font-bold leading-tight">
        <span className="inline">Welcome back,</span>
        <span className="inline ml-1.5">{user?.firstName || 'User'}!</span>
      </h1>

      {/* Date & Time - tight below welcome */}
      <div className="flex items-center gap-3 sm:gap-4 text-xs text-muted-foreground mt-0">
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
