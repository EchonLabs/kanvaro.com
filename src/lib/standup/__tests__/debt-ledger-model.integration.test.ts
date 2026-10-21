/**
 * The estimate-debt ledger and its summary read model against the database
 * (Phase 8, Task 2).
 *
 * Two properties are load-bearing and neither can be proven with a mock.
 *
 * **DAT-4, append-only.** Debt is the number a PM cites in a live meeting, so
 * a correction has to be a new entry somebody can see, never a quiet edit of
 * the old one. The refusal lives on the model rather than in the service
 * because a service is one refactor away from losing it.
 *
 * **VAR-3, idempotency.** Classification is re-runnable, so re-running it must
 * not post a second accrual. `{ sourceAllocation, entryType }` is that key for
 * allocation-derived entries; settlements and carry-ins have no allocation and
 * get their own key. Only a real unique index proves either (E11000).
 */
import mongoose from 'mongoose'

import { EstimateDebtLedger, WRITEOFF_REASON_MIN_LENGTH } from '@/models/EstimateDebtLedger'
import { MemberSprintDebtSummary } from '@/models/MemberSprintDebtSummary'

import { ids, syncIndexes, useMongo } from './helpers/mongo'

const { organization, project, sprint, member } = ids

const sourceStandup = new mongoose.Types.ObjectId()
const sourceAllocation = new mongoose.Types.ObjectId()
const createdBy = new mongoose.Types.ObjectId()

function entry(overrides: Record<string, unknown> = {}) {
  return {
    project,
    sprint,
    member,
    organization,
    entryType: 'accrual',
    minutes: 120,
    sourceStandup,
    createdBy,
    ...overrides
  }
}

const accrual = (overrides: Record<string, unknown> = {}) =>
  entry({ entryType: 'accrual', sourceAllocation, ...overrides })

const credit = (overrides: Record<string, unknown> = {}) =>
  entry({ entryType: 'credit', sourceAllocation, ...overrides })

const settlement = (overrides: Record<string, unknown> = {}) =>
  entry({ entryType: 'settlement', ...overrides })

const writeoff = (overrides: Record<string, unknown> = {}) =>
  entry({
    entryType: 'writeoff',
    reason: 'The estimate was wrong at planning, not a delivery problem.',
    ...overrides
  })

function summary(overrides: Record<string, unknown> = {}) {
  return {
    project,
    sprint,
    member,
    organization,
    outstandingMinutes: 120,
    accruedMinutes: 120,
    creditedMinutes: 0,
    settledMinutes: 0,
    writtenOffMinutes: 0,
    carriedInMinutes: 0,
    lastRebuiltAt: new Date(),
    sourceVersion: 1,
    ...overrides
  }
}

describe('EstimateDebtLedger model', () => {
  useMongo()

  beforeEach(async () => {
    await syncIndexes(EstimateDebtLedger)
  })

  it('refuses to update a ledger entry', async () => {
    const row = await EstimateDebtLedger.create(accrual({ minutes: 120 }))
    await expect(
      EstimateDebtLedger.updateOne({ _id: row._id }, { $set: { minutes: 60 } })
    ).rejects.toThrow(/append-only/i)
  })

  it('refuses to update through findOneAndUpdate', async () => {
    const row = await EstimateDebtLedger.create(accrual())
    await expect(
      EstimateDebtLedger.findOneAndUpdate({ _id: row._id }, { $set: { minutes: 60 } })
    ).rejects.toThrow(/append-only/i)
  })

  it('refuses to update many', async () => {
    await EstimateDebtLedger.create(accrual())
    await expect(
      EstimateDebtLedger.updateMany({ sprint }, { $set: { minutes: 60 } })
    ).rejects.toThrow(/append-only/i)
  })

  it('refuses to delete a ledger entry', async () => {
    const row = await EstimateDebtLedger.create(accrual({ minutes: 120 }))
    await expect(EstimateDebtLedger.deleteOne({ _id: row._id })).rejects.toThrow(/append-only/i)
  })

  it('refuses to delete many', async () => {
    await EstimateDebtLedger.create(accrual())
    await expect(EstimateDebtLedger.deleteMany({ sprint })).rejects.toThrow(/append-only/i)
  })

  it('leaves the refused entry untouched', async () => {
    const row = await EstimateDebtLedger.create(accrual({ minutes: 120 }))
    await expect(
      EstimateDebtLedger.updateOne({ _id: row._id }, { $set: { minutes: 60 } })
    ).rejects.toThrow()
    expect((await EstimateDebtLedger.findById(row._id).lean())!.minutes).toBe(120)
  })

  it('permits one accrual per allocation and refuses a second', async () => {
    await EstimateDebtLedger.create(accrual())
    await expect(EstimateDebtLedger.create(accrual())).rejects.toThrow(/E11000/)
  })

  it('permits an accrual and a credit against the same allocation', async () => {
    await EstimateDebtLedger.create(accrual())
    await expect(EstimateDebtLedger.create(credit())).resolves.toBeTruthy()
  })

  it('permits many entries that carry no source allocation', async () => {
    await EstimateDebtLedger.create(writeoff())
    await expect(EstimateDebtLedger.create(writeoff())).resolves.toBeTruthy()
  })

  it('permits one settlement per member per stand-up and refuses a second', async () => {
    await EstimateDebtLedger.create(settlement())
    await expect(EstimateDebtLedger.create(settlement())).rejects.toThrow(/E11000/)
  })

  it('permits a settlement for the same stand-up against a different member', async () => {
    await EstimateDebtLedger.create(settlement())
    await expect(
      EstimateDebtLedger.create(settlement({ member: new mongoose.Types.ObjectId() }))
    ).resolves.toBeTruthy()
  })

  it('permits a carry-in alongside a settlement on the same stand-up', async () => {
    await EstimateDebtLedger.create(settlement())
    await expect(
      EstimateDebtLedger.create(
        entry({ entryType: 'carry_in', sourceSprint: new mongoose.Types.ObjectId() })
      )
    ).resolves.toBeTruthy()
  })

  it('rejects a negative minutes value', async () => {
    await expect(EstimateDebtLedger.create(accrual({ minutes: -120 }))).rejects.toThrow()
  })

  it('rejects a zero minutes value', async () => {
    await expect(EstimateDebtLedger.create(accrual({ minutes: 0 }))).rejects.toThrow()
  })

  it('rejects a non-integer minutes value', async () => {
    await expect(EstimateDebtLedger.create(accrual({ minutes: 90.5 }))).rejects.toThrow(
      /whole number/
    )
  })

  it('rejects an unknown entry type', async () => {
    await expect(EstimateDebtLedger.create(accrual({ entryType: 'forgiveness' }))).rejects.toThrow(
      /entryType/
    )
  })

  it('rejects a writeoff whose reason is shorter than twenty characters', async () => {
    await expect(EstimateDebtLedger.create(writeoff({ reason: 'too short' }))).rejects.toThrow(
      new RegExp(`${WRITEOFF_REASON_MIN_LENGTH} characters`)
    )
  })

  it('rejects a writeoff with no reason at all', async () => {
    await expect(EstimateDebtLedger.create(writeoff({ reason: undefined }))).rejects.toThrow(
      new RegExp(`${WRITEOFF_REASON_MIN_LENGTH} characters`)
    )
  })

  it('does not demand a reason on any other entry type', async () => {
    await expect(EstimateDebtLedger.create(accrual())).resolves.toBeTruthy()
  })
})

describe('MemberSprintDebtSummary model', () => {
  useMongo()

  beforeEach(async () => {
    await syncIndexes(MemberSprintDebtSummary)
  })

  it('permits one summary per member per sprint and refuses a second', async () => {
    await MemberSprintDebtSummary.create(summary())
    await expect(MemberSprintDebtSummary.create(summary())).rejects.toThrow(/E11000/)
  })

  it('permits the same member a summary on another sprint', async () => {
    await MemberSprintDebtSummary.create(summary())
    await expect(
      MemberSprintDebtSummary.create(summary({ sprint: new mongoose.Types.ObjectId() }))
    ).resolves.toBeTruthy()
  })

  it('rejects a non-integer minute total', async () => {
    await expect(
      MemberSprintDebtSummary.create(summary({ accruedMinutes: 90.5 }))
    ).rejects.toThrow(/whole number/)
  })

  it('defaults every total to zero so a member with no ledger reads as clean', async () => {
    const row = await MemberSprintDebtSummary.create({
      project,
      sprint,
      member,
      organization,
      lastRebuiltAt: new Date()
    })
    expect(row.outstandingMinutes).toBe(0)
    expect(row.accruedMinutes).toBe(0)
    expect(row.creditedMinutes).toBe(0)
    expect(row.settledMinutes).toBe(0)
    expect(row.writtenOffMinutes).toBe(0)
    expect(row.carriedInMinutes).toBe(0)
    expect(row.sourceVersion).toBe(0)
  })

  it('is freely rewritable, unlike the ledger it summarises', async () => {
    const row = await MemberSprintDebtSummary.create(summary())
    await expect(
      MemberSprintDebtSummary.updateOne({ _id: row._id }, { $set: { outstandingMinutes: 0 } })
    ).resolves.toMatchObject({ modifiedCount: 1 })
  })
})
