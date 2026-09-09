/**
 * backfill-service (SCH-14, E49, §17.6).
 *
 * `wasBackfilled`/`backfilledAt` and `backfillWindowWorkingDays` were real
 * schema fields with no writer and no enforcement anywhere before this task
 * — see `backfill-service.ts`'s own docblock. These tests exercise the real
 * path end to end: a genuine `Missed` standup, the real completion saga
 * (allocations actually get frozen, a summary actually gets persisted — the
 * same facts `completion-saga.integration.test.ts` asserts), and the real
 * `ProjectStandupSettings.backfillWindowWorkingDays` value.
 *
 * A day-one stand-up with its one expected attendee marked `absent_planned`
 * and nothing allocated is the fixture, mirroring `complete-route.test.ts`'s
 * own reasoning: an absent member's capacity is `unavailable` (CC-1/CC-6
 * never flag it) and an empty allocation list trivially satisfies the
 * allocation-shaped checks, so the fixture isolates the backfill-specific
 * behaviour (window enforcement, `wasBackfilled` stamping) from the
 * completion-checks suite, which is already covered elsewhere.
 */
import mongoose from 'mongoose'

import { Allocation } from '@/models/Allocation'
import { ProjectStandupSettings } from '@/models/ProjectStandupSettings'
import { Sprint } from '@/models/Sprint'
import { Standup } from '@/models/Standup'
import { StandupSummary } from '@/models/StandupSummary'

import { notificationService } from '@/lib/notification-service'

import { backfillStandup } from '../backfill-service'
import { ids, syncIndexes, useMongo } from './helpers/mongo'

const { organization, project, member, user } = ids

let sprintId: mongoose.Types.ObjectId

async function seedSprint(startDate: string, endDate: string) {
  const sprint = await Sprint.create({
    name: 'Backfill sprint',
    organization,
    project,
    createdBy: user,
    status: 'active',
    startDate: new Date(`${startDate}T00:00:00.000Z`),
    endDate: new Date(`${endDate}T00:00:00.000Z`),
    capacity: 0,
    teamMembers: [member]
  })
  sprintId = sprint._id as mongoose.Types.ObjectId
}

/** A day-one, cleanly-passable Missed stand-up — see the module docblock. */
async function seedMissedStandup(standupDate: string, overrides: Record<string, unknown> = {}) {
  return Standup.create({
    project,
    sprint: sprintId,
    organization,
    standupDate,
    scheduledStartAt: new Date(`${standupDate}T03:30:00.000Z`),
    durationMinutes: 15,
    sprintDayNumber: 1,
    totalSprintDays: 5,
    shape: 'day_one',
    status: 'Missed',
    facilitator: user,
    expectedAttendees: [member],
    attendance: [{ user: member, state: 'absent_planned' }],
    version: 0,
    ...overrides
  })
}

let createNotification: jest.SpyInstance

beforeEach(() => {
  createNotification = jest
    .spyOn(notificationService, 'createNotification')
    .mockResolvedValue({ _id: 'notification' } as any)
})

afterEach(() => {
  createNotification.mockRestore()
})

describe('backfillStandup (SCH-14/E49)', () => {
  useMongo()

  beforeEach(async () => {
    await syncIndexes(StandupSummary)
  })

  it('backfills a Missed standup within the window and sets wasBackfilled/backfilledAt (E49/SCH-14)', async () => {
    // Missed on Tuesday 2026-09-01; "now" is Wednesday 2026-09-02 — exactly
    // one elapsed working day, comfortably inside a 2-working-day window.
    await seedSprint('2026-08-25', '2026-09-10')
    await ProjectStandupSettings.create({
      project,
      organization,
      backfillWindowWorkingDays: 2
    })
    const standup = await seedMissedStandup('2026-09-01')

    const result = await backfillStandup({
      standupId: String(standup._id),
      backfilledBy: String(user),
      now: new Date('2026-09-02T10:00:00.000Z')
    })

    expect(result.standup.status).toBe('Completed')
    expect(result.standup.wasBackfilled).toBe(true)
    expect(result.standup.backfilledAt).toBeInstanceOf(Date)
    expect(typeof result.summaryId).toBe('string')
    expect(result.summaryId.length).toBeGreaterThan(0)

    // The saga genuinely ran, not just the two backfill-specific fields: a
    // real summary is persisted, and the checkpoint clears.
    expect(await StandupSummary.countDocuments({ standup: standup._id })).toBe(1)

    const reloaded = await Standup.findById(standup._id).lean()
    expect(reloaded!.status).toBe('Completed')
    expect(reloaded!.wasBackfilled).toBe(true)
    expect(reloaded!.backfilledAt).toBeInstanceOf(Date)
    // `.lean()` reads the stored document as-is; a non-lean access of
    // `completionState` would show the schema's default nested subdocument
    // even though the saga's `finish()` step `$unset` it (see
    // `completion-saga.integration.test.ts`'s own RUN-23 comment).
    expect(reloaded!.completionState).toBeUndefined()
  })

  it('actually freezes allocations on a backfilled standup, same as a live completion', async () => {
    await seedSprint('2026-08-25', '2026-09-10')
    const standup = await seedMissedStandup('2026-09-01')

    const { Task } = await import('@/models/Task')
    const task = await Task.create({
      title: 'Backfill task',
      organization,
      project,
      sprint: sprintId,
      createdBy: user,
      taskNumber: 9101,
      displayId: 'KAN-9101',
      status: 'in_progress',
      remainingEstimateMinutes: 60,
      originalEstimateMinutes: 60,
      assignedTo: [{ user: member }]
    })
    await Allocation.create({
      standup: standup._id,
      sprint: sprintId,
      project,
      organization,
      member,
      task: task._id,
      plannedMinutes: 60,
      source: 'assigned_in_standup',
      excludedFromCapacity: false,
      createdBy: user
    })

    await backfillStandup({
      standupId: String(standup._id),
      backfilledBy: String(user),
      now: new Date('2026-09-02T10:00:00.000Z')
    })

    const allocations = await Allocation.find({ standup: standup._id }).lean()
    expect(allocations.every((row) => row.frozenAt)).toBe(true)
  })

  it('refuses a backfill outside the configured window and changes nothing (E49/SCH-14)', async () => {
    // Missed on Monday 2026-08-24; "now" is Monday 2026-09-07 — ten elapsed
    // working days, well outside a 2-working-day window.
    await seedSprint('2026-08-17', '2026-09-11')
    await ProjectStandupSettings.create({
      project,
      organization,
      backfillWindowWorkingDays: 2
    })
    const standup = await seedMissedStandup('2026-08-24')

    await expect(
      backfillStandup({
        standupId: String(standup._id),
        backfilledBy: String(user),
        now: new Date('2026-09-07T10:00:00.000Z')
      })
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })

    const reloaded = await Standup.findById(standup._id).lean()
    expect(reloaded!.status).toBe('Missed')
    expect(reloaded!.wasBackfilled).toBe(false)
    expect(reloaded!.backfilledAt).toBeUndefined()
    expect(await StandupSummary.countDocuments({ standup: standup._id })).toBe(0)
  })

  it('refuses to backfill a standup that is not Missed', async () => {
    await seedSprint('2026-08-25', '2026-09-10')
    const standup = await seedMissedStandup('2026-09-01', { status: 'In_Progress' })

    await expect(
      backfillStandup({
        standupId: String(standup._id),
        backfilledBy: String(user),
        now: new Date('2026-09-02T10:00:00.000Z')
      })
    ).rejects.toMatchObject({ code: 'STANDUP_NOT_STARTABLE' })

    const reloaded = await Standup.findById(standup._id).lean()
    expect(reloaded!.status).toBe('In_Progress')
    expect(reloaded!.wasBackfilled).toBe(false)
  })

  it('404s on a nonexistent standup', async () => {
    await expect(
      backfillStandup({
        standupId: new mongoose.Types.ObjectId().toString(),
        backfilledBy: String(user)
      })
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
})
