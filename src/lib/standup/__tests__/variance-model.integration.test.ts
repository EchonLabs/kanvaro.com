/**
 * The `AllocationVariance` document against the database (Phase 8, Task 1).
 *
 * One row is written per allocation when a stand-up completes, so the unique
 * index on `allocation` is the record's whole reason for existing — the
 * classifier and the debt ledger both trust that "one allocation, one
 * variance row" holds, and only a real index can prove it (E11000, not a
 * mock rejecting on faith).
 *
 * The other property proven here is DAT-2: every minute field is a whole
 * number, enforced the same way and with the same message wording as
 * `Allocation.ts`, so the two models in this module fail alike.
 */
import mongoose from 'mongoose'

import { AllocationVariance } from '@/models/AllocationVariance'

import { ids, syncIndexes, useMongo } from './helpers/mongo'

const { organization, project, sprint, member } = ids

const standup = new mongoose.Types.ObjectId()
const computedAtStandup = new mongoose.Types.ObjectId()
const task = new mongoose.Types.ObjectId()
const allocation = new mongoose.Types.ObjectId()

function baseRecord(overrides: Record<string, unknown> = {}) {
  return {
    allocation,
    standup,
    computedAtStandup,
    sprint,
    member,
    task,
    project,
    organization,
    plannedMinutes: 180,
    loggedMinutesOnDay: 150,
    dayVarianceMinutes: -30,
    originalEstimateMinutes: 480,
    totalLoggedMinutesOnTask: 300,
    taskVarianceMinutes: -180,
    remainingBeforeMinutes: 330,
    remainingAfterMinutes: 180,
    taskStatusAtClose: 'in_progress',
    outcome: 'delivered_under',
    computedAt: new Date(),
    ...overrides
  }
}

describe('AllocationVariance model', () => {
  useMongo()

  beforeEach(async () => {
    await syncIndexes(AllocationVariance)
  })

  it('permits exactly one variance record per allocation', async () => {
    await AllocationVariance.create(baseRecord())
    await expect(AllocationVariance.create(baseRecord())).rejects.toThrow(/E11000/)
  })

  it('rejects an unknown outcome', async () => {
    await expect(
      AllocationVariance.create({ ...baseRecord(), outcome: 'went_badly' })
    ).rejects.toThrow(/outcome/)
  })

  it('rejects a non-integer minute value', async () => {
    await expect(
      AllocationVariance.create({ ...baseRecord(), loggedMinutesOnDay: 90.5 })
    ).rejects.toThrow(/whole number/)
  })

  it('defaults overrun and credit to zero and both flags to false', async () => {
    const row = await AllocationVariance.create(baseRecord())
    expect(row.overrunMinutes).toBe(0)
    expect(row.creditMinutes).toBe(0)
    expect(row.recomputedAfterCompletion).toBe(false)
    expect(row.sharedContribution).toBe(false)
  })
})
