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
import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, CalendarDays } from 'lucide-react'

import { MainLayout } from '@/components/layout/MainLayout'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DegradationBanner } from '@/components/standup/DegradationBanner'
import { StandupSchedule } from '@/components/standup/StandupSchedule'
import { SprintHealthBar } from '@/components/standup/schedule/SprintHealthBar'
import { RegenerateScheduleModal } from '@/components/standup/schedule/RegenerateScheduleModal'
import type { Degradation } from '@/lib/standup/degradation'
import type { SprintSchedule } from '@/lib/standup/schedule'
import { standupStrings } from '@/lib/standup/strings'

interface SprintOption {
  id: string
  name: string
}

/** Loading skeleton for health strip */
function HealthBarSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      {[1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="h-28 rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card p-4 space-y-3 animate-pulse"
        >
          <div className="h-3 w-20 rounded bg-[var(--apple-tertiary-fill)]" />
          <div className="h-6 w-24 rounded bg-[var(--apple-tertiary-fill)]" />
          <div className="h-2 w-full rounded bg-[var(--apple-tertiary-fill)]" />
        </div>
      ))}
    </div>
  )
}

/** Shape mirrors DayRow so the loading state reads as the same list. */
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

  return (
    <MainLayout breadcrumbItems={breadcrumbItems}>
      <div className="space-y-6 p-4 md:p-6">
        {/* §3 rule 1: the banner is the first thing on every stand-up screen. */}
        <DegradationBanner degradations={degradations} />

        {/* ── Page Header ─────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--apple-radius-md)] bg-[var(--apple-system-blue)]/10 text-[var(--apple-system-blue)]">
              <CalendarDays className="h-5 w-5" strokeWidth={1.75} />
            </div>
            <div>
              <h1 className="text-[26px] sm:text-[28px] font-bold tracking-tight text-[var(--apple-label)]">
                {standupStrings.schedule.title()}
              </h1>
              <p className="text-[14px] sm:text-[15px] text-[var(--apple-secondary-label)] mt-0.5">
                {schedule
                  ? `${schedule.sprintName} · ${schedule.dateRange.from} to ${schedule.dateRange.to} · ${schedule.timezone}`
                  : 'Track stand-up cadence, capacity, and delivery health for this sprint'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {sprintId ? (
              <RegenerateScheduleModal sprintId={sprintId} onReconciled={loadSchedule} />
            ) : null}

            {sprints.length > 1 ? (
              <Select value={sprintId ?? ''} onValueChange={(value) => setSprintId(value)}>
                <SelectTrigger
                  aria-label="Sprint"
                  className="w-44 text-[13px] rounded-[var(--apple-radius-pill)] border-[var(--apple-separator)]"
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
        </div>

        {/* ── Sprint Health Strip (spec §15.7) ────────────────────────── */}
        {loading ? (
          <HealthBarSkeleton />
        ) : schedule?.health ? (
          <SprintHealthBar health={schedule.health} />
        ) : null}

        {loading ? (
          <div className="flex flex-col gap-2.5 pt-2" aria-label={standupStrings.schedule.loading()}>
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
