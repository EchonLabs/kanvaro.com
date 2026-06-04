'use client'

import { Calendar, Clock } from 'lucide-react'

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

  return (
    <div>
      <h1 className="text-[26px] sm:text-[28px] font-bold leading-tight tracking-tight text-[var(--apple-label)]">
        Welcome back,{' '}
        <span className="text-[var(--apple-system-blue)]">{user?.firstName || 'User'}!</span>
      </h1>
      <div className="flex items-center gap-2 mt-0.5 text-sm text-[var(--apple-secondary-label)]">
        <Calendar className="h-3.5 w-3.5 flex-shrink-0" />
        <span>{currentDate}</span>
        <span className="text-[var(--apple-tertiary-label)]">•</span>
        <Clock className="h-3.5 w-3.5 flex-shrink-0" />
        <span className="font-apple-mono">{currentTime}</span>
      </div>
    </div>
  )
}
