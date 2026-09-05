/**
 * Integer-minute arithmetic for the stand-up module.
 *
 * Spec DAT-2 / NFR-P1 / NFR-P2: every hour value in this module is stored and
 * computed as a whole number of minutes, and converted to hours only at the
 * display boundary. Floats are what make eight allocations of 0.25h sum to
 * 1.9999999999999998 instead of 2.0, and a capacity meter that reads 7.9h on a
 * full day destroys trust in every other number on the screen.
 *
 * The `Minutes` brand exists so that a plain `number` cannot be passed where
 * minutes are expected without going through {@link minutes} or one of the
 * converters here. Nothing outside this file should unwrap it, and no service
 * function should accept or return float hours.
 */

declare const MINUTES_BRAND: unique symbol

/** A whole number of minutes. Construct with {@link minutes}. */
export type Minutes = number & { readonly [MINUTES_BRAND]: true }

export const MINUTES_PER_HOUR = 60

/** Zero, as `Minutes`. Saves repeating `minutes(0)`. */
export const ZERO_MINUTES = 0 as Minutes

/**
 * Asserts a value is a safe, whole, non-negative-capable minute count and
 * brands it.
 *
 * Throws rather than silently rounding: a fractional minute reaching this
 * function means a caller did hour arithmetic in floats somewhere upstream,
 * and rounding it away here would hide the actual defect.
 */
export function minutes(value: number): Minutes {
  if (!Number.isFinite(value)) {
    throw new RangeError(`Minutes must be finite, received ${value}`)
  }
  if (!Number.isInteger(value)) {
    throw new RangeError(
      `Minutes must be a whole number, received ${value}. ` +
        'Convert from hours with hoursToMinutes() rather than multiplying by 60 inline.'
    )
  }
  return value as Minutes
}

/** True when `value` is already a valid whole minute count. */
export function isMinutes(value: number): boolean {
  return Number.isFinite(value) && Number.isInteger(value)
}

/**
 * Converts a decimal hour value to whole minutes, rounding half away from zero.
 *
 * This is the only sanctioned way into the minute domain from hours — used at
 * API boundaries, CSV import, and story-point conversion (NFR-P3, which rounds
 * to the nearest minute at the moment an estimate is finalised).
 */
export function hoursToMinutes(hours: number): Minutes {
  if (!Number.isFinite(hours)) {
    throw new RangeError(`Hours must be finite, received ${hours}`)
  }
  return minutes(roundHalfAwayFromZero(hours * MINUTES_PER_HOUR))
}

/**
 * Converts minutes to decimal hours for display only.
 *
 * Never feed the result back into arithmetic — sum minutes and convert once at
 * the end, or NFR-P2 is violated.
 */
export function minutesToHours(value: Minutes): number {
  return value / MINUTES_PER_HOUR
}

/**
 * The single display formatter (NFR-P1): one decimal place, rounding half away
 * from zero. Every hour string a user sees comes from here.
 *
 * `locale` is passed through to `toLocaleString` so decimal separators follow
 * the viewer's locale (NFR-21) — 7.5h renders as "7,5" in de-DE.
 */
export function formatMinutesAsHours(
  value: Minutes,
  options: { locale?: string; withUnit?: boolean; signed?: boolean } = {}
): string {
  const { locale, withUnit = true, signed = false } = options

  const hours = minutesToHours(value)
  // Round to one decimal half-away-from-zero before formatting, so -0.25h
  // renders as "-0.3" rather than relying on the formatter's own rounding mode.
  const rounded = roundHalfAwayFromZero(hours * 10) / 10

  const magnitude = Math.abs(rounded).toLocaleString(locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  })

  // Object.is distinguishes -0 from 0, so a zero variance never renders "-0.0".
  const negative = rounded < 0
  const sign = negative ? '-' : signed && rounded > 0 ? '+' : ''

  return `${sign}${magnitude}${withUnit ? 'h' : ''}`
}

/**
 * Screen-reader text for an hour value (NFR-A4: hour values must be announced
 * with units, e.g. "planned six hours").
 */
export function describeMinutes(value: Minutes, locale?: string): string {
  const hours = Math.abs(minutesToHours(value))
  const rounded = roundHalfAwayFromZero(hours * 10) / 10
  const unit = rounded === 1 ? 'hour' : 'hours'
  const magnitude = rounded.toLocaleString(locale, {
    minimumFractionDigits: rounded % 1 === 0 ? 0 : 1,
    maximumFractionDigits: 1
  })
  return value < 0 ? `minus ${magnitude} ${unit}` : `${magnitude} ${unit}`
}

/** Adds minute values. Variadic so callers never reach for `reduce` with `+`. */
export function addMinutes(...values: Minutes[]): Minutes {
  return minutes(values.reduce<number>((total, value) => total + value, 0))
}

/** `a - b`, which may be negative — variance and gaps are signed. */
export function subtractMinutes(a: Minutes, b: Minutes): Minutes {
  return minutes(a - b)
}

/** Sums a collection, mapping each item to its minute value. */
export function sumMinutes<T>(items: readonly T[], select: (item: T) => Minutes): Minutes {
  return minutes(items.reduce<number>((total, item) => total + select(item), 0))
}

/** Clamps to zero. Capacity and outstanding debt both floor rather than go negative. */
export function clampToZero(value: Minutes): Minutes {
  return value < 0 ? ZERO_MINUTES : value
}

export function maxMinutes(a: Minutes, b: Minutes): Minutes {
  return a >= b ? a : b
}

export function minMinutes(a: Minutes, b: Minutes): Minutes {
  return a <= b ? a : b
}

/**
 * Rounds to the nearest multiple of `step` minutes, half away from zero.
 *
 * Allocation hours move in 0.25h steps (ALO-6), which is 15 minutes.
 */
export function roundToStep(value: Minutes, step: Minutes): Minutes {
  if (step <= 0) throw new RangeError(`Step must be positive, received ${step}`)
  return minutes(roundHalfAwayFromZero(value / step) * step)
}

/**
 * `Math.round` rounds -0.5 to -0 (half up), but NFR-P1 requires half *away from
 * zero* so that positive and negative variances of the same magnitude are
 * displayed symmetrically.
 */
function roundHalfAwayFromZero(value: number): number {
  return value < 0 ? -Math.round(-value) : Math.round(value)
}
