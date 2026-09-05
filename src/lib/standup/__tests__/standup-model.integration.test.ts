/**
 * The `Standup` document (spec SCH-3, §10.1, RUN-23).
 *
 * Two things here are load-bearing and cannot be asserted anywhere else:
 * the unique `(sprint, standupDate)` key that makes generation idempotent under
 * a race (E10, SCH-2), and `standupDate` being a **string**, so a project
 * timezone change can never slide a stand-up onto the previous day.
 */
import mongoose from 'mongoose'

import { Standup, STANDUP_SHAPES, STANDUP_STATUSES } from '@/models/Standup'

import { anyId, ids, syncIndexes, useMongo } from './helpers/mongo'

const baseStandup = (overrides: Record<string, unknown> = {}) => ({
  project: ids.project,
  sprint: ids.sprint,
  organization: ids.organization,
  standupDate: '2026-08-10',
  scheduledStartAt: new Date('2026-08-10T03:30:00.000Z'),
  durationMinutes: 15,
  sprintDayNumber: 1,
  totalSprintDays: 9,
  shape: 'day_one',
  status: 'Scheduled',
  facilitator: ids.user,
  expectedAttendees: [ids.member, ids.otherMember],
  ...overrides
})

describe('Standup model', () => {
  useMongo()

  beforeEach(async () => {
    await syncIndexes(Standup)
  })

  it('persists a generated stand-up with its SCH-3 field set', async () => {
    const created = await Standup.create(baseStandup())

    expect(created.standupDate).toBe('2026-08-10')
    expect(created.shape).toBe('day_one')
    expect(created.status).toBe('Scheduled')
    expect(created.version).toBe(0)
    expect(created.wasBackfilled).toBe(false)
    expect(created.expectedAttendees).toHaveLength(2)
  })

  it('stores standupDate as a string, not a Date', async () => {
    await Standup.create(baseStandup())

    const raw = await mongoose.connection.db
      ?.collection('standups')
      .findOne({ standupDate: '2026-08-10' })

    expect(typeof raw?.standupDate).toBe('string')
  })

  it('refuses a second stand-up for the same sprint and date (E10)', async () => {
    await Standup.create(baseStandup())

    await expect(Standup.create(baseStandup({ sprintDayNumber: 2 }))).rejects.toThrow(
      /E11000|duplicate key/i
    )

    expect(await Standup.countDocuments({ sprint: ids.sprint })).toBe(1)
  })

  it('allows the same date in a different sprint', async () => {
    await Standup.create(baseStandup())
    await Standup.create(baseStandup({ sprint: anyId() }))

    expect(await Standup.countDocuments({ standupDate: '2026-08-10' })).toBe(2)
  })

  it('rejects a status outside the §10.1 machine', async () => {
    await expect(Standup.create(baseStandup({ status: 'Paused' }))).rejects.toThrow(
      /status/i
    )
  })

  it('rejects a shape outside the §5.2 three', async () => {
    await expect(Standup.create(baseStandup({ shape: 'retro' }))).rejects.toThrow(/shape/i)
  })

  it('rejects a standupDate that is not YYYY-MM-DD', async () => {
    await expect(Standup.create(baseStandup({ standupDate: '10/08/2026' }))).rejects.toThrow(
      /standupDate/i
    )
  })

  it('exposes the eight statuses and three shapes as frozen tuples', () => {
    expect(STANDUP_STATUSES).toEqual([
      'Scheduled',
      'Ready',
      'In_Progress',
      'Completed',
      'Reopened',
      'Missed',
      'Skipped_Holiday',
      'Cancelled'
    ])
    expect(STANDUP_SHAPES).toEqual(['day_one', 'mid_sprint', 'final_day'])
  })

  it('records attendance as embedded rows, defaulting to present (RUN-6)', async () => {
    const created = await Standup.create(
      baseStandup({
        attendance: [{ user: ids.member }, { user: ids.otherMember, state: 'absent_planned' }]
      })
    )

    expect(created.attendance[0].state).toBe('present')
    expect(created.attendance[1].state).toBe('absent_planned')
  })

  it('keeps a notification ledger so a re-run cannot send twice (SCH-17)', async () => {
    const created = await Standup.create(baseStandup())

    expect(created.notificationsSent).toEqual({})

    created.notificationsSent = { N2: new Date('2026-08-10T03:15:00.000Z') }
    await created.save()

    const reloaded = await Standup.findById(created._id)
    expect(reloaded?.notificationsSent.N2).toBeInstanceOf(Date)
  })
})
