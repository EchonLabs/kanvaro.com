import { Activity } from 'lucide-react'

import { Badge, INSET_CLASSES, TEXT_BODY, TEXT_META, type Tone } from '@/components/standup/run/ui'
import { formatMinutesAsHours } from '@/lib/standup/minutes'
import { standupStrings } from '@/lib/standup/strings'
import { cn } from '@/lib/utils'

import { MemberAvatar } from './MemberAvatar'
import { SummarySection } from './SummarySection'
import { asMinutes, field } from './rows'
import type { LooseRow } from './types'

const s = standupStrings.summary

/**
 * Two tones only, not one per outcome: this is a scan-for-problems list, and
 * a hue per outcome would bury the rows that ran over among the ones that
 * went fine.
 */
function outcomeTone(outcome: string): Tone {
  const lower = outcome.toLowerCase()
  return lower.includes('over') || lower.includes('blocked') ? 'red' : 'neutral'
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
              className={cn(INSET_CLASSES, 'flex flex-wrap items-center justify-between gap-3 px-4 py-2.5')}
            >
              <div className="flex min-w-0 items-center gap-2.5">
                {name && <MemberAvatar member={row} size={24} />}
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className={cn(TEXT_BODY, 'font-apple-mono truncate font-semibold text-[var(--sur-text)]')}>
                    {taskKey}
                  </span>
                  {name && <span className={cn(TEXT_META, 'text-[var(--sur-muted)]')}>{name}</span>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {outcome && <Badge tone={outcomeTone(outcome)} className="normal-case">{outcome}</Badge>}
                <span
                  className={cn(
                    'font-apple-mono text-[13px] font-semibold tabular-nums',
                    variance > 0 ? 'text-[var(--sur-red)]' : 'text-[var(--sur-text)]'
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
