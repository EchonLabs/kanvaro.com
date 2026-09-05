/**
 * The reconciler against a real database (spec SCH-6/7, CAL-12..16, AC-3, AC-4,
 * E3, E5, E8, E9).
 *
 * `reconcile.matrix.test.ts` proves the *decisions* for all seventy-two cells.
 * This suite proves the writes: that a skip really lands, that a completed
 * stand-up survives a calendar change with its data intact, and that exactly
 * one notification is sent no matter how many dates moved (CAL-15).
 */
import mongoose from 'mongoose'

import { Holiday } from '@/models/Holiday'
import { HolidaySet } from '@/models/HolidaySet'
import { ProjectStandupSettings } from '@/models/ProjectStandupSettings'
import { Sprint } from '@/models/Sprint'
import { Standup } from '@/models/Standup'
import { WorkingCalendar } from '@/models/WorkingCalendar'
import { notificationService } from '@/lib/notification-service'

import { generateStandupsForSprint } from '../generation'
import { assertScheduleChangeAllowed, reconcileSprintSchedule } from '../reconcile'
import { ids, syncIndexes, useMongo } from './helpers/mongo'

const { organization, project, member, otherMember, user } = ids

let holidaySetId: mongoose.Types.ObjectId

async function seedProject() {
  const set = await HolidaySet.create({
    organization,
    name: 'Sri Lanka Public Holidays',
    countryCode: 'LK',
    createdBy: user
  })
  holidaySetId = set._id as mongoose.Types.ObjectId

  await WorkingCalendar.create({
    scope: 'project',
    organization,
    project,
    workingDaysOfWeek: [1, 2, 3, 4, 5],
    standardMinutesPerDay: 480,
    timezone: 'Asia/Colombo',
    subscribedHolidaySets: [set._id],
    overrides: []
  })

  await ProjectStandupSettings.create({
    project,
    organization,
    enabled: true,
    standupLocalTime: '09:00',
    durationMinutes: 15,
    defaultFacilitator: user
  })
}

async function seedSprint(overrides: Record<string, unknown> = {}) {
  return Sprint.create({
    name: 'Sprint 14',
    organization,
    project,
    createdBy: user,
    status: 'active',
    startDate: new Date('2026-08-10T00:00:00.000Z'),
    endDate: new Date('2026-08-21T00:00:00.000Z'),
    capacity: 0,
    teamMembers: [member, otherMember],
    ...overrides
  })
}

/** Declares a holiday the way the holiday admin screen does. */
async function declareHoliday(date: string, name = 'Declared holiday') {
  await Holiday.create({
    holidaySet: holidaySetId,
    organization,
    date,
    name,
    type: 'public'
  })
}

describe('reconcileSprintSchedule', () => {
  useMongo()

  let notify: jest.SpyInstance

  beforeEach(async () => {
    await syncIndexes(Standup)
    notify = jest
      .spyOn(notificationService, 'createNotification')
      .mockResolvedValue({ _id: new mongoose.Types.ObjectId() } as never)
  })

  afterEach(() => {
    notify.mockRestore()
  })

  it('AC-3 / E3: a newly declared holiday skips its stand-up and renumbers the rest', async () => {
    await seedProject()
    const sprint = await seedSprint()
    await generateStandupsForSprint(String(sprint._id))

    await declareHoliday('2026-08-18', 'Nikini Full Moon Poya Day')

    const result = await reconcileSprintSchedule(String(sprint._id), 'date_became_non_working')

    const skipped = await Standup.findOne({ sprint: sprint._id, standupDate: '2026-08-18' })
    expect(skipped?.status).toBe('Skipped_Holiday')
    expect(skipped?.skippedReason).toMatch(/Nikini/)

    // 19 August was day 8 of 10; with the 18th gone it is day 7 of 9.
    const next = await Standup.findOne({ sprint: sprint._id, standupDate: '2026-08-19' })
    expect(next?.sprintDayNumber).toBe(7)
    expect(next?.totalSprintDays).toBe(9)

    expect(result.skipped).toBe(1)
  })

  it('AC-3 / CAL-15: exactly one consolidated notification, however many dates moved', async () => {
    await seedProject()
    const sprint = await seedSprint()
    await generateStandupsForSprint(String(sprint._id))

    await declareHoliday('2026-08-18')
    await declareHoliday('2026-08-19')
    await declareHoliday('2026-08-20')

    await reconcileSprintSchedule(String(sprint._id), 'date_became_non_working')

    // One recipient — the facilitator — and one notification, not one per date.
    expect(notify).toHaveBeenCalledTimes(1)
    expect(notify.mock.calls[0][2].data.metadata.dates).toHaveLength(3)
  })

  it('AC-3: prepared carry forward is handed to the next working day', async () => {
    await seedProject()
    const sprint = await seedSprint()
    await generateStandupsForSprint(String(sprint._id))
    await declareHoliday('2026-08-18')

    const moved: Array<Record<string, unknown>> = []

    await reconcileSprintSchedule(String(sprint._id), 'date_became_non_working', {
      carryForwardCountByStandupId: async () => 3,
      moveCarryForward: async (input) => {
        moved.push(input as unknown as Record<string, unknown>)
      }
    })

    expect(moved).toHaveLength(1)
    expect(moved[0]).toMatchObject({
      fromDate: '2026-08-18',
      toDate: '2026-08-19',
      count: 3
    })
  })

  it('AC-4 / E4: a completed stand-up keeps its data and gains an anomaly note', async () => {
    await seedProject()
    const sprint = await seedSprint()
    await generateStandupsForSprint(String(sprint._id))

    await Standup.updateOne(
      { sprint: sprint._id, standupDate: '2026-08-11' },
      { $set: { status: 'Completed', completedAt: new Date('2026-08-11T04:00:00.000Z') } }
    )

    await declareHoliday('2026-08-11')

    await reconcileSprintSchedule(String(sprint._id), 'date_became_non_working')

    const completed = await Standup.findOne({ sprint: sprint._id, standupDate: '2026-08-11' })

    expect(completed?.status).toBe('Completed')
    expect(completed?.completedAt).toBeTruthy()
    expect(completed?.calendarAnomalies).toHaveLength(1)
    expect(completed?.calendarAnomalies[0].reason).toMatch(/2026-08-11/)
    // CAL-14: what it displayed is frozen even though the working set moved.
    expect(completed?.displayedDayNumber).toBe(2)
  })

  it('AC-4: the anomaly is recorded on the sprint as well as the stand-up', async () => {
    await seedProject()
    const sprint = await seedSprint()
    await generateStandupsForSprint(String(sprint._id))
    await Standup.updateOne(
      { sprint: sprint._id, standupDate: '2026-08-11' },
      { $set: { status: 'Completed' } }
    )
    await declareHoliday('2026-08-11')

    const result = await reconcileSprintSchedule(
      String(sprint._id),
      'date_became_non_working'
    )

    expect(result.anomalies).toEqual(['2026-08-11'])

    const reloaded = (await Sprint.findById(sprint._id).lean()) as any
    expect(reloaded.calendarAnomalies).toHaveLength(1)
    expect(reloaded.calendarAnomalies[0].date).toBe('2026-08-11')
  })

  it('E5: removing a holiday mid-sprint revives the day rather than duplicating it', async () => {
    await seedProject()
    await declareHoliday('2026-08-18')
    const sprint = await seedSprint()
    await generateStandupsForSprint(String(sprint._id))

    expect(await Standup.countDocuments({ sprint: sprint._id })).toBe(9)

    await Holiday.updateOne(
      { date: '2026-08-18' },
      { $set: { status: 'revoked', revokedAt: new Date(), revokeReason: 'Gazette corrected' } }
    )

    const result = await reconcileSprintSchedule(String(sprint._id), 'date_became_working')

    expect(result.created).toBe(1)
    expect(await Standup.countDocuments({ sprint: sprint._id })).toBe(10)

    const revived = await Standup.findOne({ sprint: sprint._id, standupDate: '2026-08-18' })
    expect(revived?.status).toBe('Scheduled')
    expect(revived?.sprintDayNumber).toBe(7)
  })

  it('E8: extending the end date generates, renumbers and moves final_day', async () => {
    await seedProject()
    const sprint = await seedSprint()
    await generateStandupsForSprint(String(sprint._id))

    await Sprint.updateOne(
      { _id: sprint._id },
      { $set: { endDate: new Date('2026-08-28T00:00:00.000Z') } }
    )

    const result = await reconcileSprintSchedule(String(sprint._id), 'sprint_end_later')

    expect(result.created).toBe(5)

    const oldLast = await Standup.findOne({ sprint: sprint._id, standupDate: '2026-08-21' })
    const newLast = await Standup.findOne({ sprint: sprint._id, standupDate: '2026-08-28' })

    expect(oldLast?.shape).toBe('mid_sprint')
    expect(oldLast?.totalSprintDays).toBe(15)
    expect(newLast?.shape).toBe('final_day')
    expect(newLast?.sprintDayNumber).toBe(15)
  })

  it('E9: moving the start past a completed stand-up is refused, naming the dates', async () => {
    await seedProject()
    const sprint = await seedSprint()
    await generateStandupsForSprint(String(sprint._id))

    await Standup.updateOne(
      { sprint: sprint._id, standupDate: '2026-08-10' },
      { $set: { status: 'Completed' } }
    )
    await Sprint.updateOne(
      { _id: sprint._id },
      { $set: { startDate: new Date('2026-08-17T00:00:00.000Z') } }
    )

    await expect(
      reconcileSprintSchedule(String(sprint._id), 'sprint_start_later')
    ).rejects.toMatchObject({ code: 'IMMUTABLE_COMPLETED_STANDUP' })

    // Refused means nothing was written, not "written up to the failure".
    const untouched = await Standup.find({
      sprint: sprint._id,
      standupDate: { $lt: '2026-08-17' }
    })
    expect(untouched.every((standup) => standup.status !== 'Cancelled')).toBe(true)
  })

  it('cancels the stand-ups a shortened sprint no longer contains', async () => {
    await seedProject()
    const sprint = await seedSprint()
    await generateStandupsForSprint(String(sprint._id))

    await Sprint.updateOne(
      { _id: sprint._id },
      { $set: { endDate: new Date('2026-08-14T00:00:00.000Z') } }
    )

    const result = await reconcileSprintSchedule(String(sprint._id), 'sprint_end_earlier')

    expect(result.cancelled).toBe(5)

    const lastRemaining = await Standup.findOne({
      sprint: sprint._id,
      standupDate: '2026-08-14'
    })
    expect(lastRemaining?.shape).toBe('final_day')
  })

  it('SCH-6: a stand-up time change moves Scheduled instants only', async () => {
    await seedProject()
    const sprint = await seedSprint()
    await generateStandupsForSprint(String(sprint._id))

    await Standup.updateOne(
      { sprint: sprint._id, standupDate: '2026-08-11' },
      { $set: { status: 'Ready' } }
    )
    await ProjectStandupSettings.updateOne(
      { project },
      { $set: { standupLocalTime: '10:30' } }
    )

    const result = await reconcileSprintSchedule(String(sprint._id), 'standup_time_changed')

    expect(result.rescheduled).toBe(9)

    const moved = await Standup.findOne({ sprint: sprint._id, standupDate: '2026-08-13' })
    const ready = await Standup.findOne({ sprint: sprint._id, standupDate: '2026-08-11' })

    expect(moved?.scheduledStartAt.toISOString()).toBe('2026-08-13T05:00:00.000Z')
    expect(ready?.scheduledStartAt.toISOString()).toBe('2026-08-11T03:30:00.000Z')
  })

  it('SCH-6: cancelling the sprint cancels every non-terminal stand-up', async () => {
    await seedProject()
    const sprint = await seedSprint()
    await generateStandupsForSprint(String(sprint._id))
    await Standup.updateOne(
      { sprint: sprint._id, standupDate: '2026-08-10' },
      { $set: { status: 'Completed' } }
    )

    const result = await reconcileSprintSchedule(String(sprint._id), 'sprint_cancelled')

    expect(result.cancelled).toBe(9)
    expect(
      await Standup.countDocuments({ sprint: sprint._id, status: 'Cancelled' })
    ).toBe(9)
    expect(
      await Standup.countDocuments({ sprint: sprint._id, status: 'Completed' })
    ).toBe(1)
  })

  it('is idempotent: reconciling twice changes nothing the second time', async () => {
    await seedProject()
    const sprint = await seedSprint()
    await generateStandupsForSprint(String(sprint._id))
    await declareHoliday('2026-08-18')

    await reconcileSprintSchedule(String(sprint._id), 'date_became_non_working')
    const second = await reconcileSprintSchedule(String(sprint._id), 'date_became_non_working')

    expect(second.created).toBe(0)
    expect(second.skipped).toBe(0)
    expect(second.renumbered).toBe(0)
    // Ten documents: nine live days plus the skipped one, which is kept as the
    // record that 18 August was scheduled and then became a holiday.
    expect(await Standup.countDocuments({ sprint: sprint._id })).toBe(10)
  })
})

/**
 * SCH-6 wiring: the sprint update route is what actually fires the reconciler
 * for a date change, so the pre-check it depends on is asserted here rather
 * than left to the route's own error handling.
 */
describe('assertScheduleChangeAllowed (SCH-6 rows 2 and 4, SCH-7)', () => {
  useMongo()

  beforeEach(async () => {
    await syncIndexes(Standup)
    jest
      .spyOn(notificationService, 'createNotification')
      .mockResolvedValue({ _id: new mongoose.Types.ObjectId() } as never)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('allows a move that strands nothing', async () => {
    await seedProject()
    const sprint = await seedSprint()
    await generateStandupsForSprint(String(sprint._id))

    await expect(
      assertScheduleChangeAllowed(String(sprint._id), {
        from: '2026-08-10',
        to: '2026-08-28'
      })
    ).resolves.toBeUndefined()
  })

  it('refuses a move that would strand a completed stand-up, naming it (E9)', async () => {
    await seedProject()
    const sprint = await seedSprint()
    await generateStandupsForSprint(String(sprint._id))
    await Standup.updateOne(
      { sprint: sprint._id, standupDate: '2026-08-10' },
      { $set: { status: 'Completed' } }
    )

    await expect(
      assertScheduleChangeAllowed(String(sprint._id), {
        from: '2026-08-17',
        to: '2026-08-21'
      })
    ).rejects.toMatchObject({ code: 'IMMUTABLE_COMPLETED_STANDUP' })
  })

  it('refuses when an in-progress stand-up would fall outside', async () => {
    await seedProject()
    const sprint = await seedSprint()
    await generateStandupsForSprint(String(sprint._id))
    await Standup.updateOne(
      { sprint: sprint._id, standupDate: '2026-08-21' },
      { $set: { status: 'In_Progress' } }
    )

    await expect(
      assertScheduleChangeAllowed(String(sprint._id), {
        from: '2026-08-10',
        to: '2026-08-14'
      })
    ).rejects.toMatchObject({ code: 'IMMUTABLE_COMPLETED_STANDUP' })
  })

  it('does not refuse for a merely scheduled stand-up falling outside', async () => {
    await seedProject()
    const sprint = await seedSprint()
    await generateStandupsForSprint(String(sprint._id))

    await expect(
      assertScheduleChangeAllowed(String(sprint._id), {
        from: '2026-08-10',
        to: '2026-08-14'
      })
    ).resolves.toBeUndefined()
  })
})
