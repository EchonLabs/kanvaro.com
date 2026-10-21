import { Check } from 'lucide-react'

import { planInsetClass } from '@/components/standup/planning/ui'
import { standupStrings } from '@/lib/standup/strings'
import { cn } from '@/lib/utils'

import { SummarySection } from './SummarySection'
import type { CompletedYesterdayRow } from './types'

const s = standupStrings.summary

/** What yesterday actually shipped. */
export function CompletedYesterdayCard({ rows }: { rows: CompletedYesterdayRow[] }) {
  return (
    <SummarySection
      id="completed-yesterday-section"
      scroll
      title={s.sectionCompletedYesterday()}
      icon={Check}
      isEmpty={rows.length === 0}
      emptyText={s.emptyCompletedYesterday()}
    >
      <ul className="flex flex-col gap-1.5">
        {rows.map((row) => (
          <li
            key={row.taskId}
            data-testid="completed-row"
            className={cn(planInsetClass, 'flex items-center gap-2 px-4 py-2.5')}
          >
            {row.taskKey && (
              <span
                className="apple-type-caption font-apple-mono shrink-0 rounded-[var(--apple-radius-sm)] bg-[var(--plan-track)] px-2 py-0.5 font-bold text-[var(--plan-muted)]"
              >
                {row.taskKey}
              </span>
            )}
            <span className={'apple-type-subheadline min-w-0 truncate text-[var(--plan-text)]'}>
              {/* The id is the last resort, not a placeholder: a row that
                  names nothing still proves a task was finished. */}
              {row.title ?? row.taskKey ?? row.taskId}
            </span>
          </li>
        ))}
      </ul>
    </SummarySection>
  )
}
