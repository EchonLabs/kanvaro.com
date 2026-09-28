import { AlertTriangle, CheckCircle2, ShieldCheck } from 'lucide-react'

import { Badge, INSET_CLASSES, TEXT_BODY, TEXT_META } from '@/components/standup/run/ui'
import { standupStrings } from '@/lib/standup/strings'
import { cn } from '@/lib/utils'

import { SummarySection } from './SummarySection'
import { field } from './rows'
import type { LooseRow } from './types'

const s = standupStrings.summary

/** What got in the way today. */
export function BlockersRaisedCard({ rows }: { rows: LooseRow[] }) {
  return (
    <SummarySection
      id="blockers-raised-section"
      scroll
      title={s.sectionBlockersRaised()}
      icon={AlertTriangle}
      isEmpty={rows.length === 0}
      emptyText={s.emptyBlockersRaised()}
    >
      <ul className="flex flex-col gap-2.5">
        {rows.map((row, index) => {
          const description = field(row, 'description')
          const blockerType = field(row, 'blockerType')
          const severity = field(row, 'severity')
          const status = field(row, 'status')
          const open = status?.toLowerCase() === 'open'

          return (
            <li
              key={index}
              data-testid="blocker-raised-row"
              className={cn(INSET_CLASSES, 'flex flex-col gap-3 p-3')}
            >
              <p className={cn(TEXT_BODY, 'text-[var(--sur-text)]')}>
                {/* A blocker with no description is still a blocker — the
                    badges below carry what the record does know. */}
                {description ?? 'Blocker'}
              </p>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex flex-wrap gap-1.5">
                  {blockerType && (
                    <Badge tone="red" className="normal-case">
                      {blockerType}
                    </Badge>
                  )}
                  {severity && (
                    <Badge tone="red" className="normal-case">
                      {severity}
                    </Badge>
                  )}
                </span>
                {status && (
                  <Badge tone={open ? 'amber' : 'green'} className="normal-case">
                    {status}
                  </Badge>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </SummarySection>
  )
}

/** What got cleared, and by whom. */
export function BlockersResolvedCard({ rows }: { rows: LooseRow[] }) {
  return (
    <SummarySection
      id="blockers-resolved-section"
      scroll
      title={s.sectionBlockersResolved()}
      icon={ShieldCheck}
      isEmpty={rows.length === 0}
      emptyText={s.emptyBlockersResolved()}
    >
      <ul className="flex flex-col gap-2.5">
        {rows.map((row, index) => {
          const resolver = field(row, 'name') ?? field(row, 'resolvedByName')

          return (
            <li
              key={index}
              data-testid="blocker-resolved-row"
              className={cn(INSET_CLASSES, 'flex flex-col gap-2 p-3')}
            >
              <p className={cn(TEXT_BODY, 'text-[var(--sur-text)]')}>
                {field(row, 'resolutionNote') ?? 'Resolved.'}
              </p>
              {resolver && (
                <p className={cn(TEXT_META, 'flex items-center gap-1 text-[var(--sur-muted)]')}>
                  <CheckCircle2
                    className="h-3.5 w-3.5 shrink-0 text-[var(--sur-green)]"
                    strokeWidth={2}
                    aria-hidden="true"
                  />
                  Resolved by {resolver}
                </p>
              )}
            </li>
          )
        })}
      </ul>
    </SummarySection>
  )
}
