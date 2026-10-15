/**
 * The provisional debt position (Phase 8, Task 6b — AC-13, AC-15, AC-16).
 *
 * The property under test is the one the whole phase leans on: **day 4's board
 * knows about day 3's overrun before day 4 has completed**. VAR-2 posts the
 * ledger entry at completion, but AC-13 requires the panel to show the numbers
 * when the board is built and AC-15/16 require capacity to already reflect
 * them. So this module classifies yesterday provisionally and adds it to the
 * persisted balance.
 *
 * The failure it has to be immune to is double counting. Once completion has
 * written the accrual, the provisional pass must stop contributing its own, or
 * the debt doubles at exactly the moment it becomes real.
 */
import { EstimateDebtLedger } from '@/models/EstimateDebtLedger'
import { Standup } from '@/models/Standup'

import { assembleClassifyInputs, findPreviousStandup, loadDebtPositions } from '../debt-position'

import { useMongo } from './helpers/mongo'
import { seedWorkedExample } from './helpers/worked-example-seed'

describe('assembleClassifyInputs', () => {
  useMongo()

  it('assembles one classify input per allocation on the previous stand-up', async () => {
    const { day3, day4 } = await seedWorkedExample()
    const assembled = await assembleClassifyInputs(day4)

    expect(assembled.previousStandupId).toBe(day3)
    expect(assembled.inputs).toHaveLength(2)
    expect(assembled.inputs.map((row) => row.loggedMinutesOnDay).sort((a, b) => a - b)).toEqual([
      0, 480
    ])
    expect(assembled.inputs.map((row) => row.plannedMinutes).sort((a, b) => a - b)).toEqual([
      120, 360
    ])
  })

  it('carries the original estimate and the running task total onto each input', async () => {
    const { day4 } = await seedWorkedExample()
    const assembled = await assembleClassifyInputs(day4)
    const kan214 = assembled.inputs.find((row) => row.plannedMinutes === 360)!

    expect(kan214.originalEstimateMinutes).toBe(360)
    expect(kan214.totalLoggedMinutesOnTask).toBe(480)
    expect(kan214.remainingBeforeMinutes).toBe(360)
    expect(kan214.ownsTaskVariance).toBe(true)
  })

  it('returns nothing to classify for a stand-up with no predecessor', async () => {
    const { day3 } = await seedWorkedExample()
    // Day 3 is the earliest stand-up the fixture seeds.
    const assembled = await assembleClassifyInputs(day3)
    expect(assembled.previousStandupId).toBeUndefined()
    expect(assembled.inputs).toEqual([])
  })

  it('reads yesterday as the previous stand-up in the sprint that actually ran', async () => {
    const { day3, day4, day5 } = await seedWorkedExample()
    // Day 4 is In_Progress, so day 5 looks back at it rather than at day 3.
    expect(String((await findPreviousStandup(await Standup.findById(day5).lean()))!._id)).toBe(day4)
    expect(String((await findPreviousStandup(await Standup.findById(day4).lean()))!._id)).toBe(day3)
  })

  it('skips a stand-up that never ran when resolving yesterday', async () => {
    const { day3, day4, day5 } = await seedWorkedExample()
    await Standup.updateOne({ _id: day4 }, { $set: { status: 'Skipped_Holiday' } })
    expect(String((await findPreviousStandup(await Standup.findById(day5).lean()))!._id)).toBe(day3)
  })
})

describe('loadDebtPositions', () => {
  useMongo()

  it('returns a zero position for a member with no ledger and no previous stand-up', async () => {
    const { day3, kasunId } = await seedWorkedExample()
    const position = (await loadDebtPositions(day3)).get(kasunId)!
    expect(position.outstandingMinutes).toBe(0)
    expect(position.surplusMinutes).toBe(0)
  })

  it("includes the previous stand-up's provisional accrual before it is persisted (AC-15)", async () => {
    const { day4, kasunId } = await seedWorkedExample()
    expect(await EstimateDebtLedger.countDocuments({})).toBe(0)
    expect((await loadDebtPositions(day4)).get(kasunId)!.outstandingMinutes).toBe(120)
  })

  it('does not double-count once the accrual is persisted', async () => {
    const { day4, kasunId, sprintId, projectId, organizationId, pmId, allocations } =
      await seedWorkedExample()

    await EstimateDebtLedger.create({
      project: projectId,
      sprint: sprintId,
      organization: organizationId,
      member: kasunId,
      entryType: 'accrual',
      minutes: 120,
      sourceAllocation: allocations['KAN-214'],
      sourceStandup: day4,
      createdBy: pmId
    })

    expect((await loadDebtPositions(day4)).get(kasunId)!.outstandingMinutes).toBe(120)
  })

  it('reports a member with no debt at all as zero rather than omitting them', async () => {
    const { day4, amalId } = await seedWorkedExample()
    const position = (await loadDebtPositions(day4)).get(amalId)
    expect(position).toBeDefined()
    expect(position!.outstandingMinutes).toBe(0)
  })

  it('posts no provisional debt for a member who was marked absent (V11)', async () => {
    const { day3, day4, kasunId } = await seedWorkedExample()
    await Standup.updateOne(
      { _id: day3 },
      { $set: { attendance: [{ user: kasunId, state: 'absent_planned' }] } }
    )
    const { Allocation } = await import('@/models/Allocation')
    await Allocation.updateMany(
      { standup: day3 },
      { $set: { detachedReason: 'owner_absent', excludedFromCapacity: true } }
    )

    expect((await loadDebtPositions(day4)).get(kasunId)!.outstandingMinutes).toBe(0)
  })

  it('respects a persisted write-off against the provisional balance', async () => {
    const { day4, kasunId, sprintId, projectId, organizationId, pmId } = await seedWorkedExample()
    await EstimateDebtLedger.create({
      project: projectId,
      sprint: sprintId,
      organization: organizationId,
      member: kasunId,
      entryType: 'writeoff',
      minutes: 120,
      sourceStandup: day4,
      reason: 'The estimate was wrong at planning, not a delivery problem.',
      createdBy: pmId
    })
    // The provisional accrual and the write-off cancel out.
    expect((await loadDebtPositions(day4)).get(kasunId)!.outstandingMinutes).toBe(0)
  })
})
