import { CornerDownRight } from 'lucide-react'

import { planInsetClass, planPillClass } from '@/components/standup/planning/ui'
import { standupStrings } from '@/lib/standup/strings'
import { cn } from '@/lib/utils'

import { SummarySection } from './SummarySection'
import { field } from './rows'
import type { LooseRow } from './types'

const s = standupStrings.summary

/**
 * What did not finish and moves to tomorrow.
 *
 * The label walks the same fallback chain as the markdown export — task key,
 * title, member, then the item type — so a carried item is named the same way
 * on screen as it is in a pasted summary.
 */
function labelFor(row: LooseRow): string {
  return (
    field(row, 'taskKey') ??
    field(row, 'taskTitle') ??
    field(row, 'memberName') ??
    standupStrings.carryForward.itemTypeLabel(field(row, 'type') ?? '')
  )
}

export function CarryForwardCard({ rows }: { rows: LooseRow[] }) {
  return (
    <SummarySection
      id="carry-forward-section"
      scroll
      title={s.sectionCarryForward()}
      icon={CornerDownRight}
      isEmpty={rows.length === 0}
      emptyText={s.emptyCarryForward()}
    >
      <ul className="flex flex-col gap-2.5">
        {rows.map((row, index) => {
          const ageBand = field(row, 'ageBand')
          const status = field(row, 'status')

          return (
            <li
              key={index}
              data-testid="carry-forward-row"
              className={cn(planInsetClass, 'flex flex-wrap items-center justify-between gap-2 p-3')}
            >
              <span className={'apple-type-subheadline min-w-0 truncate font-medium text-[var(--plan-text)]'}>
                {labelFor(row)}
              </span>
              <span className="flex shrink-0 flex-wrap gap-1.5">
                {ageBand && (
                  <span className={planPillClass('neutral', 'capitalize')}>{ageBand}</span>
                )}
                {status && (
                  <span
                    className={planPillClass(status.toLowerCase() === 'resolved' ? 'success' : 'neutral', 'capitalize')}
                  >
                    {status}
                  </span>
                )}
              </span>
            </li>
          )
        })}
      </ul>
    </SummarySection>
  )
}
