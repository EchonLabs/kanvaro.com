/**
 * The organisation-scoped `WorkingCalendar` is created implicitly, by whichever
 * holiday action first needs somewhere to record the organisation's default
 * calendar — there is no org-calendar editor in the UI, so whatever that
 * implicit insert writes is what every unconfigured project inherits forever.
 *
 * That makes the *insert* the thing worth testing: a calendar born with the
 * schema's `timezone` default would silently move an organisation from its own
 * zone to UTC the first time an admin pressed "Refresh from API".
 */
import { HolidaySet } from '@/models/HolidaySet'
import { Organization } from '@/models/Organization'
import { WorkingCalendar } from '@/models/WorkingCalendar'
import { setOrganizationHolidaySubscription } from '@/lib/standup/organization-calendar'

import { anyId, ids, syncIndexes, useMongo } from './helpers/mongo'

async function seedOrganization(timezone?: string) {
  await Organization.create({
    _id: ids.organization,
    name: 'Kanvaro',
    ...(timezone ? { timezone } : {})
  })
}

async function seedHolidaySet() {
  const set = await HolidaySet.create({
    organization: ids.organization,
    name: 'Sri Lanka Public Holidays (API)',
    createdBy: ids.user
  })
  return set._id.toString()
}

describe('setOrganizationHolidaySubscription', () => {
  useMongo()

  beforeEach(async () => {
    await syncIndexes(HolidaySet, Organization, WorkingCalendar)
  })

  it("seeds a brand-new organisation calendar with the organisation's own timezone", async () => {
    await seedOrganization('Asia/Colombo')
    const setId = await seedHolidaySet()

    await setOrganizationHolidaySubscription(ids.organization.toString(), setId)

    const calendar = await WorkingCalendar.findOne({
      organization: ids.organization,
      scope: 'organization'
    }).lean<any>()

    expect(calendar.timezone).toBe('Asia/Colombo')
    expect(calendar.subscribedHolidaySets.map((id: any) => id.toString())).toEqual([setId])
  })

  it('falls back to UTC when the organisation has no timezone of its own', async () => {
    const setId = await seedHolidaySet()

    await setOrganizationHolidaySubscription(ids.organization.toString(), setId)

    const calendar = await WorkingCalendar.findOne({
      organization: ids.organization,
      scope: 'organization'
    }).lean<any>()

    expect(calendar.timezone).toBe('UTC')
  })

  it('replaces the subscription on an existing calendar without touching its timezone', async () => {
    await seedOrganization('Asia/Colombo')
    const setId = await seedHolidaySet()

    // A calendar that already exists is the organisation's configured one.
    // Switching the default holiday calendar must not re-seed anything else.
    await WorkingCalendar.create({
      organization: ids.organization,
      scope: 'organization',
      timezone: 'Europe/London',
      workingDaysOfWeek: [0, 1, 2, 3, 4],
      standardMinutesPerDay: 420,
      subscribedHolidaySets: [anyId()]
    })

    await setOrganizationHolidaySubscription(ids.organization.toString(), setId)

    const calendar = await WorkingCalendar.findOne({
      organization: ids.organization,
      scope: 'organization'
    }).lean<any>()

    expect(calendar.timezone).toBe('Europe/London')
    expect(calendar.workingDaysOfWeek).toEqual([0, 1, 2, 3, 4])
    expect(calendar.standardMinutesPerDay).toBe(420)
    expect(calendar.subscribedHolidaySets.map((id: any) => id.toString())).toEqual([setId])
  })

  it('creates exactly one organisation calendar when called repeatedly', async () => {
    await seedOrganization('Asia/Colombo')
    const setId = await seedHolidaySet()

    await setOrganizationHolidaySubscription(ids.organization.toString(), setId)
    await setOrganizationHolidaySubscription(ids.organization.toString(), setId)

    const count = await WorkingCalendar.countDocuments({
      organization: ids.organization,
      scope: 'organization'
    })
    expect(count).toBe(1)
  })
})
