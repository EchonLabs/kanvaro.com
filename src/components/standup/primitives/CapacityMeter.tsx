'use client'

import type { AllocationStatus } from '@/lib/standup/capacity'
import { type Minutes } from '@/lib/standup/minutes'
import { standupStrings } from '@/lib/standup/strings'
import { cn } from '@/lib/utils'

/**
 * One member's day as a segmented bar (§15.8.7, NFR-A1).
 *
 * Two rules shape this component.
 *
 * **Colour is never the only carrier of meaning** (NFR-A1). Every status
 * renders its word — FULL, GAP 3.0h, OVER 1.5h, Nothing planned, Unavailable —
 * beside the bar, and the bar itself is a `progressbar` carrying the real
 * minute values so a screen reader gets the numbers rather than a percentage.
 *
 * **Over-allocation is never clipped — and never leaves the bar.** A meter that
 * saturates at 100% makes nine hours and twenty hours look identical, and the
 * difference between those two is the difference between a day that needs a
 * nudge and one that needs the plan rewritten. So when a member is over, the
 * bar's scale becomes the *allocated* hours: a tick marks where capacity ends
 * and the overage fills red after it. The further over, the further left the
 * tick sits. The overage used to be drawn past the bar's right end instead,
 * which pushed it out of the bar and over the edge of the member card.
 *
 * Once over, the whole bar turns red — carried and new work included — so an
 * over-allocated member reads as one state at a glance rather than a mostly
 * green bar with a red tail. The capacity tick still shows how far over.
 *
 * Purely presentational. It computes no capacity — `computeCapacity()` is the
 * only authority for that — it renders the breakdown it is handed.
 */

/*
 * Fills are written as `color-mix` or a bare token, never `bg-[var(--x)]/60`:
 * Tailwind cannot apply an opacity modifier to a `var()` colour and silently
 * emits no rule, which left the carried and new segments with no background —
 * a member with assigned tasks showed an empty track.
 */
const TONE: Record<AllocationStatus, string> = {
  full: 'text-[var(--apple-system-green)]',
  under: 'text-[var(--apple-system-orange)]',
  over: 'text-[var(--apple-system-red)]',
  zero: 'text-[var(--apple-secondary-label)]',
  unavailable: 'text-[var(--apple-secondary-label)]'
}

export interface CapacityMeterProps {
  name: string
  effectiveMinutes: Minutes
  allocatedMinutes: Minutes
  /** The carried portion of `allocatedMinutes`, shaded differently (§15.8.7). */
  carriedMinutes: Minutes
  gapMinutes: Minutes
  status: AllocationStatus
  locale?: string
  className?: string
}

export function CapacityMeter({
  name,
  effectiveMinutes,
  allocatedMinutes,
  carriedMinutes,
  gapMinutes,
  status,
  locale,
  className
}: CapacityMeterProps) {
  // An unavailable member has no denominator. Guarding here rather than at the
  // call site keeps every caller from having to remember that a zero day is a
  // legal state rather than an error.
  const capacity = effectiveMinutes > 0 ? effectiveMinutes : 0
  const overMinutes = capacity > 0 ? Math.max(0, allocatedMinutes - capacity) : 0
  // The bar's full length: the day's capacity, or the whole allocation once
  // that exceeds it, so every segment stays inside the track.
  const scale = overMinutes > 0 ? allocatedMinutes : capacity

  const percent = (value: number) =>
    scale === 0 ? 0 : Math.min(100, (value / scale) * 100)

  // Within capacity, carried work fills first, then new; whatever lies past
  // capacity is the over segment, whichever kind of work it is.
  const withinCapacity = Math.min(allocatedMinutes, capacity)
  const carried = Math.min(carriedMinutes, withinCapacity)
  const fresh = Math.max(0, withinCapacity - carried)

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      {/* `min-w-0` + truncate on the label, `shrink-0` on the status: on a
          narrow card the label gives way, and the status word — the part that
          says OVER — always stays inside the card. */}
      <div className="flex min-w-0 items-baseline justify-between gap-2 text-[12.5px]">
        <span className="min-w-0 truncate font-apple-mono tabular-nums text-[var(--apple-secondary-label)]">
          {standupStrings.allocation.meterLabel({
            name,
            allocated: allocatedMinutes,
            capacity: effectiveMinutes,
            locale
          })}
        </span>
        {/* NFR-A1: the word, always, not only the colour. */}
        <span className={cn('shrink-0 font-apple-mono font-semibold tabular-nums', TONE[status])}>
          {statusLabel(status, gapMinutes, locale)}
        </span>
      </div>

      <div
        role="progressbar"
        aria-valuenow={allocatedMinutes}
        aria-valuemin={0}
        aria-valuemax={effectiveMinutes}
        aria-label={standupStrings.allocation.meterLabel({
          name,
          allocated: allocatedMinutes,
          capacity: effectiveMinutes,
          locale
        })}
        className="relative flex h-[6px] w-full overflow-hidden rounded-full bg-[var(--apple-tertiary-fill)]"
      >
        <div
          data-testid="meter-carried"
          title={standupStrings.allocation.meterCarriedSegment({
            minutes: carried as Minutes,
            locale
          })}
          className={cn(
            'h-full rounded-l-full',
            overMinutes > 0
              ? 'bg-[var(--apple-system-red)]'
              : 'bg-[color-mix(in_srgb,var(--apple-system-blue)_70%,transparent)]'
          )}
          style={{ width: `${percent(carried)}%` }}
        />
        <div
          data-testid="meter-new"
          title={standupStrings.allocation.meterNewSegment({
            minutes: fresh as Minutes,
            locale
          })}
          className={cn(
            'h-full',
            overMinutes > 0
              ? 'bg-[var(--apple-system-red)]'
              : 'bg-[var(--apple-system-green)]'
          )}
          style={{ width: `${percent(fresh)}%` }}
        />
        {overMinutes > 0 && (
          <div
            data-testid="meter-over"
            title={standupStrings.allocation.meterOverSegment({
              minutes: overMinutes as Minutes,
              locale
            })}
            className="h-full bg-[var(--apple-system-red)]"
            style={{ width: `${percent(overMinutes)}%` }}
          />
        )}
        {overMinutes > 0 && (
          // Where the day's capacity ends — the line the red is past.
          <span
            aria-hidden="true"
            data-testid="meter-capacity-mark"
            className="absolute top-0 h-full w-[2px] -translate-x-1/2 bg-[var(--plan-surface)]"
            style={{ left: `${percent(capacity)}%` }}
          />
        )}
      </div>
    </div>
  )
}

function statusLabel(
  status: AllocationStatus,
  gapMinutes: Minutes,
  locale?: string
): string {
  switch (status) {
    case 'full':
      return standupStrings.allocationStatus.full()
    case 'under':
      return standupStrings.allocationStatus.under({ minutes: gapMinutes, locale })
    case 'over':
      // The gap is negative when over; the string wants the magnitude.
      return standupStrings.allocationStatus.over({
        minutes: Math.abs(gapMinutes) as Minutes,
        locale
      })
    case 'zero':
      return standupStrings.allocationStatus.zero()
    case 'unavailable':
      return standupStrings.allocationStatus.unavailable()
  }
}
