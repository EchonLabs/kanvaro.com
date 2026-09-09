'use client'

/**
 * The Schedule hub (spec §15.6, UI-8, UI-9, OB-3).
 *
 * The module's first stand-up screen, and therefore the first place the
 * degrade-loudly contract has somewhere to live. §3 rule 1 puts the banner at
 * the top of every stand-up screen, and this one passes the sprint's date range
 * into the scope so `HOLIDAY_COVERAGE_GAP` can actually fire — without a range
 * that notice stays silent by design, because "is the calendar complete?" has
 * no answer without saying complete through when.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CalendarClock, CheckCircle2, Zap } from 'lucide-react'

import { MainLayout } from '@/components/layout/MainLayout'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DegradationBanner } from '@/components/standup/DegradationBanner'
import { StandupSchedule } from '@/components/standup/StandupSchedule'
import type { Degradation } from '@/lib/standup/degradation'
import type { SprintSchedule } from '@/lib/standup/schedule'
import { standupStrings } from '@/lib/standup/strings'

interface SprintOption {
  id: string
  name: string
}

/** Shape mirrors `DayRow` (StandupSchedule.tsx) so the loading state reads
 * as "the same list, not yet here" rather than a generic spinner. */
function DayRowSkeleton() {
  return (
    <div className="flex items-start gap-3 rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card px-4 py-3">
      <div className="mt-0.5 h-4 w-4 shrink-0 rounded-full bg-[var(--apple-tertiary-fill)] animate-pulse" />
      <div className="min-w-0 flex-1 space-y-2">
        <div className="h-4 w-40 rounded bg-[var(--apple-tertiary-fill)] animate-pulse" />
        <div className="h-3 w-24 rounded bg-[var(--apple-tertiary-fill)] animate-pulse" />
      </div>
    </div>
  )
}

interface ScheduleStats {
  completed: number
  missed: number
  remaining: number
  total: number
}

function summarize(schedule: SprintSchedule | null): ScheduleStats {
  const days = schedule?.days ?? []
  const completed = days.filter((day) => day.status === 'Completed').length
  const missed = days.filter((day) => day.status === 'Missed').length
  const remaining = days.length - completed - missed
  return { completed, missed, remaining, total: days.length }
}

export default function ProjectStandupSchedulePage({
  params
}: {
  params: { id: string }
}) {
  const projectId = params.id

  const [sprints, setSprints] = useState<SprintOption[]>([])
  const [sprintId, setSprintId] = useState<string | null>(null)
  const [schedule, setSchedule] = useState<SprintSchedule | null>(null)
  const [degradations, setDegradations] = useState<Degradation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // The path-based auto-generator drops any segment right after an ID
  // ("standups" here) on the assumption the page sets its own breadcrumb —
  // this is that page doing so, via the `breadcrumbItems` prop rather than
  // `useBreadcrumb()`: that hook's provider lives *inside* `MainLayout`, and
  // this component sits above `MainLayout` in the tree, so a page-level
  // `useBreadcrumb()` call can never reach it and silently no-ops.
  const breadcrumbItems = [
    { label: 'Projects', href: '/projects' },
    { label: 'View Project', href: `/projects/${projectId}` },
    { label: 'Stand-up schedule' }
  ]

  useEffect(() => {
    let cancelled = false

    const loadSprints = async () => {
      try {
        const response = await fetch(`/api/sprints?project=${projectId}`)
        const payload = await response.json()
        const rows: SprintOption[] = (payload?.data ?? payload?.sprints ?? []).map(
          (sprint: any) => ({ id: sprint._id ?? sprint.id, name: sprint.name })
        )

        if (cancelled) return
        setSprints(rows)
        setSprintId((current) => current ?? rows[0]?.id ?? null)
        if (rows.length === 0) setLoading(false)
      } catch {
        if (!cancelled) {
          setError(standupStrings.schedule.sprintsLoadFailed())
          setLoading(false)
        }
      }
    }

    loadSprints()
    return () => {
      cancelled = true
    }
  }, [projectId])

  const loadSchedule = useCallback(async () => {
    if (!sprintId) return

    setLoading(true)
    try {
      const response = await fetch(`/api/sprints/${sprintId}/standups`)
      if (!response.ok) throw new Error('schedule')

      const payload = await response.json()
      const loaded: SprintSchedule = payload.data ?? payload
      setSchedule(loaded)
      setError(null)

      // The range is what makes the coverage notice answerable (OB-3).
      const health = await fetch(
        `/api/standup/health?projectId=${projectId}&sprintId=${sprintId}` +
          `&from=${loaded.dateRange.from}&to=${loaded.dateRange.to}`
      )
      if (health.ok) {
        const healthPayload = await health.json()
        setDegradations(healthPayload.degradations ?? healthPayload.data?.degradations ?? [])
      }
    } catch {
      setError(standupStrings.schedule.scheduleLoadFailed())
    } finally {
      setLoading(false)
    }
  }, [projectId, sprintId])

  useEffect(() => {
    loadSchedule()
  }, [loadSchedule])

  const stats = useMemo(() => summarize(schedule), [schedule])

  return (
    <MainLayout breadcrumbItems={breadcrumbItems}>
      <div className="space-y-6 p-4 md:p-6">
        {/* §3 rule 1: the banner is the first thing on every stand-up screen. */}
        <DegradationBanner degradations={degradations} />

        {/* ── Page Header ─────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <Zap className="h-8 w-8 flex-shrink-0 text-[var(--apple-system-blue)]" strokeWidth={1.5} />
            <div>
              <h1 className="text-[28px] sm:text-[30px] font-bold tracking-tight text-[var(--apple-label)]">
                {standupStrings.schedule.title()}
              </h1>
              <p className="text-[15px] text-[var(--apple-secondary-label)] mt-0.5">
                {schedule
                  ? `${schedule.sprintName} · ${schedule.dateRange.from} to ${schedule.dateRange.to} · ${schedule.timezone}`
                  : 'See what is scheduled, running, or already done for this sprint'}
              </p>
            </div>
          </div>

          {sprints.length > 1 ? (
            <Select value={sprintId ?? ''} onValueChange={(value) => setSprintId(value)}>
              <SelectTrigger
                aria-label="Sprint"
                className="w-44 text-[13px] rounded-[var(--apple-radius-md)] border-[var(--apple-separator)]"
              >
                <SelectValue placeholder="Choose sprint" />
              </SelectTrigger>
              <SelectContent>
                {sprints.map((sprint) => (
                  <SelectItem key={sprint.id} value={sprint.id}>
                    {sprint.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
        </div>

        {/* ── Stats Bar ───────────────────────────────────────────────── */}
        {schedule && stats.total > 0 ? (
          <div className="grid grid-cols-3 gap-3">
            {[
              {
                label: 'Completed',
                value: stats.completed,
                icon: CheckCircle2,
                color: 'text-[var(--apple-system-green)]',
                bg: 'bg-emerald-50 dark:bg-emerald-950/30'
              },
              {
                label: 'Missed',
                value: stats.missed,
                icon: AlertTriangle,
                color: 'text-[var(--apple-system-red)]',
                bg: 'bg-red-50 dark:bg-red-950/30'
              },
              {
                label: 'Remaining',
                value: stats.remaining,
                icon: CalendarClock,
                color: 'text-[var(--apple-system-blue)]',
                bg: 'bg-blue-50 dark:bg-blue-950/30'
              }
            ].map((stat) => {
              const Icon = stat.icon
              return (
                <div
                  key={stat.label}
                  className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] dark:shadow-none p-4"
                >
                  <div className="flex items-center gap-2.5">
                    <div className={`flex h-8 w-8 items-center justify-center rounded-full ${stat.bg}`}>
                      <Icon className={`h-4 w-4 ${stat.color}`} strokeWidth={1.75} />
                    </div>
                    <div>
                      <div className="font-apple-mono text-[20px] font-semibold leading-none text-[var(--apple-label)] tabular-nums">
                        {stat.value}
                      </div>
                      <div className="apple-section-label mt-1 text-[var(--apple-tertiary-label)]">
                        {stat.label}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        ) : null}

        {loading ? (
          <div className="flex flex-col gap-2" aria-label={standupStrings.schedule.loading()}>
            <DayRowSkeleton />
            <DayRowSkeleton />
            <DayRowSkeleton />
          </div>
        ) : error ? (
          <div className="flex items-center gap-2.5 rounded-[var(--apple-radius-lg)] border border-[var(--apple-system-red)]/30 bg-[var(--apple-system-red)]/[0.06] px-4 py-3">
            <AlertTriangle className="h-4 w-4 shrink-0 text-[var(--apple-system-red)]" />
            <p className="text-sm text-[var(--apple-system-red)]">{error}</p>
          </div>
        ) : schedule ? (
          <StandupSchedule schedule={schedule} />
        ) : (
          <p className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card px-4 py-6 text-sm text-[var(--apple-secondary-label)]">
            {standupStrings.schedule.empty()}
          </p>
        )}
      </div>
    </MainLayout>
  )
}
