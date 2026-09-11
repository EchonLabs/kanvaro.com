'use client'

import { HoursValue } from '../shared/HoursValue'
import { SectionCard } from '../shared/SectionCard'
import { StatusPill } from '../shared/StatusPill'
import { Progress } from '@/components/ui/Progress'
import { formatMinutesAsHours } from '@/lib/standup/minutes'
import { standupStrings } from '@/lib/standup/strings'
import type { CapacityBreakdown } from '@/lib/standup/capacity'

/** The fields of `MemberVarianceRollUp` (`GET /api/standups/:id/variance`) this section reads. */
interface DebtFields {
  outstandingDebtMinutes: number
  surplusMinutes: number
}

export interface CapacitySectionProps {
  capacity: CapacityBreakdown
  /** `member.allocations.length` — not on `CapacityBreakdown` itself, so the caller supplies it for the full-day headline's task count. */
  allocationCount: number
  debt?: DebtFields
  locale?: string
}

const STATUS_TONE: Record<string, 'green' | 'orange' | 'red' | 'neutral'> = {
  full: 'green',
  under: 'orange',
  over: 'red',
  zero: 'neutral',
  unavailable: 'neutral'
}

function headlineFor(capacity: CapacityBreakdown, allocationCount: number, locale?: string): string {
  const hours = (m: number) => formatMinutesAsHours(m as any, { locale })
  if (capacity.status === 'unavailable') return standupStrings.my.capacityUnavailable()
  if (capacity.status === 'zero') return standupStrings.my.capacityZero()
  if (capacity.status === 'over') {
    return standupStrings.my.capacityOver({ hours: hours(Math.abs(capacity.gapMinutes)) })
  }
  if (capacity.status === 'under') {
    return standupStrings.my.capacityUnder({ hours: hours(capacity.gapMinutes) })
  }
  return standupStrings.my.capacityFull({
    hours: hours(capacity.allocatedMinutes),
    taskCount: allocationCount
  })
}

/** Design §4.3 — R2's computed headline sentence plus the real capacity breakdown, replacing the old single-line "adjustments only" render. */
export function CapacitySection({ capacity, allocationCount, debt, locale }: CapacitySectionProps) {
  const percentage =
    capacity.effectiveMinutes > 0
      ? Math.round((capacity.allocatedMinutes / capacity.effectiveMinutes) * 100)
      : 0
  const tone = STATUS_TONE[capacity.status] ?? 'neutral'

  return (
    <SectionCard title="Today" summary={<StatusPill tone={tone}>{capacity.status.toUpperCase()}</StatusPill>}>
      <p className="text-[17px] font-semibold text-[var(--apple-label)]">
        {headlineFor(capacity, allocationCount, locale)}
      </p>

      {/* VAR-10's exact wording spells out "hours", unlike every other figure
          on this screen — `withUnit: false` drops HoursValue's usual "h"
          suffix so the word can be spelled out instead ("2.0 hours"). */}
      {debt && debt.outstandingDebtMinutes > 0 ? (
        <p className="text-[15px] text-[var(--apple-secondary-label)]">
          {standupStrings.my.debtSentence({
            hours: `${formatMinutesAsHours(debt.outstandingDebtMinutes as any, { locale, withUnit: false })} hours`
          })}
        </p>
      ) : null}
      {debt && debt.outstandingDebtMinutes === 0 && debt.surplusMinutes > 0 ? (
        <p className="text-[15px] text-[var(--apple-secondary-label)]">
          {standupStrings.my.surplusSentence({
            hours: `${formatMinutesAsHours(debt.surplusMinutes as any, { locale, withUnit: false })} hours`
          })}
        </p>
      ) : null}
      {capacity.strandedMinutes > 0 ? (
        <p className="text-[15px] text-[var(--apple-system-orange)]">
          {standupStrings.my.strandedSentence({
            hours: formatMinutesAsHours(capacity.strandedMinutes, { locale })
          })}
        </p>
      ) : null}

      <Progress value={percentage} />

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-[var(--apple-secondary-label)]">
        <span>
          Nominal <HoursValue minutes={capacity.nominalMinutes} locale={locale} />
        </span>
        <span>
          Effective <HoursValue minutes={capacity.effectiveMinutes} locale={locale} />
        </span>
        <span>
          Allocated <HoursValue minutes={capacity.allocatedMinutes} locale={locale} />
        </span>
      </div>

      {capacity.adjustments.length > 0 ? (
        <ul className="flex flex-col gap-1 text-[13px] text-[var(--apple-secondary-label)]">
          {capacity.adjustments.map((adjustment, index) => (
            <li key={`${adjustment.type}-${index}`}>
              {adjustment.label}: {formatMinutesAsHours(adjustment.minutes, { locale })}
            </li>
          ))}
        </ul>
      ) : null}
    </SectionCard>
  )
}
