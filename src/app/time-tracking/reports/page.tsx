'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { MainLayout } from '@/components/layout/MainLayout'
import { TimeReports } from '@/components/time-tracking/TimeReports'
import { Button } from '@/components/ui/Button'
import { BarChart3, ArrowLeft, ShieldOff, LayoutDashboard } from 'lucide-react'
import { usePermissions } from '@/lib/permissions/permission-context'
import { Permission } from '@/lib/permissions/permission-definitions'
import { useAuthContext } from '@/contexts/AuthContext'

export default function TimeReportsPage() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuthContext()

  const router = useRouter()
  const [isLoading, setIsLoading] = useState(true)
  const { hasPermission } = usePermissions()

  const canAccessTimeReports = hasPermission(Permission.TIME_LOG_REPORT_ACCESS)

  useEffect(() => {
    if (!authLoading && isAuthenticated && user) {
      setIsLoading(false)
    } else if (!authLoading && !isAuthenticated) {
      router.push('/login')
    }
  }, [authLoading, isAuthenticated, user, router])

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-3">
          <div className="h-10 w-10 rounded-full border-2 border-[var(--apple-system-blue)] border-t-transparent animate-spin mx-auto" />
          <p className="text-[15px] text-[var(--apple-secondary-label)]">Loading reports…</p>
        </div>
      </div>
    )
  }

  if (!user) return null

  if (!canAccessTimeReports) {
    return (
      <MainLayout>
        <div className="min-h-[60vh] flex items-center justify-center p-6">
          <div className="max-w-sm w-full text-center space-y-5">
            <div
              className="h-16 w-16 rounded-[var(--apple-radius-xl)] flex items-center justify-center mx-auto shadow-[0_4px_16px_rgba(255,59,48,0.25)]"
              style={{ background: 'linear-gradient(135deg,#FF3B30 0%,#FF453A 100%)' }}
            >
              <ShieldOff className="h-8 w-8 text-white" />
            </div>
            <div className="space-y-1.5">
              <h2 className="text-[20px] font-bold tracking-tight text-[var(--apple-label)]">Access Restricted</h2>
              <p className="text-[14px] text-[var(--apple-secondary-label)] leading-relaxed">
                You don't have permission to view Time Reports. This feature is available to Administrators and HR personnel only.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2.5 justify-center">
              <button
                onClick={() => router.push('/time-tracking')}
                className="inline-flex items-center justify-center gap-2 h-9 px-4 rounded-[var(--apple-radius-md)] text-[14px] font-medium border border-[var(--apple-separator)] bg-card text-[var(--apple-label)] apple-transition hover:bg-[var(--apple-quaternary-fill)]"
              >
                <ArrowLeft className="h-4 w-4" />
                Time Tracking
              </button>
              <button
                onClick={() => router.push('/dashboard')}
                className="inline-flex items-center justify-center gap-2 h-9 px-4 rounded-[var(--apple-radius-md)] text-[14px] font-semibold text-white apple-transition"
                style={{ background: 'linear-gradient(135deg,#007AFF 0%,#5AC8FA 100%)', boxShadow: '0 2px 8px rgba(0,122,255,0.25)' }}
              >
                <LayoutDashboard className="h-4 w-4" />
                Dashboard
              </button>
            </div>
          </div>
        </div>
      </MainLayout>
    )
  }

  return (
    <MainLayout>
      <div className="space-y-6 view-transition-container">

        {/* ── Page Header ─────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className="h-11 w-11 rounded-[var(--apple-radius-md)] flex items-center justify-center flex-shrink-0 shadow-[0_2px_8px_rgba(191,90,242,0.30)]"
              style={{ background: 'linear-gradient(135deg,#BF5AF2 0%,#FF375F 100%)' }}
            >
              <BarChart3 className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-[28px] sm:text-[30px] font-bold tracking-tight text-[var(--apple-label)]">
                Time Reports
              </h1>
              <p className="text-[15px] text-[var(--apple-secondary-label)] mt-0.5">
                Analyze time tracking data and generate insights
              </p>
            </div>
          </div>
          <button
            onClick={() => router.push('/time-tracking')}
            className="self-start sm:self-auto inline-flex items-center gap-1.5 h-9 px-3.5 rounded-[var(--apple-radius-md)] text-[14px] font-medium border border-[var(--apple-separator)] bg-card text-[var(--apple-label)] apple-transition hover:bg-[var(--apple-quaternary-fill)]"
          >
            <ArrowLeft className="h-4 w-4" />
            Time Tracking
          </button>
        </div>

        <TimeReports
          userId={(user as any)._id || (user as any).id}
          organizationId={user.organization}
        />
      </div>
    </MainLayout>
  )
}
