'use client'

/**
 * The read-only stand-up summary screen (§15.13, UI-10/UI-11).
 *
 * Thin by design, matching the run screen's own conventions
 * (`.../[standupId]/page.tsx`): it loads one payload, keeps `use client`
 * state for the three load outcomes, and adapts nothing — `GET /summary` is
 * already shaped as the `StandupSummary` document, hydrated with each named
 * member's identity so the sections can show faces (see `summary-service.ts`).
 *
 * Everything visual lives in `@/components/standup/summary`: one component
 * per §15.13 section, each owning its own rows and empty state. The page's
 * only job is loading, the two export actions, and the order the sections
 * appear in.
 *
 * Every section renders, even the commonly-empty ones (blockers, overrides):
 * an omitted heading reads as "not built" rather than "nothing happened", per
 * this module's established convention (see `strings.ts`'s `yesterday`
 * namespace docblock).
 *
 * UI-10's two export actions live here rather than on a shared component:
 * "Copy as text" calls the export route and writes its markdown to the
 * clipboard; "Print / Save as PDF" is `window.print()` against the
 * `@media print` stylesheet below, which hides the interactive chrome — the
 * actual PDF path per this plan's Architecture note.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { MessageSquare } from 'lucide-react'

import { MainLayout } from '@/components/layout/MainLayout'
import { AttendanceCard } from '@/components/standup/summary/AttendanceCard'
import { BlockersRaisedCard, BlockersResolvedCard } from '@/components/standup/summary/BlockersCard'
import { CarryForwardCard } from '@/components/standup/summary/CarryForwardCard'
import { CommitmentsCard } from '@/components/standup/summary/CommitmentsCard'
import { CompletedYesterdayCard } from '@/components/standup/summary/CompletedYesterdayCard'
import { DebtMovementsCard } from '@/components/standup/summary/DebtMovementsCard'
import { OverridesCard } from '@/components/standup/summary/OverridesCard'
import { SummaryHero } from '@/components/standup/summary/SummaryHero'
import { SummarySection } from '@/components/standup/summary/SummarySection'
import { SummaryStatGrid } from '@/components/standup/summary/SummaryStatGrid'
import { VarianceCard } from '@/components/standup/summary/VarianceCard'
import { summaryStats } from '@/components/standup/summary/stats'
import type { SummaryPayload } from '@/components/standup/summary/types'
import { planCardClass } from '@/components/standup/planning/ui'
import { standupStrings } from '@/lib/standup/strings'
import { cn } from '@/lib/utils'

const s = standupStrings.summary

export default function StandupSummaryPage({
  params
}: {
  params: { id: string; sprintId: string; standupId: string }
}) {
  const { id: projectId, sprintId, standupId } = params

  const [summary, setSummary] = useState<SummaryPayload | null>(null)
  const [notAvailable, setNotAvailable] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copyNotice, setCopyNotice] = useState<string | null>(null)

  const standupHref = `/projects/${projectId}/sprints/${sprintId}/standups/${standupId}`

  // Without this, "summary" is dropped by the auto-generator (it follows the
  // standup id), leaving this screen breadcrumb-identical to the run screen
  // it summarizes — no way to tell, from the trail alone, which one you're
  // on. The "Stand-up" crumb links back to the run screen itself. Passed as
  // a prop, not via `useBreadcrumb()` — see the run screen page for why that
  // hook silently no-ops when called from a page component.
  const breadcrumbItems = [
    { label: 'Projects', href: '/projects' },
    { label: 'View Project', href: `/projects/${projectId}` },
    { label: 'View Sprint', href: `/sprints/${sprintId}` },
    { label: 'Stand-up', href: standupHref },
    { label: 'Summary' }
  ]

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      try {
        const response = await fetch(`/api/standups/${standupId}/summary`)
        if (!cancelled && response.status === 404) {
          setNotAvailable(true)
          return
        }
        if (!response.ok) throw new Error('failed')
        const payload = await response.json()
        if (!cancelled) setSummary(payload.data ?? payload)
      } catch {
        if (!cancelled) setError(s.loadFailed())
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [standupId])

  const copyAsText = useCallback(async () => {
    try {
      const response = await fetch(`/api/standups/${standupId}/summary/export?format=markdown`)
      if (!response.ok) throw new Error('failed')
      const text = await response.text()
      await navigator.clipboard.writeText(text)
      setCopyNotice(s.copied())
    } catch {
      setCopyNotice(s.copyFailed())
    }
  }, [standupId])

  const printSummary = useCallback(() => {
    window.print()
  }, [])

  const stats = useMemo(() => (summary ? summaryStats(summary) : null), [summary])

  return (
    <MainLayout breadcrumbItems={breadcrumbItems}>
      <style>{`
        @media print {
          .standup-summary-no-print {
            display: none !important;
          }
        }
      `}</style>
      {/* The `standup-summary` scope: the print rule above keys on it. The
          sections read the `--plan-*` tokens, which resolve from the app's
          theme, so a summary and the stand-up it summarises are the same
          surface. */}
      <div className="standup-summary flex flex-col gap-6 p-4 md:p-8">
        {error && (
          <p
            role="alert"
            className="rounded-[var(--apple-radius-lg)] border border-[var(--plan-danger)] bg-[var(--plan-danger-bg)] p-3 apple-type-subheadline text-[var(--plan-danger)]"
          >
            {error}
          </p>
        )}

        {notAvailable && (
          <p className={cn(planCardClass, 'p-5 apple-type-subheadline', 'text-[var(--plan-muted)]')}>{s.notAvailable()}</p>
        )}

        {!summary && !error && !notAvailable && (
          <p className={cn('apple-type-subheadline', 'text-[var(--plan-muted)]')}>{s.loading()}</p>
        )}

        {summary && stats && (
          <>
            <SummaryHero
              headerFacts={summary.headerFacts}
              standupHref={standupHref}
              onCopy={copyAsText}
              onPrint={printSummary}
            />

            {copyNotice && (
              <p role="status" className={cn('standup-summary-no-print', 'apple-type-subheadline', 'text-[var(--plan-muted)]')}>
                {copyNotice}
              </p>
            )}

            <SummaryStatGrid stats={stats} />

            <AttendanceCard
              attendance={summary.attendance}
              commitments={summary.memberCommitments}
              stats={stats}
            />
            <CompletedYesterdayCard rows={summary.completedYesterday} />
            <VarianceCard rows={summary.varianceTable} />
            <CommitmentsCard members={summary.memberCommitments} />

            {/* Lighter, naturally-paired sections share a row on desktop
                rather than each claiming a full-width card for a few lines. */}
            <div className="grid gap-4 lg:grid-cols-2">
              <DebtMovementsCard rows={summary.debtMovements} />
              <CarryForwardCard rows={summary.carryForwardState} />
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <BlockersRaisedCard rows={summary.blockersRaised} />
              <BlockersResolvedCard rows={summary.blockersResolved} />
            </div>

            <OverridesCard rows={summary.overridesIssued} />

            {/* The one section that is absent rather than empty when it has
                nothing: notes are optional by design, so "PM notes — none"
                would invent a gap the stand-up never had. */}
            {summary.pmNotes && (
              /* Free text, so the one section with no row count to bound it:
                 a facilitator who pasted a retro's worth of notes otherwise
                 pushes the page's own footer arbitrarily far down. Capped and
                 scrolled like every list above it. */
              <SummarySection id="notes-section" title={s.sectionNotes()} icon={MessageSquare} scroll>
                <p className={cn('apple-type-subheadline', 'whitespace-pre-wrap text-[var(--plan-text)]')}>
                  {summary.pmNotes}
                </p>
              </SummarySection>
            )}
          </>
        )}
      </div>
    </MainLayout>
  )
}
