/**
 * The allocation service against the database (Phase 7, Task 5).
 *
 * `allocation-service.ts` is the only writer of `Allocation`. Everything here
 * writes through it rather than seeding rows, because Phase 3 shipped two
 * defects behind passing tests that only ever read what the test itself
 * planted (§7's real-database rule). A suite that inserts its own allocations
 * proves the reader works and says nothing at all about the writer.
 *
 * The property under test throughout is that a write and the capacity it
 * reports never disagree. The board draws the meter from the breakdown this
 * service returns, and the completion checks are evaluated from the same
 * numbers on the server; if the write path and the recompute path can drift by
 * one input, the meter says "full" while CC-1 refuses to complete, and the PM
 * has no way to tell which is lying.
 */
import mongoose from 'mongoose'

import { Allocation } from '@/models/Allocation'
import { ActivityLog } from '@/models/ActivityLog'
import { MemberCapacity } from '@/models/MemberCapacity'
import { ProjectStandupSettings } from '@/models/ProjectStandupSettings'
import { Sprint } from '@/models/Sprint'
import { Standup } from '@/models/Standup'
import { Task } from '@/models/Task'
import { WorkingCalendar } from '@/models/WorkingCalendar'

import {
  createAllocation,
  loadAllocationBoard,
  removeAllocation,
  updateAllocation
} from '../allocation-service'
import { minutes } from '../minutes'
import { ids, syncIndexes, useMongo } from './helpers/mongo'

const { organization, project, sprint, member, otherMember, user } = ids

const TIMEZONE = 'Asia/Colombo'
/** A Monday. */
const DAY = '2026-08-17'

/**
 * An eight-hour day less the stand-up's own fifteen minutes (DN-1/DN-3).
 *
 * Spelled out rather than assumed: these suites assert exact minute counts, and
 * the ceremony deduction is part of what the board actually shows. A fixture
 * that switched it off would let a regression in the shared capacity context
 * pass unnoticed here.
 */
const EFFECTIVE = 465

const actor = { userId: String(user) }

let standupId: string
let taskId: string

async function seed({
  status = 'In_Progress',
  dailyCapacityMinutes = 480
}: { status?: string; dailyCapacityMinutes?: number } = {}) {
  await WorkingCalendar.create({
    scope: 'project',
    organization,
    project,
    workingDaysOfWeek: [1, 2, 3, 4, 5],
    standardMinutesPerDay: 480,
    timezone: TIMEZONE,
    subscribedHolidaySets: [],
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

  for (const who of [member, otherMember]) {
    await MemberCapacity.create({
      project,
      member: who,
      dailyCapacityMinutes,
      effectiveFrom: '2026-01-01',
      isActive: true
    })
  }

  await Sprint.create({
    _id: sprint,
    name: 'Sprint 21',
    organization,
    project,
    createdBy: user,
    status: 'active',
    startDate: new Date('2026-08-17T00:00:00.000Z'),
    endDate: new Date('2026-08-21T00:00:00.000Z'),
    capacity: 0,
    teamMembers: [member, otherMember]
  })

  const standup = await Standup.create({
    project,
    sprint,
    organization,
    standupDate: DAY,
    scheduledStartAt: new Date('2026-08-17T03:30:00.000Z'),
    durationMinutes: 15,
    sprintDayNumber: 1,
    totalSprintDays: 5,
    shape: 'day_one',
    status,
    facilitator: user,
    expectedAttendees: [member, otherMember],
    version: 3
  })
  standupId = String(standup._id)

  const task = await Task.create({
    title: 'Invoice model',
    organization,
    project,
    sprint,
    createdBy: user,
    taskNumber: 214,
    displayId: 'KAN-214',
    status: 'in_progress',
    remainingEstimateMinutes: 420,
    originalEstimateMinutes: 420
  })
  taskId = String(task._id)

  return { standup, task }
}

/** Creates a second task, for the multi-row cases. */
async function anotherTask(remainingEstimateMinutes = 240) {
  const task = await Task.create({
    title: 'PDF render',
    organization,
    project,
    sprint,
    createdBy: user,
    taskNumber: 231,
    displayId: 'KAN-231',
    status: 'todo',
    remainingEstimateMinutes,
    originalEstimateMinutes: remainingEstimateMinutes
  })
  return String(task._id)
}

const create = (overrides: Record<string, unknown> = {}) =>
  createAllocation({
    standupId,
    memberId: String(member),
    taskId,
    expectedVersion: 3,
    actor,
    ...overrides
  } as any)

describe('createAllocation', () => {
  useMongo()

  beforeEach(async () => {
    await syncIndexes(Allocation)
    await seed()
  })

  it('writes the row and returns the recomputed breakdown (the real-path test)', async () => {
    const result = await create({ plannedMinutes: minutes(180) })

    // Written, not seeded.
    const stored = await Allocation.findById(result.allocation._id).lean()
    expect(stored).not.toBeNull()
    expect(stored!.plannedMinutes).toBe(180)
    expect(stored!.sprint.toString()).toBe(String(sprint))
    expect(stored!.organization.toString()).toBe(String(organization))

    // And the breakdown reports it, computed from the database rather than
    // echoed back from the request.
    expect(result.capacity.allocatedMinutes).toBe(180)
    expect(result.capacity.effectiveMinutes).toBe(EFFECTIVE)
    expect(result.capacity.gapMinutes).toBe(EFFECTIVE - 180)
    expect(result.capacity.status).toBe('under')
  })

  it('stamps the task status the allocation was made against (Phase 8, V7 vs V12)', async () => {
    // The classifier has to tell "planned, untouched, status unchanged" (V7,
    // reason required) from "no time logged but the task moved anyway" (V12,
    // a warning). Nothing else records what the status was when the PM planned
    // the day, and reading it back later would answer with today's value.
    const result = await create({ plannedMinutes: minutes(180) })
    const stored = await Allocation.findById(result.allocation._id).lean()
    expect(stored!.taskStatusAtAllocation).toBe('in_progress')
  })

  it('moves a member from zero to full as the day fills', async () => {
    const first = await create({ plannedMinutes: minutes(420) })
    expect(first.capacity.status).toBe('under')

    const second = await createAllocation({
      standupId,
      memberId: String(member),
      taskId: await anotherTask(45),
      plannedMinutes: minutes(45),
      expectedVersion: first.standupVersion,
      actor
    })

    expect(second.capacity.allocatedMinutes).toBe(EFFECTIVE)
    expect(second.capacity.gapMinutes).toBe(0)
    expect(second.capacity.status).toBe('full')
  })

  it('applies the ALO-5 default when no hours are given', async () => {
    // The task has 7h remaining against an empty 8h day, so the whole task is
    // offered rather than the whole day.
    const result = await create()

    expect(result.allocation.plannedMinutes).toBe(420)
  })

  it('bumps the stand-up version so the next writer must re-read (RUN-23)', async () => {
    const result = await create({ plannedMinutes: minutes(60) })

    expect(result.standupVersion).toBe(4)
    const standup = await Standup.findById(standupId).lean()
    expect(standup!.version).toBe(4)
  })

  it('assigns the task to the member when it had no assignee (ALO-16)', async () => {
    await create({ plannedMinutes: minutes(60) })

    const task = (await Task.findById(taskId).lean()) as any
    expect(task.assignedTo.map((a: any) => String(a.user ?? a))).toContain(String(member))
  })

  it('leaves an existing assignee alone', async () => {
    await Task.updateOne({ _id: taskId }, { $set: { assignedTo: [{ user: otherMember }] } })

    await create({ plannedMinutes: minutes(60) })

    const task = (await Task.findById(taskId).lean()) as any
    expect(task.assignedTo).toHaveLength(1)
    expect(String(task.assignedTo[0].user)).toBe(String(otherMember))
  })

  it('writes an audit entry naming the actor and the allocation (SEC-3)', async () => {
    const result = await create({ plannedMinutes: minutes(60) })

    const entries = await ActivityLog.find({ action: 'allocation_created' }).lean()
    expect(entries).toHaveLength(1)
    expect(String(entries[0].user)).toBe(String(user))
    expect(entries[0].entityType).toBe('allocation')
    expect(String(entries[0].entityId)).toBe(String(result.allocation._id))
  })

  describe('refusals', () => {
    it('refuses a task with no estimate (CC-2, at write time not only at completion)', async () => {
      const bare = await Task.create({
        title: 'Unestimated',
        organization,
        project,
        sprint,
        createdBy: user,
        taskNumber: 999,
        displayId: 'KAN-999',
        status: 'todo'
      })

      await expect(create({ taskId: String(bare._id) })).rejects.toMatchObject({
        code: 'TASK_NOT_ESTIMATED'
      })
      expect(await Allocation.countDocuments({})).toBe(0)
    })

    it('refuses zero planned minutes (CC-5)', async () => {
      await expect(create({ plannedMinutes: 0 })).rejects.toMatchObject({
        code: 'VALIDATION_FAILED'
      })
    })

    it('refuses a fractional minute count (DAT-2)', async () => {
      await expect(create({ plannedMinutes: 22.5 })).rejects.toMatchObject({
        code: 'VALIDATION_FAILED'
      })
    })

    it('refuses a stale version and reports the current one (RUN-23, E30)', async () => {
      await create({ plannedMinutes: minutes(60) })

      // A second PM still holding version 3.
      await expect(create({ plannedMinutes: minutes(120) })).rejects.toMatchObject({
        code: 'STALE_STANDUP',
        details: expect.objectContaining({ currentVersion: 4 })
      })
    })

    it('refuses a member who is not expected at this stand-up', async () => {
      await expect(
        create({ memberId: String(new mongoose.Types.ObjectId()) })
      ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
    })

    it('refuses a task from another sprint', async () => {
      const stray = await Task.create({
        title: 'Not in this sprint',
        organization,
        project,
        createdBy: user,
        taskNumber: 500,
        displayId: 'KAN-500',
        status: 'todo',
        remainingEstimateMinutes: 60
      })

      await expect(create({ taskId: String(stray._id) })).rejects.toMatchObject({
        code: 'VALIDATION_FAILED'
      })
    })

    it('refuses a duplicate live row for the same member and task (DAT-3)', async () => {
      const first = await create({ plannedMinutes: minutes(60) })

      await expect(
        create({ plannedMinutes: minutes(60), expectedVersion: first.standupVersion })
      ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
    })
  })

  describe('a completed stand-up is immutable (ALO-22 is Task 13)', () => {
    beforeEach(async () => {
      await Standup.updateOne({ _id: standupId }, { $set: { status: 'Completed' } })
    })

    it('refuses an ordinary create', async () => {
      await expect(create({ plannedMinutes: minutes(60) })).rejects.toMatchObject({
        code: 'IMMUTABLE_COMPLETED_STANDUP'
      })
    })
  })
})

describe('updateAllocation', () => {
  useMongo()

  beforeEach(async () => {
    await syncIndexes(Allocation)
    await seed()
  })

  it('changes the hours and returns the recomputed breakdown', async () => {
    const created = await create({ plannedMinutes: minutes(180) })

    const updated = await updateAllocation({
      standupId,
      allocationId: String(created.allocation._id),
      plannedMinutes: minutes(300),
      expectedVersion: created.standupVersion,
      actor
    })

    expect(updated.allocation.plannedMinutes).toBe(300)
    expect(updated.capacity.allocatedMinutes).toBe(300)
    expect(updated.capacity.gapMinutes).toBe(EFFECTIVE - 300)
  })

  it('drops a blocked row out of the allocated total (RUN-15)', async () => {
    const created = await create({ plannedMinutes: minutes(180) })

    const updated = await updateAllocation({
      standupId,
      allocationId: String(created.allocation._id),
      isBlocked: true,
      excludedFromCapacity: true,
      excludeReason: 'BLK-14',
      expectedVersion: created.standupVersion,
      actor
    })

    // The row is still on the board; it just stops counting, and the freed
    // minutes reappear as gap so the PM can see why the meter dropped.
    expect(updated.capacity.allocatedMinutes).toBe(0)
    expect(updated.capacity.gapMinutes).toBe(EFFECTIVE)
    expect(await Allocation.countDocuments({})).toBe(1)
  })

  it('requires a note when a blocked task is kept allocated (RUN-16)', async () => {
    const created = await create({ plannedMinutes: minutes(180) })

    await expect(
      updateAllocation({
        standupId,
        allocationId: String(created.allocation._id),
        isBlocked: true,
        allocatedDespiteBlocked: true,
        expectedVersion: created.standupVersion,
        actor
      })
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
  })

  it('refuses a stale version', async () => {
    const created = await create({ plannedMinutes: minutes(180) })

    await expect(
      updateAllocation({
        standupId,
        allocationId: String(created.allocation._id),
        plannedMinutes: minutes(60),
        expectedVersion: 3,
        actor
      })
    ).rejects.toMatchObject({ code: 'STALE_STANDUP' })
  })

  it('audits the change with before and after', async () => {
    const created = await create({ plannedMinutes: minutes(180) })
    await updateAllocation({
      standupId,
      allocationId: String(created.allocation._id),
      plannedMinutes: minutes(300),
      expectedVersion: created.standupVersion,
      actor
    })

    const entry = (await ActivityLog.findOne({ action: 'allocation_updated' }).lean()) as any
    expect(entry.details.before).toMatchObject({ plannedMinutes: 180 })
    expect(entry.details.after).toMatchObject({ plannedMinutes: 300 })
  })
})

describe('removeAllocation', () => {
  useMongo()

  beforeEach(async () => {
    await syncIndexes(Allocation)
    await seed()
  })

  it('deletes the row and returns the reopened gap', async () => {
    const created = await create({ plannedMinutes: minutes(180) })

    const result = await removeAllocation({
      standupId,
      allocationId: String(created.allocation._id),
      expectedVersion: created.standupVersion,
      actor
    })

    expect(await Allocation.countDocuments({})).toBe(0)
    expect(result.capacity.allocatedMinutes).toBe(0)
    expect(result.capacity.status).toBe('zero')
  })

  it('audits the removal', async () => {
    const created = await create({ plannedMinutes: minutes(180) })
    await removeAllocation({
      standupId,
      allocationId: String(created.allocation._id),
      expectedVersion: created.standupVersion,
      actor
    })

    expect(await ActivityLog.countDocuments({ action: 'allocation_removed' })).toBe(1)
  })
})

describe('loadAllocationBoard', () => {
  useMongo()

  beforeEach(async () => {
    await syncIndexes(Allocation)
    await seed()
  })

  it('reports every expected member, allocated or not', async () => {
    await create({ plannedMinutes: minutes(180) })

    const board = await loadAllocationBoard(standupId)

    expect(board.members).toHaveLength(2)
    const [first, second] = board.members
    expect(first.capacity.allocatedMinutes).toBe(180)
    expect(first.allocations).toHaveLength(1)
    expect(second.capacity.status).toBe('zero')
    expect(second.allocations).toEqual([])
  })

  it('carries the stand-up version so the client can send it back (RUN-23)', async () => {
    const board = await loadAllocationBoard(standupId)
    expect(board.standupVersion).toBe(3)
  })

  it('carries DN-6’s flag so the board can explain undeducted ceremonies (OB-10)', async () => {
    const board = await loadAllocationBoard(standupId)
    expect(board.ceremoniesConsumeCapacity).toBe(true)
  })

  it('splits the pool into ALO-14’s two tabs', async () => {
    await anotherTask()
    await Task.updateOne({ _id: taskId }, { $set: { assignedTo: [{ user: member }] } })

    const board = await loadAllocationBoard(standupId)

    expect(board.pool.assignedNotPlanned.map((t) => t.key)).toEqual(['KAN-214'])
    expect(board.pool.unassigned.map((t) => t.key)).toEqual(['KAN-231'])
  })

  it('is stable when run twice against unchanged data', async () => {
    await create({ plannedMinutes: minutes(180) })

    const { computedAt: _first, ...first } = await loadAllocationBoard(standupId)
    const { computedAt: _second, ...second } = await loadAllocationBoard(standupId)

    // `computedAt` is excluded deliberately: DAT-9 requires it to move on every
    // read, because it is what tells the UI how old the numbers are. Everything
    // else must be identical, or the board is deriving something it should be
    // computing.
    expect(JSON.stringify(first)).toBe(JSON.stringify(second))
  })
})

/**
 * Task 13 — the server-side rules for ALO-22 (top-up) and ALO-23 (self-select).
 *
 * Phase 11 builds the *screens* for both. The engine lands here so that phase
 * inherits a surface to write, not a set of rules to invent — and so the rules
 * are enforced against the API from the moment the API exists, rather than
 * living only in whichever component happens to call it.
 *
 * ALO-22's asymmetry is the point: a completed stand-up may gain an allocation
 * and may never lose or shrink one. History that can be edited after the fact
 * is not history, and Phase 8's variance numbers are computed from exactly
 * these rows.
 */
describe('ALO-22 — top-up mode on a completed stand-up', () => {
  useMongo()

  beforeEach(async () => {
    await syncIndexes(Allocation)
    await seed()
  })

  const complete = async () => {
    await Standup.updateOne({ _id: standupId }, { $set: { status: 'Completed' } })
  }

  it('accepts an addition and stamps it', async () => {
    await complete()

    const result = await createAllocation({
      standupId,
      memberId: String(member),
      taskId,
      plannedMinutes: minutes(60),
      expectedVersion: 3,
      actor,
      topUp: { reason: 'Picked up after the meeting' }
    })

    expect(result.allocation.addedAfterCompletion).toBe(true)
    expect(result.allocation.addedAfterCompletionAt).toBeInstanceOf(Date)
    expect(result.allocation.addedAfterCompletionReason).toBe('Picked up after the meeting')
  })

  it('requires a reason — an unexplained edit to history is worse than none', async () => {
    await complete()

    await expect(
      createAllocation({
        standupId,
        memberId: String(member),
        taskId,
        plannedMinutes: minutes(60),
        expectedVersion: 3,
        actor,
        topUp: { reason: '   ' }
      })
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
  })

  it('refuses a removal', async () => {
    const created = await create({ plannedMinutes: minutes(180) })
    await complete()

    await expect(
      removeAllocation({
        standupId,
        allocationId: String(created.allocation._id),
        expectedVersion: created.standupVersion,
        actor
      })
    ).rejects.toMatchObject({ code: 'IMMUTABLE_COMPLETED_STANDUP' })
  })

  it('refuses a reduction', async () => {
    const created = await create({ plannedMinutes: minutes(180) })
    await complete()

    await expect(
      updateAllocation({
        standupId,
        allocationId: String(created.allocation._id),
        plannedMinutes: minutes(60),
        expectedVersion: created.standupVersion,
        actor,
        topUp: { reason: 'Trimming it back' }
      })
    ).rejects.toMatchObject({ code: 'IMMUTABLE_COMPLETED_STANDUP' })
  })

  it('permits an increase, because that is an addition of hours', async () => {
    const created = await create({ plannedMinutes: minutes(180) })
    await complete()

    const updated = await updateAllocation({
      standupId,
      allocationId: String(created.allocation._id),
      plannedMinutes: minutes(300),
      expectedVersion: created.standupVersion,
      actor,
      topUp: { reason: 'Ran longer than planned' }
    })

    expect(updated.allocation.plannedMinutes).toBe(300)
    expect(updated.allocation.addedAfterCompletion).toBe(true)
  })

  it('still refuses an ordinary create with no top-up intent', async () => {
    await complete()

    await expect(create({ plannedMinutes: minutes(60) })).rejects.toMatchObject({
      code: 'IMMUTABLE_COMPLETED_STANDUP'
    })
  })
})

describe('ALO-23 — self-select', () => {
  useMongo()

  beforeEach(async () => {
    await syncIndexes(Allocation)
    await seed()
  })

  const allowSelfSelect = async (allowed: boolean) => {
    await ProjectStandupSettings.updateOne(
      { project },
      { $set: { allowSelfSelect: allowed } }
    )
  }

  it('lets a member add a task to their own day when the project allows it', async () => {
    await allowSelfSelect(true)

    const result = await createAllocation({
      standupId,
      memberId: String(member),
      taskId,
      plannedMinutes: minutes(60),
      expectedVersion: 3,
      actor: { userId: String(member) },
      selfSelect: true
    })

    expect(result.allocation.source).toBe('self_selected')
  })

  it('refuses when the project setting is off', async () => {
    await allowSelfSelect(false)

    await expect(
      createAllocation({
        standupId,
        memberId: String(member),
        taskId,
        plannedMinutes: minutes(60),
        expectedVersion: 3,
        actor: { userId: String(member) },
        selfSelect: true
      })
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
  })

  it('refuses self-selecting onto somebody else’s day', async () => {
    await allowSelfSelect(true)

    await expect(
      createAllocation({
        standupId,
        memberId: String(otherMember),
        taskId,
        plannedMinutes: minutes(60),
        expectedVersion: 3,
        actor: { userId: String(member) },
        selfSelect: true
      })
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
  })

  it('never removes an existing row — it only ever adds', async () => {
    await allowSelfSelect(true)
    const first = await create({ plannedMinutes: minutes(180) })

    await createAllocation({
      standupId,
      memberId: String(member),
      taskId: await anotherTask(60),
      plannedMinutes: minutes(60),
      expectedVersion: first.standupVersion,
      actor: { userId: String(member) },
      selfSelect: true
    })

    expect(await Allocation.countDocuments({ standup: standupId })).toBe(2)
  })
})
