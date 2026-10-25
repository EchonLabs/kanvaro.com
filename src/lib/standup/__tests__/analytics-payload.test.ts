import { buildAnalyticsPayload } from '@/lib/standup/analytics-payload'

import { JUSTIFICATION, emptyInputs, populatedInputs } from './helpers/analytics-fixtures'

describe('buildAnalyticsPayload', () => {
  it('builds an empty sprint without throwing', () => {
    for (const view of ['full', 'aggregate'] as const) {
      const payload = buildAnalyticsPayload(emptyInputs(), view)

      expect(payload.view).toBe(view)
      expect(payload.headline.onTimeRate).toBeNull()
      expect(payload.headline.outstandingDebtMinutes).toBe(0)
      expect(payload.headline.topOverrideType).toBeNull()
      expect(payload.allocationHealth).toEqual([])
      expect(payload.debtTrend).toEqual([])
      expect(payload.accuracy.team.percent).toBeNull()
      expect(payload.spillChains).toEqual([])
    }
  })

  it('computes the shared widgets from the inputs', () => {
    const payload = buildAnalyticsPayload(populatedInputs(), 'aggregate')

    // Only the day that ran with a snapshot; the non-capacity allocation is left out.
    expect(payload.allocationHealth).toEqual([
      {
        standupId: 's1',
        standupDate: '2026-10-01',
        dayNumber: 1,
        effectiveMinutes: 720,
        fullMinutes: 660,
        underMinutes: 60,
        overMinutes: 60
      }
    ])
    // Days that have happened (ran or missed); the scheduled day is not a point yet.
    expect(payload.debtTrend).toEqual([
      { date: '2026-10-01', outstandingMinutes: 90 },
      { date: '2026-10-02', outstandingMinutes: 90 }
    ])
    expect(payload.headline).toMatchObject({
      onTimeRate: 50,
      missedCount: 1,
      outstandingDebtMinutes: 90,
      overrideCount: 3,
      topOverrideType: 'under_allocation',
      chronicCarryForwardCount: 1
    })
    expect(payload.overrideCountsByType).toEqual({ under_allocation: 3 })
    expect(payload.overrideCountsByReason).toEqual({ no_work_available: 3 })
    expect(payload.accuracy.team.percent).toBeCloseTo(50)
    expect(payload.discipline.standups.map((row) => row.status)).toEqual(['Completed', 'Missed', 'Scheduled'])
    expect(payload.spillChains).toEqual([
      expect.objectContaining({ taskId: 't1', taskKey: 'KAN-212', chainLength: 2, loggedMinutes: 600 })
    ])
  })

  it('names members and shows justifications in the full view', () => {
    const payload = buildAnalyticsPayload(populatedInputs(), 'full')
    if (payload.view !== 'full') throw new Error('expected the full view')

    expect(payload.accuracy.members).toEqual([
      expect.objectContaining({ memberId: 'm-kenji', name: 'Kenji Sato', percent: 50 })
    ])
    expect(payload.overrides).toHaveLength(3)
    expect(payload.overrides[0]).toMatchObject({ justification: JUSTIFICATION, memberNames: ['Amara Okafor'] })
    // Newest first.
    expect(payload.overrides.map((row) => row.overrideId)).toEqual(['o3', 'o2', 'o1'])
    expect(payload.chronicMembers).toEqual([{ memberId: 'm-amara', name: 'Amara Okafor', count: 3 }])
    expect(payload.spillChains[0]).toMatchObject({ assigneeName: 'Amara Okafor' })
    expect(payload.ageingItems.find((item) => item.itemId === 'c1')).toMatchObject({
      memberName: 'Amara Okafor',
      taskKey: 'KAN-212'
    })
  })

  it('leaks no individual data in the aggregate view (NFR-13)', () => {
    const payload = buildAnalyticsPayload(populatedInputs(), 'aggregate')
    const json = JSON.stringify(payload)

    for (const forbidden of ['m-amara', 'm-kenji', 'Amara', 'Kenji', JUSTIFICATION]) {
      expect(json).not.toContain(forbidden)
    }
    if (payload.view !== 'aggregate') throw new Error('expected the aggregate view')
    expect(payload.chronicMemberCount).toBe(1)
    expect(Object.keys(payload.accuracy)).toEqual(['team'])
    expect(payload).not.toHaveProperty('overrides')
    expect(payload).not.toHaveProperty('chronicMembers')
  })
})
