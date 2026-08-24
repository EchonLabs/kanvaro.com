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
import { Loader2 } from 'lucide-react'

import { MainLayout } from '@/components/layout/MainLayout'
import { DegradationBanner } from '@/components/standup/DegradationBanner'
import { StandupSchedule } from '@/components/standup/StandupSchedule'
import type { Degradation } from '@/lib/standup/degradation'
import type { SprintSchedule } from '@/lib/standup/schedule'
import { standupStrings } from '@/lib/standup/strings'

interface SprintOption {
  id: string
  name: string
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

  useEffect(() => {
    let cancelled = false

    const loadSprints = async () => {
      try {
        const response = await fetch(`/api/sprints?projectId=${projectId}`)
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
          setError('Could not load this project`s sprints.')
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
      setError('Could not load the stand-up schedule.')
    } finally {
      setLoading(false)
    }
  }, [projectId, sprintId])

  useEffect(() => {
    loadSchedule()
  }, [loadSchedule])

  return (
    <MainLayout>
      <div className="mx-auto w-full max-w-4xl space-y-5 p-4 md:p-6">
        {/* §3 rule 1: the banner is the first thing on every stand-up screen. */}
        <DegradationBanner degradations={degradations} />

        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {standupStrings.schedule.title()}
            </h1>
            {schedule ? (
              <p className="text-sm text-[var(--apple-secondary-label)]">
                {schedule.sprintName} · {schedule.dateRange.from} to {schedule.dateRange.to} ·{' '}
                {schedule.timezone}
              </p>
            ) : null}
          </div>

          {sprints.length > 1 ? (
            <select
              aria-label="Sprint"
              value={sprintId ?? ''}
              onChange={(event) => setSprintId(event.target.value)}
              className="apple-transition rounded-[var(--apple-radius-sm)] border border-[var(--apple-separator)] bg-card px-3 py-2 text-sm"
            >
              {sprints.map((sprint) => (
                <option key={sprint.id} value={sprint.id}>
                  {sprint.name}
                </option>
              ))}
            </select>
          ) : null}
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-[var(--apple-secondary-label)]">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading the schedule…
          </div>
        ) : error ? (
          <p className="text-sm text-[var(--apple-system-red)]">{error}</p>
        ) : schedule ? (
          <StandupSchedule schedule={schedule} />
        ) : (
          <p className="text-sm text-[var(--apple-secondary-label)]">
            {standupStrings.schedule.empty()}
          </p>
        )}
      </div>
    </MainLayout>
  )
}
