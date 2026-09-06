/**
 * The minute layer underpins every number the stand-up module shows a PM. Its
 * whole reason for existing is NFR-P2 — sums must be exact — so the rounding
 * and summation rules are pinned here rather than trusted.
 */
import {
  addMinutes,
  clampToZero,
  describeMinutes,
  formatMinutesAsHours,
  hoursToMinutes,
  isMinutes,
  maxMinutes,
  minMinutes,
  minutes,
  minutesToHours,
  roundToStep,
  subtractMinutes,
  sumMinutes,
  ZERO_MINUTES
} from '../minutes'

describe('minutes()', () => {
  it('accepts whole numbers, including negatives for signed variance', () => {
    expect(minutes(480)).toBe(480)
    expect(minutes(0)).toBe(0)
    expect(minutes(-120)).toBe(-120)
  })

  it('rejects a fractional value instead of silently rounding it', () => {
    // A fraction here means someone did float-hour maths upstream. Rounding it
    // away would hide the real defect.
    expect(() => minutes(7.5)).toThrow(/whole number/)
  })

  it('rejects non-finite values', () => {
    expect(() => minutes(NaN)).toThrow(/finite/)
    expect(() => minutes(Infinity)).toThrow(/finite/)
  })

  it('isMinutes reports validity without throwing', () => {
    expect(isMinutes(480)).toBe(true)
    expect(isMinutes(7.5)).toBe(false)
    expect(isMinutes(NaN)).toBe(false)
  })
})

describe('hoursToMinutes()', () => {
  it('converts the quarter-hour steps the allocation UI uses', () => {
    expect(hoursToMinutes(8)).toBe(480)
    expect(hoursToMinutes(0.25)).toBe(15)
    expect(hoursToMinutes(7.5)).toBe(450)
    expect(hoursToMinutes(0)).toBe(0)
  })

  it('rounds to the nearest whole minute, half away from zero (NFR-P3)', () => {
    // 1/3 h = 20.0000...; 0.3456h = 20.736m -> 21
    expect(hoursToMinutes(0.3456)).toBe(21)
    expect(hoursToMinutes(-0.3456)).toBe(-21)
  })

  it('rounds .5 of a minute away from zero in both directions', () => {
    // 0.075h = 4.5 minutes
    expect(hoursToMinutes(0.075)).toBe(5)
    expect(hoursToMinutes(-0.075)).toBe(-5)
  })
})

describe('NFR-P2: sums are exact', () => {
  it('eight allocations of 0.25h sum to exactly 2.0h', () => {
    // The spec's own worked assertion (E76). In floats,
    // 0.25*8 is fine but 0.1+0.2 style drift across a real board is not.
    const eighths = Array.from({ length: 8 }, () => hoursToMinutes(0.25))
    const total = sumMinutes(eighths, (m) => m)

    expect(total).toBe(120)
    expect(minutesToHours(total)).toBe(2)
    expect(formatMinutesAsHours(total)).toBe('2.0h')
  })

  it('stays exact across a full board of awkward values', () => {
    // Ten rows that are each individually inexact in float hours.
    const rows = [0.1, 0.2, 0.3, 0.7, 1.1, 1.3, 2.9, 0.45, 0.05, 0.9]
    const total = sumMinutes(rows, (h) => hoursToMinutes(h))

    // 6 + 12 + 18 + 42 + 66 + 78 + 174 + 27 + 3 + 54
    expect(total).toBe(480)
    expect(formatMinutesAsHours(total)).toBe('8.0h')
  })

  it('avoids the float drift the minute domain exists to prevent', () => {
    // The canonical demonstration: 0.1 + 0.2 !== 0.3 in IEEE 754.
    expect(0.1 + 0.2).not.toBe(0.3)

    // Through minutes it is exact, and formats as the PM expects.
    const total = sumMinutes([0.1, 0.2], (h) => hoursToMinutes(h))
    expect(total).toBe(18)
    expect(minutesToHours(total)).toBe(0.3)
    expect(formatMinutesAsHours(total)).toBe('0.3h')
  })
})

describe('formatMinutesAsHours()', () => {
  it('always shows one decimal place (NFR-P1)', () => {
    expect(formatMinutesAsHours(minutes(480))).toBe('8.0h')
    expect(formatMinutesAsHours(minutes(450))).toBe('7.5h')
    expect(formatMinutesAsHours(ZERO_MINUTES)).toBe('0.0h')
  })

  it('can omit the unit for use next to a separate label', () => {
    expect(formatMinutesAsHours(minutes(480), { withUnit: false })).toBe('8.0')
  })

  it('renders negatives with a minus sign', () => {
    expect(formatMinutesAsHours(minutes(-120))).toBe('-2.0h')
  })

  it('adds an explicit plus only when asked, for signed variance columns', () => {
    expect(formatMinutesAsHours(minutes(120), { signed: true })).toBe('+2.0h')
    expect(formatMinutesAsHours(minutes(-120), { signed: true })).toBe('-2.0h')
    // Zero variance must never render as "+0.0h" or "-0.0h".
    expect(formatMinutesAsHours(ZERO_MINUTES, { signed: true })).toBe('0.0h')
  })

  it('rounds half away from zero symmetrically', () => {
    // 3 minutes = 0.05h, which sits exactly on the .1 boundary.
    expect(formatMinutesAsHours(minutes(3))).toBe('0.1h')
    expect(formatMinutesAsHours(minutes(-3))).toBe('-0.1h')
  })

  it('respects locale decimal separators (NFR-21)', () => {
    expect(formatMinutesAsHours(minutes(450), { locale: 'de-DE' })).toBe('7,5h')
  })
})

describe('describeMinutes() — screen reader text (NFR-A4)', () => {
  it('announces the unit', () => {
    expect(describeMinutes(minutes(480))).toBe('8 hours')
  })

  it('uses the singular for exactly one hour', () => {
    expect(describeMinutes(minutes(60))).toBe('1 hour')
  })

  it('includes the fraction when there is one', () => {
    expect(describeMinutes(minutes(450))).toBe('7.5 hours')
  })

  it('says "minus" rather than relying on a symbol', () => {
    expect(describeMinutes(minutes(-120))).toBe('minus 2 hours')
  })
})

describe('arithmetic helpers', () => {
  it('adds and subtracts', () => {
    expect(addMinutes(minutes(180), minutes(120))).toBe(300)
    expect(addMinutes()).toBe(0)
    expect(subtractMinutes(minutes(480), minutes(300))).toBe(180)
  })

  it('allows a negative difference, because gaps and variance are signed', () => {
    expect(subtractMinutes(minutes(300), minutes(480))).toBe(-180)
  })

  it('clampToZero floors negatives for capacity and outstanding debt', () => {
    expect(clampToZero(minutes(-120))).toBe(0)
    expect(clampToZero(minutes(120))).toBe(120)
  })

  it('min/max pick the right side', () => {
    expect(maxMinutes(minutes(120), minutes(480))).toBe(480)
    expect(minMinutes(minutes(120), minutes(480))).toBe(120)
  })
})

describe('roundToStep()', () => {
  const QUARTER_HOUR = minutes(15)

  it('snaps to the 0.25h step the allocation stepper uses (ALO-6)', () => {
    expect(roundToStep(minutes(20), QUARTER_HOUR)).toBe(15)
    expect(roundToStep(minutes(23), QUARTER_HOUR)).toBe(30)
    expect(roundToStep(minutes(480), QUARTER_HOUR)).toBe(480)
  })

  it('rounds an exact half-step away from zero in both directions', () => {
    // A 15-minute step has no whole-minute midpoint, so use a 10-minute step
    // where 5 sits exactly on the boundary.
    const TEN = minutes(10)
    expect(roundToStep(minutes(5), TEN)).toBe(10)
    expect(roundToStep(minutes(-5), TEN)).toBe(-10)
  })

  it('cannot be handed a fractional minute count at all', () => {
    // The brand guard is the backstop: fractional minutes never enter the
    // domain, so roundToStep never has to defend against them.
    expect(() => roundToStep(minutes(7.5 as number), QUARTER_HOUR)).toThrow(/whole number/)
  })

  it('rejects a non-positive step', () => {
    expect(() => roundToStep(minutes(20), minutes(0))).toThrow(/positive/)
  })
})
