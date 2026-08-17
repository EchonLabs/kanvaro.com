/**
 * Guards the shipped Sri Lanka seed files.
 *
 * These are hand-curated from the government gazette, so the risk is a typo
 * making a public holiday silently vanish. Parsing them through the real
 * importer catches malformed rows, and the counts below catch a dropped line.
 */
import { readFileSync } from 'fs'
import { join } from 'path'

import { parseHolidayCsv } from '../holiday-import'

const seedDir = join(process.cwd(), 'scripts', 'seed-data', 'holidays')
const readSeed = (file: string) => readFileSync(join(seedDir, file), 'utf8')

/**
 * A genuine full-moon day.
 *
 * "Day following Vesak Full Moon Poya Day" ends with the same words but is the
 * day *after* the full moon, so a loose /Poya/ match over-counts by one.
 */
const isPoyaDay = (name: string) =>
  /Full Moon Poya Day$/.test(name) && !/^Day following/.test(name)

describe('Sri Lanka 2026', () => {
  const result = parseHolidayCsv(readSeed('sri-lanka-2026.csv'))

  it('parses cleanly through the real importer', () => {
    if (!result.ok) {
      throw new Error(`Seed file rejected: ${JSON.stringify(result.errors)}`)
    }
    expect(result.ok).toBe(true)
  })

  it('has 26 rows', () => {
    expect(result.ok && result.rows).toHaveLength(26)
  })

  it('contains thirteen Poya days, not twelve', () => {
    if (!result.ok) return
    const poyas = result.rows.filter((row) => isPoyaDay(row.name))

    // 2026 carries an intercalary Adhi Poson, so the usual twelve becomes
    // thirteen. Any code assuming one full moon per month is wrong.
    expect(poyas).toHaveLength(13)
    expect(poyas.map((p) => p.name)).toContain('Adhi Poson Full Moon Poya Day')
  })

  it('has two holidays on 1 May', () => {
    if (!result.ok) return
    const mayFirst = result.rows.filter((row) => row.date === '2026-05-01')

    expect(mayFirst.map((row) => row.name).sort()).toEqual([
      'May Day',
      'Vesak Full Moon Poya Day'
    ])
  })

  it('includes Nikini Poya on 27 August, the spec\'s own example holiday', () => {
    if (!result.ok) return
    const nikini = result.rows.find((row) => row.name.startsWith('Nikini'))

    expect(nikini?.date).toBe('2026-08-27')
  })

  it('is entirely public holidays', () => {
    if (!result.ok) return
    // Sri Lankan religious holidays are gazetted for the whole workforce under
    // the Holidays Act, so none of them are per-member opt-ins.
    expect(result.rows.every((row) => row.type === 'public')).toBe(true)
  })

  it('is sorted by date', () => {
    if (!result.ok) return
    const dates = result.rows.map((row) => row.date)
    expect([...dates].sort()).toEqual(dates)
  })
})

describe('Sri Lanka 2027', () => {
  const result = parseHolidayCsv(readSeed('sri-lanka-2027.csv'))

  it('parses cleanly through the real importer', () => {
    if (!result.ok) {
      throw new Error(`Seed file rejected: ${JSON.stringify(result.errors)}`)
    }
    expect(result.ok).toBe(true)
  })

  it('has 25 rows', () => {
    expect(result.ok && result.rows).toHaveLength(25)
  })

  it('contains twelve Poya days', () => {
    if (!result.ok) return
    expect(result.rows.filter((row) => isPoyaDay(row.name))).toHaveLength(12)
  })

  it('keeps Vesak and the day following it consecutive', () => {
    if (!result.ok) return
    // Sources disagree on whether Vesak 2027 is 19 or 20 May. Whichever is
    // gazetted, "Day following Vesak" must be the next day — this catches a
    // half-applied correction.
    const vesak = result.rows.find((row) => row.name === 'Vesak Full Moon Poya Day')
    const following = result.rows.find((row) => row.name.startsWith('Day following Vesak'))

    expect(vesak).toBeDefined()
    expect(following).toBeDefined()

    const dayAfterVesak = new Date(`${vesak!.date}T00:00:00Z`)
    dayAfterVesak.setUTCDate(dayAfterVesak.getUTCDate() + 1)
    expect(following!.date).toBe(dayAfterVesak.toISOString().slice(0, 10))
  })

  it('is sorted by date', () => {
    if (!result.ok) return
    const dates = result.rows.map((row) => row.date)
    expect([...dates].sort()).toEqual(dates)
  })
})
