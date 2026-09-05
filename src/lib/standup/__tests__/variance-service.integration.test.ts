/**
 * The variance engine's writer, against the database (Phase 8, Task 7).
 *
 * This suite carries the phase's highest-weight guarantees, and each is here
 * because getting it wrong produces a *plausible* wrong number rather than a
 * visible failure:
 *
 *   AC-13/14  the §12.3 worked example, end to end, to the exact minute.
 *   VAR-3     running classification twice posts nothing the second time.
 *   V11       a retroactively absent member accrues **no ledger entries** —
 *             not zero-minute ones, none at all.
 *   D-D       a shared task accrues once, not twice.
 *   AC-16     the reduce policy settles exactly once per member per stand-up.
 *   E40       retrospective time is corrected by a compensating entry, never
 *             by editing what was already posted (DAT-4).
 *
 * Everything writes through the service. Nothing asserts against a row the
 * test itself planted.
 */
import mongoose from 'mongoose'

import { AllocationVariance } from '@/models/AllocationVariance'
import { Allocation } from '@/models/Allocation'
import { EstimateDebtLedger } from '@/models/EstimateDebtLedger'
import { MemberSprintDebtSummary } from '@/models/MemberSprintDebtSummary'
import { Standup } from '@/models/Standup'
import { Task } from '@/models/Task'
import { TimeEntry } from '@/models/TimeEntry'

import { computeDebtPosition } from '../debt'
import {
  classifyAndPost,
  loadVariancePanel,
  recomputeAfterCompletion,
  type VariancePanel,
  type VarianceRow
} from '../variance-service'

import { syncIndexes, useMongo } from './helpers/mongo'
import { FIXTURE_DAY_3, seedWorkedExample } from './helpers/worked-example-seed'

const rowFor = (panel: VariancePanel, key: string): VarianceRow =>
  panel.rows.find((row) => row.taskKey === key)!

describe('loadVariancePanel — the provisional view (AC-13)', () => {
  useMongo()

  beforeEach(async () => {
    await syncIndexes(EstimateDebtLedger)
    await syncIndexes(AllocationVariance)
  })

  it('reproduces the §12.3 worked example exactly', async () => {
    const { day4 } = await seedWorkedExample()
    const panel = await loadVariancePanel(day4)

    const kan214 = rowFor(panel, 'KAN-214')
    expect(kan214.outcome).toBe('open_over_consumed')
    expect(kan214.plannedMinutes).toBe(360)
    expect(kan214.loggedMinutesOnDay).toBe(480)
    expect(kan214.dayVarianceMinutes).toBe(120)
    expect(kan214.originalEstimateMinutes).toBe(360)
    expect(kan214.totalLoggedMinutesOnTask).toBe(480)
    expect(kan214.taskVarianceMinutes).toBe(120)
    expect(kan214.requiresRevision).toBe(true)

    const kan231 = rowFor(panel, 'KAN-231')
    expect(kan231.outcome).toBe('not_started')
    expect(kan231.requiresReason).toBe(true)
    expect(kan231.overrunMinutes).toBe(0)
  })

  it('renders §12.3 explanation sentences on both rows', async () => {
    const { day4 } = await seedWorkedExample()
    const panel = await loadVariancePanel(day4)

    expect(rowFor(panel, 'KAN-214').explanation).toBe(
      'Planned 6.0h, logged 8.0h, over by 2.0h. Still in progress. Total on task 8.0h against a ' +
        '6.0h estimate, task is 2.0h over estimate. Revised remaining estimate required.'
    )
    expect(rowFor(panel, 'KAN-231').explanation).toBe(
      'Planned 2.0h, logged 0.0h, not started. 2.0h of planned work did not happen. Reason required.'
    )
  })

  it('rolls up the member strip VAR-13 requires', async () => {
    const { day4, kasunId } = await seedWorkedExample()
    const panel = await loadVariancePanel(day4)
    const kasun = panel.members.find((row) => row.memberId === kasunId)!

    expect(kasun.plannedMinutes).toBe(480)
    expect(kasun.loggedMinutesOnDay).toBe(480)
    expect(kasun.dayVarianceMinutes).toBe(0)
    expect(kasun.outstandingDebtMinutes).toBe(120)
    expect(kasun.needingRevision).toBe(1)
  })

  it('writes nothing at all', async () => {
    const { day4 } = await seedWorkedExample()
    await loadVariancePanel(day4)
    expect(await EstimateDebtLedger.countDocuments({})).toBe(0)
    expect(await AllocationVariance.countDocuments({})).toBe(0)
  })

  it('returns an empty panel for a stand-up with no predecessor', async () => {
    const { day3 } = await seedWorkedExample()
    const panel = await loadVariancePanel(day3)
    expect(panel.rows).toEqual([])
    expect(panel.previousStandupId).toBeUndefined()
  })

  it('reports a row as answered once a reason is recorded on the allocation', async () => {
    const { day4, allocations } = await seedWorkedExample()
    await Allocation.updateOne(
      { _id: allocations['KAN-231'] },
      { $set: { notStartedReason: 'Kasun stayed on the invoice model all day.' } }
    )
    const panel = await loadVariancePanel(day4)
    expect(rowFor(panel, 'KAN-231').notStartedReason).toBe(
      'Kasun stayed on the invoice model all day.'
    )
    expect(panel.members.find((row) => row.needingRevision > 0)!.needingRevision).toBe(1)
  })

  it('counts the full carry-forward chain rather than a flat two (VAR-14, E41)', async () => {
    const { day4, allocations, sprintId, projectId, organizationId, kasunId, kan214, pmId } =
      await seedWorkedExample()

    // A five-stand-up chain: the root plus three earlier carried links plus
    // day 3's own allocation, which is what `loadVariancePanel(day4)` classifies.
    // The earlier links belong to stand-ups this fixture never seeds — only
    // their id needs to exist for the unique (standup, member, task) index.
    const root = await Allocation.create({
      standup: new mongoose.Types.ObjectId(),
      sprint: sprintId,
      project: projectId,
      organization: organizationId,
      member: kasunId,
      task: kan214,
      plannedMinutes: 60,
      source: 'carried_forward',
      taskStatusAtAllocation: 'in_progress',
      createdBy: pmId
    })
    for (let i = 0; i < 3; i += 1) {
      await Allocation.create({
        standup: new mongoose.Types.ObjectId(),
        sprint: sprintId,
        project: projectId,
        organization: organizationId,
        member: kasunId,
        task: kan214,
        plannedMinutes: 60,
        source: 'carried_forward',
        taskStatusAtAllocation: 'in_progress',
        carryChainRoot: root._id,
        createdBy: pmId
      })
    }
    await Allocation.updateOne(
      { _id: allocations['KAN-214'] },
      { $set: { carryChainRoot: root._id } }
    )

    const panel = await loadVariancePanel(day4)
    const kan214Row = rowFor(panel, 'KAN-214')
    expect(kan214Row.spillChainLength).toBe(5)
    expect(kan214Row.chronicSpill).toBe(true)
  })
})

describe('classifyAndPost — persistence and the ledger (AC-14)', () => {
  useMongo()

  beforeEach(async () => {
    await syncIndexes(EstimateDebtLedger)
    await syncIndexes(AllocationVariance)
  })

  it('posts a 120-minute accrual for Kasun once day 4 completes', async () => {
    const { day4, kasunId, sprintId, pmId } = await seedWorkedExample()
    await classifyAndPost({ standupId: day4, actor: { userId: pmId } })

    const entries = (await EstimateDebtLedger.find({
      sprint: sprintId,
      member: kasunId
    }).lean()) as any[]
    const accruals = entries.filter((entry) => entry.entryType === 'accrual')
    expect(accruals).toHaveLength(1)
    expect(accruals[0].minutes).toBe(120)
    expect(computeDebtPosition(entries).outstandingMinutes).toBe(120)
  })

  it('writes one variance row per allocation, carrying both scopes', async () => {
    const { day4, day3, pmId } = await seedWorkedExample()
    const result = await classifyAndPost({ standupId: day4, actor: { userId: pmId } })
    expect(result.classified).toBe(2)

    const rows = (await AllocationVariance.find({}).lean()) as any[]
    expect(rows).toHaveLength(2)

    const over = rows.find((row) => row.outcome === 'open_over_consumed')!
    expect(over.dayVarianceMinutes).toBe(120)
    expect(over.taskVarianceMinutes).toBe(120)
    expect(over.overrunMinutes).toBe(120)
    expect(String(over.standup)).toBe(day3)
    expect(String(over.computedAtStandup)).toBe(day4)
  })

  it('is idempotent: running twice posts nothing the second time (VAR-3)', async () => {
    const { day4, pmId } = await seedWorkedExample()
    const first = await classifyAndPost({ standupId: day4, actor: { userId: pmId } })
    const second = await classifyAndPost({ standupId: day4, actor: { userId: pmId } })

    expect(second.entriesPosted).toBe(0)
    expect(second.skipped).toBe(first.entriesPosted)
    expect(second.classified).toBe(0)
    expect(await EstimateDebtLedger.countDocuments({})).toBe(first.entriesPosted)
    expect(await AllocationVariance.countDocuments({})).toBe(first.classified)
  })

  it('refreshes the summary read model to agree with the ledger (DAT-5)', async () => {
    const { day4, kasunId, sprintId, pmId } = await seedWorkedExample()
    await classifyAndPost({ standupId: day4, actor: { userId: pmId } })

    const summary = (await MemberSprintDebtSummary.findOne({
      sprint: sprintId,
      member: kasunId
    }).lean()) as any
    expect(summary.outstandingMinutes).toBe(120)
    expect(summary.accruedMinutes).toBe(120)
    expect(summary.sourceVersion).toBe(1)
  })

  it('records an audit entry naming what it posted', async () => {
    const { day4, pmId } = await seedWorkedExample()
    await classifyAndPost({ standupId: day4, actor: { userId: pmId } })
    const { ActivityLog } = await import('@/models/ActivityLog')
    expect(await ActivityLog.countDocuments({ action: 'variance_computed' })).toBe(1)
  })

  it('records one audit entry per member, not one per run', async () => {
    const { day3, day4, kasunId, amalId, pmId, organizationId, projectId, sprintId } =
      await seedWorkedExample()

    // Amal delivers a second task under estimate, so both she and Kasun end
    // up with posted entries from the same completion.
    const kan999 = await Task.create({
      title: 'Amal delivers under',
      organization: organizationId,
      project: projectId,
      sprint: sprintId,
      createdBy: pmId,
      assignedTo: [{ user: amalId, assignedAt: new Date() }],
      taskNumber: 999,
      displayId: 'KAN-999',
      status: 'done',
      originalEstimateMinutes: 240,
      remainingEstimateMinutes: 240,
      estimateLockedAt: new Date(`${FIXTURE_DAY_3}T00:00:00.000Z`)
    })
    await Allocation.create({
      standup: day3,
      sprint: sprintId,
      project: projectId,
      organization: organizationId,
      member: amalId,
      task: kan999._id,
      plannedMinutes: 240,
      source: 'assigned_in_standup',
      taskStatusAtAllocation: 'done',
      createdBy: pmId
    })
    await TimeEntry.create({
      user: amalId,
      organization: organizationId,
      project: projectId,
      task: kan999._id,
      description: 'finished early',
      startTime: new Date(`${FIXTURE_DAY_3}T09:00:00+05:30`),
      duration: 180,
      isBillable: false,
      status: 'completed'
    })

    await classifyAndPost({ standupId: day4, actor: { userId: pmId } })

    const { ActivityLog } = await import('@/models/ActivityLog')
    const entries = (await ActivityLog.find({ action: 'variance_computed' }).lean()) as any[]
    expect(entries).toHaveLength(2)
    const memberIds = entries.map((entry) => entry.details?.memberId)
    expect(new Set(memberIds)).toEqual(new Set([kasunId, amalId]))
  })

  it('does nothing for a stand-up with no predecessor', async () => {
    const { day3, pmId } = await seedWorkedExample()
    const result = await classifyAndPost({ standupId: day3, actor: { userId: pmId } })
    expect(result).toEqual({ classified: 0, entriesPosted: 0, skipped: 0 })
  })

  it('posts a credit when a task is delivered under (AC-19)', async () => {
    const { day4, kasunId, kan214, sprintId, pmId } = await seedWorkedExample({
      loggedOnKan214Minutes: 240
    })
    await Task.updateOne({ _id: kan214 }, { $set: { status: 'done' } })

    await classifyAndPost({ standupId: day4, actor: { userId: pmId } })
    const credit = (await EstimateDebtLedger.findOne({
      sprint: sprintId,
      member: kasunId,
      entryType: 'credit'
    }).lean()) as any
    expect(credit.minutes).toBe(120)
  })
})

describe('classifyAndPost — V11, the absent owner', () => {
  useMongo()

  beforeEach(async () => {
    await syncIndexes(EstimateDebtLedger)
    await syncIndexes(AllocationVariance)
  })

  it('posts zero ledger entries for a retroactively absent member', async () => {
    const { day3, day4, kasunId, pmId } = await seedWorkedExample()

    await Standup.updateOne(
      { _id: day3 },
      { $set: { attendance: [{ user: kasunId, state: 'absent_planned' }] } }
    )
    await Allocation.updateMany(
      { standup: day3 },
      { $set: { detachedReason: 'owner_absent', excludedFromCapacity: true } }
    )

    await classifyAndPost({ standupId: day4, actor: { userId: pmId } })

    expect(await EstimateDebtLedger.countDocuments({ member: kasunId })).toBe(0)

    const rows = (await AllocationVariance.find({ member: kasunId }).lean()) as any[]
    expect(rows).toHaveLength(2)
    expect(rows.every((row) => row.outcome === 'owner_absent')).toBe(true)
    expect(rows.every((row) => row.overrunMinutes === 0)).toBe(true)
    expect(rows.every((row) => row.creditMinutes === 0)).toBe(true)
  })
})

describe('classifyAndPost — D-D, a shared task', () => {
  useMongo()

  beforeEach(async () => {
    await syncIndexes(EstimateDebtLedger)
    await syncIndexes(AllocationVariance)
  })

  it('accrues once, not twice, when two members share a task', async () => {
    const example = await seedWorkedExample()
    const { day3, day4, kasunId, amalId, kan214, pmId, organizationId, projectId, sprintId } =
      example

    // Amal joins KAN-214: Kasun stays the owner (assignedTo[0]).
    await Task.updateOne(
      { _id: kan214 },
      { $push: { assignedTo: { user: amalId, assignedAt: new Date() } } }
    )
    await Allocation.create({
      standup: day3,
      sprint: sprintId,
      project: projectId,
      organization: organizationId,
      member: amalId,
      task: kan214,
      plannedMinutes: 240,
      source: 'assigned_in_standup',
      taskStatusAtAllocation: 'in_progress',
      createdBy: pmId
    })
    // Amal worked exactly to plan, so only Kasun's day overran.
    await TimeEntry.create({
      user: amalId,
      organization: organizationId,
      project: projectId,
      task: kan214,
      description: 'pairing',
      startTime: new Date(`${FIXTURE_DAY_3}T09:00:00+05:30`),
      duration: 240,
      isBillable: false,
      status: 'completed'
    })

    await classifyAndPost({ standupId: day4, actor: { userId: pmId } })

    const rows = (await AllocationVariance.find({ task: kan214 }).lean()) as any[]
    expect(rows).toHaveLength(2)

    // Exactly one row carries the task-scope variance.
    expect(rows.filter((row) => row.taskVarianceMinutes !== 0)).toHaveLength(1)
    const shared = rows.find((row) => row.sharedContribution)!
    expect(String(shared.member)).toBe(amalId)
    expect(shared.taskVarianceMinutes).toBe(0)

    // And the ledger holds Kasun's own day overrun once, with nothing for Amal.
    const accruals = (await EstimateDebtLedger.find({ entryType: 'accrual' }).lean()) as any[]
    expect(accruals).toHaveLength(1)
    expect(String(accruals[0].member)).toBe(kasunId)
  })
})

describe('classifyAndPost — the overrun policies (AC-15, AC-16)', () => {
  useMongo()

  beforeEach(async () => {
    await syncIndexes(EstimateDebtLedger)
    await syncIndexes(AllocationVariance)
  })

  it('posts no settlement under the absorb policy', async () => {
    const { day4, kasunId, pmId } = await seedWorkedExample({ overrunPolicy: 'absorb' })
    await classifyAndPost({ standupId: day4, actor: { userId: pmId } })
    expect(
      await EstimateDebtLedger.countDocuments({ member: kasunId, entryType: 'settlement' })
    ).toBe(0)
  })

  it('posts one settlement per member per stand-up under the reduce policy', async () => {
    const { day4, kasunId, pmId } = await seedWorkedExample({ overrunPolicy: 'reduce' })
    await classifyAndPost({ standupId: day4, actor: { userId: pmId } })

    const settlements = (await EstimateDebtLedger.find({
      member: kasunId,
      entryType: 'settlement'
    }).lean()) as any[]
    expect(settlements).toHaveLength(1)
    expect(settlements[0].minutes).toBe(120)
  })

  it('settles the debt away, so it is not charged twice', async () => {
    const { day4, kasunId, sprintId, pmId } = await seedWorkedExample({ overrunPolicy: 'reduce' })
    await classifyAndPost({ standupId: day4, actor: { userId: pmId } })

    const entries = (await EstimateDebtLedger.find({
      sprint: sprintId,
      member: kasunId
    }).lean()) as any[]
    expect(computeDebtPosition(entries).outstandingMinutes).toBe(0)
  })

  it('does not re-settle a stand-up that was already classified (E45)', async () => {
    const { day4, pmId } = await seedWorkedExample({ overrunPolicy: 'reduce' })
    await classifyAndPost({ standupId: day4, actor: { userId: pmId } })
    await classifyAndPost({ standupId: day4, actor: { userId: pmId } })
    expect(await EstimateDebtLedger.countDocuments({ entryType: 'settlement' })).toBe(1)
  })
})

describe('recomputeAfterCompletion — E40', () => {
  useMongo()

  beforeEach(async () => {
    await syncIndexes(EstimateDebtLedger)
    await syncIndexes(AllocationVariance)
  })

  it('marks the record recomputed and corrects the ledger with a new entry', async () => {
    const { day4, kasunId, kan214, organizationId, projectId, pmId } = await seedWorkedExample()
    await classifyAndPost({ standupId: day4, actor: { userId: pmId } })

    // An hour logged retrospectively against day 3.
    await TimeEntry.create({
      user: kasunId,
      organization: organizationId,
      project: projectId,
      task: kan214,
      description: 'forgot to log this',
      startTime: new Date(`${FIXTURE_DAY_3}T18:00:00+05:30`),
      duration: 60,
      isBillable: false,
      status: 'completed'
    })

    const { adjusted } = await recomputeAfterCompletion({
      standupId: day4,
      actor: { userId: pmId }
    })

    expect(adjusted).toHaveLength(1)
    const row = (await AllocationVariance.findOne({ task: kan214 }).lean()) as any
    expect(row.recomputedAfterCompletion).toBe(true)
    expect(row.loggedMinutesOnDay).toBe(540)
    expect(row.overrunMinutes).toBe(180)

    // DAT-4: a compensating entry, never an edit of the original.
    const accruals = (await EstimateDebtLedger.find({ entryType: 'accrual' })
      .sort({ createdAt: 1 })
      .lean()) as any[]
    expect(accruals).toHaveLength(2)
    expect(accruals[0].minutes).toBe(120)
    expect(accruals[1].minutes).toBe(60)
    expect(accruals[1].reason).toMatch(/retrospectively/)
  })

  it('changes nothing when no time has moved', async () => {
    const { day4, pmId } = await seedWorkedExample()
    await classifyAndPost({ standupId: day4, actor: { userId: pmId } })
    const { adjusted } = await recomputeAfterCompletion({
      standupId: day4,
      actor: { userId: pmId }
    })
    expect(adjusted).toEqual([])
    expect(await EstimateDebtLedger.countDocuments({ entryType: 'accrual' })).toBe(1)
  })
})
