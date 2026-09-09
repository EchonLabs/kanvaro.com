/**
 * E60 — wiring member-removal into the carry-forward register.
 *
 * The audit found that removing a member from a project
 * (`src/app/api/members/route.ts`'s `DELETE`, a `Project.teamMembers` `$pull`)
 * had zero interaction with `Allocation` or `CarryForwardItem`: a removed
 * member's still-open allocations on a live (non-`Completed`) stand-up were
 * simply orphaned, pointing at someone no longer on the project, with no
 * register entry ever created — unlike a daily absence mark, which correctly
 * detaches the row via `attendance-service.ts` for the completion-time sweep
 * in `carry-forward-service.ts` to pick up.
 *
 * Removal is not a stand-up's own completion event, so it cannot rely on that
 * later sweep — the member may never attend another stand-up to trigger it.
 * This exercises the real `DELETE /api/members` handler end to end (mocking
 * only the auth/permission layer, the same way `complete-route.test.ts`
 * does) and asserts it both detaches the allocation exactly the way
 * `attendance-service.ts` does, and opens the `owner_absent` register item
 * immediately rather than waiting on a sweep that may never run.
 */
import mongoose from 'mongoose'
import { NextRequest } from 'next/server'

import { Allocation } from '@/models/Allocation'
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

let mockUserId: mongoose.Types.ObjectId
let mockOrgId: mongoose.Types.ObjectId

import { DELETE } from '@/app/api/members/route'

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
    name: 'Sprint 30',
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
    title: 'Reconciliation',
    organization,
    project,
    sprint: sprintId,
    createdBy: user,
    taskNumber: 900,
    displayId: 'KAN-900',
    status: 'in_progress',
    remainingEstimateMinutes: 240,
    originalEstimateMinutes: 240,
    assignedTo: [{ user: member }]
  })
  taskId = task._id as mongoose.Types.ObjectId
}

function invoke() {
  const request = new NextRequest(`http://localhost/api/members?memberId=${String(member)}`, {
    method: 'DELETE'
  })
  return DELETE(request)
}

describe('DELETE /api/members (E60)', () => {
  useMongo()

  beforeAll(() => {
    mockUserId = user
    mockOrgId = organization
  })

  beforeEach(async () => {
    await syncIndexes(Allocation, CarryForwardItem)
    hasPermission.mockReset().mockResolvedValue(true)
    await seed()
  })

  it('converts a removed members open allocation into an owner_absent carry-forward item', async () => {
    const allocation = await Allocation.create({
      standup: standupId,
      sprint: sprintId,
      project,
      organization,
      member,
      task: taskId,
      plannedMinutes: 240,
      source: 'assigned_in_standup',
      createdBy: user
    })

    const response = await invoke()
    expect(response.status).toBe(200)

    const detached = await Allocation.findById(allocation._id).lean()
    expect((detached as any).detachedReason).toBe('owner_absent')
    expect((detached as any).excludedFromCapacity).toBe(true)

    const item = await CarryForwardItem.findOne({ task: taskId, member }).lean()
    expect(item).toBeTruthy()
    expect((item as any).type).toBe('owner_absent')
    expect((item as any).tags).toContain('owner_absent')
    expect((item as any).status).toBe('open')

    const proj = await Project.findById(project).lean()
    expect((proj as any).teamMembers.some((row: any) => String(row.memberId) === String(member))).toBe(false)
  })

  it('does not touch an allocation on an already-completed stand-up', async () => {
    await Standup.updateOne({ _id: standupId }, { $set: { status: 'Completed' } })

    const allocation = await Allocation.create({
      standup: standupId,
      sprint: sprintId,
      project,
      organization,
      member,
      task: taskId,
      plannedMinutes: 240,
      source: 'assigned_in_standup',
      createdBy: user
    })

    const response = await invoke()
    expect(response.status).toBe(200)

    const untouched = await Allocation.findById(allocation._id).lean()
    expect((untouched as any).detachedReason).toBeUndefined()

    const item = await CarryForwardItem.findOne({ task: taskId, member }).lean()
    expect(item).toBeNull()
  })
})
