import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

import { planButtonClass, planCardClass, planPillClass } from '@/components/standup/planning/ui'
import { standupStrings } from '@/lib/standup/strings'
import { cn } from '@/lib/utils'

import { shortDate } from './format'
import type { AnalyticsPayload } from './types'

const s = standupStrings.analytics

/**
 * The banner across the top, on the Summary screen's hero pattern: what this
 * report covers, which of its two views the reader is getting, and the way
 * back to the sprint it belongs to.
 */
export function AnalyticsHero({ payload }: { payload: AnalyticsPayload }) {
  const { sprint } = payload
  const full = payload.view === 'full'

  return (
    <div className={cn(planCardClass, 'flex flex-wrap items-center justify-between gap-4 p-5 sm:p-7')}>
      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="apple-type-title1 font-bold text-[var(--plan-text)]">{s.title()}</h1>
          <span className={planPillClass(full ? 'success' : 'neutral')} data-testid="analytics-view-pill">
            {full ? s.fullView() : s.teamView()}
          </span>
        </div>
        <p className="apple-type-subheadline flex flex-wrap items-center gap-2 text-[var(--plan-muted)]">
          <span className="font-semibold text-[var(--plan-text)]">{sprint.name}</span>
          {sprint.projectName && (
            <>
              <span aria-hidden="true" className="h-1 w-1 rounded-full bg-[var(--plan-muted)]" />
              <span>{sprint.projectName}</span>
            </>
          )}
          {sprint.startDate && sprint.endDate && (
            <>
              <span aria-hidden="true" className="h-1 w-1 rounded-full bg-[var(--plan-muted)]" />
              <span>{s.sprintDates({ start: shortDate(sprint.startDate), end: shortDate(sprint.endDate) })}</span>
            </>
          )}
        </p>
      </div>

      <Link href={`/sprints/${sprint.id}`} className={planButtonClass('secondary')}>
        <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
        {s.backToSprint()}
      </Link>
    </div>
  )
}
