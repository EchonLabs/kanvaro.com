'use client'

/**
 * Stand-up Analytics sprint picker.
 *
 * Route: `/sprints/analytics`, the sidebar's "Analytics" item under Sprint
 * Management. The report itself is per sprint (`/sprints/[id]/analytics`), but
 * a sidebar item is global, so it lands here to choose which sprint's report
 * to open. Lists only sprints that have stand-ups (`hasStandups`: planned,
 * active, completed) — a draft or planning sprint has nothing to report.
 *
 * Deliberately not gated in the sidebar, like the "Standups" item beside it:
 * `standup:view_analytics` is mostly granted per project, so an org-wide check
 * would hide the item from the people the team view is for. The list is the
 * caller's own sprints, and the report enforces access itself.
 */
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, BarChart3 } from 'lucide-react'

import { MainLayout } from '@/components/layout/MainLayout'
import { planButtonClass, planCardClass, planEmptyClass, planPillClass } from '@/components/standup/planning/ui'
import { standupStrings } from '@/lib/standup/strings'
import { cn } from '@/lib/utils'

const s = standupStrings.analytics

interface PickerSprint {
  _id: string
  name: string
  status: string
  startDate?: string
  endDate?: string
  project?: { _id?: string; name?: string } | string | null
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'loaded'; sprints: PickerSprint[] }
  | { kind: 'failed' }

const GROUPS = ['active', 'planned', 'completed'] as const
const STATUS_TONE = { active: 'success', planned: 'accent', completed: 'neutral' } as const

const breadcrumbItems = [{ label: 'Sprints', href: '/sprints' }, { label: s.breadcrumb() }]

const projectNameOf = (sprint: PickerSprint) =>
  typeof sprint.project === 'object' && sprint.project ? (sprint.project.name ?? '') : ''

function dateRange(sprint: PickerSprint): string | null {
  if (!sprint.startDate || !sprint.endDate) return null
  const format = (value: string) =>
    new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
  return s.sprintDates({ start: format(sprint.startDate), end: format(sprint.endDate) })
}

export default function SprintAnalyticsPickerPage() {
  const [state, setState] = useState<LoadState>({ kind: 'loading' })

  const load = useCallback(async () => {
    setState({ kind: 'loading' })
    try {
      const response = await fetch('/api/sprints?status=active,planned,completed&limit=100')
      if (!response.ok) throw new Error('failed')
      const body = await response.json()
      if (body.success === false) throw new Error('failed')
      setState({ kind: 'loaded', sprints: Array.isArray(body.data) ? body.data : [] })
    } catch {
      setState({ kind: 'failed' })
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const sprints = state.kind === 'loaded' ? state.sprints : []

  return (
    <MainLayout breadcrumbItems={breadcrumbItems}>
      <div className="flex flex-col gap-6 p-4 md:p-8">
        <div className={cn(planCardClass, 'flex flex-col gap-1.5 p-5 sm:p-7')}>
          <h1 className="apple-type-title1 font-bold text-[var(--plan-text)]">{s.title()}</h1>
          <p className="apple-type-subheadline text-[var(--plan-muted)]">{s.pickerSubtitle()}</p>
        </div>

        {state.kind === 'loading' && (
          <p role="status" className="apple-type-subheadline text-[var(--plan-muted)]">
            {s.pickerLoading()}
          </p>
        )}

        {state.kind === 'failed' && (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--apple-radius-lg)] border border-[var(--plan-danger)] bg-[var(--plan-danger-bg)] p-4"
          >
            <p className="apple-type-subheadline text-[var(--plan-danger)]">{s.pickerLoadFailed()}</p>
            <button type="button" onClick={() => void load()} className={planButtonClass('secondary', undefined, 'sm')}>
              {s.retry()}
            </button>
          </div>
        )}

        {state.kind === 'loaded' && sprints.length === 0 && (
          <div className={cn(planCardClass, 'flex flex-col items-start gap-3 p-5')}>
            <p className={planEmptyClass + ' w-full'}>{s.pickerEmpty()}</p>
            <Link href="/sprints" className={planButtonClass('secondary')}>
              {s.pickerAllSprints()}
            </Link>
          </div>
        )}

        {GROUPS.map((status) => {
          const inGroup = sprints.filter((sprint) => sprint.status === status)
          if (inGroup.length === 0) return null

          return (
            <section key={status} className="flex flex-col gap-3">
              <h2 className="apple-section-label text-[var(--plan-muted)]">{s.pickerGroup({ status })}</h2>
              <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {inGroup.map((sprint) => (
                  <li key={sprint._id}>
                    <Link
                      href={`/sprints/${sprint._id}/analytics`}
                      className={cn(
                        planCardClass,
                        'apple-transition flex h-full items-center justify-between gap-3 p-4 hover:bg-[var(--apple-tertiary-fill)]'
                      )}
                    >
                      <span className="flex min-w-0 flex-col gap-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <BarChart3 className="h-4 w-4 shrink-0 text-[var(--plan-accent-ink)]" strokeWidth={2} aria-hidden="true" />
                          <span className="truncate apple-type-headline font-semibold text-[var(--plan-text)]">
                            {sprint.name}
                          </span>
                          <span className={planPillClass(STATUS_TONE[status])}>{s.pickerGroup({ status })}</span>
                        </span>
                        <span className="truncate apple-type-footnote text-[var(--plan-muted)]">
                          {projectNameOf(sprint) && <span>{projectNameOf(sprint)}</span>}
                          {projectNameOf(sprint) && dateRange(sprint) && ' · '}
                          {dateRange(sprint)}
                        </span>
                      </span>
                      <ArrowRight className="h-4 w-4 shrink-0 text-[var(--plan-muted)]" strokeWidth={2} aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )
        })}
      </div>
    </MainLayout>
  )
}
