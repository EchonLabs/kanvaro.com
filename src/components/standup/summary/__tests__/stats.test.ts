/**
 * The six figures across the summary's stat grid, and the attendance card's
 * own count, derived from one payload.
 *
 * Pure and tested without jsdom: these are the numbers a reader trusts at a
 * glance, and every one of them is a rule about the payload (what counts as
 * "over-estimated", what makes a blocker still open) rather than markup.
 */
import { summaryStats } from '@/components/standup/summary/stats'
import type { SummaryPayload } from '@/components/standup/summary/types'

function payload(overrides: Partial<SummaryPayload> = {}): SummaryPayload {
  return {
    headerFacts: {
      standupDate: '2026-09-11',
      dayNumber: 2,
      totalDays: 10,
      facilitatorName: 'PM Ruth',
      durationMinutes: 15
    },
    attendance: [],
    completedYesterday: [],
    varianceTable: [],
    debtMovements: [],
    memberCommitments: [],
    blockersRaised: [],
    blockersResolved: [],
    carryForwardState: [],
    overridesIssued: [],
    ...overrides
  }
}

describe('summaryStats', () => {
  it('counts every task completed yesterday', () => {
    const stats = summaryStats(
      payload({
        completedYesterday: [
          { taskId: 'a', taskKey: 'KAN-1' },
          { taskId: 'b', taskKey: 'KAN-2' }
        ]
      })
    )

    expect(stats.completedCount).toBe(2)
  })

  it('counts only the variance rows whose outcome ran over or was blocked', () => {
    const stats = summaryStats(
      payload({
        varianceTable: [
          { outcome: 'delivered_over' },
          { outcome: 'blocked' },
          { outcome: 'delivered_on_estimate' }
        ]
      })
    )

    expect(stats.overEstimatedCount).toBe(2)
  })

  it('sums outstanding estimate debt across members', () => {
    const stats = summaryStats(
      payload({
        debtMovements: [
          { outstandingDebtMinutes: 90 },
          { outstandingDebtMinutes: 30 }
        ]
      })
    )

    expect(stats.debtMinutes).toBe(120)
  })

  it('treats a debt row with an unreadable value as zero rather than NaN', () => {
    const stats = summaryStats(
      payload({ debtMovements: [{ outstandingDebtMinutes: 'not-a-number' }, {}] })
    )

    expect(stats.debtMinutes).toBe(0)
  })

  it('counts a blocker as open when its own status says so, not by subtracting resolved ones', () => {
    const stats = summaryStats(
      payload({
        blockersRaised: [{ status: 'open' }, { status: 'resolved' }, { status: 'open' }],
        blockersResolved: [{ resolutionNote: 'Fixed.' }]
      })
    )

    expect(stats.openBlockerCount).toBe(2)
  })

  it('counts carried-forward items and issued overrides', () => {
    const stats = summaryStats(
      payload({
        carryForwardState: [{ taskKey: 'KAN-3' }, { taskKey: 'KAN-4' }],
        overridesIssued: [{ type: 'under_allocation' }]
      })
    )

    expect(stats.carryForwardCount).toBe(2)
    expect(stats.overrideCount).toBe(1)
  })

  it('reports full attendance when everyone recorded is present', () => {
    const stats = summaryStats(
      payload({
        attendance: [
          { memberId: '1', name: 'A', status: 'present' },
          { memberId: '2', name: 'B', status: 'present' }
        ]
      })
    )

    expect(stats.presentCount).toBe(2)
    expect(stats.attendanceTotal).toBe(2)
    expect(stats.attendancePercent).toBe(100)
    expect(stats.fullAttendance).toBe(true)
  })

  it('is not full attendance when somebody is absent', () => {
    const stats = summaryStats(
      payload({
        attendance: [
          { memberId: '1', name: 'A', status: 'present' },
          { memberId: '2', name: 'B', status: 'absent_unplanned' }
        ]
      })
    )

    expect(stats.presentCount).toBe(1)
    expect(stats.attendancePercent).toBe(50)
    expect(stats.fullAttendance).toBe(false)
  })

  it('is not full attendance when nobody was recorded at all', () => {
    const stats = summaryStats(payload())

    expect(stats.attendancePercent).toBe(0)
    expect(stats.fullAttendance).toBe(false)
  })
})
