import { UserMinus } from 'lucide-react'

import { planPillClass } from '@/components/standup/planning/ui'
import { SummarySection } from '@/components/standup/summary/SummarySection'
import { standupStrings } from '@/lib/standup/strings'

import { Figure } from './format'
import { RowsTable, TeamViewNote } from './RowsTable'
import type { AnalyticsPayload, SprintLinkContext } from './types'

const s = standupStrings.analytics

/**
 * §15.15 "Chronic under allocation", on the module's own definition: three
 * or more `under_allocation` overrides for one member in the sprint — the
 * rule N7 fires on and the oversight rollup counts (OVR-9), so this list and
 * those signals always agree. The team view gets the count, not the names.
 */
export function ChronicUnderAllocationCard({ payload }: { payload: AnalyticsPayload; link: SprintLinkContext }) {
  const count = payload.view === 'full' ? payload.chronicMembers.length : payload.chronicMemberCount

  return (
    <SummarySection
      id="analytics-chronic"
      title={s.sectionChronic()}
      icon={UserMinus}
      isEmpty={count === 0}
      emptyText={s.emptyChronic()}
      badge={count > 0 ? <span className={planPillClass('warning')}>{count}</span> : undefined}
    >
      {payload.view === 'full' ? (
        <RowsTable
          caption={s.sectionChronic()}
          columns={[
            { key: 'member', label: s.columnMember() },
            { key: 'count', label: s.columnOverrides(), align: 'right' }
          ]}
          rows={payload.chronicMembers.map((member) => ({
            key: member.memberId,
            cells: { member: member.name, count: <Figure value={String(member.count)} /> }
          }))}
        />
      ) : (
        <div className="flex flex-col gap-2">
          <p className="apple-type-subheadline text-[var(--plan-text)]">{s.chronicMemberCount({ count })}</p>
          <TeamViewNote />
        </div>
      )}
    </SummarySection>
  )
}
