/**
 * The carry-forward register's writer (Phase 9 — spec §13, CFW-1..11, SCH-13).
 *
 * Exercises the two upstream seams (`reconcile.ts`'s skip mover, `mark-missed`'s
 * roll-forward) and the builder's own discovery, ageing and auto-close passes,
 * against a real database — the rule this module's own §7 sets: at least one
 * test per phase must write through the real path, not a pre-seeded row.
 */
import mongoose from 'mongoose'

import { Allocation } from '@/models/Allocation'
import {
  CarryForwardItem,
  type CarryForwardStatus
} from '@/models/CarryForwardItem'
import { Sprint } from '@/models/Sprint'
import { Standup } from '@/models/Standup'
import { Task } from '@/models/Task'

import {
  addCarryForwardNote,
  buildCarryForwardSet,
  loadCarryForwardPanel,
  moveCarryForwardOnSkip,
  resolveCarryForwardItem,
  rollForwardMissedStandup
} from '../carry-forward-service'
import { CARRY_FORWARD_NOTE_MIN_LENGTH } from '../carry-forward'
import { ids, syncIndexes, useMongo } from './helpers/mongo'

const { organization, project, member, otherMember, user } = ids

const actor = { type: 'user' as const, userId: String(user) }

let sprintId: mongoose.Types.ObjectId

async function seedSprint() {
  const sprint = await Sprint.create({
    name: 'Sprint 9',
    organization,
    project,
    createdBy: user,
    status: 'active',
    startDate: new Date('2026-08-17T00:00:00.000Z'),
    endDate: new Date('2026-08-21T00:00:00.000Z'),
    capacity: 0,
    teamMembers: [member, otherMember]
  })
  sprintId = sprint._id as mongoose.Types.ObjectId
}

async function seedStandup(date: string, dayNumber: number, overrides: Record<string, unknown> = {}) {
  return Standup.create({
    project,
    sprint: sprintId,
    organization,
    standupDate: date,
    scheduledStartAt: new Date(`${date}T03:30:00.000Z`),
    durationMinutes: 15,
    sprintDayNumber: dayNumber,
    totalSprintDays: 5,
    shape: dayNumber === 1 ? 'day_one' : 'mid_sprint',
    status: 'Completed',
    facilitator: user,
    expectedAttendees: [member, otherMember],
    version: 0,
    ...overrides
  })
}

let taskCounter = 500

async function seedTask(overrides: Record<string, unknown> = {}) {
  taskCounter += 1
  return Task.create({
    title: 'Reconciliation',
    organization,
    project,
    sprint: sprintId,
    createdBy: user,
    taskNumber: taskCounter,
    displayId: `KAN-${taskCounter}`,
    status: 'in_progress',
    remainingEstimateMinutes: 240,
    originalEstimateMinutes: 240,
    assignedTo: [{ user: member }],
    ...overrides
  })
}

async function seedAllocation(
  standupId: mongoose.Types.ObjectId,
  taskId: mongoose.Types.ObjectId,
  overrides: Record<string, unknown> = {}
) {
  return Allocation.create({
    standup: standupId,
    sprint: sprintId,
    project,
    organization,
    member,
    task: taskId,
    plannedMinutes: 240,
    source: 'assigned_in_standup',
    excludedFromCapacity: false,
    createdBy: user,
    ...overrides
  })
}

describe('buildCarryForwardSet', () => {
  useMongo()

  beforeEach(async () => {
    await syncIndexes(CarryForwardItem, Allocation)
    await seedSprint()
  })

  it('CFW-1/CFW-6: discovers an unfinished task and places it on the next stand-up', async () => {
    const today = await seedStandup('2026-08-17', 1)
    const tomorrow = await seedStandup('2026-08-18', 2, { status: 'Scheduled' })
    const task = await seedTask()
    await seedAllocation(today._id, task._id)

    const result = await buildCarryForwardSet({ standupId: String(today._id), actor })
    expect(result.created).toBe(1)

    const item = (await CarryForwardItem.findOne({ sprint: sprintId }).lean()) as any
    expect(item.type).toBe('unfinished_task')
    expect(item.status).toBe('open')
    expect(item.ageInStandups).toBe(1)
    expect(String(item.currentStandup)).toBe(String(tomorrow._id))
    expect(String(item.member)).toBe(String(member))
  })

  it('CFW-6: is idempotent — running twice for the same stand-up creates nothing new', async () => {
    const today = await seedStandup('2026-08-17', 1)
    await seedStandup('2026-08-18', 2, { status: 'Scheduled' })
    const task = await seedTask()
    await seedAllocation(today._id, task._id)

    await buildCarryForwardSet({ standupId: String(today._id), actor })
    const second = await buildCarryForwardSet({ standupId: String(today._id), actor })

    expect(second.created).toBe(0)
    expect(await CarryForwardItem.countDocuments({})).toBe(1)
  })

  it('CFW-2: ages an already-open item by one and moves it to the following stand-up', async () => {
    const day1 = await seedStandup('2026-08-17', 1)
    const day2 = await seedStandup('2026-08-18', 2, { status: 'Scheduled' })
    const day3 = await seedStandup('2026-08-19', 3, { status: 'Scheduled' })
    const task = await seedTask()
    await seedAllocation(day1._id, task._id)

    await buildCarryForwardSet({ standupId: String(day1._id), actor })

    // Day 2 completes, the task is still open, and nothing re-allocated it —
    // the existing unfinished_task item should age, not duplicate. (Day 2's
    // build also classifies day 1's freshly-lagged variance, per VAR-2, which
    // may raise its own `not_started_commitment` item for the same task — a
    // second, narrower obligation existing here is expected, not a bug.)
    await Standup.updateOne({ _id: day2._id }, { $set: { status: 'Completed' } })
    const result = await buildCarryForwardSet({ standupId: String(day2._id), actor })

    expect(result.aged).toBe(1)

    const item = (await CarryForwardItem.findOne({
      sprint: sprintId,
      type: 'unfinished_task'
    }).lean()) as any
    expect(item.ageInStandups).toBe(2)
    expect(String(item.currentStandup)).toBe(String(day3._id))
  })

  it('§13.2: auto-closes an unfinished_task item once the task reaches done', async () => {
    const day1 = await seedStandup('2026-08-17', 1)
    const day2 = await seedStandup('2026-08-18', 2, { status: 'Scheduled' })
    const task = await seedTask()
    await seedAllocation(day1._id, task._id)
    await buildCarryForwardSet({ standupId: String(day1._id), actor })

    await Task.updateOne({ _id: task._id }, { $set: { status: 'done' } })
    await Standup.updateOne({ _id: day2._id }, { $set: { status: 'Completed' } })
    const result = await buildCarryForwardSet({ standupId: String(day2._id), actor })

    expect(result.autoClosed).toBe(1)
    const item = (await CarryForwardItem.findOne({
      sprint: sprintId,
      type: 'unfinished_task'
    }).lean()) as any
    expect(item.status).toBe('resolved')
    expect(item.resolution.resolutionType).toBe('done')
  })

  it('RUN-7/OB-13: sweeps a detached allocation into an owner_absent item', async () => {
    const today = await seedStandup('2026-08-17', 1)
    await seedStandup('2026-08-18', 2, { status: 'Scheduled' })
    const task = await seedTask()
    await seedAllocation(today._id, task._id, {
      excludedFromCapacity: true,
      detachedReason: 'owner_absent'
    })

    await buildCarryForwardSet({ standupId: String(today._id), actor })

    const item = (await CarryForwardItem.findOne({ sprint: sprintId }).lean()) as any
    expect(item.type).toBe('owner_absent')
    expect(item.tags).toContain('owner_absent')
  })

  it('RUN-17/CFW-1: discovers a sprint task nobody picked up as unassigned_task', async () => {
    const today = await seedStandup('2026-08-17', 1)
    await seedStandup('2026-08-18', 2, { status: 'Scheduled' })
    await seedTask({ assignedTo: [] })

    const result = await buildCarryForwardSet({ standupId: String(today._id), actor })

    expect(result.created).toBe(1)
    const item = (await CarryForwardItem.findOne({ sprint: sprintId }).lean()) as any
    expect(item.type).toBe('unassigned_task')
  })

  it('has nothing left to build into on the sprint`s last stand-up, so the item stays on it', async () => {
    const last = await seedStandup('2026-08-21', 5)
    const task = await seedTask()
    await seedAllocation(last._id, task._id)

    await buildCarryForwardSet({ standupId: String(last._id), actor })

    const item = (await CarryForwardItem.findOne({ sprint: sprintId }).lean()) as any
    expect(String(item.currentStandup)).toBe(String(last._id))
  })
})

describe('moveCarryForwardOnSkip (reconcile.ts CAL-12 seam)', () => {
  useMongo()

  beforeEach(async () => {
    await seedSprint()
  })

  it('moves an open item to the next working day without ageing it', async () => {
    const skipped = await seedStandup('2026-08-18', 2, { status: 'Skipped_Holiday' })
    const next = await seedStandup('2026-08-19', 3, { status: 'Scheduled' })
    const item = await CarryForwardItem.create({
      sprint: sprintId,
      project,
      organization,
      type: 'unfinished_task',
      originStandup: skipped._id,
      originDate: '2026-08-17',
      currentStandup: skipped._id,
      ageInStandups: 2,
      status: 'open'
    })

    await moveCarryForwardOnSkip({
      fromStandupId: String(skipped._id),
      fromDate: '2026-08-18',
      toStandupId: String(next._id),
      toDate: '2026-08-19',
      count: 1
    })

    const moved = (await CarryForwardItem.findById(item._id).lean()) as any
    expect(String(moved.currentStandup)).toBe(String(next._id))
    expect(moved.ageInStandups).toBe(2) // unchanged — CFW-2, a skipped day does not age it
  })
})

describe('rollForwardMissedStandup (jobs/mark-missed.ts SCH-13 seam)', () => {
  useMongo()

  beforeEach(async () => {
    await seedSprint()
  })

  it('tags every item on the missed stand-up as from_missed_standup and moves it forward', async () => {
    const missed = await seedStandup('2026-08-18', 2, { status: 'Missed' })
    const next = await seedStandup('2026-08-19', 3, { status: 'Scheduled' })
    const item = await CarryForwardItem.create({
      sprint: sprintId,
      project,
      organization,
      type: 'unfinished_task',
      originStandup: missed._id,
      originDate: '2026-08-17',
      currentStandup: missed._id,
      ageInStandups: 1,
      status: 'open'
    })

    await rollForwardMissedStandup({
      missedStandupId: String(missed._id),
      missedDate: '2026-08-18',
      toStandupId: String(next._id),
      toDate: '2026-08-19',
      origin: 'missed_standup'
    })

    const rolled = (await CarryForwardItem.findById(item._id).lean()) as any
    expect(String(rolled.currentStandup)).toBe(String(next._id))
    expect(rolled.tags).toContain('from_missed_standup')
  })
})

describe('addCarryForwardNote', () => {
  useMongo()

  let standupId: string
  let itemId: string

  beforeEach(async () => {
    await seedSprint()
    const standup = await seedStandup('2026-08-17', 3)
    standupId = String(standup._id)
    const item = await CarryForwardItem.create({
      sprint: sprintId,
      project,
      organization,
      type: 'open_blocker',
      originStandup: standup._id,
      originDate: '2026-08-14',
      currentStandup: standup._id,
      ageInStandups: 3,
      status: 'open'
    })
    itemId = String(item._id)
  })

  it(`CFW-4: rejects fewer than ${CARRY_FORWARD_NOTE_MIN_LENGTH} characters`, async () => {
    await expect(
      addCarryForwardNote({ itemId, standupId, text: 'short', actor: { userId: String(user) } })
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
  })

  it('CFW-4: rejects a verbatim resubmission of yesterday`s note', async () => {
    await addCarryForwardNote({
      itemId,
      standupId,
      text: 'Waiting on the vendor to respond.',
      actor: { userId: String(user) }
    })

    await expect(
      addCarryForwardNote({
        itemId,
        standupId,
        text: 'Waiting on the vendor to respond.',
        actor: { userId: String(user) }
      })
    ).rejects.toMatchObject({ code: 'NOTE_UNCHANGED' })
  })

  it('CFW-5: accepts a genuinely new note and marks the item noted', async () => {
    const view = await addCarryForwardNote({
      itemId,
      standupId,
      text: 'Vendor responded, fix expected tomorrow.',
      actor: { userId: String(user) }
    })

    expect(view.status).toBe('noted')
    expect(view.notes).toHaveLength(1)
    expect(view.notes[0].text).toBe('Vendor responded, fix expected tomorrow.')
  })
})

describe('resolveCarryForwardItem', () => {
  useMongo()

  let standupId: string
  let itemId: string

  beforeEach(async () => {
    await seedSprint()
    const standup = await seedStandup('2026-08-17', 3)
    standupId = String(standup._id)
    const item = await CarryForwardItem.create({
      sprint: sprintId,
      project,
      organization,
      type: 'unfinished_task',
      originStandup: standup._id,
      originDate: '2026-08-14',
      currentStandup: standup._id,
      ageInStandups: 3,
      status: 'open'
    })
    itemId = String(item._id)
  })

  it('CFW-7: rejects a resolution not valid for the item`s type', async () => {
    await expect(
      resolveCarryForwardItem({
        itemId,
        standupId,
        resolutionType: 'acknowledged',
        actor: { userId: String(user) }
      })
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
  })

  it('CFW-7: resolves the item directly from the register row', async () => {
    const view = await resolveCarryForwardItem({
      itemId,
      standupId,
      resolutionType: 'done',
      comment: 'Finished after the stand-up.',
      actor: { userId: String(user) }
    })

    const status: CarryForwardStatus = view.status
    expect(status).toBe('resolved')

    const persisted = (await CarryForwardItem.findById(itemId).lean()) as any
    expect(persisted.status).toBe('resolved')
    expect(persisted.resolution.resolutionType).toBe('done')
  })
})

describe('loadCarryForwardPanel', () => {
  useMongo()

  beforeEach(async () => {
    await seedSprint()
  })

  it('CFW-10/11: sorts oldest first and summarises the open count', async () => {
    const standup = await seedStandup('2026-08-17', 3)

    await CarryForwardItem.create([
      {
        sprint: sprintId,
        project,
        organization,
        type: 'unfinished_task',
        originStandup: standup._id,
        originDate: '2026-08-14',
        currentStandup: standup._id,
        ageInStandups: 2,
        status: 'open'
      },
      {
        sprint: sprintId,
        project,
        organization,
        type: 'open_blocker',
        originStandup: standup._id,
        originDate: '2026-08-10',
        currentStandup: standup._id,
        ageInStandups: 6,
        status: 'escalated'
      }
    ])

    const panel = await loadCarryForwardPanel(String(standup._id))

    expect(panel.items.map((item) => item.ageInStandups)).toEqual([6, 2])
    expect(panel.summary.totalOpen).toBe(2)
    expect(panel.summary.escalated).toBe(1)
  })
})
