'use client'

/**
 * Stand-up Analytics (spec §15.15, UI-13).
 *
 * Route: `/sprints/[id]/analytics`, in the Sprint Management module beside
 * `/sprints/[id]/planning` — a per-sprint report, so it belongs to the sprint
 * rather than to any one stand-up. It is reached from the org-admin oversight
 * cards, deliberately not from the sprint page, which is already full.
 *
 * Thin by design, like the stand-up summary page: one fetch, three load
 * outcomes, and the order the widgets appear in. The API decides which of the
 * two views the caller gets (`standup:view_debt` → full, otherwise team
 * view), so this page never filters anything itself — it renders what it is
 * sent and labels which view that is.
 */
import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

import { MainLayout } from '@/components/layout/MainLayout'
import { AccuracyCard } from '@/components/sprints/analytics/AccuracyCard'
import { AgeingCard } from '@/components/sprints/analytics/AgeingCard'
import { AllocationHealthCard } from '@/components/sprints/analytics/AllocationHealthCard'
import { AnalyticsHero } from '@/components/sprints/analytics/AnalyticsHero'
import { AnalyticsStatGrid } from '@/components/sprints/analytics/AnalyticsStatGrid'
import { ChronicUnderAllocationCard } from '@/components/sprints/analytics/ChronicUnderAllocationCard'
import { DebtTrendCard } from '@/components/sprints/analytics/DebtTrendCard'
import { DisciplineCard } from '@/components/sprints/analytics/DisciplineCard'
import { OverrideLogCard } from '@/components/sprints/analytics/OverrideLogCard'
import { SpillChainsCard } from '@/components/sprints/analytics/SpillChainsCard'
import type { AnalyticsPayload } from '@/components/sprints/analytics/types'
import { planButtonClass, planCardClass } from '@/components/standup/planning/ui'
import { standupStrings } from '@/lib/standup/strings'
import { cn } from '@/lib/utils'

const s = standupStrings.analytics

type LoadState =
  | { kind: 'loading' }
  | { kind: 'loaded'; payload: AnalyticsPayload }
  | { kind: 'forbidden' }
  | { kind: 'not-found' }
  | { kind: 'failed' }

/** Placeholder cards in the final layout's shape, so the page does not jump when it lands. */
function LoadingSkeleton() {
  const block = cn(planCardClass, 'animate-pulse bg-[var(--plan-raised)]')

  return (
    <div data-testid="analytics-loading" aria-busy="true" aria-label={s.loading()} className="flex flex-col gap-6">
      <div className={cn(block, 'h-28')} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className={cn(block, 'h-20')} />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className={cn(block, 'h-64')} />
        <div className={cn(block, 'h-64')} />
      </div>
    </div>
  )
}

export default function SprintAnalyticsPage() {
  const params = useParams()
  const sprintId = String(params?.id ?? '')

  const [state, setState] = useState<LoadState>({ kind: 'loading' })

  const load = useCallback(async () => {
    setState({ kind: 'loading' })
    try {
      const response = await fetch(`/api/sprints/${sprintId}/analytics`)
      if (response.status === 403) return setState({ kind: 'forbidden' })
      if (response.status === 404) return setState({ kind: 'not-found' })
      if (!response.ok) throw new Error('failed')
      const body = await response.json()
      setState({ kind: 'loaded', payload: body.data ?? body })
    } catch {
      setState({ kind: 'failed' })
    }
  }, [sprintId])

  useEffect(() => {
    if (sprintId) void load()
  }, [sprintId, load])

  // Planning's trail (see `/sprints/[id]/planning`): the project route once the
  // project is known, the flat Sprints route until then. Passed as a prop —
  // `useBreadcrumb()` called from a page never reaches MainLayout's provider.
  const projectId = state.kind === 'loaded' ? state.payload.sprint.projectId : null
  const breadcrumbItems = projectId
    ? [
        { label: 'Projects', href: '/projects' },
        { label: 'View Project', href: `/projects/${projectId}` },
        { label: 'View Sprint', href: `/sprints/${sprintId}` },
        { label: s.breadcrumb() }
      ]
    : [
        { label: 'Sprints', href: '/sprints' },
        { label: 'View Sprint', href: `/sprints/${sprintId}` },
        { label: s.breadcrumb() }
      ]

  return (
    <MainLayout breadcrumbItems={breadcrumbItems}>
      {/* No padding of its own: MainLayout's <main> already pads the content, and
          a second layer here doubled it. */}
      <div data-testid="analytics-page" className="flex flex-col gap-6">
        {state.kind === 'loading' && <LoadingSkeleton />}

        {(state.kind === 'forbidden' || state.kind === 'not-found') && (
          <p className={cn(planCardClass, 'p-5 apple-type-subheadline text-[var(--plan-muted)]')}>
            {state.kind === 'forbidden' ? s.forbidden() : s.notFound()}
          </p>
        )}

        {state.kind === 'failed' && (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--apple-radius-lg)] border border-[var(--plan-danger)] bg-[var(--plan-danger-bg)] p-4"
          >
            <p className="apple-type-subheadline text-[var(--plan-danger)]">{s.loadFailed()}</p>
            <button type="button" onClick={() => void load()} className={planButtonClass('secondary', undefined, 'sm')}>
              {s.retry()}
            </button>
          </div>
        )}

        {state.kind === 'loaded' && (
          <Report payload={state.payload} sprintId={sprintId} />
        )}
      </div>
    </MainLayout>
  )
}

/** The report itself, in the order the design fixes: paired widgets share a row on desktop. */
function Report({ payload, sprintId }: { payload: AnalyticsPayload; sprintId: string }) {
  const link = { projectId: payload.sprint.projectId, sprintId }

  return (
    <>
      <AnalyticsHero payload={payload} />
      <AnalyticsStatGrid headline={payload.headline} />

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <AllocationHealthCard payload={payload} link={link} />
        <DebtTrendCard payload={payload} link={link} />
      </div>
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <AccuracyCard payload={payload} link={link} />
        <AgeingCard payload={payload} link={link} />
      </div>
      <OverrideLogCard payload={payload} link={link} />
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <ChronicUnderAllocationCard payload={payload} link={link} />
        <DisciplineCard payload={payload} link={link} />
      </div>
      <SpillChainsCard payload={payload} link={link} />
    </>
  )
}
