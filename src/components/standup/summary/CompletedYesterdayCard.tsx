import { Check } from 'lucide-react'

import { INSET_CLASSES, TEXT_BODY, TEXT_META } from '@/components/standup/run/ui'
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
            className={cn(INSET_CLASSES, 'flex items-center gap-2 px-4 py-2.5')}
          >
            {row.taskKey && (
              <span
                className={cn(
                  TEXT_META,
                  'font-apple-mono shrink-0 rounded-[var(--sur-radius-control)] bg-[var(--sur-neutral-tint)] px-2 py-0.5 font-bold text-[var(--sur-muted)]'
                )}
              >
                {row.taskKey}
              </span>
            )}
            <span className={cn(TEXT_BODY, 'min-w-0 truncate text-[var(--sur-text)]')}>
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
