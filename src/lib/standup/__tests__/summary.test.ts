/**
 * `summary.ts` — the pure §15.13 assembler. Takes rows the completion saga
 * already has in memory and shapes them into `StandupSummary`'s schema,
 * without querying anything itself. No database in this file.
 */
import { buildSummaryDocument, personalCommitmentFor, type BuildSummaryInput } from '@/lib/standup/summary'

const fixture: BuildSummaryInput = {
  standupId: 'standup-1',
  sprintId: 'sprint-1',
  projectId: 'project-1',
  organizationId: 'org-1',
  headerFacts: {
    standupDate: '2026-08-10',
    dayNumber: 1,
    totalDays: 9,
    facilitatorName: 'Kasun',
    durationMinutes: 15
  },
  attendance: [{ memberId: 'member-1' as any, name: 'Kasun', status: 'present' }],
  completedYesterday: [{ taskId: 'task-1' as any, taskKey: 'KAN-1', title: 'Wire the health job' }],
  varianceTable: [{ taskId: 'task-1', plannedMinutes: 60, actualMinutes: 90 }],
  debtMovements: [{ memberId: 'member-1', deltaMinutes: 30 }],
  memberCommitments: [
    {
      memberId: 'member-1' as any,
      name: 'Kasun',
      allocations: [{ taskId: 'task-2' as any, taskKey: 'KAN-2', plannedMinutes: 120 }]
    },
    {
      memberId: 'member-2' as any,
      name: 'Nadeesha',
      allocations: [{ taskId: 'task-3' as any, taskKey: 'KAN-3', plannedMinutes: 90 }]
    }
  ],
  blockersRaised: [{ id: 'blocker-1', text: 'Waiting on vendor sandbox' }],
  blockersResolved: [],
  carryForwardState: [{ id: 'cfw-1', type: 'unfinished_task' }],
  overridesIssued: [{ id: 'override-1', type: 'under_allocation' }],
  pmNotes: 'Solid day.'
}

describe('buildSummaryDocument', () => {
  it('returns the exact §15.13 shape given a fixture input', () => {
    const result = buildSummaryDocument(fixture)

    expect(result).toEqual({
      standup: 'standup-1',
      sprint: 'sprint-1',
      project: 'project-1',
      organization: 'org-1',
      generatedAt: expect.any(Date),
      headerFacts: fixture.headerFacts,
      attendance: fixture.attendance,
      completedYesterday: fixture.completedYesterday,
      varianceTable: fixture.varianceTable,
      debtMovements: fixture.debtMovements,
      memberCommitments: fixture.memberCommitments,
      blockersRaised: fixture.blockersRaised,
      blockersResolved: fixture.blockersResolved,
      carryForwardState: fixture.carryForwardState,
      overridesIssued: fixture.overridesIssued,
      pmNotes: fixture.pmNotes
    })
  })

  it('stamps generatedAt with the current time', () => {
    const before = Date.now()
    const result = buildSummaryDocument(fixture)
    const after = Date.now()

    expect(result.generatedAt.getTime()).toBeGreaterThanOrEqual(before)
    expect(result.generatedAt.getTime()).toBeLessThanOrEqual(after)
  })
})

describe('personalCommitmentFor', () => {
  it('returns undefined for an unknown member id', () => {
    expect(personalCommitmentFor(fixture, 'member-does-not-exist')).toBeUndefined()
  })

  it('returns the matching row for a known member id', () => {
    const result = personalCommitmentFor(fixture, 'member-2')

    expect(result?.name).toBe('Nadeesha')
    expect(result?.allocations).toEqual([{ taskId: 'task-3', taskKey: 'KAN-3', plannedMinutes: 90 }])
  })
})
