/**
 * Estimate debt reaching the capacity board (Phase 8, Task 10 — AC-15, AC-16,
 * E43, E45).
 *
 * §12.3 sets out both policies against the same scenario, and the difference
 * between them is the whole reason `overrunPolicy` exists:
 *
 *   absorb  Kasun's day stays 8.0h and the 2.0h shows as a badge. The team's
 *           culture is that the plan is the plan; debt is information.
 *   reduce  Kasun's day becomes 6.0h. The debt is taken out of today, settled
 *           once at completion, and does not reduce tomorrow as well.
 *
 * The "not charged twice" half is the one worth the most: a settlement that
 * fails to post leaves the member paying for one overrun every day for the rest
 * of the sprint, and nothing on the screen would say why.
 */
import { AllocationVariance } from '@/models/AllocationVariance'
import { EstimateDebtLedger } from '@/models/EstimateDebtLedger'
import { ProjectStandupSettings } from '@/models/ProjectStandupSettings'

import { loadAllocationBoard, type AllocationBoard, type BoardMember } from '../allocation-service'
import { classifyAndPost } from '../variance-service'

import { syncIndexes, useMongo } from './helpers/mongo'
import { seedWorkedExample } from './helpers/worked-example-seed'

const cardFor = (board: AllocationBoard, memberId: string): BoardMember =>
  board.members.find((member) => member.memberId === memberId)!

describe('the absorb policy (AC-15)', () => {
  useMongo()

  beforeEach(async () => {
    await syncIndexes(EstimateDebtLedger)
    await syncIndexes(AllocationVariance)
  })

  it('leaves effective capacity at nominal and badges the debt', async () => {
    const { day4, kasunId } = await seedWorkedExample({ overrunPolicy: 'absorb' })
    const board = await loadAllocationBoard(day4)
    const card = cardFor(board, kasunId)

    expect(card.capacity.nominalMinutes).toBe(480)
    expect(card.capacity.adjustedMinutes).toBe(480)
    expect(card.capacity.outstandingDebtMinutes).toBe(120)
    expect(card.capacity.effectiveMinutes).toBe(480)
  })

  it('shows the debt before the stand-up that will post it has completed', async () => {
    const { day4, kasunId } = await seedWorkedExample({ overrunPolicy: 'absorb' })
    expect(await EstimateDebtLedger.countDocuments({})).toBe(0)
    expect(cardFor(await loadAllocationBoard(day4), kasunId).capacity.outstandingDebtMinutes).toBe(
      120
    )
  })

  it('leaves a member with no debt untouched', async () => {
    const { day4, amalId } = await seedWorkedExample({ overrunPolicy: 'absorb' })
    const card = cardFor(await loadAllocationBoard(day4), amalId)
    expect(card.capacity.outstandingDebtMinutes).toBe(0)
    expect(card.capacity.effectiveMinutes).toBe(480)
  })
})

describe('the reduce policy (AC-16, E43)', () => {
  useMongo()

  beforeEach(async () => {
    await syncIndexes(EstimateDebtLedger)
    await syncIndexes(AllocationVariance)
  })

  it('reduces effective capacity by the debt', async () => {
    const { day4, kasunId } = await seedWorkedExample({ overrunPolicy: 'reduce' })
    const card = cardFor(await loadAllocationBoard(day4), kasunId)

    expect(card.capacity.adjustedMinutes).toBe(480)
    expect(card.capacity.outstandingDebtMinutes).toBe(120)
    expect(card.capacity.effectiveMinutes).toBe(360)
  })

  it('returns to nominal on the next day once the settlement is posted', async () => {
    const { day4, day5, kasunId, pmId } = await seedWorkedExample({ overrunPolicy: 'reduce' })
    await classifyAndPost({ standupId: day4, actor: { userId: pmId } })

    const card = cardFor(await loadAllocationBoard(day5), kasunId)
    expect(card.capacity.outstandingDebtMinutes).toBe(0)
    expect(card.capacity.effectiveMinutes).toBe(480)
  })

  it('floors effective capacity at zero when debt exceeds the day (E43)', async () => {
    const { day4, kasunId, sprintId, projectId, organizationId, pmId } = await seedWorkedExample({
      overrunPolicy: 'reduce'
    })
    // Eleven hours of debt carried in, against an eight-hour day.
    await EstimateDebtLedger.create({
      project: projectId,
      sprint: sprintId,
      organization: organizationId,
      member: kasunId,
      entryType: 'carry_in',
      minutes: 660,
      sourceStandup: day4,
      sourceSprint: sprintId,
      createdBy: pmId
    })

    const card = cardFor(await loadAllocationBoard(day4), kasunId)
    expect(card.capacity.effectiveMinutes).toBe(0)
    // A day with no capacity left reads `unavailable` whatever consumed it —
    // Phase 6's deliberate choice. What tells the panel this is debt rather
    // than leave, and lets it raise E43's not-recoverable prompt, is the debt
    // figure surviving alongside the floor.
    expect(card.capacity.status).toBe('unavailable')
    // 11.0h carried in plus the 2.0h day 3 overran, still provisional.
    expect(card.capacity.outstandingDebtMinutes).toBe(780)
    expect(card.capacity.adjustedMinutes).toBe(480)
  })
})

describe('changing the policy mid sprint (E45)', () => {
  useMongo()

  beforeEach(async () => {
    await syncIndexes(EstimateDebtLedger)
    await syncIndexes(AllocationVariance)
  })

  it('does not reverse a settlement already posted', async () => {
    const { day4, projectId, pmId } = await seedWorkedExample({ overrunPolicy: 'reduce' })
    await classifyAndPost({ standupId: day4, actor: { userId: pmId } })
    expect(await EstimateDebtLedger.countDocuments({ entryType: 'settlement' })).toBe(1)

    await ProjectStandupSettings.updateOne(
      { project: projectId },
      { $set: { overrunPolicy: 'absorb' } }
    )

    // Re-running finds every key taken; the settlement stands.
    await classifyAndPost({ standupId: day4, actor: { userId: pmId } })
    expect(await EstimateDebtLedger.countDocuments({ entryType: 'settlement' })).toBe(1)
  })

  it('applies the new policy only to stand-ups not yet completed', async () => {
    const { day4, kasunId, projectId } = await seedWorkedExample({ overrunPolicy: 'reduce' })
    expect(cardFor(await loadAllocationBoard(day4), kasunId).capacity.effectiveMinutes).toBe(360)

    await ProjectStandupSettings.updateOne(
      { project: projectId },
      { $set: { overrunPolicy: 'absorb' } }
    )
    expect(cardFor(await loadAllocationBoard(day4), kasunId).capacity.effectiveMinutes).toBe(480)
  })
})
