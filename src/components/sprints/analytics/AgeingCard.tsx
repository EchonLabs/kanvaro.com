import { CornerDownRight } from 'lucide-react'

import { planPillClass } from '@/components/standup/planning/ui'
import { SummarySection } from '@/components/standup/summary/SummarySection'
import { standupStrings } from '@/lib/standup/strings'
import { cn } from '@/lib/utils'

import { Figure } from './format'
import { RowsTable, ShowRows } from './RowsTable'
import type { AnalyticsPayload, SprintLinkContext } from './types'

const s = standupStrings.analytics

/**
 * §15.15 "Carry forward ageing": open items by age in stand-ups, with the
 * chronic band (E63, age 8+) highlighted — in red, striped, *and* labelled
 * "N chronic" in text, so the band is never told apart by colour alone.
 */
export function AgeingCard({ payload }: { payload: AnalyticsPayload; link: SprintLinkContext }) {
  const { buckets, chronicCount } = payload.ageing
  const items = payload.ageingItems
  const tallest = Math.max(1, ...buckets.map((bucket) => bucket.count))

  return (
    <SummarySection
      id="analytics-ageing"
      title={s.sectionAgeing()}
      icon={CornerDownRight}
      isEmpty={items.length === 0}
      emptyText={s.emptyAgeing()}
      badge={
        chronicCount > 0 ? (
          <span className={planPillClass('danger')}>{s.chronicBand({ count: chronicCount })}</span>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex h-36 items-end gap-2">
          {buckets.map((bucket) => (
            <div key={bucket.label} className="flex flex-1 flex-col items-center gap-1.5">
              <span className="apple-type-caption font-apple-mono tabular-nums text-[var(--plan-text)]" aria-hidden="true">
                {bucket.count === 0 ? '—' : bucket.count}
              </span>
              <div className="flex h-24 w-full items-end">
                <span
                  role="img"
                  aria-label={s.ageBucketLabel({ label: bucket.label, count: bucket.count, chronic: bucket.chronic })}
                  className={cn(
                    'block w-full rounded-t-[var(--apple-radius-sm)]',
                    bucket.chronic
                      ? 'bg-[var(--plan-danger)] [background-image:repeating-linear-gradient(135deg,transparent_0_4px,rgba(255,255,255,0.35)_4px_7px)]'
                      : 'bg-[var(--plan-accent-ink)]'
                  )}
                  style={{ height: bucket.count === 0 ? '2px' : `${(bucket.count / tallest) * 100}%` }}
                />
              </div>
              <span
                className={cn(
                  'apple-type-caption whitespace-nowrap',
                  bucket.chronic ? 'font-semibold text-[var(--plan-danger)]' : 'text-[var(--plan-muted)]'
                )}
                aria-hidden="true"
              >
                {bucket.label}
              </span>
            </div>
          ))}
        </div>

        <ShowRows>
          <RowsTable
            caption={s.sectionAgeing()}
            columns={[
              { key: 'task', label: s.columnTask() },
              { key: 'age', label: s.columnAge(), align: 'right' },
              { key: 'status', label: s.columnStatus() },
              ...(payload.view === 'full' ? [{ key: 'owner', label: s.columnOwner() }] : [])
            ]}
            rows={items.map((item) => ({
              key: item.itemId,
              cells: {
                task: item.taskKey ? `${item.taskKey} ${item.title ?? ''}`.trim() : (item.title ?? '—'),
                age: <Figure value={s.ageInStandups({ age: item.ageInStandups })} />,
                status: <span className="capitalize">{item.status}</span>,
                owner: 'memberName' in item ? (item.memberName ?? '—') : undefined
              }
            }))}
          />
        </ShowRows>
      </div>
    </SummarySection>
  )
}
