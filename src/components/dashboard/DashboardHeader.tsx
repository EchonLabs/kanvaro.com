'use client'

import { Calendar, Clock } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/Card'
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
    <Card className="border-0 overflow-x-hidden">
      <CardContent className="p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex-1 min-w-0">
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-900 dark:text-white">
              <span className="block sm:inline">Welcome back,</span>
              <span className="block sm:inline sm:ml-1">{user?.firstName || 'User'}!</span>
            </h1>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4 mt-2 text-xs sm:text-sm text-muted-foreground">
              <div className="flex items-center whitespace-nowrap">
                <Calendar className="h-3 w-3 sm:h-4 sm:w-4 mr-1 flex-shrink-0" />
                <span className="truncate">{currentDate}</span>
              </div>
              <div className="flex items-center whitespace-nowrap">
                <Clock className="h-3 w-3 sm:h-4 sm:w-4 mr-1 flex-shrink-0" />
                <span>{currentTime}</span>
              </div>
            </div>
          </div>
          
          <div className="text-left sm:text-right space-y-2 flex-shrink-0 w-full sm:w-auto">
            <div className="text-xs sm:text-sm text-muted-foreground whitespace-nowrap">
              Last login: {lastLoginText}
            </div>
            <div className="flex sm:justify-end">
              <Badge variant="secondary" className="text-xs">
                {user?.customRole?.name || formatToTitleCase(user?.role) || 'Team Member'}
              </Badge>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
