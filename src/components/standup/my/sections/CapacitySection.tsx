'use client'

import { Gauge } from 'lucide-react'
import { HoursValue } from '../shared/HoursValue'
import { RingGauge } from '../shared/RingGauge'
import { SectionCard } from '../shared/SectionCard'
import { StatusPill } from '../shared/StatusPill'
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
    <SectionCard
      title={standupStrings.my.capacityHeader()}
      icon={<Gauge strokeWidth={1.75} />}
      tone={tone}
      summary={<StatusPill tone={tone}>{capacity.status.toUpperCase()}</StatusPill>}
    >
      {/* The ring is the one hero visual on the whole screen — today's
          headline number, at a glance, before anything has to be read. */}
      <div className="flex items-center gap-4">
        <RingGauge percentage={percentage} tone={tone}>
          <span className="font-apple-mono text-[17px] font-semibold tabular-nums text-[var(--apple-label)]">
            {percentage}%
          </span>
        </RingGauge>

        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="text-[17px] font-semibold leading-snug text-[var(--apple-label)]">
            {headlineFor(capacity, allocationCount, locale)}
          </p>

          {/* VAR-10's exact wording spells out "hours", unlike every other
              figure on this screen — `withUnit: false` drops HoursValue's
              usual "h" suffix so the word can be spelled out instead
              ("2.0 hours"). */}
          {debt && debt.outstandingDebtMinutes > 0 ? (
            <p className="text-[13px] text-[var(--apple-secondary-label)]">
              {standupStrings.my.debtSentence({
                hours: `${formatMinutesAsHours(debt.outstandingDebtMinutes as any, { locale, withUnit: false })} hours`
              })}
            </p>
          ) : null}
          {debt && debt.outstandingDebtMinutes === 0 && debt.surplusMinutes > 0 ? (
            <p className="text-[13px] text-[var(--apple-secondary-label)]">
              {standupStrings.my.surplusSentence({
                hours: `${formatMinutesAsHours(debt.surplusMinutes as any, { locale, withUnit: false })} hours`
              })}
            </p>
          ) : null}
          {capacity.strandedMinutes > 0 ? (
            <p className="text-[13px] text-[var(--apple-system-orange)]">
              {standupStrings.my.strandedSentence({
                hours: formatMinutesAsHours(capacity.strandedMinutes, { locale })
              })}
            </p>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'Nominal', minutes: capacity.nominalMinutes },
          { label: 'Effective', minutes: capacity.effectiveMinutes },
          { label: 'Allocated', minutes: capacity.allocatedMinutes }
        ].map((stat) => (
          <div
            key={stat.label}
            className="flex flex-col items-center gap-0.5 rounded-[var(--apple-radius-sm)] bg-[var(--apple-quaternary-fill)] py-2"
          >
            <span className="apple-section-label text-[var(--apple-tertiary-label)]">{stat.label}</span>
            <HoursValue minutes={stat.minutes} locale={locale} />
          </div>
        ))}
      </div>

      {capacity.adjustments.length > 0 ? (
        <ul className="flex flex-col divide-y divide-[var(--apple-separator)] overflow-hidden rounded-[var(--apple-radius-sm)] border border-[var(--apple-separator)]">
          {capacity.adjustments.map((adjustment, index) => (
            <li
              key={`${adjustment.type}-${index}`}
              className="flex items-center justify-between gap-2 bg-card px-3 py-2 text-[13px]"
            >
              <span className="text-[var(--apple-secondary-label)]">{adjustment.label}</span>
              <HoursValue minutes={adjustment.minutes} locale={locale} />
            </li>
          ))}
        </ul>
      ) : null}
    </SectionCard>
  )
}
