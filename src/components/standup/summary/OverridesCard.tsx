import { Settings } from 'lucide-react'

import { planInsetClass, planPillClass } from '@/components/standup/planning/ui'
import { standupStrings } from '@/lib/standup/strings'
import { cn } from '@/lib/utils'

import { SummarySection } from './SummarySection'
import { field } from './rows'
import type { LooseRow } from './types'

const s = standupStrings.summary

/**
 * Where a rule was deliberately set aside, and why.
 *
 * The justification is the point of the section — an override without a
 * stated reason is the thing an auditor is looking for — so it stays body
 * copy rather than being folded into a badge.
 */
export function OverridesCard({ rows }: { rows: LooseRow[] }) {
  return (
    <SummarySection
      id="overrides-section"
      scroll
      title={s.sectionOverrides()}
      icon={Settings}
      isEmpty={rows.length === 0}
      emptyText={s.emptyOverrides()}
    >
      <ul className="flex flex-col gap-2.5">
        {rows.map((row, index) => {
          const approver = field(row, 'name') ?? field(row, 'approvedByName')
          const reasonCode = field(row, 'reasonCode')

          return (
            <li key={index} data-testid="override-row" className={cn(planInsetClass, 'flex flex-col gap-3 p-4')}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex flex-wrap gap-1.5">
                  <span className={planPillClass('warning', 'capitalize')}>{field(row, 'type') ?? 'override'}</span>
                  {reasonCode && (
                    <span className={planPillClass('neutral', 'capitalize')}>{reasonCode}</span>
                  )}
                </span>
                {approver && (
                  <span className="apple-type-caption text-[var(--plan-muted)]">Approved by {approver}</span>
                )}
              </div>
              {field(row, 'justification') && (
                <p className="apple-type-subheadline text-[var(--plan-text)]">{field(row, 'justification')}</p>
              )}
            </li>
          )
        })}
      </ul>
    </SummarySection>
  )
}
