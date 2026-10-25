import Link from 'next/link'
import { Settings } from 'lucide-react'

import { planLinkClass, planPillClass } from '@/components/standup/planning/ui'
import { SummarySection } from '@/components/standup/summary/SummarySection'
import { standupStrings } from '@/lib/standup/strings'

import { Figure, shortDate, standupHref } from './format'
import { RowsTable, TeamViewNote } from './RowsTable'
import type { AnalyticsPayload, SprintLinkContext } from './types'

const s = standupStrings.analytics

function countRows(counts: Record<string, number>, label: (key: string) => string) {
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([key, count]) => ({ key, cells: { label: label(key), count: <Figure value={String(count)} /> } }))
}

/**
 * §15.15 "Override log": every override with its type, reason, member,
 * justification and date (OVR-8). The justification is the point — it is
 * what tells the reader something true — so in the full view it stays body
 * copy. The team view gets the same overrides as counts by type and reason,
 * with nobody named and nothing quoted (NFR-13).
 */
export function OverrideLogCard({ payload, link }: { payload: AnalyticsPayload; link: SprintLinkContext }) {
  const total = payload.headline.overrideCount

  return (
    <SummarySection
      id="analytics-overrides"
      title={s.sectionOverrides()}
      icon={Settings}
      isEmpty={total === 0}
      emptyText={s.emptyOverrides()}
      scroll={payload.view === 'full'}
      badge={total > 0 ? <span className={planPillClass('warning')}>{total}</span> : undefined}
    >
      {payload.view === 'full' ? (
        <RowsTable
          caption={s.sectionOverrides()}
          columns={[
            { key: 'date', label: s.columnDate() },
            { key: 'type', label: s.columnType() },
            { key: 'member', label: s.columnMember() },
            { key: 'reason', label: s.columnReason() },
            { key: 'justification', label: s.columnJustification() }
          ]}
          rows={payload.overrides.map((row) => {
            const status = payload.discipline.standups.find((day) => day.standupId === row.standupId)?.status ?? ''
            return {
              key: row.overrideId,
              cells: {
                date: (
                  <Link className={planLinkClass} href={standupHref(link.projectId, link.sprintId, row.standupId, status)}>
                    {row.standupDate ? shortDate(row.standupDate) : '—'}
                  </Link>
                ),
                type: <span className={planPillClass('warning')}>{s.overrideType({ type: row.type })}</span>,
                member: row.memberNames.join(', ') || '—',
                reason: standupStrings.override.reasonLabel({ code: row.reasonCode }),
                justification: <span className="block min-w-[14rem]">{row.justification}</span>
              }
            }
          })}
        />
      ) : (
        <div className="flex flex-col gap-4">
          <RowsTable
            caption={s.columnType()}
            columns={[
              { key: 'label', label: s.columnType() },
              { key: 'count', label: s.columnCount(), align: 'right' }
            ]}
            rows={countRows(payload.overrideCountsByType, (type) => s.overrideType({ type }))}
          />
          <RowsTable
            caption={s.columnReason()}
            columns={[
              { key: 'label', label: s.columnReason() },
              { key: 'count', label: s.columnCount(), align: 'right' }
            ]}
            rows={countRows(payload.overrideCountsByReason, (code) => standupStrings.override.reasonLabel({ code }))}
          />
          <TeamViewNote />
        </div>
      )}
    </SummarySection>
  )
}
