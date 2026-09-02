/**
 * `POST /api/standups/:id/complete` (Task 17 — RUN-19..22, §17.6, §17.8).
 *
 * Real handler invocation against a real (in-memory) database, mirroring
 * `completion-saga.integration.test.ts`'s own approach rather than
 * source-inspection: `withStandupIdPermission`'s auth layer is mocked (the
 * same way `override-routes.test.ts` and `blocker-routes.test.ts` mock it),
 * but `Standup`, `Sprint`, the board loader, the checks evaluator and the
 * saga itself all run for real. That is the only way to prove
 * `assembleCompletionContext` actually wires a *usable* `CompletionContext`
 * together — a mocked saga would only prove the route calls a function
 * named `runCompletionSaga`, not that the object it hands over is real.
 *
 * A day-one stand-up with its one expected attendee marked `absent_planned`
 * and nothing allocated is deliberately the fixture for the passing cases:
 * an absent member's capacity is `unavailable`, which CC-1/CC-6 never flag,
 * and an empty allocation list trivially satisfies CC-2/CC-5/CC-10 — so the
 * only thing standing in the way of a clean complete is CC-7 (attendance),
 * which the fixture sets. That keeps the seed small while still exercising
 * every loader `assembleCompletionContext` calls (the board, the variance
 * panel, the carry-forward panel, blockers, sprint health, admin lookup).
 */
import mongoose from 'mongoose'
import { NextRequest } from 'next/server'

import { Allocation } from '@/models/Allocation'
import { Sprint } from '@/models/Sprint'
import { Standup } from '@/models/Standup'
import { StandupOverride } from '@/models/StandupOverride'
import { StandupSummary } from '@/models/StandupSummary'
import { Task } from '@/models/Task'

import { notificationService } from '@/lib/notification-service'
import { STANDUP_VERSION_HEADER } from '@/lib/standup/version-header'

import { ids, syncIndexes, useMongo } from './helpers/mongo'

// --- Mocks for the auth/permission layer only -------------------------------
// Everything below this (Standup, the board loader, the checks evaluator, the
// saga) runs for real against the in-memory database. Declared at module
// scope so Jest's hoisting places these above the static `route` import.
const hasPermission = jest.fn()
const requireProjectAccess = jest.fn()

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
    hasPermission: (...args: unknown[]) => hasPermission(...args),
    requireProjectAccess: (...args: unknown[]) => requireProjectAccess(...args)
  }
}))

// AC-26-style resume test: inject one failure into `classifyAndPost` so a
// completion attempt dies mid-saga, the same technique
// `completion-saga.integration.test.ts` uses and for the same reason (SWC
// compiles named exports to non-configurable accessors, so `jest.spyOn`
// directly on the module throws).
jest.mock('@/lib/standup/variance-service', () => {
  const actual = jest.requireActual('@/lib/standup/variance-service')
  return { ...actual, classifyAndPost: jest.fn(actual.classifyAndPost) }
})

// `ids` is only populated once `helpers/mongo` is imported below — but the
// auth mock factory above is hoisted before that import executes, so it
// cannot close over `ids` directly. A `mock`-prefixed mutable binding, set in
// `beforeAll`, is what babel-plugin-jest-hoist allows a mock factory to read.
let mockUserId: mongoose.Types.ObjectId
let mockOrgId: mongoose.Types.ObjectId

import * as completeRoute from '@/app/api/standups/[id]/complete/route'
import { classifyAndPost } from '@/lib/standup/variance-service'

const classifyAndPostMock = classifyAndPost as jest.MockedFunction<typeof classifyAndPost>

const { organization, project, member, otherMember, user } = ids

let sprintId: mongoose.Types.ObjectId

async function seedSprint() {
  const sprint = await Sprint.create({
    name: 'Sprint 20',
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

/** A day-one stand-up, its attendee absent, nothing allocated — see the module docblock. */
async function seedCleanStandup(overrides: Record<string, unknown> = {}) {
  return Standup.create({
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
    attendance: [{ user: member, state: 'absent_planned' }],
    version: 0,
    ...overrides
  })
}

function buildRequest(standupId: string, version: number, body: Record<string, unknown> = {}) {
  return new NextRequest(`http://localhost/api/standups/${standupId}/complete`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      [STANDUP_VERSION_HEADER]: String(version)
    },
    body: JSON.stringify(body)
  })
}

const invoke = (standupId: string, version: number, body: Record<string, unknown> = {}) =>
  completeRoute.POST(buildRequest(standupId, version, body), { params: { id: standupId } })

let createNotification: jest.SpyInstance

beforeAll(() => {
  mockUserId = user
  mockOrgId = organization
})

beforeEach(() => {
  hasPermission.mockReset().mockResolvedValue(true)
  requireProjectAccess.mockReset().mockResolvedValue(undefined)
  createNotification = jest
    .spyOn(notificationService, 'createNotification')
    .mockResolvedValue({ _id: 'notification' } as any)
})

afterEach(() => {
  createNotification.mockRestore()
  classifyAndPostMock.mockClear()
})

describe('POST /api/standups/:id/complete', () => {
  useMongo()

  beforeEach(async () => {
    await syncIndexes(StandupSummary)
    await seedSprint()
  })

  it('exposes the handler CompletionPanel/StandupRunScreen need', () => {
    expect(typeof completeRoute.POST).toBe('function')
    expect(completeRoute.dynamic).toBe('force-dynamic')
  })

  it('completes a clean stand-up end to end: 200, a real summaryId, status flips', async () => {
    const standup = await seedCleanStandup()

    const response = await invoke(String(standup._id), 0)
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.status).toBe('completed')
    expect(payload.standupId).toBe(String(standup._id))
    expect(typeof payload.summaryId).toBe('string')
    expect(payload.summaryId.length).toBeGreaterThan(0)

    const after = await Standup.findById(standup._id).lean()
    expect(after!.status).toBe('Completed')
    expect(after!.completionState).toBeUndefined()

    expect(await StandupSummary.countDocuments({ standup: standup._id })).toBe(1)
  })

  it('RUN-23: a stale expectedVersion 409s with STALE_STANDUP and writes nothing', async () => {
    const standup = await seedCleanStandup()

    const response = await invoke(String(standup._id), 99)
    const payload = await response.json()

    expect(response.status).toBe(409)
    expect(payload.error.code).toBe('STALE_STANDUP')

    const after = await Standup.findById(standup._id).lean()
    expect(after!.status).toBe('In_Progress')
    expect(await StandupSummary.countDocuments({ standup: standup._id })).toBe(0)
  })

  it('RUN-19/§17.8: a failing hard check 422s with COMPLETION_CHECKS_FAILED and the failing-check shape, writing nothing', async () => {
    // CC-7: an expected attendee with no attendance recorded at all.
    const standup = await seedCleanStandup({ attendance: [] })

    const response = await invoke(String(standup._id), 0)
    const payload = await response.json()

    expect(response.status).toBe(422)
    expect(payload.error.code).toBe('COMPLETION_CHECKS_FAILED')

    const failing = payload.error.details.failingChecks
    expect(Array.isArray(failing)).toBe(true)
    const cc7 = failing.find((check: any) => check.checkId === 'CC-7')
    expect(cc7).toMatchObject({
      checkId: 'CC-7',
      status: 'fail',
      hard: true,
      overridable: false
    })
    expect(typeof cc7.message).toBe('string')
    expect(Array.isArray(cc7.entities)).toBe(true)

    const after = await Standup.findById(standup._id).lean()
    expect(after!.status).toBe('In_Progress')
    expect(await StandupSummary.countDocuments({ standup: standup._id })).toBe(0)
  })

  it('RUN-22/E55: completing an already-completed stand-up 409s with STANDUP_ALREADY_COMPLETED and changes nothing (double-click safety)', async () => {
    const standup = await seedCleanStandup()

    const first = await invoke(String(standup._id), 0)
    expect(first.status).toBe(200)

    const summaryCountAfterFirst = await StandupSummary.countDocuments({ standup: standup._id })

    // A double-click sends whatever version the client still holds — either
    // the pre-completion version or one it raced to read back — but the
    // saga's own guard checks `status === 'Completed'` before it ever looks
    // at the version, so either way this must refuse.
    const second = await invoke(String(standup._id), 1)
    const secondPayload = await second.json()

    expect(second.status).toBe(409)
    expect(secondPayload.error.code).toBe('STANDUP_ALREADY_COMPLETED')

    expect(await StandupSummary.countDocuments({ standup: standup._id })).toBe(
      summaryCountAfterFirst
    )
  })

  it('reuses the in-flight runId across a resumed call, so the saga actually resumes rather than restarting', async () => {
    const standup = await seedCleanStandup()
    const freezeSpy = jest.spyOn(Allocation, 'updateMany')
    classifyAndPostMock.mockRejectedValueOnce(new Error('boom: injected classify-and-post failure'))

    const first = await invoke(String(standup._id), 0)
    expect(first.status).toBe(500)

    const afterFailure = await Standup.findById(standup._id).lean()
    expect(afterFailure!.status).toBe('In_Progress')
    expect(afterFailure!.completionState?.lastCompletedStep).toBe('freeze-allocations')
    expect(freezeSpy).toHaveBeenCalledTimes(1)

    // Resume: `mockRejectedValueOnce` only overrides the next single call, so
    // the mock already falls back to the real implementation here.
    const second = await invoke(String(standup._id), 0)
    expect(second.status).toBe(200)

    // If `assembleCompletionContext` had minted a fresh runId instead of
    // reusing `standup.completionState.runId`, `standupCheckpoint.load` would
    // read "no prior run" and the saga would restart from
    // `freeze-allocations` — a second call to `Allocation.updateMany`. See
    // `completion-saga.ts`'s module docblock.
    expect(freezeSpy).toHaveBeenCalledTimes(1)

    const completed = await Standup.findById(standup._id).lean()
    expect(completed!.status).toBe('Completed')
    expect(completed!.completionState).toBeUndefined()
  })

  // --- Task 21 / AC-10: assembleCompletionContext must populate the richer
  // overridesIssued shape (affectedMemberIds/affectedTaskIds) from the real
  // StandupOverride documents, not just {overrideId, type} — otherwise the
  // saga's reconciliation always sees empty arrays and never actually unblocks
  // anything, even though the saga-level unit tests pass.

  it('AC-10: a present, unallocated member blocks completion on CC-1, and a matching under_allocation override (read from a real StandupOverride document) unblocks it', async () => {
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
      attendance: [{ user: member, state: 'present' }],
      version: 0
    })

    // A real, but small, allocation: `allocationStatus` treats zero allocated
    // minutes as `zero` (not `under`), so CC-1's own offender needs *some*
    // hours planned, just far short of the member's nominal capacity.
    const task = await Task.create({
      title: 'Route test task',
      organization,
      project,
      sprint: sprintId,
      createdBy: user,
      taskNumber: 9001,
      displayId: 'KAN-9001',
      status: 'in_progress',
      remainingEstimateMinutes: 100,
      originalEstimateMinutes: 100,
      assignedTo: [{ user: member }]
    })
    await Allocation.create({
      standup: standup._id,
      sprint: sprintId,
      project,
      organization,
      member,
      task: task._id,
      plannedMinutes: 100,
      source: 'assigned_in_standup',
      excludedFromCapacity: false,
      createdBy: user
    })

    const blocked = await invoke(String(standup._id), 0)
    const blockedPayload = await blocked.json()
    expect(blocked.status).toBe(422)
    expect(blockedPayload.error.code).toBe('COMPLETION_CHECKS_FAILED')
    const cc1 = blockedPayload.error.details.failingChecks.find((c: any) => c.checkId === 'CC-1')
    expect(cc1).toBeDefined()
    expect(cc1.entities).toEqual([expect.objectContaining({ memberId: String(member) })])

    await StandupOverride.create({
      standup: standup._id,
      sprint: sprintId,
      project,
      organization,
      type: 'under_allocation',
      affectedMemberIds: [member],
      affectedTaskIds: [],
      reasonCode: 'blocked_capacity',
      justification: "All of this member's remaining work is blocked on the vendor sandbox today.",
      gapMinutes: 480,
      issuedBy: user
    })

    const unblocked = await invoke(String(standup._id), 0)
    const unblockedPayload = await unblocked.json()
    expect(unblocked.status).toBe(200)
    expect(unblockedPayload.status).toBe('completed')

    const after = await Standup.findById(standup._id).lean()
    expect(after!.status).toBe('Completed')
  })
})
