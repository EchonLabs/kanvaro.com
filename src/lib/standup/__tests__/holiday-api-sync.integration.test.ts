import { Holiday } from '@/models/Holiday'
import { HolidaySet } from '@/models/HolidaySet'
import { WorkingCalendar } from '@/models/WorkingCalendar'
import { revokeHoliday } from '@/lib/standup/holiday-admin'
import { syncHolidaysFromApi } from '@/lib/standup/holiday-api-sync'

import { ids, syncIndexes, useMongo } from './helpers/mongo'

function mockApiResponse(byYear: Record<number, Array<Record<string, unknown>>>) {
  return jest.spyOn(global, 'fetch').mockImplementation(async (input: any) => {
    const url = new URL(String(input))
    const year = Number(url.searchParams.get('year'))
    return {
      ok: true,
      json: async () => ({
        ok: true,
        data: { year, holidays: byYear[year] ?? [] }
      })
    } as Response
  })
}

const REASON = 'Gazette corrected: this date was withdrawn by the ministry.'

describe('syncHolidaysFromApi', () => {
  useMongo()

  beforeEach(async () => {
    await syncIndexes(Holiday, HolidaySet, WorkingCalendar)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('creates its own set, maps public/non-public rows, and defaults the org calendar to it', async () => {
    mockApiResponse({
      2026: [
        { date: '2026-01-03', name: 'Duruthu Full Moon Poya Day', public: true, bank: true, mercantile: true },
        { date: '2026-02-04', name: 'Independence Day', public: false, bank: true, mercantile: false }
      ],
      2027: []
    })

    const summary = await syncHolidaysFromApi({
      organizationId: ids.organization.toString(),
      userId: ids.user.toString(),
      years: [2026, 2027]
    })

    expect(summary.fetched).toBe(2)
    expect(summary.inserted).toBe(2)
    expect(summary.updated).toBe(0)
    expect(summary.skippedRevoked).toBe(0)

    const set = await HolidaySet.findById(summary.setId).lean<any>()
    expect(set.name).toBe('Sri Lanka Public Holidays (API)')
    expect(set.source).toBe('api')
    expect(set.apiProvider).toBe('induwara')

    const rows = await Holiday.find({ holidaySet: summary.setId }).sort({ date: 1 }).lean<any[]>()
    expect(rows.map((r) => [r.name, r.type])).toEqual([
      ['Duruthu Full Moon Poya Day', 'public'],
      ['Independence Day', 'optional']
    ])

    const orgCalendar = await WorkingCalendar.findOne({
      organization: ids.organization,
      scope: 'organization'
    }).lean<any>()
    expect(orgCalendar.subscribedHolidaySets.map((id: any) => id.toString())).toEqual([
      summary.setId
    ])
  })

  it('is idempotent: re-running with the same data does not duplicate rows', async () => {
    mockApiResponse({
      2026: [{ date: '2026-01-03', name: 'Duruthu Full Moon Poya Day', public: true }],
      2027: []
    })

    const first = await syncHolidaysFromApi({
      organizationId: ids.organization.toString(),
      userId: ids.user.toString(),
      years: [2026, 2027]
    })

    const second = await syncHolidaysFromApi({
      organizationId: ids.organization.toString(),
      userId: ids.user.toString(),
      years: [2026, 2027]
    })

    expect(second.inserted).toBe(0)
    expect(second.setId).toBe(first.setId)

    const count = await Holiday.countDocuments({ holidaySet: first.setId })
    expect(count).toBe(1)
  })

  it('never resurrects a holiday an admin withdrew', async () => {
    mockApiResponse({
      2026: [{ date: '2026-01-03', name: 'Duruthu Full Moon Poya Day', public: true }],
      2027: []
    })

    const first = await syncHolidaysFromApi({
      organizationId: ids.organization.toString(),
      userId: ids.user.toString(),
      years: [2026, 2027]
    })

    const holiday = await Holiday.findOne({ holidaySet: first.setId }).lean<any>()

    await revokeHoliday({
      holidayId: holiday._id.toString(),
      organizationId: ids.organization.toString(),
      actorId: ids.user.toString(),
      reason: REASON
    })

    const second = await syncHolidaysFromApi({
      organizationId: ids.organization.toString(),
      userId: ids.user.toString(),
      years: [2026, 2027]
    })

    expect(second.skippedRevoked).toBe(1)
    expect(second.updated).toBe(0)
    expect(second.inserted).toBe(0)

    const after = await Holiday.findById(holiday._id).lean<any>()
    expect(after.status).toBe('revoked')
  })

  it('does not re-default the org calendar once an admin has chosen anything', async () => {
    mockApiResponse({
      2026: [{ date: '2026-01-03', name: 'Duruthu Full Moon Poya Day', public: true }],
      2027: []
    })

    const first = await syncHolidaysFromApi({
      organizationId: ids.organization.toString(),
      userId: ids.user.toString(),
      years: [2026, 2027]
    })

    // The admin explicitly switches the org calendar to something else —
    // including "nothing", modelled here as a different set entirely.
    const otherSet = await HolidaySet.create({
      organization: ids.organization,
      name: 'UK Bank Holidays',
      createdBy: ids.user
    })
    await WorkingCalendar.updateOne(
      { organization: ids.organization, scope: 'organization' },
      { $set: { subscribedHolidaySets: [otherSet._id] } }
    )

    mockApiResponse({
      2026: [
        { date: '2026-01-03', name: 'Duruthu Full Moon Poya Day', public: true },
        { date: '2026-02-04', name: 'Independence Day', public: true }
      ],
      2027: []
    })

    await syncHolidaysFromApi({
      organizationId: ids.organization.toString(),
      userId: ids.user.toString(),
      years: [2026, 2027]
    })

    const orgCalendar = await WorkingCalendar.findOne({
      organization: ids.organization,
      scope: 'organization'
    }).lean<any>()
    expect(orgCalendar.subscribedHolidaySets.map((id: any) => id.toString())).toEqual([
      otherSet._id.toString()
    ])
    expect(orgCalendar.subscribedHolidaySets.map((id: any) => id.toString())).not.toContain(
      first.setId
    )
  })

  it('never touches a pre-existing manually-managed set of a similar name', async () => {
    // Regression: HolidaySet has a unique {organization, name} index. Before
    // this module used a distinct name for its own set, it either collided
    // with an org's hand-seeded "Sri Lanka Public Holidays" calendar (a raw
    // duplicate-key error surfaced to the admin as a generic "something went
    // wrong"), or — in an earlier revision — silently mutated that seeded
    // document in place. Neither is acceptable: the seeded calendar must be
    // left exactly as the admin curated it, and remain a separate, selectable
    // option alongside the new API-backed one.
    const manualSet = await HolidaySet.create({
      organization: ids.organization,
      name: 'Sri Lanka Public Holidays',
      createdBy: ids.user
    })

    await Holiday.create({
      holidaySet: manualSet._id,
      organization: ids.organization,
      name: 'Existing Manual Holiday',
      date: '2025-12-25',
      type: 'public',
      isFullDay: true,
      createdBy: ids.user
    })

    mockApiResponse({
      2026: [{ date: '2026-01-03', name: 'Duruthu Full Moon Poya Day', public: true }],
      2027: []
    })

    const summary = await syncHolidaysFromApi({
      organizationId: ids.organization.toString(),
      userId: ids.user.toString(),
      years: [2026, 2027]
    })

    expect(summary.setId).not.toBe(manualSet._id.toString())
    expect(await HolidaySet.countDocuments({ organization: ids.organization })).toBe(2)

    const untouchedManualSet = await HolidaySet.findById(manualSet._id).lean<any>()
    expect(untouchedManualSet.source).toBe('manual')
    expect(untouchedManualSet.name).toBe('Sri Lanka Public Holidays')

    const preexisting = await Holiday.findOne({
      holidaySet: manualSet._id,
      name: 'Existing Manual Holiday'
    }).lean<any>()
    expect(preexisting).not.toBeNull()

    const apiSet = await HolidaySet.findById(summary.setId).lean<any>()
    expect(apiSet.name).toBe('Sri Lanka Public Holidays (API)')
  })

  it('does not crash on a legacy seeded set inserted without createdBy', async () => {
    // Regression: `scripts/seed-holidays.js` inserts holiday sets with the raw
    // MongoDB driver, bypassing Mongoose validation entirely, so a
    // production org can have a "Sri Lanka Public Holidays" document with no
    // `createdBy` at all — a field the schema marks required. An earlier
    // revision of this module loaded that exact document and called
    // `.save()` on it, which re-validates every path and threw "Path
    // `createdBy` is required.", surfaced to the admin as a generic
    // "something went wrong". This module must never load or write that
    // document at all.
    await HolidaySet.collection.insertOne({
      organization: ids.organization,
      name: 'Sri Lanka Public Holidays',
      countryCode: 'LK',
      description: 'Seeded from scripts/seed-data/holidays',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
      // deliberately no createdBy, no source — exactly what the raw seed script writes
    })

    mockApiResponse({
      2026: [{ date: '2026-01-03', name: 'Duruthu Full Moon Poya Day', public: true }],
      2027: []
    })

    await expect(
      syncHolidaysFromApi({
        organizationId: ids.organization.toString(),
        userId: ids.user.toString(),
        years: [2026, 2027]
      })
    ).resolves.toMatchObject({ inserted: 1 })
  })

  it('reuses the same API set on refresh even if it was renamed', async () => {
    mockApiResponse({ 2026: [], 2027: [] })

    const first = await syncHolidaysFromApi({
      organizationId: ids.organization.toString(),
      userId: ids.user.toString(),
      years: [2026, 2027]
    })

    await HolidaySet.updateOne({ _id: first.setId }, { $set: { name: 'Renamed Calendar' } })

    const second = await syncHolidaysFromApi({
      organizationId: ids.organization.toString(),
      userId: ids.user.toString(),
      years: [2026, 2027]
    })

    expect(second.setId).toBe(first.setId)
    expect(await HolidaySet.countDocuments({ organization: ids.organization, source: 'api' })).toBe(1)
  })

  it('throws only when every requested year fails', async () => {
    jest.spyOn(global, 'fetch').mockImplementation(async () => {
      return { ok: false, status: 503, json: async () => ({}) } as Response
    })

    await expect(
      syncHolidaysFromApi({
        organizationId: ids.organization.toString(),
        userId: ids.user.toString(),
        years: [2026, 2027]
      })
    ).rejects.toThrow(/holiday api/i)
  })
})
