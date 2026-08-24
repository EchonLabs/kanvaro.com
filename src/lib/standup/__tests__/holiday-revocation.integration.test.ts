import { Holiday } from '@/models/Holiday'
import { HolidaySet } from '@/models/HolidaySet'
import { WorkingCalendar } from '@/models/WorkingCalendar'
import {
  createHoliday,
  updateHoliday,
  revokeHoliday,
  HolidayRevocationBlockedError
} from '@/lib/standup/holiday-admin'
import { loadCalendarContext, getHolidayCoverage } from '@/lib/standup/calendar-service'

import { anyId, ids, syncIndexes, useMongo } from './helpers/mongo'

describe('holiday revocation (DO-3)', () => {
  useMongo()

  let setId: string

  beforeEach(async () => {
    await syncIndexes(Holiday, HolidaySet, WorkingCalendar)

    const set = await HolidaySet.create({
      organization: ids.organization,
      name: 'Sri Lanka Public Holidays',
      countryCode: 'LK',
      createdBy: ids.user
    })
    setId = set._id.toString()

    await WorkingCalendar.create({
      scope: 'project',
      organization: ids.organization,
      project: ids.project,
      workingDaysOfWeek: [1, 2, 3, 4, 5],
      standardMinutesPerDay: 480,
      timezone: 'Asia/Colombo',
      subscribedHolidaySets: [set._id]
    })
  })

  const addHoliday = (date: string, name = 'Vesak Poya') =>
    Holiday.create({
      holidaySet: setId,
      organization: ids.organization,
      name,
      date,
      type: 'public',
      isFullDay: true,
      createdBy: ids.user
    })

  const REASON = 'Gazette corrected: this date was withdrawn by the ministry.'

  it('marks the holiday revoked instead of deleting it', async () => {
    const holiday = await addHoliday('2028-05-08')

    await revokeHoliday({
      holidayId: holiday._id.toString(),
      organizationId: ids.organization.toString(),
      actorId: ids.user.toString(),
      reason: REASON
    })

    const after = await Holiday.findById(holiday._id).lean<any>()
    // The row must survive: historical stand-ups resolve their calendar as of
    // their own date, so a deleted holiday would rewrite the past (DAT-1).
    expect(after).not.toBeNull()
    expect(after.status).toBe('revoked')
    expect(after.revokeReason).toBe(REASON)
    expect(after.revokedBy.toString()).toBe(ids.user.toString())
    expect(after.revokedAt).toBeInstanceOf(Date)
  })

  it('stops a revoked holiday from removing a working day', async () => {
    const holiday = await addHoliday('2028-05-08')

    const before = await loadCalendarContext(ids.project.toString(), '2028-05-08', '2028-05-08')
    expect(before.holidaysByDate.get('2028-05-08')).toHaveLength(1)

    await revokeHoliday({
      holidayId: holiday._id.toString(),
      organizationId: ids.organization.toString(),
      actorId: ids.user.toString(),
      reason: REASON
    })

    const after = await loadCalendarContext(ids.project.toString(), '2028-05-08', '2028-05-08')
    expect(after.holidaysByDate.get('2028-05-08') ?? []).toHaveLength(0)
  })

  it('excludes revoked rows from coverage, so a gap is reported honestly', async () => {
    await addHoliday('2028-01-01', 'New Year')
    const last = await addHoliday('2028-12-31', 'Special Closure')

    expect((await getHolidayCoverage([setId]))?.to).toBe('2028-12-31')

    await revokeHoliday({
      holidayId: last._id.toString(),
      organizationId: ids.organization.toString(),
      actorId: ids.user.toString(),
      reason: REASON
    })

    // Coverage must shrink back, otherwise the calendar claims to cover dates
    // that no longer have any data behind them.
    expect((await getHolidayCoverage([setId]))?.to).toBe('2028-01-01')
  })

  it('requires a substantive reason', async () => {
    const holiday = await addHoliday('2028-05-08')

    await expect(
      revokeHoliday({
        holidayId: holiday._id.toString(),
        organizationId: ids.organization.toString(),
        actorId: ids.user.toString(),
        reason: 'wrong'
      })
    ).rejects.toThrow(/at least 20 characters/i)
  })

  it('refuses to revoke a date a completed stand-up already resolved', async () => {
    const holiday = await addHoliday('2028-05-08')

    await expect(
      revokeHoliday({
        holidayId: holiday._id.toString(),
        organizationId: ids.organization.toString(),
        actorId: ids.user.toString(),
        reason: REASON,
        // Phase 5 supplies the real query; the rule is enforced here and now.
        findBlockingStandups: async () => [
          { standupId: anyId().toString(), date: '2028-05-08', status: 'Completed' }
        ]
      })
    ).rejects.toThrow(HolidayRevocationBlockedError)

    expect((await Holiday.findById(holiday._id).lean<any>()).status).toBe('active')
  })

  it('refuses to revoke a holiday belonging to another organisation', async () => {
    const holiday = await addHoliday('2028-05-08')

    await expect(
      revokeHoliday({
        holidayId: holiday._id.toString(),
        organizationId: anyId().toString(),
        actorId: ids.user.toString(),
        reason: REASON
      })
    ).rejects.toThrow(/not found/i)
  })
})

describe('holiday create and update (DO-1)', () => {
  useMongo()

  let setId: string

  beforeEach(async () => {
    await syncIndexes(Holiday, HolidaySet)
    const set = await HolidaySet.create({
      organization: ids.organization,
      name: 'Sri Lanka Public Holidays',
      createdBy: ids.user
    })
    setId = set._id.toString()
  })

  const base = {
    holidaySetId: () => setId,
    organizationId: ids.organization.toString(),
    actorId: ids.user.toString()
  }

  it('adds a holiday by hand, which is the only path HR has without shell access', async () => {
    const created = await createHoliday({
      holidaySetId: setId,
      organizationId: base.organizationId,
      actorId: base.actorId,
      name: 'Thai Pongal',
      date: '2028-01-15',
      type: 'public',
      isFullDay: true
    })

    expect(created.date).toBe('2028-01-15')
    expect(created.status).toBe('active')
  })

  it('rejects a malformed date rather than storing something unresolvable', async () => {
    await expect(
      createHoliday({
        holidaySetId: setId,
        organizationId: base.organizationId,
        actorId: base.actorId,
        name: 'Bad',
        date: '15-01-2028',
        type: 'public',
        isFullDay: true
      })
    ).rejects.toThrow(/YYYY-MM-DD/i)
  })

  it('rejects a duplicate of the same name on the same date', async () => {
    const args = {
      holidaySetId: setId,
      organizationId: base.organizationId,
      actorId: base.actorId,
      name: 'Vesak Poya',
      date: '2028-05-08',
      type: 'public' as const,
      isFullDay: true
    }
    await createHoliday(args)

    await expect(createHoliday(args)).rejects.toThrow(/already/i)
  })

  it('allows two different holidays on the same date', async () => {
    // 1 May 2026 is both May Day and Vesak Poya — a real case, not a hypothetical.
    await createHoliday({ ...base, holidaySetId: setId, name: 'May Day', date: '2028-05-01', type: 'public', isFullDay: true })

    await expect(
      createHoliday({ ...base, holidaySetId: setId, name: 'Vesak Poya', date: '2028-05-01', type: 'public', isFullDay: true })
    ).resolves.toBeDefined()
  })

  it('runs the completed-stand-up guard when a date is changed', async () => {
    const holiday = await createHoliday({
      ...base,
      holidaySetId: setId,
      name: 'Vesak Poya',
      date: '2028-05-08',
      type: 'public',
      isFullDay: true
    })

    await expect(
      updateHoliday({
        holidayId: holiday.id,
        organizationId: base.organizationId,
        actorId: base.actorId,
        changes: { date: '2028-05-09' },
        findBlockingStandups: async () => [
          { standupId: 'x', date: '2028-05-08', status: 'Completed' }
        ]
      })
    ).rejects.toThrow(HolidayRevocationBlockedError)
  })

  it('does not run the guard for a rename, which changes no working day', async () => {
    const holiday = await createHoliday({
      ...base,
      holidaySetId: setId,
      name: 'Vesak',
      date: '2028-05-08',
      type: 'public',
      isFullDay: true
    })

    const guard = jest.fn()
    const updated = await updateHoliday({
      holidayId: holiday.id,
      organizationId: base.organizationId,
      actorId: base.actorId,
      changes: { name: 'Vesak Poya' },
      findBlockingStandups: guard as never
    })

    expect(updated.name).toBe('Vesak Poya')
    expect(guard).not.toHaveBeenCalled()
  })
})
