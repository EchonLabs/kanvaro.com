/**
 * Sprint day numbering and stand-up shape (spec SCH-3, RUN-1, §5.2, CAL-14).
 *
 * Pure by design: numbering is derived from the working-day set on every
 * reconcile, so a wrong rule here corrupts every schedule the moment a holiday
 * moves. Nothing in this file touches a database.
 */
import { numberSprintDays, shapeFor } from '../day-numbering'

describe('shapeFor', () => {
  const cases: Array<[number, number, string]> = [
    // index (0-based), total, expected shape
    [0, 1, 'day_one'], // a one-day sprint is day one: the pool still has to be worked
    [0, 2, 'day_one'],
    [1, 2, 'final_day'],
    [0, 9, 'day_one'],
    [1, 9, 'mid_sprint'],
    [7, 9, 'mid_sprint'],
    [8, 9, 'final_day']
  ]

  it.each(cases)('index %i of %i is %s', (index, total, expected) => {
    expect(shapeFor(index, total)).toBe(expected)
  })
})

describe('numberSprintDays', () => {
  it('returns nothing for a sprint with no working days (SCH-5)', () => {
    expect(numberSprintDays([])).toEqual([])
  })

  it('numbers a single working day as day one of one', () => {
    expect(numberSprintDays(['2026-08-10'])).toEqual([
      { date: '2026-08-10', sprintDayNumber: 1, totalSprintDays: 1, shape: 'day_one' }
    ])
  })

  it('numbers the AC-1 sprint: 9 working days across a holiday and two weekends', () => {
    // 10–21 Aug 2026, Mon–Fri, with 12 Aug a public holiday.
    const workingDates = [
      '2026-08-10',
      '2026-08-11',
      '2026-08-13',
      '2026-08-14',
      '2026-08-17',
      '2026-08-18',
      '2026-08-19',
      '2026-08-20',
      '2026-08-21'
    ]

    const numbered = numberSprintDays(workingDates)

    expect(numbered).toHaveLength(9)
    expect(numbered.every((day) => day.totalSprintDays === 9)).toBe(true)
    expect(numbered[0]).toEqual({
      date: '2026-08-10',
      sprintDayNumber: 1,
      totalSprintDays: 9,
      shape: 'day_one'
    })
    expect(numbered[8]).toEqual({
      date: '2026-08-21',
      sprintDayNumber: 9,
      totalSprintDays: 9,
      shape: 'final_day'
    })
  })

  it('counts working days only, so a gap does not consume a number', () => {
    // 12 Aug is missing: 13 Aug must be day 3, not day 4.
    const numbered = numberSprintDays(['2026-08-10', '2026-08-11', '2026-08-13'])

    expect(numbered.map((day) => day.sprintDayNumber)).toEqual([1, 2, 3])
    expect(numbered[2].shape).toBe('final_day')
  })

  it('sorts input defensively — the caller must not have to', () => {
    const numbered = numberSprintDays(['2026-08-13', '2026-08-10', '2026-08-11'])

    expect(numbered.map((day) => day.date)).toEqual([
      '2026-08-10',
      '2026-08-11',
      '2026-08-13'
    ])
    expect(numbered[0].shape).toBe('day_one')
  })

  it('rejects a duplicate date rather than numbering it twice', () => {
    expect(() => numberSprintDays(['2026-08-10', '2026-08-10'])).toThrow(/duplicate/i)
  })

  it('rejects a malformed date', () => {
    expect(() => numberSprintDays(['10/08/2026'])).toThrow()
  })
})
