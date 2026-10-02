import { Holiday } from '@/models/Holiday'
import { HolidaySet } from '@/models/HolidaySet'
import { Organization } from '@/models/Organization'
import { WorkingCalendar } from '@/models/WorkingCalendar'
import { revokeHoliday } from '@/lib/standup/holiday-admin'
import { syncHolidaysFromApi } from '@/lib/standup/holiday-api-sync'

import { anyId, ids, syncIndexes, useMongo } from './helpers/mongo'

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
    await syncIndexes(Holiday, HolidaySet, Organization, WorkingCalendar)
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

  it('reports only genuinely changed rows as updated', async () => {
    // Regression: `updated` came from bulkWrite's modifiedCount, and Mongoose's
    // `timestamps` injects updatedAt into every $set — so modifiedCount could
    // never be 0 and the refresh toast claimed every row had changed, every
    // time. The number is there to tell an admin a gazette correction landed.
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

    // Nothing changed upstream.
    const unchanged = await syncHolidaysFromApi({
      organizationId: ids.organization.toString(),
      userId: ids.user.toString(),
      years: [2026, 2027]
    })
    expect(unchanged.inserted).toBe(0)
    expect(unchanged.updated).toBe(0)

    // One row is reclassified upstream; only that one counts as updated.
    mockApiResponse({
      2026: [
        { date: '2026-01-03', name: 'Duruthu Full Moon Poya Day', public: true },
        { date: '2026-02-04', name: 'Independence Day', public: false }
      ],
      2027: []
    })

    const changed = await syncHolidaysFromApi({
      organizationId: ids.organization.toString(),
      userId: ids.user.toString(),
      years: [2026, 2027]
    })
    expect(changed.inserted).toBe(0)
    expect(changed.updated).toBe(1)

    const row = await Holiday.findOne({ date: '2026-02-04' }).lean<any>()
    expect(row.type).toBe('optional')
  })

  it('keeps the original importer on a row a later refresh touches', async () => {
    // createdBy was in the $set, so every refresh reattributed every holiday
    // to whoever pressed the button last.
    mockApiResponse({
      2026: [{ date: '2026-01-03', name: 'Duruthu Full Moon Poya Day', public: true }],
      2027: []
    })

    await syncHolidaysFromApi({
      organizationId: ids.organization.toString(),
      userId: ids.user.toString(),
      years: [2026, 2027]
    })

    const laterAdmin = anyId()
    mockApiResponse({
      2026: [{ date: '2026-01-03', name: 'Duruthu Full Moon Poya Day', public: false }],
      2027: []
    })

    await syncHolidaysFromApi({
      organizationId: ids.organization.toString(),
      userId: laterAdmin.toString(),
      years: [2026, 2027]
    })

    const row = await Holiday.findOne({ date: '2026-01-03' }).lean<any>()
    expect(row.createdBy.toString()).toBe(ids.user.toString())
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

  it("creates the org calendar in the organisation's own timezone, not UTC", async () => {
    // Regression: the org-scoped WorkingCalendar is created here, implicitly,
    // and nothing in the UI can edit it afterwards. Letting it take the
    // schema's `timezone` default moved every unconfigured project from the
    // organisation's zone to UTC the first time an admin pressed refresh.
    await Organization.create({ _id: ids.organization, name: 'Kanvaro', timezone: 'Asia/Colombo' })

    mockApiResponse({
      2026: [{ date: '2026-01-03', name: 'Duruthu Full Moon Poya Day', public: true }],
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

    expect(orgCalendar.timezone).toBe('Asia/Colombo')
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

  it('bounds every request so a hung API cannot hold the refresh open', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(
      async () =>
        ({
          ok: true,
          json: async () => ({ ok: true, data: { year: 2026, holidays: [] } })
        }) as Response
    )

    await syncHolidaysFromApi({
      organizationId: ids.organization.toString(),
      userId: ids.user.toString(),
      years: [2026]
    })

    const init = fetchSpy.mock.calls[0][1] as RequestInit
    expect(init.signal).toBeInstanceOf(AbortSignal)
  })

  it('reports a timed-out API as an unreachable one, naming the year', async () => {
    jest.spyOn(global, 'fetch').mockImplementation(async () => {
      // What AbortSignal.timeout rejects a fetch with once it fires.
      throw Object.assign(new Error('The operation was aborted due to timeout'), {
        name: 'TimeoutError'
      })
    })

    await expect(
      syncHolidaysFromApi({
        organizationId: ids.organization.toString(),
        userId: ids.user.toString(),
        years: [2026]
      })
    ).rejects.toThrow(/did not respond within .* for year 2026/)
  })

  it('recovers when a concurrent refresh created the API set first', async () => {
    // Two admins pressing the button together: both find-or-creates look,
    // both miss, both insert, and the unique partial index on
    // {organization, source, apiProvider} rejects the loser — which used to
    // surface as a bare 500 rather than simply reusing the set that won.
    mockApiResponse({
      2026: [{ date: '2026-01-03', name: 'Duruthu Full Moon Poya Day', public: true }],
      2027: []
    })

    const winner = await HolidaySet.create({
      organization: ids.organization,
      name: 'Sri Lanka Public Holidays (API)',
      createdBy: ids.user,
      source: 'api',
      apiProvider: 'induwara'
    })

    // Our request looked before the winner's insert landed.
    jest.spyOn(HolidaySet, 'findOne').mockImplementationOnce((() =>
      Promise.resolve(null)) as any)

    const summary = await syncHolidaysFromApi({
      organizationId: ids.organization.toString(),
      userId: ids.user.toString(),
      years: [2026, 2027]
    })

    expect(summary.setId).toBe(winner._id.toString())
    expect(await HolidaySet.countDocuments({ organization: ids.organization })).toBe(1)
    expect(await Holiday.countDocuments({ holidaySet: winner._id })).toBe(1)
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
