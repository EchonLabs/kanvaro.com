/**
 * The `StandupSummary` document (spec §15.13, RUN-20 step 8): a stand-up's
 * summary, persisted verbatim so a re-read never recomputes it. The one
 * load-bearing constraint here is the unique index on `standup` — a summary
 * belongs to exactly one stand-up.
 */
import { StandupSummary } from '@/models/StandupSummary'

import { anyId, ids, syncIndexes, useMongo } from './helpers/mongo'

const baseSummary = (overrides: Record<string, unknown> = {}) => ({
  standup: ids.user,
  sprint: ids.sprint,
  project: ids.project,
  organization: ids.organization,
  headerFacts: {
    standupDate: '2026-08-10',
    dayNumber: 1,
    totalDays: 9,
    facilitatorName: 'Kasun',
    durationMinutes: 15
  },
  ...overrides
})

describe('StandupSummary model', () => {
  useMongo()

  beforeEach(async () => {
    await syncIndexes(StandupSummary)
  })

  it('persists a summary with the §15.13 sections defaulting to empty arrays', async () => {
    const created = await StandupSummary.create(baseSummary())

    expect(created.attendance).toEqual([])
    expect(created.completedYesterday).toEqual([])
    expect(created.varianceTable).toEqual([])
    expect(created.debtMovements).toEqual([])
    expect(created.memberCommitments).toEqual([])
    expect(created.blockersRaised).toEqual([])
    expect(created.blockersResolved).toEqual([])
    expect(created.carryForwardState).toEqual([])
    expect(created.overridesIssued).toEqual([])
    expect(created.generatedAt).toBeInstanceOf(Date)
  })

  it('refuses a second summary for the same stand-up', async () => {
    await StandupSummary.create(baseSummary())

    await expect(StandupSummary.create(baseSummary())).rejects.toThrow(/E11000|duplicate key/i)

    expect(await StandupSummary.countDocuments({ standup: ids.user })).toBe(1)
  })

  it('allows a different stand-up to have its own summary', async () => {
    await StandupSummary.create(baseSummary())
    await StandupSummary.create(baseSummary({ standup: anyId() }))

    expect(await StandupSummary.countDocuments({})).toBe(2)
  })

  it('requires headerFacts', async () => {
    await expect(
      StandupSummary.create(baseSummary({ headerFacts: undefined }))
    ).rejects.toThrow(/headerFacts/i)
  })

  it('stores an optional pmNotes string', async () => {
    const created = await StandupSummary.create(baseSummary({ pmNotes: 'Great sprint pace.' }))
    expect(created.pmNotes).toBe('Great sprint pace.')
  })
})
