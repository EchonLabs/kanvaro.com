/**
 * The Phase 7 routes (Task 8 — RUN-23, RUN-25, NFR-5, SEC-1).
 *
 * Three things are worth testing at this layer, and the suite is limited to
 * them because everything else is already proven where it lives: the write
 * rules in `allocation-service`, the detachment loop in `attendance-service`,
 * the check table in `completion-checks`.
 *
 * 1. **The version header is read, and a missing one is refused.** RUN-23's
 *    guarantee is only as strong as its weakest caller, and the failure mode of
 *    a mis-spelled header is silent: the guard degrades to "always allow"
 *    rather than erroring, which is the worst possible outcome for a
 *    concurrency control.
 * 2. **Each route is gated on the right permission**, and reading the board is
 *    a different power from filling it (SEC-1).
 * 3. **The handlers exist and opt out of static rendering**, so a board is
 *    never served from build-time cache.
 */
import fs from 'fs'
import path from 'path'

import { NextRequest } from 'next/server'

import { Permission } from '@/lib/permissions/permission-definitions'
import { requireStandupVersion, STANDUP_VERSION_HEADER } from '../route-helpers'

import * as boardRoute from '@/app/api/standups/[id]/allocations/route'
import * as rowRoute from '@/app/api/standups/[id]/allocations/[allocationId]/route'
import * as attendanceRoute from '@/app/api/standups/[id]/attendance/route'
import * as checksRoute from '@/app/api/standups/[id]/checks/route'

const requestWith = (version?: string) =>
  new NextRequest('http://localhost/api/standups/x/allocations', {
    headers: version === undefined ? {} : { [STANDUP_VERSION_HEADER]: version }
  })

const sourceOf = (relative: string) =>
  fs.readFileSync(path.join(process.cwd(), relative), 'utf8')

describe('requireStandupVersion (RUN-23)', () => {
  it('reads a valid version', () => {
    expect(requireStandupVersion(requestWith('4'))).toBe(4)
  })

  it('accepts zero — a stand-up nobody has written to yet', () => {
    expect(requireStandupVersion(requestWith('0'))).toBe(0)
  })

  it('refuses a missing header rather than defaulting to zero', () => {
    // Defaulting would let a client that has never read the stand-up win a race
    // against one that has, inverting the guarantee entirely.
    expect(() => requireStandupVersion(requestWith())).toThrow(
      /missing the stand-up version/
    )
  })

  it('refuses an empty header', () => {
    expect(() => requireStandupVersion(requestWith('   '))).toThrow(
      /missing the stand-up version/
    )
  })

  it('refuses a non-numeric header', () => {
    expect(() => requireStandupVersion(requestWith('latest'))).toThrow(/whole number/)
  })

  it('refuses a fractional header', () => {
    expect(() => requireStandupVersion(requestWith('4.5'))).toThrow(/whole number/)
  })

  it('refuses a negative header', () => {
    expect(() => requireStandupVersion(requestWith('-1'))).toThrow(/whole number/)
  })

  it('carries the catalogue code, so the client gets the §17.1 envelope', () => {
    expect(() => requireStandupVersion(requestWith())).toThrow(
      expect.objectContaining({ code: 'VALIDATION_FAILED' })
    )
  })
})

describe('the four routes', () => {
  it('expose the handlers Panel 1, Panel 5 and Panel 7 need', () => {
    expect(typeof boardRoute.GET).toBe('function')
    expect(typeof boardRoute.POST).toBe('function')
    expect(typeof rowRoute.PATCH).toBe('function')
    expect(typeof rowRoute.DELETE).toBe('function')
    expect(typeof attendanceRoute.PATCH).toBe('function')
    expect(typeof attendanceRoute.POST).toBe('function')
    expect(typeof checksRoute.GET).toBe('function')
  })

  it('opt out of static rendering, so a board is never served from build cache', () => {
    for (const route of [boardRoute, rowRoute, attendanceRoute, checksRoute]) {
      expect(route.dynamic).toBe('force-dynamic')
    }
  })
})

describe('permission gating (SEC-1)', () => {
  const board = sourceOf('src/app/api/standups/[id]/allocations/route.ts')
  const row = sourceOf('src/app/api/standups/[id]/allocations/[allocationId]/route.ts')
  const attendance = sourceOf('src/app/api/standups/[id]/attendance/route.ts')
  const checks = sourceOf('src/app/api/standups/[id]/checks/route.ts')

  it('reading the board needs only standup:view', () => {
    expect(board).toContain('Permission.STANDUP_VIEW')
    expect(checks).toContain('Permission.STANDUP_VIEW')
  })

  it('every mutation needs a stronger permission than reading', () => {
    // The board's GET and POST must not share a permission: seeing who is
    // planned to do what and deciding it are different powers.
    expect(board).toContain('Permission.STANDUP_ALLOCATE')
    expect(row).toContain('Permission.STANDUP_ALLOCATE')
    expect(attendance).toContain('Permission.STANDUP_RUN')
    expect(attendance).toContain('Permission.STANDUP_ALLOCATE')
  })

  it('gates every route through the shared wrapper, never ad hoc', () => {
    for (const source of [board, row, attendance, checks]) {
      expect(source).toContain('withStandupIdPermission')
    }
  })

  it('reads the version on every mutating route and no read-only one', () => {
    expect(board).toContain('requireStandupVersion')
    expect(row).toContain('requireStandupVersion')
    expect(attendance).toContain('requireStandupVersion')
    // A GET has nothing to guard against, and demanding a header would make the
    // board unreadable until the client had already read it.
    expect(checks).not.toContain('requireStandupVersion')
  })
})

describe('the role matrix behind those permissions (NFR-13, SEC-1)', () => {
  const {
    PROJECT_ROLE_PERMISSIONS,
    ProjectRole
  } = require('@/lib/permissions/permission-definitions')

  it('lets a Project Manager fill the board', () => {
    expect(PROJECT_ROLE_PERMISSIONS[ProjectRole.PROJECT_MANAGER]).toContain(
      Permission.STANDUP_ALLOCATE
    )
  })

  it('does not let a project member allocate for other people', () => {
    // ALO-23 self-select is `standup:allocate_own`, a different grant, and its
    // surface is Phase 11.
    expect(PROJECT_ROLE_PERMISSIONS[ProjectRole.PROJECT_MEMBER]).not.toContain(
      Permission.STANDUP_ALLOCATE
    )
  })

  it('does not let a project viewer touch anything', () => {
    for (const permission of [
      Permission.STANDUP_ALLOCATE,
      Permission.STANDUP_RUN,
      Permission.STANDUP_ALLOCATE_OWN
    ]) {
      expect(PROJECT_ROLE_PERMISSIONS[ProjectRole.PROJECT_VIEWER]).not.toContain(permission)
    }
  })
})

// --- Appended to src/lib/standup/__tests__/allocation-routes.test.ts ---
import mongoose from 'mongoose'
import { Standup } from '@/models/Standup'
import { Task } from '@/models/Task'
import { Allocation } from '@/models/Allocation'
import { ProjectStandupSettings } from '@/models/ProjectStandupSettings'
import { WorkingCalendar } from '@/models/WorkingCalendar'
import { ids, useMongo } from './helpers/mongo'

const hasPermission2 = jest.fn()

jest.mock('@/lib/db-config', () => ({
  __esModule: true,
  default: jest.fn().mockResolvedValue(undefined)
}))
jest.mock('@/lib/auth-utils', () => ({
  authenticateUser: jest.fn(async () => ({
    user: { id: String(mockMemberId2), organization: String(mockOrgId2) }
  }))
}))
jest.mock('@/lib/permissions/permission-service', () => ({
  PermissionService: {
    hasPermission: (...args: unknown[]) => hasPermission2(...args),
    requireProjectAccess: jest.fn().mockResolvedValue(undefined)
  }
}))

let mockMemberId2: mongoose.Types.ObjectId
let mockOrgId2: mongoose.Types.ObjectId

import * as boardRouteLive from '@/app/api/standups/[id]/allocations/route'

const { organization: org2, project: proj2, sprint: spr2, member: mem2 } = ids

async function seedSelfSelectFixture(overrides: Record<string, unknown> = {}) {
  await WorkingCalendar.create({
    scope: 'project',
    organization: org2,
    project: proj2,
    workingDaysOfWeek: [1, 2, 3, 4, 5],
    standardMinutesPerDay: 480,
    timezone: 'Asia/Colombo',
    subscribedHolidaySets: [],
    overrides: []
  })
  await ProjectStandupSettings.create({
    project: proj2,
    organization: org2,
    enabled: true,
    standupLocalTime: '09:00',
    defaultFacilitator: mem2,
    allowSelfSelect: true
  })
  const standup = await Standup.create({
    project: proj2,
    sprint: spr2,
    organization: org2,
    standupDate: '2026-09-05',
    scheduledStartAt: new Date('2026-09-05T03:30:00.000Z'),
    durationMinutes: 15,
    sprintDayNumber: 3,
    totalSprintDays: 5,
    shape: 'mid_sprint',
    status: 'Ready',
    facilitator: mem2,
    expectedAttendees: [mem2],
    ...overrides
  })
  const task = await Task.create({
    title: 'Pool task',
    description: '',
    status: 'todo',
    priority: 'medium',
    type: 'task',
    organization: org2,
    project: proj2,
    sprint: spr2,
    taskNumber: 1,
    displayId: 'KAN-1',
    createdBy: mem2,
    remainingEstimateMinutes: 60,
    labels: [],
    dependencies: [],
    attachments: []
  })
  return { standup, task }
}

const buildPost = (url: string, body: unknown, version = 0) =>
  new (require('next/server').NextRequest)(`http://localhost${url}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      [STANDUP_VERSION_HEADER]: String(version)
    },
    body: JSON.stringify(body)
  })

describe('POST /api/standups/:id/allocations — self-select and top-up (ALO-22/23)', () => {
  useMongo()

  beforeAll(() => {
    mockMemberId2 = mem2
    mockOrgId2 = org2
  })

  beforeEach(() => {
    hasPermission2.mockReset().mockResolvedValue(true)
  })

  it('lets a member self-select a task onto their own day', async () => {
    const { standup, task } = await seedSelfSelectFixture()

    const response = await boardRouteLive.POST(
      buildPost(`/api/standups/${standup._id}/allocations`, {
        memberId: String(mem2),
        taskId: String(task._id),
        selfSelect: true
      }),
      { params: { id: String(standup._id) } }
    )
    const payload = await response.json()

    expect(response.status).toBe(201)
    expect(payload.data.allocation.source).toBe('self_selected')
  })

  it('refuses a member self-selecting onto somebody else\'s day', async () => {
    const { standup, task } = await seedSelfSelectFixture({
      expectedAttendees: [mem2, ids.otherMember]
    })

    const response = await boardRouteLive.POST(
      buildPost(`/api/standups/${standup._id}/allocations`, {
        memberId: String(ids.otherMember),
        taskId: String(task._id),
        selfSelect: true
      }),
      { params: { id: String(standup._id) } }
    )

    expect(response.status).toBe(422)
  })

  it('refuses the POST outright when the caller holds neither allocate permission', async () => {
    const { standup, task } = await seedSelfSelectFixture()
    hasPermission2.mockResolvedValue(false)

    const response = await boardRouteLive.POST(
      buildPost(`/api/standups/${standup._id}/allocations`, {
        memberId: String(mem2),
        taskId: String(task._id),
        selfSelect: true
      }),
      { params: { id: String(standup._id) } }
    )

    expect(response.status).toBe(403)
  })

  it('lets a top-up add to a Completed stand-up with a reason (ALO-22)', async () => {
    const { standup, task } = await seedSelfSelectFixture({ status: 'Completed', version: 1 })

    const response = await boardRouteLive.POST(
      buildPost(
        `/api/standups/${standup._id}/allocations`,
        {
          memberId: String(mem2),
          taskId: String(task._id),
          topUp: { reason: 'Extra work done, forgot to log it' }
        },
        1
      ),
      { params: { id: String(standup._id) } }
    )
    const payload = await response.json()

    expect(response.status).toBe(201)
    expect(payload.data.allocation.addedAfterCompletion).toBe(true)
  })

  it('rejects a top-up with an empty reason', async () => {
    const { standup, task } = await seedSelfSelectFixture({ status: 'Completed', version: 1 })

    const response = await boardRouteLive.POST(
      buildPost(
        `/api/standups/${standup._id}/allocations`,
        { memberId: String(mem2), taskId: String(task._id), topUp: { reason: '' } },
        1
      ),
      { params: { id: String(standup._id) } }
    )

    expect(response.status).toBe(422)
  })

  it('refuses a member holding only allocate_own from acting on someone else\'s row', async () => {
    // The outer gate (standup:allocate_own) still passes — only the route's
    // own inner standup:allocate check must fail, in isolation from the outer
    // one, or this proves nothing about the new branch. The route throws this
    // refusal as a StandupError('VALIDATION_FAILED', ...), which the catalogue
    // (errors.ts) maps to 422, not a raw 403 — same shape as createAllocation's
    // own ALO-23 ownership check, and asserted on message too so this failure
    // is distinguishable from that one: selfSelect is not set here, so
    // createAllocation's ownership branch never even runs — this 422 can only
    // have come from the route's new inner check.
    hasPermission2.mockImplementation(
      async (_userId: string, permission: string) => permission !== Permission.STANDUP_ALLOCATE
    )
    const { standup, task } = await seedSelfSelectFixture({
      expectedAttendees: [mem2, ids.otherMember]
    })

    const response = await boardRouteLive.POST(
      buildPost(`/api/standups/${standup._id}/allocations`, {
        memberId: String(ids.otherMember),
        taskId: String(task._id)
      }),
      { params: { id: String(standup._id) } }
    )
    const payload = await response.json()

    expect(response.status).toBe(422)
    expect(payload.error.message).toBe('You can only add work to your own day.')
  })

  it('refuses a member holding only allocate_own from topping up their own row', async () => {
    // Same isolation as above: no selfSelect on this request, so the only way
    // this call could 422 with this message is the route's inner
    // standup:allocate check refusing the topUp — createAllocation's own
    // ownership check is not in play, since it only fires for selfSelect.
    hasPermission2.mockImplementation(
      async (_userId: string, permission: string) => permission !== Permission.STANDUP_ALLOCATE
    )
    const { standup, task } = await seedSelfSelectFixture({ status: 'Completed', version: 1 })

    const response = await boardRouteLive.POST(
      buildPost(
        `/api/standups/${standup._id}/allocations`,
        {
          memberId: String(mem2),
          taskId: String(task._id),
          topUp: { reason: 'Extra work done, forgot to log it' }
        },
        1
      ),
      { params: { id: String(standup._id) } }
    )
    const payload = await response.json()

    expect(response.status).toBe(422)
    expect(payload.error.message).toBe('You can only add work to your own day.')
  })

  it('lets a PM allocate an ordinary task to a different member end to end', async () => {
    // hasPermission2 resolves true for every permission here (beforeEach's
    // default), simulating a caller who holds the full standup:allocate — the
    // regression this task must not break: a PM allocating to somebody else,
    // with no selfSelect and no topUp, must still succeed exactly as before.
    const { standup, task } = await seedSelfSelectFixture({
      expectedAttendees: [mem2, ids.otherMember]
    })

    const response = await boardRouteLive.POST(
      buildPost(`/api/standups/${standup._id}/allocations`, {
        memberId: String(ids.otherMember),
        taskId: String(task._id)
      }),
      { params: { id: String(standup._id) } }
    )
    const payload = await response.json()

    expect(response.status).toBe(201)
    expect(payload.data.allocation.source).toBe('assigned_in_standup')
  })
})
