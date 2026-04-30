'use client'

import React from 'react'
import { Clock, LogOut, RefreshCw } from 'lucide-react'

interface SessionTimeoutWarningProps {
  showWarning: boolean
  remainingSeconds: number
  onStayLoggedIn: () => void
  onLogout: () => void
}

export function SessionTimeoutWarning({
  showWarning,
  remainingSeconds,
  onStayLoggedIn,
  onLogout,
}: SessionTimeoutWarningProps) {
  if (!showWarning) return null

  const minutes = Math.floor(remainingSeconds / 60)
  const seconds = remainingSeconds % 60
  const timeDisplay = minutes > 0
    ? `${minutes}m ${seconds.toString().padStart(2, '0')}s`
    : `${seconds}s`

  const isUrgent = remainingSeconds <= 60

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[9998]" />

      {/* Modal */}
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
        <div className="bg-background border border-border rounded-xl shadow-2xl max-w-md w-full p-6 animate-in fade-in zoom-in-95 duration-200">
          {/* Icon */}
          <div className="flex justify-center mb-4">
            <div className={`h-16 w-16 rounded-full flex items-center justify-center ${
              isUrgent
                ? 'bg-destructive/10 text-destructive'
                : 'bg-amber-500/10 text-amber-500'
            }`}>
              <Clock className="h-8 w-8" />
            </div>
          </div>

          {/* Title */}
          <h2 className="text-xl font-semibold text-center text-foreground mb-2">
            Session Expiring Soon
          </h2>

          {/* Description */}
          <p className="text-sm text-muted-foreground text-center mb-4">
            Your session will expire due to inactivity. You will be logged out automatically.
          </p>

          {/* Countdown */}
          <div className={`text-center py-3 px-4 rounded-lg mb-6 ${
            isUrgent
              ? 'bg-destructive/10 border border-destructive/20'
              : 'bg-amber-500/10 border border-amber-500/20'
          }`}>
            <p className="text-xs text-muted-foreground mb-1">Time remaining</p>
            <p className={`text-2xl font-mono font-bold ${
              isUrgent ? 'text-destructive' : 'text-amber-500'
            }`}>
              {timeDisplay}
            </p>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={onLogout}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-border text-sm font-medium text-muted-foreground hover:bg-accent transition-colors"
            >
              <LogOut className="h-4 w-4" />
              Logout
            </button>
            <button
              onClick={onStayLoggedIn}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              <RefreshCw className="h-4 w-4" />
              Stay Logged In
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
