'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { MainLayout } from '@/components/layout/MainLayout'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { useAuthContext } from '@/contexts/AuthContext'
import { cn } from '@/lib/utils'
import {
  Clock,
  Play,
  FileText,
  BarChart3,
  Target,
  Timer,
  Calendar,
  TrendingUp,
  Loader2,
  ArrowRight,
  Clock3,
  CheckCircle2,
  FolderOpen,
  Zap
} from 'lucide-react'

interface ActiveTimer {
  _id: string
  project: { _id: string; name: string }
  task?: { _id: string; title: string }
  description: string
  startTime: string
  currentDuration: number
  isPaused: boolean
  isBillable: boolean
}

const TIME_PALETTE = [
  { gradient: 'var(--apple-card-gradient)', glow: 'var(--apple-chart-glow)', bg: 'bg-blue-50 dark:bg-blue-950/30', text: 'text-blue-600 dark:text-blue-400' },
  { gradient: 'var(--apple-card-gradient)', glow: 'var(--apple-chart-glow)', bg: 'bg-emerald-50 dark:bg-emerald-950/30', text: 'text-emerald-600 dark:text-emerald-400' },
  { gradient: 'var(--apple-card-gradient)', glow: 'var(--apple-chart-glow)', bg: 'bg-purple-50 dark:bg-purple-950/30', text: 'text-purple-600 dark:text-purple-400' },
]

export default function TimeTrackingPage() {
  const [isLoading, setIsLoading] = useState(true)
  const [stats, setStats] = useState<any>(null)
  const [statsLoading, setStatsLoading] = useState(true)
  const [activeTimer, setActiveTimer] = useState<ActiveTimer | null>(null)
  const [displayTime, setDisplayTime] = useState('00:00:00')
  const baseMinutesRef = useRef<number>(0)
  const tickStartMsRef = useRef<number | null>(null)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const router = useRouter()
  const { user, isAuthenticated, isLoading: authLoading } = useAuthContext()

  const loadActiveTimer = async (currentUser: any) => {
    if (!currentUser?.id || !currentUser?.organization) return
    try {
      const response = await fetch(
        `/api/time-tracking/timer?userId=${currentUser.id}&organizationId=${currentUser.organization}`
      )
      if (response.ok) {
        const data = await response.json()
        setActiveTimer(data.activeTimer ?? null)
      }
    } catch (err) {
      console.error('Failed to load active timer:', err)
    }
  }

  useEffect(() => {
    if (!authLoading && isAuthenticated && user) {
      setIsLoading(false)
      loadActiveTimer(user)
    } else if (!authLoading && !isAuthenticated) {
      router.push('/login')
    }
  }, [authLoading, isAuthenticated, user, router])

  useEffect(() => {
    const fetchStats = async () => {
      if (!user) return
      try {
        setStatsLoading(true)
        const response = await fetch('/api/time-tracking/stats')
        if (response.ok) {
          const statsData = await response.json()
          setStats(statsData)
        }
      } catch (error) {
        console.error('Failed to fetch time tracking stats:', error)
      } finally {
        setStatsLoading(false)
      }
    }
    fetchStats()
  }, [user])

  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    if (!activeTimer) {
      setDisplayTime('00:00:00')
      baseMinutesRef.current = 0
      tickStartMsRef.current = null
      return
    }
    baseMinutesRef.current = activeTimer.currentDuration || 0
    const fmt = (m: number) => {
      const h = Math.floor(m / 60)
      const mn = Math.floor(m % 60)
      const s = Math.floor((m % 1) * 60)
      return `${String(h).padStart(2, '0')}:${String(mn).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    }
    setDisplayTime(fmt(baseMinutesRef.current))
    if (!activeTimer.isPaused) {
      tickStartMsRef.current = Date.now()
      intervalRef.current = setInterval(() => {
        const elapsed = (Date.now() - (tickStartMsRef.current as number)) / 60000
        setDisplayTime(fmt(Math.max(0, baseMinutesRef.current + elapsed)))
      }, 1000)
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [activeTimer])

  const fmtMins = (minutes: number) => {
    const h = Math.floor(minutes / 60)
    const m = Math.round(minutes % 60)
    if (h > 0) return `${h}h ${m}m`
    return `${m}m`
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', { weekday: 'long' })
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-3">
          <div className="h-10 w-10 rounded-full border-2 border-[var(--apple-system-blue)] border-t-transparent animate-spin mx-auto" />
          <p className="text-[15px] text-[var(--apple-secondary-label)]">Loading time tracking…</p>
        </div>
      </div>
    )
  }

  if (!user) return null

  const todayHours = stats?.todaySummary?.timeTracked ?? 0
  const weekHours = stats?.weekSummary?.totalHours ?? 0
  const tasksCompleted = stats?.todaySummary?.tasksCompleted ?? 0
  const billableTime = stats?.todaySummary?.billableTime ?? 0

  return (
    <MainLayout>
      <div className="space-y-6 view-transition-container">

        {/* ── Page Header ─────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <Clock className="h-8 w-8 flex-shrink-0 text-[var(--apple-chart-to)]" strokeWidth={1.5} />
            <div>
              <h1 className="text-[28px] sm:text-[30px] font-bold tracking-tight text-[var(--apple-label)]">
                Time Tracking
              </h1>
              <p className="text-[15px] text-[var(--apple-secondary-label)] mt-0.5">
                Track your work, manage entries, and analyze performance
              </p>
            </div>
          </div>
          <Button
            onClick={() => router.push('/time-tracking/timer')}
            className="h-9 px-4 rounded-[var(--apple-radius-md)] text-[15px] font-medium flex-shrink-0"
            style={{ background: 'var(--apple-card-gradient)' }}
          >
            <Play className="h-4 w-4 mr-2" strokeWidth={1.5} />
            Start Timer
          </Button>
        </div>

        {/* ── Stats Bar ───────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: "Today's Hours", value: statsLoading ? '…' : fmtMins(todayHours), icon: Clock, color: 'text-[var(--apple-system-blue)]', bg: 'bg-blue-50 dark:bg-blue-950/30' },
            { label: "Billable Time", value: statsLoading ? '…' : fmtMins(billableTime), icon: Zap, color: 'text-[var(--apple-system-green)]', bg: 'bg-emerald-50 dark:bg-emerald-950/30' },
            { label: "This Week", value: statsLoading ? '…' : fmtMins(weekHours), icon: Calendar, color: 'text-[var(--apple-system-purple)]', bg: 'bg-purple-50 dark:bg-purple-950/30' },
            { label: "Tasks Done Today", value: statsLoading ? '…' : String(tasksCompleted), icon: CheckCircle2, color: 'text-[var(--apple-system-orange)]', bg: 'bg-orange-50 dark:bg-orange-950/30' },
          ].map((stat) => {
            const Icon = stat.icon
            return (
              <div
                key={stat.label}
                className="card-fade-in rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] dark:shadow-none p-4 apple-transition hover:shadow-[0_4px_14px_rgba(0,0,0,0.09)] dark:hover:shadow-[0_4px_14px_rgba(0,0,0,0.35)]"
              >
                <Icon className={cn('h-5 w-5 mb-3', stat.color)} strokeWidth={1.5} />
                <p className="text-[11px] font-semibold tracking-[0.06em] uppercase text-[var(--apple-tertiary-label)]">
                  {stat.label}
                </p>
                <p className="text-[22px] font-bold tracking-tight text-[var(--apple-label)] font-apple-mono tabular-nums mt-0.5">
                  {stat.value}
                </p>
              </div>
            )
          })}
        </div>

        {/* ── Quick Actions ───────────────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { label: 'Timer', desc: 'Start or manage a live timer', path: '/time-tracking/timer', ...TIME_PALETTE[0], icon: Play },
            { label: 'Time Logs', desc: 'Review and edit time entries', path: '/time-tracking/logs', ...TIME_PALETTE[1], icon: FileText },
            { label: 'Reports', desc: 'Analyze tracked time data', path: '/time-tracking/reports', ...TIME_PALETTE[2], icon: BarChart3 },
          ].map((action) => {
            const Icon = action.icon
            return (
              <button
                key={action.label}
                onClick={() => router.push(action.path)}
                className="card-fade-in text-left rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] dark:shadow-none p-5 apple-transition hover:shadow-[0_8px_28px_rgba(0,0,0,0.11)] dark:hover:shadow-[0_8px_28px_rgba(0,0,0,0.40)] hover:-translate-y-0.5 group"
              >
                <div className="flex items-center justify-between mb-4">
                  <Icon className={cn('h-6 w-6', action.text)} strokeWidth={1.5} />
                  <ArrowRight className="h-4 w-4 text-[var(--apple-tertiary-label)] group-hover:text-[var(--apple-system-blue)] group-hover:translate-x-0.5 apple-transition" strokeWidth={1.5} />
                </div>
                <p className="text-[17px] font-semibold text-[var(--apple-label)]">{action.label}</p>
                <p className="text-[13px] text-[var(--apple-secondary-label)] mt-0.5">{action.desc}</p>
              </button>
            )
          })}
        </div>

        {/* ── Active Timer + Weekly Summary ───────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* Active Timer */}
          <div className="lg:col-span-2 rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] dark:shadow-none overflow-hidden">
            <div className="px-5 py-4 border-b border-[var(--apple-separator)] flex items-center gap-2">
              <Timer className="h-4 w-4 text-[var(--apple-secondary-label)]" strokeWidth={1.5} />
              <span className="text-[15px] font-semibold text-[var(--apple-label)]">Active Timer</span>
              {activeTimer && (
                <span
                  className={cn(
                    'ml-auto inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border',
                    activeTimer.isPaused
                      ? 'bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800'
                      : 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800'
                  )}
                  style={{ animation: 'badge-border-pulse 3s ease-in-out infinite' }}
                >
                  <span
                    className={cn('h-1.5 w-1.5 rounded-full', activeTimer.isPaused ? 'bg-amber-500' : 'bg-emerald-500')}
                    style={!activeTimer.isPaused ? { animation: 'status-pulse 2s ease-in-out infinite' } : undefined}
                  />
                  {activeTimer.isPaused ? 'Paused' : 'Running'}
                </span>
              )}
            </div>
            <div className="p-5">
              {activeTimer ? (
                <div className="space-y-5">
                  {/* Clock display */}
                  <div className="flex flex-col items-center py-4">
                    <Clock className="h-12 w-12 mb-4 text-[var(--apple-chart-to)]" strokeWidth={1.5} />
                    <span className="text-[44px] font-bold font-apple-mono tabular-nums tracking-[-0.02em] text-[var(--apple-label)]">
                      {displayTime}
                    </span>
                  </div>

                  {/* Timer details */}
                  <div className="rounded-[var(--apple-radius-md)] bg-[var(--apple-tertiary-fill)] p-4 space-y-2.5">
                    <div className="flex items-center gap-2.5 text-[14px]">
                      <FolderOpen className="h-4 w-4 text-[var(--apple-secondary-label)] flex-shrink-0" strokeWidth={1.5} />
                      <span className="text-[var(--apple-tertiary-label)] font-medium min-w-[4rem]">Project</span>
                      <span className="text-[var(--apple-label)] font-medium truncate">{activeTimer.project?.name}</span>
                    </div>
                    {activeTimer.task && (
                      <div className="flex items-center gap-2.5 text-[14px]">
                        <Target className="h-4 w-4 text-[var(--apple-secondary-label)] flex-shrink-0" strokeWidth={1.5} />
                        <span className="text-[var(--apple-tertiary-label)] font-medium min-w-[4rem]">Task</span>
                        <span className="text-[var(--apple-label)] truncate">{activeTimer.task.title}</span>
                      </div>
                    )}
                    {activeTimer.description && (
                      <div className="flex items-start gap-2.5 text-[14px]">
                        <FileText className="h-4 w-4 text-[var(--apple-secondary-label)] flex-shrink-0 mt-0.5" strokeWidth={1.5} />
                        <span className="text-[var(--apple-tertiary-label)] font-medium min-w-[4rem]">Memo</span>
                        <span className="text-[var(--apple-label)] line-clamp-2">{activeTimer.description}</span>
                      </div>
                    )}
                    {activeTimer.isBillable && (
                      <div className="flex items-center gap-2.5">
                        <div className="w-4 flex-shrink-0" />
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                          Billable
                        </span>
                      </div>
                    )}
                  </div>

                  <Button
                    variant="outline"
                    onClick={() => {
                      const pid = activeTimer.project?._id ? `projectId=${encodeURIComponent(activeTimer.project._id)}` : ''
                      const tid = activeTimer.task?._id ? `taskId=${encodeURIComponent(activeTimer.task._id)}` : ''
                      const qs = [pid, tid].filter(Boolean).join('&')
                      router.push(qs ? `/time-tracking/timer?${qs}` : '/time-tracking/timer')
                    }}
                    className="w-full h-9 rounded-[var(--apple-radius-md)] border-[var(--apple-separator)] text-[15px] font-medium apple-transition hover:bg-[var(--apple-quaternary-fill)]"
                  >
                    <Clock className="h-4 w-4 mr-2" strokeWidth={1.5} />
                    Manage Timer
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col items-center py-8 gap-4">
                  <Clock3 className="h-10 w-10 text-[var(--apple-tertiary-label)]" strokeWidth={1.5} />
                  <div className="text-center">
                    <p className="text-[17px] font-semibold text-[var(--apple-label)]">No Active Timer</p>
                    <p className="text-[14px] text-[var(--apple-secondary-label)] mt-1">
                      Start the timer to begin tracking work
                    </p>
                  </div>
                  <Button
                    onClick={() => router.push('/time-tracking/timer')}
                    className="h-9 px-5 rounded-[var(--apple-radius-md)] text-[15px] font-medium"
                    style={{ background: 'linear-gradient(135deg,#007AFF 0%,#5AC8FA 100%)' }}
                  >
                    <Play className="h-4 w-4 mr-2" strokeWidth={1.5} />
                    Start Timer
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Weekly Summary */}
          <div className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] dark:shadow-none overflow-hidden">
            <div className="px-5 py-4 border-b border-[var(--apple-separator)] flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-[var(--apple-secondary-label)]" strokeWidth={1.5} />
              <span className="text-[15px] font-semibold text-[var(--apple-label)]">Weekly Overview</span>
            </div>
            <div className="p-5 space-y-4">
              {[
                { label: 'Total Hours', value: statsLoading ? '…' : fmtMins(weekHours), sub: 'this week' },
                { label: 'Daily Average', value: statsLoading ? '…' : fmtMins(stats?.weekSummary?.averageDaily || 0), sub: 'per day' },
                { label: 'Most Active Day', value: statsLoading ? '…' : (stats?.weekSummary?.mostActiveDay ? formatDate(stats.weekSummary.mostActiveDay.date) : '—'), sub: '' },
              ].map((row) => (
                <div key={row.label} className="flex items-center justify-between py-2 border-b border-[var(--apple-separator)] last:border-0">
                  <div>
                    <p className="text-[13px] text-[var(--apple-secondary-label)]">{row.label}</p>
                    {row.sub && <p className="text-[11px] text-[var(--apple-tertiary-label)] mt-0.5">{row.sub}</p>}
                  </div>
                  <span className="text-[17px] font-semibold font-apple-mono tabular-nums text-[var(--apple-label)]">
                    {row.value}
                  </span>
                </div>
              ))}

              <Button
                variant="outline"
                onClick={() => router.push('/time-tracking/reports')}
                className="w-full h-9 rounded-[var(--apple-radius-md)] border-[var(--apple-separator)] text-[14px] font-medium mt-2 apple-transition hover:bg-[var(--apple-quaternary-fill)]"
              >
                <BarChart3 className="h-4 w-4 mr-2" strokeWidth={1.5} />
                View Reports
              </Button>
            </div>
          </div>
        </div>

        {/* ── Recent Activity ─────────────────────────────────────────── */}
        <div className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] dark:shadow-none overflow-hidden">
          <div className="px-5 py-4 border-b border-[var(--apple-separator)] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-[var(--apple-secondary-label)]" strokeWidth={1.5} />
              <span className="text-[15px] font-semibold text-[var(--apple-label)]">Recent Activity</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push('/time-tracking/logs')}
              className="h-7 px-2.5 text-[13px] text-[var(--apple-system-blue)] hover:bg-[var(--apple-quaternary-fill)] rounded-[var(--apple-radius-sm)]"
            >
              View All
            </Button>
          </div>
          <div className="p-5">
            {statsLoading ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="flex items-center gap-3 animate-pulse">
                    <div className="h-9 w-9 rounded-full bg-[var(--apple-tertiary-fill)] flex-shrink-0" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-3.5 w-48 rounded-full bg-[var(--apple-tertiary-fill)]" />
                      <div className="h-3 w-32 rounded-full bg-[var(--apple-tertiary-fill)]" />
                    </div>
                    <div className="h-3.5 w-12 rounded-full bg-[var(--apple-tertiary-fill)]" />
                  </div>
                ))}
              </div>
            ) : stats?.recentActivity && stats.recentActivity.length > 0 ? (
              <div className="space-y-1">
                {stats.recentActivity.map((entry: any, idx: number) => {
                  const palette = TIME_PALETTE[idx % TIME_PALETTE.length]
                  return (
                    <div
                      key={entry._id}
                      className="flex items-center gap-3 rounded-[var(--apple-radius-md)] px-3 py-2.5 apple-transition hover:bg-[var(--apple-quaternary-fill)] group"
                    >
                      <div
                        className="h-9 w-9 rounded-full flex items-center justify-center flex-shrink-0 text-white text-[12px] font-bold"
                        style={{ background: palette.gradient }}
                      >
                        {(entry.project?.name || '?').charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[14px] font-medium text-[var(--apple-label)] truncate">
                          {entry.description || entry.project?.name || 'Time entry'}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {entry.project && (
                            <span className="text-[12px] text-[var(--apple-secondary-label)] flex items-center gap-1">
                              <FolderOpen className="h-3 w-3" strokeWidth={1.5} />
                              {entry.project.name}
                            </span>
                          )}
                          {entry.isBillable && (
                            <span className="inline-flex items-center px-1.5 py-0 rounded-full text-[10px] font-semibold bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                              Billable
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-[14px] font-semibold font-apple-mono tabular-nums text-[var(--apple-label)]">
                          {fmtMins(entry.duration)}
                        </p>
                        <p className="text-[11px] text-[var(--apple-tertiary-label)] mt-0.5">
                          {new Date(entry.startTime).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center py-8 gap-3">
                <div className="h-14 w-14 rounded-full bg-[var(--apple-tertiary-fill)] flex items-center justify-center">
                  <CheckCircle2 className="h-7 w-7 text-[var(--apple-tertiary-label)]" />
                </div>
                <p className="text-[15px] font-semibold text-[var(--apple-label)]">No Recent Activity</p>
                <p className="text-[13px] text-[var(--apple-secondary-label)]">
                  Start tracking time to see activity here
                </p>
              </div>
            )}
          </div>
        </div>

      </div>
    </MainLayout>
  )
}
