import { Wallet } from 'lucide-react'

import { TEXT_BODY, TEXT_META } from '@/components/standup/run/ui'
import { formatMinutesAsHours } from '@/lib/standup/minutes'
import { standupStrings } from '@/lib/standup/strings'
import { cn } from '@/lib/utils'

import { MemberAvatar } from './MemberAvatar'
import { SummarySection } from './SummarySection'
import { asMinutes, field } from './rows'
import type { LooseRow } from './types'

const s = standupStrings.summary

/**
 * Where each member stands on estimate debt — a table rather than a card
 * list, because the only question here is how three numbers compare down a
 * column.
 */
export function DebtMovementsCard({ rows }: { rows: LooseRow[] }) {
  return (
    <SummarySection
      id="debt-section"
      scroll
      title={s.sectionDebtMovements()}
      icon={Wallet}
      isEmpty={rows.length === 0}
      emptyText={s.emptyDebtMovements()}
    >
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th
              scope="col"
              className={cn(TEXT_META, 'sticky top-0 z-[1] bg-[var(--sur-surface)] pb-2 text-left font-bold uppercase tracking-wide text-[var(--sur-muted)]')}
            >
              Member
            </th>
            <th
              scope="col"
              className={cn(TEXT_META, 'w-[80px] sticky top-0 z-[1] bg-[var(--sur-surface)] pb-2 text-right font-bold uppercase tracking-wide text-[var(--sur-muted)]')}
            >
              Debt
            </th>
            <th
              scope="col"
              className={cn(TEXT_META, 'w-[80px] sticky top-0 z-[1] bg-[var(--sur-surface)] pb-2 text-right font-bold uppercase tracking-wide text-[var(--sur-muted)]')}
            >
              Surplus
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const debt = asMinutes(row.outstandingDebtMinutes)
            const surplus = asMinutes(row.surplusMinutes)
            const name = field(row, 'name') ?? field(row, 'memberId') ?? '—'

            return (
              <tr
                key={index}
                data-testid="debt-row"
                className="border-b border-[var(--sur-border)] last:border-b-0"
              >
                <td className={cn(TEXT_BODY, 'py-2.5 pr-3 font-medium text-[var(--sur-text)]')}>
                  <span className="flex items-center gap-2">
                    <MemberAvatar member={row} size={22} />
                    <span className="min-w-0 truncate">{name}</span>
                  </span>
                </td>
                {/* Debt reads red only when there is some: a red 0.0h would
                    raise an alarm about a member who owes nothing. */}
                <td
                  className={cn(
                    'font-apple-mono py-2.5 text-right text-[13px] font-medium tabular-nums',
                    debt > 0 ? 'text-[var(--sur-red)]' : 'text-[var(--sur-muted)]'
                  )}
                >
                  {formatMinutesAsHours(debt)}
                </td>
                <td className="font-apple-mono py-2.5 text-right text-[13px] font-medium tabular-nums text-[var(--sur-muted)]">
                  {formatMinutesAsHours(surplus)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </SummarySection>
  )
}
