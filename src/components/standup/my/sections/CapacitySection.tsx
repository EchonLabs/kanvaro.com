'use client'

import { Tag, type TagTone } from '../shared/Tag'
import { Emphasize } from '../shared/Emphasize'
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

const STATUS_TONE: Record<string, TagTone> = {
  full: 'green',
  under: 'amber',
  over: 'red',
  zero: 'neutral',
  unavailable: 'neutral'
}

/** The ring's arc colour — the design's blue while the day is sound, the status colour once it is not. */
const RING_COLOUR: Record<string, string> = {
  full: 'var(--my-blue)',
  under: 'var(--my-blue)',
  over: 'var(--my-red)',
  zero: 'var(--my-subtle)',
  unavailable: 'var(--my-subtle)'
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

const RING_SIZE = 110
const RING_STROKE = 4

/**
 * Step 2's capacity row — the allocation ring, the day's state, the real
 * breakdown (UI-14: nominal, adjustments, effective, allocated), and R2's
 * computed sentence with the VAR-10 debt wording.
 */
export function CapacitySection({ capacity, allocationCount, debt, locale }: CapacitySectionProps) {
  const percentage =
    capacity.effectiveMinutes > 0
      ? Math.round((capacity.allocatedMinutes / capacity.effectiveMinutes) * 100)
      : 0
  const hours = (m: number) => formatMinutesAsHours(m as any, { locale })
  const spelled = (m: number) => `${formatMinutesAsHours(m as any, { locale, withUnit: false })} hours`

  const radius = (RING_SIZE - RING_STROKE) / 2
  const circumference = 2 * Math.PI * radius
  const arc = Math.min(percentage, 100) / 100

  return (
    <div className="flex w-full flex-col items-start gap-4 sm:flex-row sm:items-center sm:gap-6">
      <div className="relative h-[110px] w-[110px] shrink-0">
        <svg width={RING_SIZE} height={RING_SIZE} viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`} aria-hidden className="-rotate-90">
          <circle cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={radius} fill="var(--my-blue-tint)" stroke="var(--my-border)" strokeWidth={RING_STROKE} />
          <circle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={radius}
            fill="none"
            stroke={RING_COLOUR[capacity.status] ?? 'var(--my-blue)'}
            strokeWidth={RING_STROKE}
            strokeLinecap="round"
            strokeDasharray={`${circumference * arc} ${circumference}`}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[22px] font-bold text-[var(--my-text)]">{percentage}%</span>
          <span className="text-[10px] uppercase text-[var(--my-muted)]">
            {standupStrings.my.capacityAllocated()}
          </span>
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          <Tag tone={STATUS_TONE[capacity.status] ?? 'neutral'} shape="square">
            {standupStrings.my.capacityState[capacity.status] ?? capacity.status}
          </Tag>
          <Tag tone="neutral" shape="square" className="my-mono font-normal">
            {standupStrings.my.plannedVsCapacity({
              planned: hours(capacity.allocatedMinutes),
              capacity: hours(capacity.effectiveMinutes)
            })}
          </Tag>
          {capacity.nominalMinutes !== capacity.effectiveMinutes ? (
            <Tag tone="neutral" shape="square" className="my-mono font-normal">
              {standupStrings.my.nominalCapacity({ hours: hours(capacity.nominalMinutes) })}
            </Tag>
          ) : null}
          {capacity.adjustments.map((adjustment, index) => (
            <Tag key={`${adjustment.type}-${index}`} tone="neutral" shape="square" className="font-normal">
              {standupStrings.my.adjustmentLine({ label: adjustment.label, hours: hours(adjustment.minutes) })}
            </Tag>
          ))}
        </div>

        <p data-testid="capacity-summary" className="text-[14px] leading-5 text-[var(--my-muted)]">
          {headlineFor(capacity, allocationCount, locale)}
          {/* VAR-10's exact wording spells out "hours" ("2.0 hours"), unlike every other figure here. */}
          {debt && debt.outstandingDebtMinutes > 0 ? (
            <>
              {' '}
              <Emphasize
                text={standupStrings.my.debtSentence({ hours: spelled(debt.outstandingDebtMinutes) })}
                phrase={spelled(debt.outstandingDebtMinutes)}
                className="font-semibold text-[var(--my-text)]"
              />
            </>
          ) : null}
          {debt && debt.outstandingDebtMinutes === 0 && debt.surplusMinutes > 0 ? (
            <>
              {' '}
              <Emphasize
                text={standupStrings.my.surplusSentence({ hours: spelled(debt.surplusMinutes) })}
                phrase={spelled(debt.surplusMinutes)}
                className="font-semibold text-[var(--my-text)]"
              />
            </>
          ) : null}
          {capacity.strandedMinutes > 0 ? (
            <>
              {' '}
              <span className="text-[var(--my-amber)]">
                {standupStrings.my.strandedSentence({ hours: hours(capacity.strandedMinutes) })}
              </span>
            </>
          ) : null}
        </p>
      </div>
    </div>
  )
}
