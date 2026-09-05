/**
 * The spec's §12.3 worked example, end to end (Phase 8, Task 17).
 *
 * §12.3 says the example "must be implemented exactly as described and should
 * be used as the primary QA fixture", and this is the test that holds the whole
 * phase to it. Everything runs through the real services against a real
 * database: classification, the capacity board, the revision, the reason, the
 * completion checks, the ledger, and the summary read model.
 *
 * Anything that fails here is a defect in the engine, not in this test.
 *
 * The scenario, in the spec's own numbers:
 *
 *   Day 3   KAN-214 planned 6.0h, KAN-231 planned 2.0h — a full, green day.
 *           Kasun spends the whole day on KAN-214, logging 8.0h, and never
 *           touches KAN-231. KAN-214 is still in progress.
 *
 *   Day 4   KAN-214 is V6 over by 2.0h with 8.0h on a 6.0h estimate; KAN-231 is
 *           V7 not started. A 2.0h accrual is posted against Kasun. Under
 *           absorb his day stays 8.0h with a badge; under reduce it becomes
 *           6.0h and settles once.
 */
import { AllocationVariance } from '@/models/AllocationVariance'
import { EstimateDebtLedger } from '@/models/EstimateDebtLedger'
import { MemberSprintDebtSummary } from '@/models/MemberSprintDebtSummary'
import { Task } from '@/models/Task'

import { loadAllocationBoard } from '../allocation-service'
import { blockingFailures, evaluateCompletionChecks } from '../completion-checks'
import { computeDebtPosition } from '../debt'
import { minutes } from '../minutes'
import { recordNotStartedReason, reviseRemainingEstimate } from '../revision-service'
import { classifyAndPost, loadVariancePanel } from '../variance-service'

import { syncIndexes, useMongo } from './helpers/mongo'
import { seedWorkedExample, type WorkedExample } from './helpers/worked-example-seed'

const rowFor = (panel: Awaited<ReturnType<typeof loadVariancePanel>>, key: string) =>
  panel.rows.find((row) => row.taskKey === key)!

const cardFor = (
  board: Awaited<ReturnType<typeof loadAllocationBoard>>,
  memberId: string
) => board.members.find((member) => member.memberId === memberId)!

/** Answers the two questions §12.3's PM asks, at the version the board is on. */
async function answerBothQuestions(example: WorkedExample) {
  const board = await loadAllocationBoard(example.day4)

  const revision = await reviseRemainingEstimate({
    standupId: example.day4,
    allocationId: example.allocations['KAN-214'],
    newRemainingMinutes: 180,
    reason: 'underestimated',
    expectedVersion: board.standupVersion,
    actor: { userId: example.pmId }
  })

  await recordNotStartedReason({
    standupId: example.day4,
    allocationId: example.allocations['KAN-231'],
    reason: 'Kasun stayed on the invoice model all day.',
    expectedVersion: revision.standupVersion,
    actor: { userId: example.pmId }
  })

  return revision
}

/** CC-3 as the checks route evaluates it. */
async function evaluateChecksFor(standupId: string, shape: 'mid_sprint' | 'day_one' = 'mid_sprint') {
  const board = await loadAllocationBoard(standupId)
  const panel = await loadVariancePanel(standupId)

  return evaluateCompletionChecks({
    shape,
    members: board.members.map((member) => ({
      memberId: member.memberId,
      attendance: 'present' as const,
      capacity: member.capacity,
      allocations: member.allocations.map((row) => ({
        allocationId: row.allocationId,
        taskId: row.taskId,
        taskKey: row.taskKey,
        memberId: member.memberId,
        plannedMinutes: row.plannedMinutes,
        remainingEstimateMinutes: row.remainingEstimateMinutes,
        isBlocked: row.isBlocked,
        excludedFromCapacity: row.excludedFromCapacity,
        detachedReason: row.detachedReason,
        pairedDeliberately: row.pairedDeliberately
      }))
    })),
    variance: panel.rows
  })
}

describe('§12.3 end to end', () => {
  useMongo()

  beforeEach(async () => {
    await syncIndexes(EstimateDebtLedger)
    await syncIndexes(AllocationVariance)
    await syncIndexes(MemberSprintDebtSummary)
  })

  it('runs the worked example under the absorb policy and produces the spec numbers', async () => {
    const example = await seedWorkedExample({ overrunPolicy: 'absorb' })

    // --- Day 4 opens. Both rows classify, provisionally. ------------------
    const panel = await loadVariancePanel(example.day4)

    expect(rowFor(panel, 'KAN-214')).toMatchObject({
      outcome: 'open_over_consumed',
      plannedMinutes: 360,
      loggedMinutesOnDay: 480,
      dayVarianceMinutes: 120,
      originalEstimateMinutes: 360,
      totalLoggedMinutesOnTask: 480,
      taskVarianceMinutes: 120,
      requiresRevision: true
    })
    expect(rowFor(panel, 'KAN-231')).toMatchObject({
      outcome: 'not_started',
      plannedMinutes: 120,
      loggedMinutesOnDay: 0,
      dayVarianceMinutes: -120,
      overrunMinutes: 0,
      requiresReason: true
    })

    // The §12.3 sentences, word for word.
    expect(rowFor(panel, 'KAN-214').explanation).toBe(
      'Planned 6.0h, logged 8.0h, over by 2.0h. Still in progress. Total on task 8.0h against a ' +
        '6.0h estimate, task is 2.0h over estimate. Revised remaining estimate required.'
    )
    expect(rowFor(panel, 'KAN-231').explanation).toBe(
      'Planned 2.0h, logged 0.0h, not started. 2.0h of planned work did not happen. Reason required.'
    )

    // --- Day 4 capacity: debt is a badge, not a reduction. -----------------
    const board = await loadAllocationBoard(example.day4)
    expect(cardFor(board, example.kasunId).capacity).toMatchObject({
      nominalMinutes: 480,
      adjustedMinutes: 480,
      outstandingDebtMinutes: 120,
      effectiveMinutes: 480
    })

    // --- CC-3 blocks until both questions are answered. --------------------
    const before = await evaluateChecksFor(example.day4)
    expect(before.find((check) => check.checkId === 'CC-3')!.status).toBe('fail')
    expect(blockingFailures(before).map((check) => check.checkId)).toContain('CC-3')

    const revision = await answerBothQuestions(example)

    // The original estimate is untouched; the remaining is 3.0h (AC-17).
    const task = (await Task.findById(example.kan214).lean()) as any
    expect(task.originalEstimateMinutes).toBe(360)
    expect(task.remainingEstimateMinutes).toBe(180)
    expect(task.estimateRevisions).toHaveLength(1)
    // §15.11's projected total: 8.0h logged plus 3.0h left.
    expect(revision.projectedTotalMinutes).toBe(660)

    const after = await evaluateChecksFor(example.day4)
    expect(after.find((check) => check.checkId === 'CC-3')!.status).toBe('pass')

    // --- Completion posts exactly one accrual. -----------------------------
    await classifyAndPost({ standupId: example.day4, actor: { userId: example.pmId } })

    const entries = (await EstimateDebtLedger.find({
      sprint: example.sprintId,
      member: example.kasunId
    }).lean()) as any[]
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({ entryType: 'accrual', minutes: 120 })
    expect(
      computeDebtPosition(
        entries.map((entry) => ({ entryType: entry.entryType, minutes: minutes(entry.minutes) }))
      ).outstandingMinutes
    ).toBe(120)

    // --- And the read model agrees with the ledger. ------------------------
    const summary = (await MemberSprintDebtSummary.findOne({
      sprint: example.sprintId,
      member: example.kasunId
    }).lean()) as any
    expect(summary.outstandingMinutes).toBe(120)
    expect(summary.accruedMinutes).toBe(120)

    // The revision is frozen onto the variance row, so the report can cite it.
    const kan214Row = (await AllocationVariance.findOne({ task: example.kan214 }).lean()) as any
    expect(kan214Row.revisedRemainingMinutes).toBe(180)
    expect(kan214Row.revisionReason).toBe('underestimated')

    const kan231Row = (await AllocationVariance.findOne({ task: example.kan231 }).lean()) as any
    expect(kan231Row.notStartedReason).toBe('Kasun stayed on the invoice model all day.')
    expect(kan231Row.overrunMinutes).toBe(0)
  })

  it('runs the same example under the reduce policy and settles once (AC-16)', async () => {
    const example = await seedWorkedExample({ overrunPolicy: 'reduce' })

    // 8.0h reduced to 6.0h by 2.0h of debt.
    expect(cardFor(await loadAllocationBoard(example.day4), example.kasunId).capacity).toMatchObject(
      { adjustedMinutes: 480, outstandingDebtMinutes: 120, effectiveMinutes: 360 }
    )

    await answerBothQuestions(example)
    await classifyAndPost({ standupId: example.day4, actor: { userId: example.pmId } })

    // A settlement of 2.0h is posted, so the debt is consumed once...
    const settlements = (await EstimateDebtLedger.find({
      member: example.kasunId,
      entryType: 'settlement'
    }).lean()) as any[]
    expect(settlements).toHaveLength(1)
    expect(settlements[0].minutes).toBe(120)

    // ...and does not reduce tomorrow as well.
    expect(
      cardFor(await loadAllocationBoard(example.day5), example.kasunId).capacity.effectiveMinutes
    ).toBe(480)
  })

  it('produces identical numbers when classification is re-run (VAR-3)', async () => {
    const example = await seedWorkedExample()
    await answerBothQuestions(example)

    const first = await classifyAndPost({ standupId: example.day4, actor: { userId: example.pmId } })
    const ledgerAfterFirst = await EstimateDebtLedger.countDocuments({})
    const rowsAfterFirst = await AllocationVariance.countDocuments({})

    const second = await classifyAndPost({
      standupId: example.day4,
      actor: { userId: example.pmId }
    })

    expect(second.entriesPosted).toBe(0)
    expect(second.classified).toBe(0)
    expect(second.skipped).toBe(first.entriesPosted)
    expect(await EstimateDebtLedger.countDocuments({})).toBe(ledgerAfterFirst)
    expect(await AllocationVariance.countDocuments({})).toBe(rowsAfterFirst)
  })
})
