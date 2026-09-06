/**
 * The pre-stand-up snapshot (spec SCH-9, SCH-10, SCH-11).
 *
 * SCH-11 is the rule with teeth: building a snapshot is a read-and-compute
 * operation and must not mutate a task. It runs on a background job, before
 * anyone has opened the stand-up, so a write here would edit the board behind
 * the team's back.
 */
import mongoose from 'mongoose'

import { MemberCapacity } from '@/models/MemberCapacity'
import { ProjectStandupSettings } from '@/models/ProjectStandupSettings'
import { Sprint } from '@/models/Sprint'
import { Standup } from '@/models/Standup'
import { Task } from '@/models/Task'
import { WorkingCalendar } from '@/models/WorkingCalendar'

import { generateStandupsForSprint } from '../generation'
import { buildStandupSnapshot, snapshotIsStale, SNAPSHOT_MAX_AGE_MINUTES } from '../snapshot'
import { ids, syncIndexes, useMongo } from './helpers/mongo'

const { organization, project, member, otherMember, user } = ids

async function seedProject() {
  await WorkingCalendar.create({
    scope: 'project',
    organization,
    project,
    workingDaysOfWeek: [1, 2, 3, 4, 5],
    standardMinutesPerDay: 480,
    timezone: 'Asia/Colombo',
    subscribedHolidaySets: [],
    overrides: []
  })

  await ProjectStandupSettings.create({
    project,
    organization,
    enabled: true,
    standupLocalTime: '09:00',
    defaultFacilitator: user
  })

  await MemberCapacity.create({
    project,
    member,
    dailyCapacityMinutes: 360,
    effectiveFrom: '2026-01-01',
    isActive: true
  })
}

async function seedSprintWithStandups() {
  const sprint = await Sprint.create({
    name: 'Sprint 14',
    organization,
    project,
    createdBy: user,
    status: 'active',
    startDate: new Date('2026-08-10T00:00:00.000Z'),
    endDate: new Date('2026-08-14T00:00:00.000Z'),
    capacity: 0,
    teamMembers: [member, otherMember]
  })

  await generateStandupsForSprint(String(sprint._id))
  return sprint
}

let taskCounter = 0

async function seedTask(overrides: Record<string, unknown> = {}) {
  taskCounter += 1

  return Task.create({
    title: 'Wire the export endpoint',
    organization,
    project,
    createdBy: user,
    status: 'todo',
    priority: 'medium',
    originalEstimateMinutes: 240,
    taskNumber: taskCounter,
    displayId: `KAN-${taskCounter}`,
    ...overrides
  })
}

describe('buildStandupSnapshot', () => {
  useMongo()

  beforeEach(async () => {
    await syncIndexes(Standup)
  })

  it('reports each expected attendee`s capacity for the day (SCH-9)', async () => {
    await seedProject()
    const sprint = await seedSprintWithStandups()
    const standup = await Standup.findOne({ sprint: sprint._id, standupDate: '2026-08-11' })

    const snapshot = await buildStandupSnapshot(String(standup!._id))

    expect(snapshot.date).toBe('2026-08-11')
    expect(snapshot.members).toHaveLength(2)

    const configured = snapshot.members.find((row) => row.memberId === String(member))
    const defaulted = snapshot.members.find((row) => row.memberId === String(otherMember))

    expect(configured?.nominalMinutes).toBe(360)
    // No MemberCapacity row: the project's standard day is the honest default.
    expect(defaulted?.nominalMinutes).toBe(480)
  })

  it('lists the unassigned task pool for the sprint (SCH-9)', async () => {
    await seedProject()
    const sprint = await seedSprintWithStandups()

    await seedTask({ sprint: sprint._id })
    await seedTask({ sprint: sprint._id, title: 'Second unassigned', status: 'todo' })
    await seedTask({
      sprint: sprint._id,
      title: 'Already owned',
      assignedTo: [{ user: member, assignedAt: new Date() }]
    })
    await seedTask({ sprint: sprint._id, title: 'Finished', status: 'done' })

    const standup = await Standup.findOne({ sprint: sprint._id, standupDate: '2026-08-10' })
    const snapshot = await buildStandupSnapshot(String(standup!._id))

    expect(snapshot.unassignedPool.map((task) => task.title).sort()).toEqual([
      'Second unassigned',
      'Wire the export endpoint'
    ])
  })

  it('caps the pool rather than loading an unbounded sprint (D-K)', async () => {
    await seedProject()
    const sprint = await seedSprintWithStandups()

    for (let index = 0; index < 55; index += 1) {
      await seedTask({ sprint: sprint._id, title: `Task ${index}` })
    }

    const standup = await Standup.findOne({ sprint: sprint._id, standupDate: '2026-08-10' })
    const snapshot = await buildStandupSnapshot(String(standup!._id))

    expect(snapshot.unassignedPool).toHaveLength(50)
    expect(snapshot.unassignedPoolTotal).toBe(55)
  })

  it('SCH-11: builds without mutating a single task', async () => {
    await seedProject()
    const sprint = await seedSprintWithStandups()
    const task = await seedTask({ sprint: sprint._id })
    const before = (await Task.findById(task._id).lean()) as any

    const standup = await Standup.findOne({ sprint: sprint._id, standupDate: '2026-08-10' })
    await buildStandupSnapshot(String(standup!._id))

    const after = (await Task.findById(task._id).lean()) as any
    expect(after.updatedAt.toISOString()).toBe(before.updatedAt.toISOString())
    expect(after.status).toBe(before.status)
  })

  it('is deterministic: two builds of an unchanged sprint agree', async () => {
    await seedProject()
    const sprint = await seedSprintWithStandups()
    await seedTask({ sprint: sprint._id })

    const standup = await Standup.findOne({ sprint: sprint._id, standupDate: '2026-08-10' })

    const first = await buildStandupSnapshot(String(standup!._id))
    const second = await buildStandupSnapshot(String(standup!._id))

    expect(second).toEqual(first)
  })

  it('persists the snapshot and its build time when asked to', async () => {
    await seedProject()
    const sprint = await seedSprintWithStandups()
    const standup = await Standup.findOne({ sprint: sprint._id, standupDate: '2026-08-10' })

    await buildStandupSnapshot(String(standup!._id), { persist: true })

    const reloaded = await Standup.findById(standup!._id)
    expect(reloaded?.snapshotBuiltAt).toBeInstanceOf(Date)
    expect((reloaded?.snapshot as any)?.date).toBe('2026-08-10')
  })

  it('carries the Phase 7-9 seams as declared empties, not as missing keys', async () => {
    await seedProject()
    const sprint = await seedSprintWithStandups()
    const standup = await Standup.findOne({ sprint: sprint._id, standupDate: '2026-08-11' })

    const snapshot = await buildStandupSnapshot(String(standup!._id))

    expect(snapshot.previousAllocations).toEqual([])
    expect(snapshot.carryForward).toEqual([])
    expect(snapshot.prefilledAllocations).toEqual([])
  })

  it('refuses a stand-up that does not exist', async () => {
    await expect(
      buildStandupSnapshot(String(new mongoose.Types.ObjectId()))
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
})

describe('snapshotIsStale (SCH-10)', () => {
  const builtAt = new Date('2026-08-10T03:00:00.000Z')

  it('is fresh one minute inside the window', () => {
    const now = new Date(builtAt.getTime() + (SNAPSHOT_MAX_AGE_MINUTES - 1) * 60_000)
    expect(snapshotIsStale(builtAt, now)).toBe(false)
  })

  it('is stale one minute past it', () => {
    const now = new Date(builtAt.getTime() + (SNAPSHOT_MAX_AGE_MINUTES + 1) * 60_000)
    expect(snapshotIsStale(builtAt, now)).toBe(true)
  })

  it('treats a snapshot that was never built as stale', () => {
    expect(snapshotIsStale(undefined, builtAt)).toBe(true)
  })
})
