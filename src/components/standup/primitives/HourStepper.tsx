'use client'

import { useEffect, useState } from 'react'

import { ALLOCATION_STEP_MINUTES, describeSplit } from '@/lib/standup/allocation'
import {
  MINUTES_PER_HOUR,
  hoursToMinutes,
  roundToStep,
  type Minutes
} from '@/lib/standup/minutes'
import { standupStrings } from '@/lib/standup/strings'
import { cn } from '@/lib/utils'

/**
 * Planned hours for one allocation row (ALO-6, ALO-7).
 *
 * Displays hours because that is what a PM says out loud, and emits **minutes**
 * because that is what the module stores (DAT-2). The conversion happens here,
 * once, at the boundary.
 *
 * Three behaviours are deliberate:
 *
 * **It never emits zero.** CC-5 refuses empty allocations, and the schema
 * refuses them too — so the decrement is disabled at one step rather than
 * letting the PM produce a row the server will reject. Removing a row is the
 * remove button's job, not the stepper's.
 *
 * **A typed value snaps to the grain rather than being refused.** 2.6 hours
 * becomes 2.5 rather than an error: the PM is mid-sentence in a meeting, and
 * the server applies the same rounding, so nothing drifts.
 *
 * **The field restores itself when an entry is ignored.** A stepper showing
 * "banana" or "0" while the server holds 3.0h is worse than one that snaps
 * back — the visible number must always be the committed one.
 */

export interface HourStepperProps {
  /** The task this plans, for the accessible name. */
  taskLabel: string
  valueMinutes: Minutes
  /** Supplied to render ALO-7's split helper. */
  remainingEstimateMinutes?: Minutes
  onChange: (minutes: Minutes) => void
  disabled?: boolean
  locale?: string
  className?: string
}

export function HourStepper({
  taskLabel,
  valueMinutes,
  remainingEstimateMinutes,
  onChange,
  disabled = false,
  locale,
  className
}: HourStepperProps) {
  const [draft, setDraft] = useState(() => hoursText(valueMinutes, locale))

  // The row is controlled by the server's answer, so an optimistic edit that is
  // rolled back (RUN-25) has to be reflected here too.
  useEffect(() => {
    setDraft(hoursText(valueMinutes, locale))
  }, [valueMinutes, locale])

  const atFloor = valueMinutes <= ALLOCATION_STEP_MINUTES

  const step = (direction: 1 | -1) => {
    const next = valueMinutes + direction * ALLOCATION_STEP_MINUTES
    if (next < ALLOCATION_STEP_MINUTES) return
    onChange(next as Minutes)
  }

  const commit = () => {
    const parsed = Number(draft)

    // Anything unusable — empty, non-numeric, below the grain — leaves the
    // committed value alone and puts it back on screen.
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setDraft(hoursText(valueMinutes, locale))
      return
    }

    const snapped = roundToStep(hoursToMinutes(parsed), ALLOCATION_STEP_MINUTES)
    if (snapped < ALLOCATION_STEP_MINUTES) {
      setDraft(hoursText(valueMinutes, locale))
      return
    }

    setDraft(hoursText(snapped, locale))
    if (snapped !== valueMinutes) onChange(snapped)
  }

  const split =
    remainingEstimateMinutes === undefined
      ? null
      : describeSplit(valueMinutes, remainingEstimateMinutes)

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label={standupStrings.allocation.stepperDecrease()}
          disabled={disabled || atFloor}
          onClick={() => step(-1)}
          className="h-7 w-7 rounded-md border border-border text-sm leading-none disabled:opacity-40"
        >
          −
        </button>

        <input
          type="number"
          role="spinbutton"
          inputMode="decimal"
          step={0.25}
          min={0.25}
          aria-label={standupStrings.allocation.stepperLabel({ task: taskLabel })}
          value={draft}
          disabled={disabled}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              commit()
              return
            }
            // The browser's own number-input arrows move by `step`, but only
            // once the field is focused *and* the value is valid; handling them
            // here keeps the grain identical to the buttons in every state.
            if (event.key === 'ArrowUp') {
              event.preventDefault()
              step(1)
            }
            if (event.key === 'ArrowDown') {
              event.preventDefault()
              step(-1)
            }
          }}
          className="h-7 w-16 rounded-md border border-border bg-background px-2 text-right text-sm tabular-nums disabled:opacity-40"
        />

        <button
          type="button"
          aria-label={standupStrings.allocation.stepperIncrease()}
          disabled={disabled}
          onClick={() => step(1)}
          className="h-7 w-7 rounded-md border border-border text-sm leading-none disabled:opacity-40"
        >
          +
        </button>
      </div>

      {split && (
        <p className="text-xs text-muted-foreground">
          {standupStrings.allocation.stepperSplit({
            planned: split.plannedMinutes,
            remaining: split.remainingEstimateMinutes,
            carries: split.carriesMinutes,
            locale
          })}
        </p>
      )}
    </div>
  )
}

/**
 * The exact hours the field shows — no unit, because the field is numeric.
 *
 * Deliberately **not** `formatMinutesAsHours`. ALO-2 rounds *display* to one
 * decimal place, which would render a legal 8.25h allocation as "8.3" inside an
 * editable field. The value would still round-trip correctly (2.6 snaps back to
 * 2.5 on commit), but a field showing a number that is not the stored one is a
 * field that lies, and the PM has no way to tell 8.25 from 8.3 while typing.
 *
 * Read-only displays follow ALO-2. An input shows what will be committed.
 */
function hoursText(value: Minutes, _locale?: string): string {
  const hours = value / MINUTES_PER_HOUR
  // Quarter hours never need more than two decimals, and trailing zeros make a
  // stepper look like a currency field.
  return String(Number(hours.toFixed(2)))
}
