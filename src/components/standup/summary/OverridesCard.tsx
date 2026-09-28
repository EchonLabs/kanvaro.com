import { Settings } from 'lucide-react'

import { Badge, INSET_CLASSES, TEXT_BODY, TEXT_META } from '@/components/standup/run/ui'
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
            <li key={index} data-testid="override-row" className={cn(INSET_CLASSES, 'flex flex-col gap-3 p-4')}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex flex-wrap gap-1.5">
                  <Badge tone="amber" className="normal-case">
                    {field(row, 'type') ?? 'override'}
                  </Badge>
                  {reasonCode && (
                    <Badge tone="neutral" className="normal-case">
                      {reasonCode}
                    </Badge>
                  )}
                </span>
                {approver && (
                  <span className={cn(TEXT_META, 'text-[var(--sur-muted)]')}>Approved by {approver}</span>
                )}
              </div>
              {field(row, 'justification') && (
                <p className={cn(TEXT_BODY, 'text-[var(--sur-text)]')}>{field(row, 'justification')}</p>
              )}
            </li>
          )
        })}
      </ul>
    </SummarySection>
  )
}
