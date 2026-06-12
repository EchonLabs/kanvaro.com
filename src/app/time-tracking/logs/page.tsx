"use client"

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { MainLayout } from '@/components/layout/MainLayout'
import { TimeLogs } from '@/components/time-tracking/TimeLogs'
import { FileText, ArrowLeft, Clock, TrendingUp, CheckCircle2, Calendar } from 'lucide-react'
import { useAuthContext } from '@/contexts/AuthContext'

export default function TimeLogsPage() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuthContext()

  const router = useRouter()
  const [isLoading, setIsLoading] = useState(true)
  const [stats, setStats] = useState<{ today: number; week: number; pending: number } | null>(null)

  useEffect(() => {
    if (!authLoading && isAuthenticated && user) {
      setIsLoading(false)
      fetchStats()
    } else if (!authLoading && !isAuthenticated) {
      router.push('/login')
    }
  }, [authLoading, isAuthenticated, user, router])

  const fetchStats = async () => {
    if (!user) return
    try {
      const now = new Date()
      const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0)
      const todayEnd = new Date(now); todayEnd.setHours(23, 59, 59, 999)
      const weekStart = new Date(now); weekStart.setDate(now.getDate() - now.getDay()); weekStart.setHours(0, 0, 0, 0)

      const [todayRes, weekRes] = await Promise.all([
        fetch(`/api/time-tracking/entries?userId=${user.id}&organizationId=${user.organization}&startDate=${todayStart.toISOString()}&endDate=${todayEnd.toISOString()}`),
        fetch(`/api/time-tracking/entries?userId=${user.id}&organizationId=${user.organization}&startDate=${weekStart.toISOString()}&endDate=${now.toISOString()}`)
      ])
      const [todayData, weekData] = await Promise.all([todayRes.json(), weekRes.json()])
      const todayMins = todayData?.totals?.totalDuration ?? 0
      const weekMins = weekData?.totals?.totalDuration ?? 0
      const pendingApproval = (weekData?.data ?? []).filter((e: any) => e.status === 'pending' || e.approvalStatus === 'pending').length
      setStats({
        today: todayMins,
        week: weekMins,
        pending: pendingApproval
      })
    } catch {
      // non-critical
    }
  }

  const fmtMins = (mins: number) => {
    const h = Math.floor(mins / 60)
    const m = Math.round(mins % 60)
    return h > 0 ? `${h}h ${m > 0 ? `${m}m` : ''}`.trim() : `${m}m`
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-3">
          <div className="h-10 w-10 rounded-full border-2 border-[var(--apple-system-green)] border-t-transparent animate-spin mx-auto" />
          <p className="text-[15px] text-[var(--apple-secondary-label)]">Loading time logs…</p>
        </div>
      </div>
    )
  }

  if (!user) return null

  const STAT_ITEMS = [
    {
      label: "Today",
      value: stats ? fmtMins(stats.today) : '—',
      icon: Clock,
      gradient: 'var(--apple-card-gradient)',
      shadow: 'var(--apple-chart-glow)',
    },
    {
      label: "This Week",
      value: stats ? fmtMins(stats.week) : '—',
      icon: TrendingUp,
      gradient: 'var(--apple-card-gradient)',
      shadow: 'var(--apple-chart-glow)',
    },
    {
      label: "Pending",
      value: stats ? String(stats.pending) : '—',
      icon: CheckCircle2,
      gradient: 'var(--apple-card-gradient)',
      shadow: 'var(--apple-chart-glow)',
    },
  ]

  return (
    <MainLayout>
      <div className="space-y-6 view-transition-container">

        {/* ── Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <FileText className="h-8 w-8 flex-shrink-0" strokeWidth={1.5} style={{ color: 'var(--apple-card-gradient)' }} />
            <div>
              <h1 className="text-[28px] sm:text-[30px] font-bold tracking-tight text-[var(--apple-label)]">Time Logs</h1>
              <p className="text-[15px] text-[var(--apple-secondary-label)] mt-0.5">Review and manage your time entries</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => router.push('/time-tracking/timer')}
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-[var(--apple-radius-md)] text-[14px] font-semibold text-white apple-transition"
              style={{ background: 'var(--apple-card-gradient)', boxShadow: '0 2px 8px var(--apple-chart-glow)' }}
            >
              <Clock className="h-4 w-4" />
              Start Timer
            </button>
            <button
              onClick={() => router.push('/time-tracking')}
              className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-[var(--apple-radius-md)] text-[14px] font-medium border border-[var(--apple-separator)] bg-card text-[var(--apple-label)] apple-transition hover:bg-[var(--apple-quaternary-fill)]"
            >
              <ArrowLeft className="h-4 w-4" />
              Time Tracking
            </button>
          </div>
        </div>

        {/* ── Quick Stats Bar */}
        <div className="grid grid-cols-3 gap-3 sm:gap-4">
          {STAT_ITEMS.map((item) => {
            const Icon = item.icon
            return (
              <div
                key={item.label}
                className="card-fade-in rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] dark:shadow-none p-3 sm:p-4 flex items-center gap-3"
              >
                <div
                  className="h-9 w-9 rounded-[var(--apple-radius-sm)] flex items-center justify-center flex-shrink-0"
                  style={{ background: item.gradient, boxShadow: `0 2px 8px ${item.shadow}` }}
                >
                  <Icon className="h-4 w-4 text-white" />
                </div>
                <div className="min-w-0">
                  <p className="text-[18px] sm:text-[20px] font-bold tracking-tight text-[var(--apple-label)] tabular-nums">{item.value}</p>
                  <p className="text-[11px] font-semibold text-[var(--apple-secondary-label)] uppercase tracking-[0.06em]">{item.label}</p>
                </div>
              </div>
            )
          })}
        </div>

        {/* ── Section Header */}
        <div className="flex items-center gap-2.5">
          <div
            className="h-7 w-7 rounded-[var(--apple-radius-sm)] flex items-center justify-center flex-shrink-0"
            style={{ background: 'var(--apple-card-gradient)' }}
          >
            <Calendar className="h-3.5 w-3.5 text-white" />
          </div>
          <h2 className="text-[17px] font-semibold text-[var(--apple-label)]">All Entries</h2>
          <span className="text-[13px] text-[var(--apple-tertiary-label)]">· Browse and filter your logs</span>
        </div>

        <TimeLogs
          userId={(user as any)._id || (user as any).id}
          organizationId={user.organization}
          showManualLogButtons={true}
        />
      </div>
    </MainLayout>
  )
}
