/**
 * The day outcome write-back, and the two `persist-summary` hardenings.
 *
 * A stand-up's record is frozen when its meeting completes, at the start of
 * the working day, so it can only hold the plan. The next stand-up's
 * completion knows how that plan went (its variance step classified it) and
 * writes `dayOutcome` back onto the earlier record. These tests pin that the
 * write is additive: it never creates a record, never touches the frozen
 * fields, and survives the earlier stand-up being completed again.
 */
import mongoose from 'mongoose'

import { Allocation } from '@/models/Allocation'
import { AllocationVariance } from '@/models/AllocationVariance'
import { CarryForwardItem } from '@/models/CarryForwardItem'
import { EstimateDebtLedger } from '@/models/EstimateDebtLedger'
import { Sprint } from '@/models/Sprint'
import { Standup } from '@/models/Standup'
import { StandupSummary } from '@/models/StandupSummary'

import { notificationService } from '@/lib/notification-service'

import { runCompletionSaga, type CompletionContext } from '../completion-saga'
import { minutes } from '../minutes'
import { ids, syncIndexes, useMongo } from './helpers/mongo'

const { organization, project, member, otherMember, user } = ids

let sprintId: mongoose.Types.ObjectId

async function seedSprint() {
  const sprint = await Sprint.create({
    name: 'Sprint 17',
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

async function seedSummary(standupId: mongoose.Types.ObjectId, standupDate: string) {
  return StandupSummary.create({
    standup: standupId,
    sprint: sprintId,
    project,
    organization,
    headerFacts: { standupDate, dayNumber: 1, totalDays: 5, facilitatorName: 'F', durationMinutes: 15 },
    memberCommitments: [{ memberId: String(member), name: 'Member', allocations: [] }]
  })
}

function summaryInputs(standupDate: string): CompletionContext['summaryInputs'] {
  return {
    headerFacts: { standupDate, dayNumber: 2, totalDays: 5, facilitatorName: 'F', durationMinutes: 15 },
    attendance: [],
    completedYesterday: [],
    varianceTable: [],
    debtMovements: [],
    memberCommitments: [],
    blockersRaised: [],
    blockersResolved: [],
    carryForwardState: [],
    overridesIssued: []
  }
}

function context(
  standupId: mongoose.Types.ObjectId,
  standupDate: string,
  overrides: Partial<CompletionContext> = {}
): CompletionContext {
  return {
    runId: `run-${standupDate}`,
    standupId: String(standupId),
    sprintId: String(sprintId),
    projectId: String(project),
    organizationId: String(organization),
    completedBy: String(user),
    expectedVersion: 0,
    checkInput: {
      shape: 'mid_sprint',
      members: [],
      variance: [],
      carryForward: [],
      blockers: [],
      sprintHealth: { remainingEstimateMinutes: minutes(0), remainingCapacityMinutes: minutes(1000) }
    },
    attendeeIds: [],
    adminRecipientIds: [],
    memberCommitments: [],
    overridesIssued: [],
    summaryInputs: summaryInputs(standupDate),
    summaryUrl: '/my/standup',
    ...overrides
  }
}

function outcomeFor(previousStandupId: mongoose.Types.ObjectId, recordedBy: mongoose.Types.ObjectId) {
  return {
    standupId: String(previousStandupId),
    outcome: {
      recordedByStandupId: String(recordedBy),
      recordedByStandupDate: '2026-08-18',
      completedTasks: [{ taskId: 'task-1', taskKey: 'KAN-1', title: 'Shipped it' }],
      varianceTable: [{ allocationId: 'a-1', taskKey: 'KAN-1', memberId: String(member), outcome: 'delivered_on_plan', dayVarianceMinutes: 0 }],
      memberTotals: [
        { memberId: String(member), plannedMinutes: 240, loggedMinutesOnDay: 270, dayVarianceMinutes: 30 }
      ]
    }
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

describe('day outcome write-back', () => {
  useMongo()

  beforeEach(async () => {
    await syncIndexes(CarryForwardItem, Allocation, AllocationVariance, StandupSummary, EstimateDebtLedger)
    await seedSprint()
  })

  it("writes the previous day's outcome onto its record and leaves the frozen fields alone", async () => {
    const day1 = await seedStandup('2026-08-17', 1)
    await seedSummary(day1._id, '2026-08-17')
    const day2 = await seedStandup('2026-08-18', 2)

    await runCompletionSaga(
      context(day2._id, '2026-08-18', { previousDayOutcome: outcomeFor(day1._id, day2._id) })
    )

    const record = await StandupSummary.findOne({ standup: day1._id }).lean()
    expect(record!.dayOutcome).toMatchObject({
      recordedByStandup: String(day2._id),
      recordedByStandupDate: '2026-08-18',
      completedTasks: [{ taskKey: 'KAN-1' }],
      memberTotals: [{ plannedMinutes: 240, loggedMinutesOnDay: 270, dayVarianceMinutes: 30 }]
    })
    expect(record!.dayOutcome!.recordedAt).toBeInstanceOf(Date)
    // The plan recorded at day 1's meeting is untouched.
    expect(record!.headerFacts.standupDate).toBe('2026-08-17')
    expect(record!.memberCommitments).toHaveLength(1)

    // Day 2's own record does not carry an outcome yet: its day is not over.
    const ownRecord = await StandupSummary.findOne({ standup: day2._id }).lean()
    expect(ownRecord!.dayOutcome).toBeUndefined()
  })

  it('never creates a record for a previous stand-up that has none', async () => {
    const missed = await seedStandup('2026-08-17', 1, { status: 'Missed' })
    const day2 = await seedStandup('2026-08-18', 2)

    await runCompletionSaga(
      context(day2._id, '2026-08-18', { previousDayOutcome: outcomeFor(missed._id, day2._id) })
    )

    expect(await StandupSummary.countDocuments({ standup: missed._id })).toBe(0)
    expect((await Standup.findById(day2._id).lean())!.status).toBe('Completed')
  })

  it('does nothing extra when there is no previous day to report on', async () => {
    const day2 = await seedStandup('2026-08-18', 2)

    await runCompletionSaga(context(day2._id, '2026-08-18'))

    expect(await StandupSummary.countDocuments({})).toBe(1)
  })

  it('keeps a recorded outcome when the earlier stand-up is completed again after a reopen', async () => {
    const day1 = await seedStandup('2026-08-17', 1)
    await seedSummary(day1._id, '2026-08-17')
    const day2 = await seedStandup('2026-08-18', 2)
    await runCompletionSaga(
      context(day2._id, '2026-08-18', { previousDayOutcome: outcomeFor(day1._id, day2._id) })
    )

    await Standup.updateOne({ _id: day1._id }, { $set: { status: 'Reopened' } })
    await runCompletionSaga(context(day1._id, '2026-08-17', { runId: 'run-recomplete' }))

    const record = await StandupSummary.findOne({ standup: day1._id }).lean()
    expect(record!.dayOutcome).toMatchObject({ recordedByStandup: String(day2._id) })
  })
})

describe('persist-summary hardening', () => {
  useMongo()

  beforeEach(async () => {
    await syncIndexes(CarryForwardItem, Allocation, AllocationVariance, StandupSummary, EstimateDebtLedger)
    await seedSprint()
  })

  it('retries once when a racing upsert loses on the unique standup index (E11000)', async () => {
    const day2 = await seedStandup('2026-08-18', 2)
    const real = StandupSummary.findOneAndUpdate.bind(StandupSummary)
    const spy = jest
      .spyOn(StandupSummary, 'findOneAndUpdate')
      .mockImplementationOnce((() => {
        throw Object.assign(new Error('E11000 duplicate key error'), { code: 11000 })
      }) as any)
      .mockImplementation(((...args: Parameters<typeof real>) => real(...args)) as any)

    const result = await runCompletionSaga(context(day2._id, '2026-08-18'))

    expect(spy).toHaveBeenCalledTimes(2)
    expect(result.summaryId).toBeTruthy()
    expect(await StandupSummary.countDocuments({ standup: day2._id })).toBe(1)
    expect((await Standup.findById(day2._id).lean())!.status).toBe('Completed')
  })

  it('does not swallow errors other than a duplicate key', async () => {
    const day2 = await seedStandup('2026-08-18', 2)
    jest.spyOn(StandupSummary, 'findOneAndUpdate').mockImplementationOnce((() => {
      throw new Error('disk full')
    }) as any)

    await expect(runCompletionSaga(context(day2._id, '2026-08-18'))).rejects.toThrow('disk full')
    const standup = await Standup.findById(day2._id).lean()
    expect(standup!.status).toBe('In_Progress')
    expect(standup!.completionState!.lastCompletedStep).toBe('build-carry-forward-set')
  })

  it('returns the existing summary id when a resumed run skips persist-summary', async () => {
    const day2 = await seedStandup('2026-08-18', 2, {
      completionState: { runId: 'run-resume', lastCompletedStep: 'persist-summary', updatedAt: new Date() }
    })
    const existing = await seedSummary(day2._id, '2026-08-18')

    const result = await runCompletionSaga(context(day2._id, '2026-08-18', { runId: 'run-resume' }))

    expect(result.summaryId).toBe(String(existing._id))
  })
})
