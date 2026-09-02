/**
 * The completion saga (Phase 10, Task 16 — RUN-19..22).
 *
 * Per the parent plan's own exit criteria, the failure-injection + resume
 * test (AC-26) is written before the happy path: it is the one that proves
 * R2's mitigation — "a partial completion is never persisted, and a `resume`
 * genuinely resumes rather than re-running or skipping" — actually holds
 * against the real `runSaga`, not just that the saga compiles.
 */
import mongoose from 'mongoose'

import { Allocation } from '@/models/Allocation'
import { AllocationVariance } from '@/models/AllocationVariance'
import { CarryForwardItem, OPEN_CARRY_FORWARD_STATUSES } from '@/models/CarryForwardItem'
import { EstimateDebtLedger } from '@/models/EstimateDebtLedger'
import { Sprint } from '@/models/Sprint'
import { Standup } from '@/models/Standup'
import { StandupSummary } from '@/models/StandupSummary'
import { Task } from '@/models/Task'

import { notificationService } from '@/lib/notification-service'

import { runCompletionSaga, type CompletionContext } from '../completion-saga'
// SWC compiles named exports to non-configurable accessor properties, so
// `jest.spyOn(varianceService, 'classifyAndPost')` throws "Cannot redefine
// property". `jest.mock` with a factory that wraps the real implementation in
// `jest.fn(...)` is what actually lets the AC-26 test inject one failure and
// then let the real function run on resume.
import { classifyAndPost } from '../variance-service'
import { alreadyCompleted, staleStandup } from '../errors'
import { minutes } from '../minutes'
import { ids, syncIndexes, useMongo } from './helpers/mongo'

jest.mock('../variance-service', () => {
  const actual = jest.requireActual('../variance-service')
  return { ...actual, classifyAndPost: jest.fn(actual.classifyAndPost) }
})

const classifyAndPostMock = classifyAndPost as jest.MockedFunction<typeof classifyAndPost>

const { organization, project, member, otherMember, user } = ids

let sprintId: mongoose.Types.ObjectId

async function seedSprint() {
  const sprint = await Sprint.create({
    name: 'Sprint 16',
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
    status: dayNumber === 1 ? 'Completed' : 'In_Progress',
    facilitator: user,
    expectedAttendees: [member, otherMember],
    version: 0,
    ...overrides
  })
}

let taskCounter = 900

async function seedTask(overrides: Record<string, unknown> = {}) {
  taskCounter += 1
  return Task.create({
    title: 'Saga task',
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

/** A fully-passing check input — this suite is about the saga, not the checks. */
function passingCheckInput() {
  return {
    shape: 'mid_sprint' as const,
    members: [],
    variance: [],
    carryForward: [],
    blockers: [],
    sprintHealth: { remainingEstimateMinutes: minutes(0), remainingCapacityMinutes: minutes(1000) }
  }
}

function baseContext(overrides: Partial<CompletionContext> = {}): Omit<CompletionContext, 'standupId' | 'expectedVersion'> {
  return {
    runId: 'run-1',
    sprintId: String(sprintId),
    projectId: String(project),
    organizationId: String(organization),
    completedBy: String(user),
    checkInput: passingCheckInput(),
    attendeeIds: [String(member)],
    adminRecipientIds: [String(user)],
    memberCommitments: [{ memberId: String(member), hasAnyAllocation: true }],
    summaryInputs: {
      headerFacts: {
        standupDate: '2026-08-18',
        dayNumber: 2,
        totalDays: 5,
        facilitatorName: 'Facilitator',
        durationMinutes: 15
      },
      attendance: [],
      completedYesterday: [],
      varianceTable: [],
      debtMovements: [],
      memberCommitments: [],
      blockersRaised: [],
      blockersResolved: [],
      carryForwardState: [],
      overridesIssued: []
    },
    summaryUrl: '/standups/summary',
    ...overrides
  }
}

let createNotification: jest.SpyInstance

beforeEach(() => {
  createNotification = jest
    .spyOn(notificationService, 'createNotification')
    .mockResolvedValue({ _id: 'notification' } as any)
})

afterEach(() => {
  createNotification.mockRestore()
  jest.restoreAllMocks()
})

describe('runCompletionSaga', () => {
  useMongo()

  beforeEach(async () => {
    await syncIndexes(CarryForwardItem, Allocation, AllocationVariance, StandupSummary, EstimateDebtLedger)
    await seedSprint()
  })

  // --- AC-26, written first per the plan's own exit criteria ---------------

  it('AC-26/R2: a mid-saga failure leaves no partial completion, and a second call resumes without repeating finished steps', async () => {
    const day1 = await seedStandup('2026-08-17', 1)
    const day2 = await seedStandup('2026-08-18', 2)
    const task = await seedTask()
    await seedAllocation(day1._id, task._id)
    await seedAllocation(day2._id, task._id)

    const freezeSpy = jest.spyOn(Allocation, 'updateMany')
    classifyAndPostMock.mockRejectedValueOnce(new Error('boom: injected classify-and-post failure'))

    const ctx: CompletionContext = {
      ...baseContext(),
      standupId: String(day2._id),
      expectedVersion: 0
    }

    await expect(runCompletionSaga(ctx)).rejects.toThrow('boom')

    // Nothing after the injected failure ran, and nothing before it was undone.
    const afterFailure = await Standup.findById(day2._id).lean()
    expect(afterFailure!.status).toBe('In_Progress')
    expect(afterFailure!.completionState).toBeDefined()
    expect(afterFailure!.completionState!.lastCompletedStep).toBe('freeze-allocations')
    expect(await StandupSummary.countDocuments({ standup: day2._id })).toBe(0)
    expect(freezeSpy).toHaveBeenCalledTimes(1)

    // Resume: `mockRejectedValueOnce` only overrides the next single call, so
    // the mock already falls back to the real implementation here.
    const result = await runCompletionSaga(ctx)

    expect(result.status).toBe('completed')
    expect(result.summaryId).toBeTruthy()

    // The step before the failure did not run again on resume.
    expect(freezeSpy).toHaveBeenCalledTimes(1)

    const completed = await Standup.findById(day2._id).lean()
    expect(completed!.status).toBe('Completed')
    expect(completed!.completionState).toBeUndefined()
    expect(await StandupSummary.countDocuments({ standup: day2._id })).toBe(1)
  })

  // --- The happy path -------------------------------------------------------

  it('completes a stand-up end to end: status flips, one summary is persisted, checkpoint clears', async () => {
    const day1 = await seedStandup('2026-08-17', 1)
    const day2 = await seedStandup('2026-08-18', 2)
    const task = await seedTask()
    await seedAllocation(day1._id, task._id)
    await seedAllocation(day2._id, task._id)

    const ctx: CompletionContext = {
      ...baseContext(),
      standupId: String(day2._id),
      expectedVersion: 0
    }

    const result = await runCompletionSaga(ctx)

    expect(result.status).toBe('completed')

    const standup = await Standup.findById(day2._id).lean()
    expect(standup!.status).toBe('Completed')
    expect(standup!.completedAt).toBeDefined()
    expect(standup!.completionState).toBeUndefined()
    expect(standup!.version).toBe(1)

    expect(await StandupSummary.countDocuments({ standup: day2._id })).toBe(1)

    const allocations = await Allocation.find({ standup: day2._id }).lean()
    expect(allocations.every((row) => row.frozenAt)).toBe(true)
  })

  // --- RUN-22 / double submission -------------------------------------------

  it('RUN-22: a second completion attempt on an already-completed stand-up rejects and changes nothing', async () => {
    const day1 = await seedStandup('2026-08-17', 1)
    const day2 = await seedStandup('2026-08-18', 2)
    const task = await seedTask()
    await seedAllocation(day1._id, task._id)
    await seedAllocation(day2._id, task._id)

    const ctx: CompletionContext = {
      ...baseContext(),
      standupId: String(day2._id),
      expectedVersion: 0
    }

    await runCompletionSaga(ctx)
    const summaryCountAfterFirst = await StandupSummary.countDocuments({ standup: day2._id })

    await expect(runCompletionSaga({ ...ctx, expectedVersion: 1 })).rejects.toMatchObject({
      code: alreadyCompleted().code
    })

    expect(await StandupSummary.countDocuments({ standup: day2._id })).toBe(summaryCountAfterFirst)
  })

  // --- RUN-23 reused / stale version ----------------------------------------

  it('RUN-23: a stale expectedVersion rejects before any step runs', async () => {
    const day1 = await seedStandup('2026-08-17', 1)
    const day2 = await seedStandup('2026-08-18', 2)
    const task = await seedTask()
    await seedAllocation(day1._id, task._id)
    await seedAllocation(day2._id, task._id)

    const ctx: CompletionContext = {
      ...baseContext(),
      standupId: String(day2._id),
      expectedVersion: 99
    }

    await expect(runCompletionSaga(ctx)).rejects.toMatchObject({ code: staleStandup(0).code })

    const standup = await Standup.findById(day2._id).lean()
    expect(standup!.status).toBe('In_Progress')
    // The schema's nested `lastCompletedStep` default materialises the
    // subdocument on creation even though no saga run ever touched it — a run
    // is only "in flight" once `runId` is set, which the guard clause above
    // never reaches.
    expect(standup!.completionState?.runId).toBeUndefined()
    expect(standup!.completionState?.lastCompletedStep ?? null).toBeNull()
    expect(await StandupSummary.countDocuments({ standup: day2._id })).toBe(0)
  })

  // --- INV-6 -----------------------------------------------------------------

  it('INV-6: every allocation on the classified (previous) stand-up gets exactly one AllocationVariance', async () => {
    const day1 = await seedStandup('2026-08-17', 1)
    const day2 = await seedStandup('2026-08-18', 2)
    const task1 = await seedTask()
    const task2 = await seedTask()
    await seedAllocation(day1._id, task1._id)
    await seedAllocation(day1._id, task2._id, { plannedMinutes: 120 })
    await seedAllocation(day2._id, task1._id)

    const ctx: CompletionContext = {
      ...baseContext(),
      standupId: String(day2._id),
      expectedVersion: 0
    }

    await runCompletionSaga(ctx)

    const day1AllocationCount = await Allocation.countDocuments({ standup: day1._id })
    const varianceCount = await AllocationVariance.countDocuments({ standup: day1._id })
    expect(varianceCount).toBe(day1AllocationCount)
  })

  // --- INV-8 -----------------------------------------------------------------

  it('INV-8: every undisposed carry-forward item from the completed stand-up appears on the register', async () => {
    const day1 = await seedStandup('2026-08-17', 1)
    const day2 = await seedStandup('2026-08-18', 2)
    // A task nobody finishes stays open, so it must land on the register as
    // `unfinished_task` once day2 completes and builds its carry-forward set.
    const task = await seedTask({ status: 'in_progress' })
    await seedAllocation(day1._id, task._id)
    await seedAllocation(day2._id, task._id)

    const ctx: CompletionContext = {
      ...baseContext(),
      standupId: String(day2._id),
      expectedVersion: 0
    }

    await runCompletionSaga(ctx)

    const openItems = await CarryForwardItem.find({
      sprint: sprintId,
      status: { $in: OPEN_CARRY_FORWARD_STATUSES }
    }).lean()

    const undisposed = openItems.filter((item) => !item.resolution)
    expect(undisposed.length).toBeGreaterThan(0)
    for (const item of undisposed) {
      expect(OPEN_CARRY_FORWARD_STATUSES).toContain(item.status)
    }
  })
})
