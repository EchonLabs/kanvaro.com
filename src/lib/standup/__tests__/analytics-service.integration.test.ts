/**
 * The analytics loader against a real (in-memory) database.
 *
 * The arithmetic is `analytics.test.ts`'s job and the full/aggregate split is
 * `analytics-payload.test.ts`'s; this proves the loader reads the fields the
 * models actually store — a misspelt `.select()` silently yields zeros, which
 * no pure test can catch — and that it is scoped to the one sprint.
 */
import mongoose from 'mongoose'

import { Allocation } from '@/models/Allocation'
import { AllocationVariance } from '@/models/AllocationVariance'
import { CarryForwardItem } from '@/models/CarryForwardItem'
import { EstimateDebtLedger } from '@/models/EstimateDebtLedger'
import { Project } from '@/models/Project'
import { Sprint } from '@/models/Sprint'
import { Standup } from '@/models/Standup'
import { StandupOverride } from '@/models/StandupOverride'

import { getSprintAnalytics } from '../analytics-service'
import { ids, useMongo } from './helpers/mongo'

const { organization, project, sprint: sprintId, otherSprint, member, otherMember, user } = ids

async function seedStandup(
  sprint: mongoose.Types.ObjectId,
  date: string,
  status: string,
  extra: Record<string, unknown> = {}
) {
  return Standup.create({
    project,
    sprint,
    organization,
    standupDate: date,
    scheduledStartAt: new Date(`${date}T03:30:00.000Z`),
    durationMinutes: 15,
    sprintDayNumber: 1,
    totalSprintDays: 5,
    shape: 'mid_sprint',
    status,
    facilitator: user,
    expectedAttendees: [member, otherMember],
    version: 0,
    ...extra
  })
}

async function seedAllocation(standupId: mongoose.Types.ObjectId, memberId: mongoose.Types.ObjectId, task: mongoose.Types.ObjectId, plannedMinutes: number, extra: Record<string, unknown> = {}) {
  return Allocation.create({
    standup: standupId,
    sprint: sprintId,
    project,
    organization,
    member: memberId,
    task,
    plannedMinutes,
    source: 'assigned_in_standup',
    createdBy: user,
    ...extra
  })
}

describe('getSprintAnalytics', () => {
  useMongo()

  it('reads the sprint\'s stand-ups, allocations, variance, ledger, overrides and carry-forward', async () => {
    await Project.create({
      _id: project,
      name: 'Kanvaro Web',
      organization,
      createdBy: user,
      status: 'active',
      projectNumber: 1,
      startDate: new Date('2026-10-01T00:00:00.000Z'),
      projectRoles: []
    })
    const sprint = await Sprint.create({
      _id: sprintId,
      name: 'Sprint 14',
      organization,
      project,
      createdBy: user,
      status: 'active',
      startDate: new Date('2026-10-01T00:00:00.000Z'),
      endDate: new Date('2026-10-14T00:00:00.000Z'),
      capacity: 0,
      teamMembers: [member, otherMember]
    })

    const snapshot = {
      members: [
        { memberId: String(member), effectiveMinutes: 360 },
        { memberId: String(otherMember), effectiveMinutes: 360 }
      ]
    }
    const day1 = await seedStandup(sprintId, '2026-10-01', 'Completed', { snapshot, actualDurationMinutes: 14 })
    const day2 = await seedStandup(sprintId, '2026-10-02', 'Missed')

    const taskA = new mongoose.Types.ObjectId()
    const taskB = new mongoose.Types.ObjectId()
    const root = await seedAllocation(day1._id, member, taskA, 300)
    await seedAllocation(day1._id, otherMember, taskB, 420)
    await seedAllocation(day1._id, otherMember, new mongoose.Types.ObjectId(), 60, { excludedFromCapacity: true, excludeReason: 'support rota' })
    await seedAllocation(day2._id, member, taskA, 60, { source: 'carried_forward', carryChainRoot: root._id, carriedFromAllocation: root._id })

    const variance = (task: mongoose.Types.ObjectId, memberId: mongoose.Types.ObjectId, status: string, logged: number, computedAt: string) =>
      AllocationVariance.create({
        allocation: new mongoose.Types.ObjectId(),
        standup: day1._id,
        computedAtStandup: day1._id,
        sprint: sprintId,
        member: memberId,
        task,
        project,
        organization,
        plannedMinutes: 60,
        loggedMinutesOnDay: 60,
        dayVarianceMinutes: 0,
        originalEstimateMinutes: 120,
        totalLoggedMinutesOnTask: logged,
        taskVarianceMinutes: logged - 120,
        remainingBeforeMinutes: 60,
        remainingAfterMinutes: 0,
        taskStatusAtClose: status,
        outcome: 'delivered_over',
        computedAt: new Date(computedAt)
      })
    // The later row wins, because the logged total is cumulative.
    await variance(taskB, otherMember, 'Done', 180, '2026-10-01T10:00:00.000Z')
    await variance(taskB, otherMember, 'Done', 240, '2026-10-02T10:00:00.000Z')
    // Not done: excluded from accuracy.
    await variance(taskA, member, 'in_progress', 600, '2026-10-01T10:00:00.000Z')

    await EstimateDebtLedger.create({
      project,
      sprint: sprintId,
      member,
      organization,
      entryType: 'accrual',
      minutes: 90,
      sourceAllocation: root._id,
      sourceStandup: day1._id,
      createdBy: user
    })

    for (let n = 0; n < 3; n += 1) {
      await StandupOverride.create({
        standup: day1._id,
        sprint: sprintId,
        project,
        organization,
        type: 'under_allocation',
        affectedMemberIds: [member],
        reasonCode: 'no_work_available',
        justification: 'Nothing else in the sprint was unblocked for them',
        gapMinutes: 60,
        issuedBy: user
      })
    }

    await CarryForwardItem.create({
      sprint: sprintId,
      project,
      organization,
      type: 'unfinished_task',
      task: taskA,
      member,
      originStandup: day1._id,
      originDate: '2026-10-01',
      currentStandup: day2._id,
      ageInStandups: 9,
      status: 'escalated'
    })

    // Another sprint's rows must not leak in.
    const foreign = await seedStandup(otherSprint, '2026-10-01', 'Missed')
    await StandupOverride.create({
      standup: foreign._id,
      sprint: otherSprint,
      project,
      organization,
      type: 'over_allocation',
      affectedMemberIds: [otherMember],
      reasonCode: 'critical_deadline',
      justification: 'A different sprint entirely, should not be counted',
      gapMinutes: 0,
      issuedBy: user
    })

    const payload = await getSprintAnalytics(sprint.toObject(), 'full')
    if (payload.view !== 'full') throw new Error('expected the full view')

    expect(payload.sprint).toMatchObject({ name: 'Sprint 14', projectName: 'Kanvaro Web', startDate: '2026-10-01' })
    expect(payload.allocationHealth).toEqual([
      expect.objectContaining({ standupDate: '2026-10-01', effectiveMinutes: 720, fullMinutes: 660, underMinutes: 60, overMinutes: 60 })
    ])
    expect(payload.debtTrend).toEqual([
      { date: '2026-10-01', outstandingMinutes: 90 },
      { date: '2026-10-02', outstandingMinutes: 90 }
    ])
    expect(payload.headline).toMatchObject({ onTimeRate: 50, missedCount: 1, overrideCount: 3, chronicCarryForwardCount: 1 })
    expect(payload.overrideCountsByType).toEqual({ under_allocation: 3 })
    expect(payload.accuracy.team).toMatchObject({ taskCount: 1, estimatedMinutes: 120, loggedMinutes: 240, percent: 50 })
    expect(payload.chronicMembers).toEqual([expect.objectContaining({ memberId: String(member), count: 3 })])
    expect(payload.spillChains).toEqual([expect.objectContaining({ taskId: String(taskA), chainLength: 2 })])
    expect(payload.discipline.medianDurationMinutes).toBe(14)

    const aggregate = await getSprintAnalytics(sprint.toObject(), 'aggregate')
    expect(JSON.stringify(aggregate)).not.toContain(String(member))
    expect(JSON.stringify(aggregate)).not.toContain('unblocked for them')
  })

  it('returns an empty report for a sprint with nothing in it', async () => {
    const sprint = await Sprint.create({
      _id: sprintId,
      name: 'Empty',
      organization,
      project,
      createdBy: user,
      status: 'planning',
      startDate: new Date('2026-10-01T00:00:00.000Z'),
      endDate: new Date('2026-10-14T00:00:00.000Z'),
      capacity: 0,
      teamMembers: []
    })

    const payload = await getSprintAnalytics(sprint.toObject(), 'aggregate')

    expect(payload.allocationHealth).toEqual([])
    expect(payload.headline.onTimeRate).toBeNull()
    expect(payload.spillChains).toEqual([])
  })
})
