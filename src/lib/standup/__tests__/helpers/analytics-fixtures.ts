/**
 * Shared stand-up analytics inputs: an empty sprint and a small populated one
 * (two members, one chronic under-allocation, one spill chain, one chronic
 * carry-forward item). Used by the payload tests and the page's component
 * tests, so both read the same sprint.
 */
import type { AnalyticsInputs } from '@/lib/standup/analytics-payload'

export const JUSTIFICATION = 'Nothing else was unblocked for Amara today'

export function emptyInputs(): AnalyticsInputs {
  return {
    sprint: {
      id: 'sprint-1',
      name: 'Sprint 14',
      projectId: 'project-1',
      projectName: 'Kanvaro Web',
      startDate: '2026-10-01',
      endDate: '2026-10-14'
    },
    standups: [],
    allocations: [],
    completedTasks: [],
    taskTotals: [],
    ledger: [],
    overrides: [],
    carryForward: [],
    tasks: {},
    memberNames: {}
  }
}

export function populatedInputs(): AnalyticsInputs {
  const under = (n: number) => ({
    overrideId: `o${n}`,
    standupId: 's1',
    standupDate: '2026-10-01',
    type: 'under_allocation',
    reasonCode: 'no_work_available',
    justification: JUSTIFICATION,
    affectedMemberIds: ['m-amara'],
    issuedAt: `2026-10-0${n}T09:30:00.000Z`
  })

  return {
    ...emptyInputs(),
    standups: [
      {
        standupId: 's1',
        standupDate: '2026-10-01',
        dayNumber: 1,
        status: 'Completed',
        wasBackfilled: false,
        actualDurationMinutes: 14,
        capacity: [
          { memberId: 'm-amara', effectiveMinutes: 360 },
          { memberId: 'm-kenji', effectiveMinutes: 360 }
        ]
      },
      {
        standupId: 's2',
        standupDate: '2026-10-02',
        dayNumber: 2,
        status: 'Missed',
        wasBackfilled: false,
        capacity: null
      },
      {
        standupId: 's3',
        standupDate: '2026-10-03',
        dayNumber: 3,
        status: 'Scheduled',
        wasBackfilled: false,
        capacity: null
      }
    ],
    allocations: [
      { allocationId: 'a1', standupId: 's1', memberId: 'm-amara', taskId: 't1', plannedMinutes: 300, countsTowardCapacity: true },
      { allocationId: 'a2', standupId: 's1', memberId: 'm-kenji', taskId: 't2', plannedMinutes: 420, countsTowardCapacity: true },
      { allocationId: 'a3', standupId: 's1', memberId: 'm-kenji', taskId: 't3', plannedMinutes: 60, countsTowardCapacity: false },
      { allocationId: 'a4', standupId: 's2', memberId: 'm-amara', taskId: 't1', plannedMinutes: 60, carryChainRoot: 'a1', countsTowardCapacity: true }
    ],
    completedTasks: [
      { taskId: 't2', memberId: 'm-kenji', originalEstimateMinutes: 120, totalLoggedMinutesOnTask: 240 }
    ],
    taskTotals: [{ taskId: 't1', originalEstimateMinutes: 480, totalLoggedMinutesOnTask: 600 }],
    ledger: [{ memberId: 'm-amara', entryType: 'accrual', minutes: 90, standupDate: '2026-10-01' }],
    overrides: [under(1), under(2), under(3)],
    carryForward: [
      { itemId: 'c1', taskId: 't1', memberId: 'm-amara', ageInStandups: 9, status: 'escalated' },
      { itemId: 'c2', memberId: 'm-kenji', ageInStandups: 1, status: 'open' }
    ],
    tasks: {
      t1: { key: 'KAN-212', title: 'Checkout retry', assigneeId: 'm-amara' },
      t2: { key: 'KAN-198', title: 'Export', assigneeId: 'm-kenji' }
    },
    memberNames: { 'm-amara': 'Amara Okafor', 'm-kenji': 'Kenji Sato' }
  }
}
