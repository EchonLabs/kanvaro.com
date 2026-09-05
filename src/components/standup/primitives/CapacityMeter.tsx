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
 * **Over-allocation renders beyond the bar's end, never clipped.** A meter that
 * saturates at 100% makes nine hours and twenty hours look identical, and the
 * difference between those two is the difference between a day that needs a
 * nudge and one that needs the plan rewritten.
 *
 * Purely presentational. It computes no capacity — `computeCapacity()` is the
 * only authority for that — it renders the breakdown it is handed.
 */

const TONE: Record<AllocationStatus, string> = {
  full: 'text-emerald-600 dark:text-emerald-400',
  under: 'text-amber-600 dark:text-amber-400',
  over: 'text-destructive',
  zero: 'text-muted-foreground',
  unavailable: 'text-muted-foreground'
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
  const denominator = effectiveMinutes > 0 ? effectiveMinutes : 0

  const percent = (value: number) =>
    denominator === 0 ? 0 : Math.min(100, (value / denominator) * 100)

  const carried = Math.min(carriedMinutes, allocatedMinutes)
  const fresh = Math.max(0, allocatedMinutes - carried)
  const overMinutes = Math.max(0, allocatedMinutes - denominator)

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="tabular-nums text-muted-foreground">
          {standupStrings.allocation.meterLabel({
            name,
            allocated: allocatedMinutes,
            capacity: effectiveMinutes,
            locale
          })}
        </span>
        {/* NFR-A1: the word, always, not only the colour. */}
        <span className={cn('font-medium tabular-nums', TONE[status])}>
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
        className="relative flex h-2 w-full overflow-visible rounded-full bg-muted"
      >
        <div
          data-testid="meter-carried"
          title={standupStrings.allocation.meterCarriedSegment({
            minutes: carried as Minutes,
            locale
          })}
          className="h-full rounded-l-full bg-sky-500/70"
          style={{ width: `${percent(carried)}%` }}
        />
        <div
          data-testid="meter-new"
          title={standupStrings.allocation.meterNewSegment({
            minutes: fresh as Minutes,
            locale
          })}
          className="h-full bg-emerald-500/70"
          style={{ width: `${percent(fresh)}%` }}
        />
        {overMinutes > 0 && (
          <div
            data-testid="meter-over"
            title={standupStrings.allocation.meterOverSegment({
              minutes: overMinutes as Minutes,
              locale
            })}
            // Sits past the bar's end deliberately: the overflow is the point.
            className="absolute left-full top-0 h-full rounded-r-full bg-destructive"
            style={{ width: `${Math.min(50, percent(overMinutes))}%` }}
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
