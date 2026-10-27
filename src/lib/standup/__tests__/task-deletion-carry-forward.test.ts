/**
 * E64 — auto-closing carry-forward items on hard task deletion.
 *
 * The audit found that hard-deleting a task (`src/app/api/tasks/[id]/route.ts`'s
 * `DELETE`, a `Task.findOneAndDelete`) had zero interaction with
 * `CarryForwardItem`: the existing auto-close pass inside
 * `carry-forward-service.ts`'s `buildCarryForwardSet` only fires for the soft
 * `descopedAt` path, at completion time, for whatever is currently showing on
 * one stand-up's board. A hard delete is a different event entirely — it can
 * happen at any point in a task's life, independent of any stand-up's
 * lifecycle — so any carry-forward item still pointing at the task (on any
 * stand-up, closed or open) was left open forever, referencing a task that no
 * longer exists.
 *
 * This exercises the real `DELETE /api/tasks/:id` handler end to end (mocking
 * only the auth/permission layer, the same way `member-removal-carry-forward
 * .test.ts` does for the analogous `DELETE /api/members` case) and asserts
 * every open carry-forward item pointing at the deleted task is closed with a
 * `closed_descoped` resolution naming who deleted it and when.
 */
import mongoose from 'mongoose'
import { NextRequest } from 'next/server'

import { CarryForwardItem } from '@/models/CarryForwardItem'
import { Project } from '@/models/Project'
import { Sprint } from '@/models/Sprint'
import { Standup } from '@/models/Standup'
import { Task } from '@/models/Task'
import { User } from '@/models/User'

import { ids, syncIndexes, useMongo } from './helpers/mongo'

// --- Mocks for the auth/permission layer only -------------------------------
const hasPermission = jest.fn()

jest.mock('@/lib/db-config', () => ({
  __esModule: true,
  default: jest.fn().mockResolvedValue(undefined)
}))

jest.mock('@/lib/auth-utils', () => ({
  authenticateUser: jest.fn(async () => ({
    user: { id: String(mockUserId), organization: String(mockOrgId) }
  }))
}))

jest.mock('@/lib/permissions/permission-service', () => ({
  PermissionService: {
    hasPermission: (...args: unknown[]) => hasPermission(...args)
  }
}))

// `closeCarryForwardItemsForDeletedTask` is wrapped in a `jest.fn` (defaulting
// to its real implementation) rather than left untouched, so one test below
// can force a single call of it to reject without disturbing every other
// test in this file, which all rely on the real behaviour. A plain
// `jest.spyOn` on the live module can't do this — ts-jest/Next's ESM
// interop makes named exports non-configurable, so redefining the property
// throws "Cannot redefine property."
jest.mock('@/lib/standup/carry-forward-service', () => {
  const actual = jest.requireActual('@/lib/standup/carry-forward-service')
  return {
    __esModule: true,
    ...actual,
    closeCarryForwardItemsForDeletedTask: jest.fn(actual.closeCarryForwardItemsForDeletedTask)
  }
})

let mockUserId: mongoose.Types.ObjectId
let mockOrgId: mongoose.Types.ObjectId

import { closeCarryForwardItemsForDeletedTask } from '@/lib/standup/carry-forward-service'
import { DELETE } from '@/app/api/tasks/[id]/route'

const { organization, project, member, user } = ids

let sprintId: mongoose.Types.ObjectId
let standupId: mongoose.Types.ObjectId
let taskId: mongoose.Types.ObjectId

async function seed() {
  await User.create({
    _id: user,
    firstName: 'Pat',
    lastName: 'Manager',
    email: 'pat.manager@example.test',
    password: 'hashed',
    role: 'project_manager',
    organization
  })

  await User.create({
    _id: member,
    firstName: 'Sam',
    lastName: 'Member',
    email: 'sam.member@example.test',
    password: 'hashed',
    role: 'team_member',
    organization
  })

  await Project.create({
    _id: project,
    name: 'Kanvaro Redesign',
    organization,
    createdBy: user,
    projectNumber: 1,
    teamMembers: [{ memberId: member }],
    startDate: new Date('2026-08-01T00:00:00.000Z')
  })

  const sprint = await Sprint.create({
    name: 'Sprint 31',
    organization,
    project,
    createdBy: user,
    status: 'active',
    startDate: new Date('2026-08-17T00:00:00.000Z'),
    endDate: new Date('2026-08-21T00:00:00.000Z'),
    capacity: 0,
    teamMembers: [member]
  })
  sprintId = sprint._id as mongoose.Types.ObjectId

  const standup = await Standup.create({
    project,
    sprint: sprintId,
    organization,
    standupDate: '2026-08-17',
    scheduledStartAt: new Date('2026-08-17T03:30:00.000Z'),
    durationMinutes: 15,
    sprintDayNumber: 1,
    totalSprintDays: 5,
    shape: 'day_one',
    status: 'In_Progress',
    facilitator: user,
    expectedAttendees: [member],
    version: 0
  })
  standupId = standup._id as mongoose.Types.ObjectId

  const task = await Task.create({
    title: 'Wire up the export button',
    organization,
    project,
    sprint: sprintId,
    createdBy: user,
    taskNumber: 901,
    displayId: 'KAN-901',
    status: 'in_progress',
    remainingEstimateMinutes: 240,
    originalEstimateMinutes: 240,
    assignedTo: [{ user: member }]
  })
  taskId = task._id as mongoose.Types.ObjectId
}

function invoke() {
  const request = new NextRequest(`http://localhost/api/tasks/${String(taskId)}`, {
    method: 'DELETE'
  })
  return DELETE(request, { params: { id: String(taskId) } })
}

describe('DELETE /api/tasks/:id (E64)', () => {
  useMongo()

  beforeAll(() => {
    mockUserId = user
    mockOrgId = organization
  })

  beforeEach(async () => {
    await syncIndexes(CarryForwardItem)
    hasPermission.mockReset().mockResolvedValue(true)
    await seed()
  })

  it('auto-closes an open carry-forward item when its task is hard-deleted', async () => {
    const item = await CarryForwardItem.create({
      sprint: sprintId,
      project,
      organization,
      type: 'unfinished_task',
      task: taskId,
      member,
      originStandup: standupId,
      originDate: '2026-08-17',
      currentStandup: standupId,
      status: 'open'
    })

    const response = await invoke()
    expect(response.status).toBe(200)

    const reloaded = await CarryForwardItem.findById(item._id).lean()
    expect((reloaded as any).status).toBe('closed_descoped')
    expect((reloaded as any).resolution?.resolutionType).toBe('descoped')
    expect(String((reloaded as any).resolution?.resolvedBy)).toBe(String(user))
    expect((reloaded as any).resolution?.comment).toContain(String(user))

    const deletedTask = await Task.findById(taskId).lean()
    expect(deletedTask).toBeNull()
  })

  it('leaves an already-resolved carry-forward item untouched', async () => {
    const item = await CarryForwardItem.create({
      sprint: sprintId,
      project,
      organization,
      type: 'unfinished_task',
      task: taskId,
      member,
      originStandup: standupId,
      originDate: '2026-08-17',
      currentStandup: standupId,
      status: 'resolved',
      resolution: {
        resolvedAt: new Date('2026-08-16T00:00:00.000Z'),
        resolvedBy: user,
        resolutionType: 'done'
      }
    })

    const response = await invoke()
    expect(response.status).toBe(200)

    const reloaded = await CarryForwardItem.findById(item._id).lean()
    expect((reloaded as any).status).toBe('resolved')
    expect((reloaded as any).resolution?.resolutionType).toBe('done')
  })

  it('does not error when the deleted task has no carry-forward items', async () => {
    const response = await invoke()
    expect(response.status).toBe(200)
  })

  it('still deletes the task and returns success with a warning when carry-forward cleanup fails', async () => {
    const item = await CarryForwardItem.create({
      sprint: sprintId,
      project,
      organization,
      type: 'unfinished_task',
      task: taskId,
      member,
      originStandup: standupId,
      originDate: '2026-08-17',
      currentStandup: standupId,
      status: 'open'
    })

    ;(closeCarryForwardItemsForDeletedTask as jest.Mock).mockRejectedValueOnce(
      new Error('simulated carry-forward cleanup failure')
    )

    const response = await invoke()
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.warnings).toEqual(['Failed to auto-close related carry-forward items'])

    // The task deletion itself is unaffected by the cleanup failure.
    const deletedTask = await Task.findById(taskId).lean()
    expect(deletedTask).toBeNull()

    // And the register is left exactly as inconsistent as the warning says —
    // this is what the warning exists to surface, not paper over.
    const untouched = await CarryForwardItem.findById(item._id).lean()
    expect((untouched as any).status).toBe('open')
  })
})
