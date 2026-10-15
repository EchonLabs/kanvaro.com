/**
 * Holiday CSV import (spec CAL-10).
 *
 * The all-or-nothing rule is the point of these tests: a partial import leaves a
 * calendar that looks loaded but silently misses dates, and a missing public
 * holiday produces a stand-up that should never have existed.
 */
import { describeImportFailure, parseHolidayCsv } from '../holiday-import'

const HEADER = 'name,date,type,isFullDay,hoursIfPartial'

const csv = (...rows: string[]) => [HEADER, ...rows].join('\n')

describe('valid files', () => {
  it('parses a full-day public holiday', () => {
    const result = parseHolidayCsv(csv('Nikini Full Moon Poya Day,2026-08-27,public,true,'))

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0]).toMatchObject({
      name: 'Nikini Full Moon Poya Day',
      date: '2026-08-27',
      type: 'public',
      isFullDay: true
    })
  })

  it('converts hoursIfPartial to whole minutes at the boundary', () => {
    const result = parseHolidayCsv(csv('Christmas Eve,2026-12-24,company,false,3.5'))

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.rows[0].minutesIfPartial).toBe(210)
  })

  it('accepts two holidays on the same date', () => {
    // Real case: 2026-05-01 is both May Day and Vesak Poya.
    const result = parseHolidayCsv(
      csv('May Day,2026-05-01,public,true,', 'Vesak Full Moon Poya Day,2026-05-01,public,true,')
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.rows).toHaveLength(2)
  })

  it('handles a quoted name containing a comma', () => {
    const result = parseHolidayCsv(csv('"Day prior to Sinhala, Tamil New Year",2026-04-13,public,true,'))

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.rows[0].name).toBe('Day prior to Sinhala, Tamil New Year')
  })

  it('handles an escaped quote inside a name', () => {
    const result = parseHolidayCsv(csv('"Prophet""s Birthday",2026-08-26,public,true,'))

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.rows[0].name).toBe('Prophet"s Birthday')
  })

  it('defaults an empty isFullDay to a full day', () => {
    const result = parseHolidayCsv(csv('May Day,2026-05-01,public,,'))

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.rows[0].isFullDay).toBe(true)
  })

  it('tolerates CRLF line endings and a BOM from spreadsheet exports', () => {
    const result = parseHolidayCsv(`﻿${HEADER}\r\nMay Day,2026-05-01,public,true,\r\n`)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.rows).toHaveLength(1)
  })

  it('skips blank lines between rows', () => {
    const result = parseHolidayCsv(
      csv('May Day,2026-05-01,public,true,', '', 'Christmas Day,2026-12-25,public,true,')
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.rows).toHaveLength(2)
  })

  it('parses the real Sri Lanka 2026 shape', () => {
    const result = parseHolidayCsv(
      csv(
        'Duruthu Full Moon Poya Day,2026-01-03,public,true,',
        'Tamil Thai Pongal Day,2026-01-15,public,true,',
        'Adhi Poson Full Moon Poya Day,2026-05-30,public,true,',
        'Deepavali Festival Day,2026-11-08,public,true,'
      )
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.rows).toHaveLength(4)
  })
})

describe('CAL-10 — the whole file is rejected if any row fails', () => {
  it('imports nothing when a single row is invalid', () => {
    const result = parseHolidayCsv(
      csv(
        'Good row,2026-05-01,public,true,',
        'Bad row,not-a-date,public,true,',
        'Another good row,2026-12-25,public,true,'
      )
    )

    expect(result.ok).toBe(false)
    if (result.ok) return
    // The two valid rows are discarded along with the invalid one.
    expect(result.errors).toHaveLength(1)
  })

  it('reports the failing row number as the user sees it in a spreadsheet', () => {
    const result = parseHolidayCsv(
      csv('Good row,2026-05-01,public,true,', 'Bad row,not-a-date,public,true,')
    )

    expect(result.ok).toBe(false)
    if (result.ok) return
    // Header is row 1, so the bad row is row 3.
    expect(result.errors[0].row).toBe(3)
  })

  it('reports every failing row at once, not just the first', () => {
    const result = parseHolidayCsv(
      csv('Bad one,nope,public,true,', 'Fine,2026-05-01,public,true,', 'Bad two,,public,true,')
    )

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors.map((error) => error.row)).toEqual([2, 4])
  })
})

describe('row validation', () => {
  const expectRejected = (row: string, pattern: RegExp) => {
    const result = parseHolidayCsv(csv(row))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors[0].reason).toMatch(pattern)
  }

  it('requires a name', () => {
    expectRejected(',2026-05-01,public,true,', /name is required/)
  })

  it('requires a date', () => {
    expectRejected('May Day,,public,true,', /date is required/)
  })

  it('rejects a malformed date', () => {
    expectRejected('May Day,01/05/2026,public,true,', /not a valid ISO date/)
  })

  it('rejects a date that looks valid but cannot exist', () => {
    expectRejected('Impossible,2026-02-31,public,true,', /not a valid ISO date/)
  })

  it('rejects an unknown type', () => {
    expectRejected('May Day,2026-05-01,bank,true,', /must be one of/)
  })

  it('rejects a non-boolean isFullDay', () => {
    expectRejected('May Day,2026-05-01,public,maybe,', /must be true or false/)
  })

  it('requires hoursIfPartial when the day is partial', () => {
    expectRejected('Half day,2026-05-01,company,false,', /hoursIfPartial is required/)
  })

  it('rejects a non-positive hoursIfPartial', () => {
    expectRejected('Half day,2026-05-01,company,false,0', /must be a positive number/)
    expectRejected('Half day,2026-05-01,company,false,abc', /must be a positive number/)
  })

  it('rejects an exact duplicate of name and date', () => {
    const result = parseHolidayCsv(
      csv('May Day,2026-05-01,public,true,', 'May Day,2026-05-01,public,true,')
    )

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors[0].reason).toMatch(/duplicate/)
  })

  it('lists several problems in one row together', () => {
    const result = parseHolidayCsv(csv(',bad-date,wrong,maybe,'))

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors[0].reason).toMatch(/name is required/)
    expect(result.errors[0].reason).toMatch(/not a valid ISO date/)
  })
})

describe('file-level validation', () => {
  it('rejects an empty file', () => {
    expect(parseHolidayCsv('').ok).toBe(false)
  })

  it('rejects a wrong header', () => {
    const result = parseHolidayCsv('date,name,type\n2026-05-01,May Day,public')

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors[0].reason).toMatch(/header row must be exactly/)
  })

  it('rejects a header-only file', () => {
    const result = parseHolidayCsv(HEADER)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors[0].reason).toMatch(/no holiday rows/)
  })
})

describe('describeImportFailure', () => {
  it('names every failing row so the user can go fix them', () => {
    const message = describeImportFailure([
      { row: 3, reason: 'bad date' },
      { row: 7, reason: 'bad type' }
    ])

    expect(message).toMatch(/Nothing was imported/)
    expect(message).toMatch(/rows 3, 7/)
  })

  it('uses the singular for one row', () => {
    const message = describeImportFailure([{ row: 3, reason: 'bad date' }])
    expect(message).toMatch(/1 row failed/)
    expect(message).toMatch(/row 3/)
  })
})
