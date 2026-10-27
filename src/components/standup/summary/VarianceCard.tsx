import { Activity } from 'lucide-react'

import {
  PlanAvatar,
  planInsetClass,
  planPillClass,
  type PlanPillTone
} from '@/components/standup/planning/ui'
import { formatMinutesAsHours } from '@/lib/standup/minutes'
import { standupStrings } from '@/lib/standup/strings'
import { cn } from '@/lib/utils'

import { SummarySection } from './SummarySection'
import { asMinutes, avatarMember, field } from './rows'
import type { LooseRow } from './types'

const s = standupStrings.summary

/**
 * Two tones only, not one per outcome: this is a scan-for-problems list, and
 * a hue per outcome would bury the rows that ran over among the ones that
 * went fine.
 */
function outcomeTone(outcome: string): PlanPillTone {
  const lower = outcome.toLowerCase()
  return lower.includes('over') || lower.includes('blocked') ? 'danger' : 'neutral'
}

/** How yesterday's estimates held up, task by task. */
export function VarianceCard({ rows }: { rows: LooseRow[] }) {
  return (
    <SummarySection
      id="variance-section"
      scroll
      title={s.sectionVariance()}
      icon={Activity}
      isEmpty={rows.length === 0}
      emptyText={s.emptyVariance()}
    >
      <ul className="flex flex-col gap-1.5">
        {rows.map((row, index) => {
          const taskKey = field(row, 'taskKey') ?? field(row, 'allocationId') ?? 'Task'
          const outcome = field(row, 'outcome')
          const variance = asMinutes(row.dayVarianceMinutes)
          const name = field(row, 'name')

          return (
            <li
              key={index}
              data-testid="variance-row"
              className={cn(planInsetClass, 'flex flex-wrap items-center justify-between gap-3 px-4 py-2.5')}
            >
              <div className="flex min-w-0 items-center gap-2.5">
                {name && (
                  <span data-testid="member-avatar" title={name} className="inline-flex shrink-0">
                    <PlanAvatar member={avatarMember(row, name)} size={24} />
                  </span>
                )}
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className={'apple-type-subheadline font-apple-mono truncate font-semibold text-[var(--plan-text)]'}>
                    {taskKey}
                  </span>
                  {name && <span className="apple-type-caption text-[var(--plan-muted)]">{name}</span>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {outcome && <span className={planPillClass(outcomeTone(outcome), 'capitalize')}>{outcome}</span>}
                <span
                  className={cn(
                    'apple-type-subheadline font-apple-mono font-semibold tabular-nums',
                    variance > 0 ? 'text-[var(--plan-danger)]' : 'text-[var(--plan-text)]'
                  )}
                >
                  {formatMinutesAsHours(variance, { signed: true })}
                </span>
              </div>
            </li>
          )
        })}
      </ul>
    </SummarySection>
  )
}
