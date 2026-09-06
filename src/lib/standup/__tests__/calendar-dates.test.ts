/**
 * Timezone and DST handling is the classic source of silent, late-discovered
 * defects in this kind of module, so the boundaries are pinned here.
 *
 * Asia/Colombo is the module's primary example project and a good stress test
 * for half-hour offsets (UTC+05:30), but it has **no DST** — so the DST cases
 * deliberately use Europe/London and America/New_York instead.
 */
import {
  addDays,
  assertIsoDate,
  dayBoundsInTimezone,
  dayOfWeek,
  eachDateInRange,
  isIsoDate,
  isValidTimezone,
  isWithinRange,
  monthDay,
  offsetMinutesAt,
  toInstant,
  toProjectDate
} from '../calendar-dates'

const COLOMBO = 'Asia/Colombo'
const LONDON = 'Europe/London'
const NEW_YORK = 'America/New_York'

describe('ISO date validation', () => {
  it('accepts well-formed dates', () => {
    expect(isIsoDate('2026-08-14')).toBe(true)
    expect(isIsoDate('2026-02-29')).toBe(false) // 2026 is not a leap year
    expect(isIsoDate('2028-02-29')).toBe(true) // 2028 is
  })

  it('rejects shapes that look right but are impossible dates', () => {
    expect(isIsoDate('2026-02-31')).toBe(false)
    expect(isIsoDate('2026-13-01')).toBe(false)
    expect(isIsoDate('2026-00-10')).toBe(false)
  })

  it('rejects anything that is not a bare calendar date', () => {
    expect(isIsoDate('2026-8-14')).toBe(false)
    expect(isIsoDate('2026-08-14T00:00:00Z')).toBe(false)
    expect(isIsoDate('')).toBe(false)
  })

  it('assertIsoDate names the offending field', () => {
    expect(() => assertIsoDate('nonsense', 'startDate')).toThrow(/startDate/)
  })
})

describe('dayOfWeek', () => {
  it('is a property of the date, not of any observer timezone', () => {
    // 2026-08-14 is a Friday everywhere.
    expect(dayOfWeek('2026-08-14')).toBe(5)
    expect(dayOfWeek('2026-08-15')).toBe(6) // Saturday
    expect(dayOfWeek('2026-08-16')).toBe(0) // Sunday
  })
})

describe('date arithmetic stays in the date domain', () => {
  it('adds and subtracts days', () => {
    expect(addDays('2026-08-14', 1)).toBe('2026-08-15')
    expect(addDays('2026-08-14', -1)).toBe('2026-08-13')
  })

  it('crosses month and year boundaries', () => {
    expect(addDays('2026-08-31', 1)).toBe('2026-09-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2027-01-01', -1)).toBe('2026-12-31')
  })

  it('handles leap years', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01')
  })

  it('does not drift across a DST boundary', () => {
    // 2026-03-29 is when the UK springs forward. Naive date maths that goes
    // through a local Date can land on the wrong day here.
    expect(addDays('2026-03-28', 1)).toBe('2026-03-29')
    expect(addDays('2026-03-29', 1)).toBe('2026-03-30')
  })

  it('enumerates an inclusive range', () => {
    expect(eachDateInRange('2026-08-14', '2026-08-17')).toEqual([
      '2026-08-14',
      '2026-08-15',
      '2026-08-16',
      '2026-08-17'
    ])
  })

  it('returns a single date when from equals to', () => {
    expect(eachDateInRange('2026-08-14', '2026-08-14')).toEqual(['2026-08-14'])
  })

  it('returns nothing when the range is inverted', () => {
    expect(eachDateInRange('2026-08-17', '2026-08-14')).toEqual([])
  })

  it('spans a year boundary, as a sprint may (E12)', () => {
    expect(eachDateInRange('2026-12-30', '2027-01-02')).toEqual([
      '2026-12-30',
      '2026-12-31',
      '2027-01-01',
      '2027-01-02'
    ])
  })

  it('isWithinRange is inclusive at both ends', () => {
    expect(isWithinRange('2026-08-14', '2026-08-14', '2026-08-17')).toBe(true)
    expect(isWithinRange('2026-08-17', '2026-08-14', '2026-08-17')).toBe(true)
    expect(isWithinRange('2026-08-13', '2026-08-14', '2026-08-17')).toBe(false)
  })

  it('monthDay strips the year for annually recurring overrides', () => {
    expect(monthDay('2026-12-24')).toBe('12-24')
    expect(monthDay('2027-12-24')).toBe('12-24')
  })
})

describe('CAL-5 — the project timezone decides which date a stand-up belongs to', () => {
  it('converts a 09:15 Colombo stand-up to 03:45 UTC', () => {
    // The spec's own worked example. Colombo is UTC+05:30.
    const instant = toInstant('2026-08-14', '09:15', COLOMBO)
    expect(instant.toISOString()).toBe('2026-08-14T03:45:00.000Z')
  })

  it('attributes a late-evening UTC instant to the next Colombo date', () => {
    // 23:00 UTC on the 5th is already 04:30 on the 6th in Colombo.
    const instant = new Date('2026-08-05T23:00:00.000Z')
    expect(toProjectDate(instant, COLOMBO)).toBe('2026-08-06')
    expect(toProjectDate(instant, 'UTC')).toBe('2026-08-05')
  })

  it('handles the half-hour offset without special-casing', () => {
    expect(offsetMinutesAt(COLOMBO, new Date('2026-01-15T00:00:00Z'))).toBe(330)
    // Colombo has no DST, so the offset is identical in July.
    expect(offsetMinutesAt(COLOMBO, new Date('2026-07-15T00:00:00Z'))).toBe(330)
  })
})

describe('CAL-6 / E7 — DST is handled by recomputing, never by a stored offset', () => {
  it('keeps the same local wall-clock time either side of a UK transition', () => {
    // London: GMT (+0) in March before the change, BST (+1) after.
    // The UK springs forward on the last Sunday of March, 2026-03-29.
    const beforeDst = toInstant('2026-03-27', '09:15', LONDON)
    const afterDst = toInstant('2026-03-30', '09:15', LONDON)

    // GMT: 09:15 local is 09:15 UTC.
    expect(beforeDst.toISOString()).toBe('2026-03-27T09:15:00.000Z')
    // BST: the same 09:15 local is now an hour earlier in UTC. A stored offset
    // would have kept it at 09:15Z and drifted the meeting by an hour.
    expect(afterDst.toISOString()).toBe('2026-03-30T08:15:00.000Z')
  })

  it('reports the offset change across the transition', () => {
    expect(offsetMinutesAt(LONDON, new Date('2026-03-27T12:00:00Z'))).toBe(0)
    expect(offsetMinutesAt(LONDON, new Date('2026-03-30T12:00:00Z'))).toBe(60)
  })

  it('handles a negative-offset zone across its own transition', () => {
    // New York: EST (-5) in early March, EDT (-4) after.
    expect(offsetMinutesAt(NEW_YORK, new Date('2026-03-01T12:00:00Z'))).toBe(-300)
    expect(offsetMinutesAt(NEW_YORK, new Date('2026-04-01T12:00:00Z'))).toBe(-240)
  })

  it('a sprint spanning the transition keeps its local start time throughout', () => {
    // Every stand-up is 09:15 local, even though the UTC instants differ.
    const dates = ['2026-03-26', '2026-03-27', '2026-03-30', '2026-03-31']
    const localTimes = dates.map((date) => {
      const instant = toInstant(date, '09:15', LONDON)
      return toProjectDate(instant, LONDON) === date
    })

    expect(localTimes.every(Boolean)).toBe(true)
  })
})

describe('dayBoundsInTimezone', () => {
  it('produces a half-open interval covering exactly one local day', () => {
    const { from, to } = dayBoundsInTimezone('2026-08-14', COLOMBO)

    expect(from.toISOString()).toBe('2026-08-13T18:30:00.000Z')
    expect(to.toISOString()).toBe('2026-08-14T18:30:00.000Z')
    // Exactly 24 hours in a zone with no DST.
    expect(to.getTime() - from.getTime()).toBe(24 * 60 * 60 * 1000)
  })

  it('is 23 hours long on a spring-forward day', () => {
    const { from, to } = dayBoundsInTimezone('2026-03-29', LONDON)

    // This is precisely why logged-minutes queries take instants from here
    // rather than assuming every day is 1440 minutes wide.
    expect(to.getTime() - from.getTime()).toBe(23 * 60 * 60 * 1000)
  })

  it('is 25 hours long on a fall-back day', () => {
    const { from, to } = dayBoundsInTimezone('2026-10-25', LONDON)
    expect(to.getTime() - from.getTime()).toBe(25 * 60 * 60 * 1000)
  })
})

describe('timezone validation', () => {
  it('accepts real IANA identifiers', () => {
    expect(isValidTimezone(COLOMBO)).toBe(true)
    expect(isValidTimezone('UTC')).toBe(true)
  })

  it('rejects made-up ones', () => {
    expect(isValidTimezone('Mars/Olympus_Mons')).toBe(false)
    expect(isValidTimezone('')).toBe(false)
  })
})

describe('toInstant validation', () => {
  it('rejects a malformed local time', () => {
    expect(() => toInstant('2026-08-14', '9:15', COLOMBO)).toThrow(/HH:mm/)
    expect(() => toInstant('2026-08-14', '25:00', COLOMBO)).toThrow(/HH:mm/)
  })
})
