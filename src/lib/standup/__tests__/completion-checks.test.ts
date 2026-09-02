/**
 * The completion-check evaluator (Phase 7, Task 7 — spec §10.3, §17.8).
 *
 * Phase 7 can honestly answer six of the eleven checks: CC-1, CC-2, CC-5, CC-6,
 * CC-7 and CC-10. The other five depend on engines that do not exist yet.
 *
 * They are still returned, as `not_evaluated` naming the phase that owns them.
 * The alternative — omitting them — would make Panel 7 look complete when it is
 * not, and would let a PM read "all checks passed" from a list that never asked
 * whether the carry-forward items have notes. A check that cannot be run is a
 * different thing from a check that passed, and the payload says which.
 *
 * No override path is built here (Phase 10). `overridable` is data on the
 * result, not a control: the evaluator reports what the spec's table says about
 * each check, and Phase 10 decides what to render.
 */
import type { CapacityBreakdown } from '../capacity'
import {
  blockingFailures,
  evaluateCompletionChecks,
  type CheckAllocation,
  type CheckMember
} from '../completion-checks'
import { minutes } from '../minutes'

const m = minutes

const KASUN = 'kasun'
const AMAL = 'amal'

function capacity(overrides: Partial<CapacityBreakdown> = {}): CapacityBreakdown {
  return {
    memberId: KASUN,
    date: '2026-08-17',
    nominalMinutes: m(480),
    adjustments: [],
    adjustedMinutes: m(480),
    outstandingDebtMinutes: m(0),
    overrunPolicy: 'absorb',
    effectiveMinutes: m(480),
    allocatedMinutes: m(480),
    gapMinutes: m(0),
    status: 'full',
    isUnavailable: false,
    strandedMinutes: m(0),
    ...overrides
  }
}

function allocation(overrides: Partial<CheckAllocation> = {}): CheckAllocation {
  return {
    allocationId: 'a1',
    taskId: 't1',
    taskKey: 'KAN-214',
    memberId: KASUN,
    plannedMinutes: m(480),
    remainingEstimateMinutes: m(480),
    isBlocked: false,
    excludedFromCapacity: false,
    pairedDeliberately: false,
    ...overrides
  }
}

function member(overrides: Partial<CheckMember> = {}): CheckMember {
  return {
    memberId: KASUN,
    name: 'Kasun',
    attendance: 'present',
    capacity: capacity(),
    allocations: [allocation()],
    ...overrides
  }
}

/** A stand-up where every Phase 7 check passes. */
const healthy = () => ({ shape: 'mid_sprint' as const, members: [member()] })

const check = (results: ReturnType<typeof evaluateCompletionChecks>, id: string) => {
  const found = results.find((result) => result.checkId === id)
  if (!found) throw new Error(`No result for ${id}`)
  return found
}

describe('evaluateCompletionChecks', () => {
  it('returns all eleven checks, in table order', () => {
    const results = evaluateCompletionChecks(healthy())

    expect(results.map((r) => r.checkId)).toEqual([
      'CC-1',
      'CC-2',
      'CC-3',
      'CC-4',
      'CC-5',
      'CC-6',
      'CC-7',
      'CC-8',
      'CC-9',
      'CC-10',
      'CC-11'
    ])
  })

  it('passes every Phase 7 check on a healthy stand-up', () => {
    const results = evaluateCompletionChecks(healthy())

    for (const id of ['CC-1', 'CC-2', 'CC-5', 'CC-6', 'CC-7', 'CC-10']) {
      expect(check(results, id).status).toBe('pass')
    }
  })

  describe('CC-3 — yesterday has been explained (Phase 8)', () => {
    const varianceRow = (overrides: Record<string, unknown> = {}) => ({
      allocationId: 'alloc-1',
      taskKey: 'KAN-214',
      memberId: 'kasun',
      requiresRevision: false,
      requiresReason: false,
      ...overrides
    })

    it('fails when an over-consumed row has no revised estimate (AC-13)', () => {
      const result = check(
        evaluateCompletionChecks({
          ...healthy(),
          variance: [varianceRow({ requiresRevision: true })]
        }),
        'CC-3'
      )
      expect(result.status).toBe('fail')
      expect(result.hard).toBe(true)
      expect(result.entities[0]).toMatchObject({ needs: 'revision', taskKey: 'KAN-214' })
    })

    it('fails when a not-started row has no reason (AC-18)', () => {
      const result = check(
        evaluateCompletionChecks({
          ...healthy(),
          variance: [varianceRow({ requiresReason: true, taskKey: 'KAN-231' })]
        }),
        'CC-3'
      )
      expect(result.status).toBe('fail')
      expect(result.entities[0]).toMatchObject({ needs: 'reason', taskKey: 'KAN-231' })
    })

    it('passes once every row is answered', () => {
      const result = check(
        evaluateCompletionChecks({
          ...healthy(),
          variance: [
            varianceRow({ requiresRevision: true, revisedRemainingMinutes: minutes(180) }),
            varianceRow({
              requiresReason: true,
              notStartedReason: 'Kasun stayed on the invoice model all day.'
            })
          ]
        }),
        'CC-3'
      )
      expect(result.status).toBe('pass')
    })

    it('does not accept a blank reason as an answer', () => {
      const result = check(
        evaluateCompletionChecks({
          ...healthy(),
          variance: [varianceRow({ requiresReason: true, notStartedReason: '   ' })]
        }),
        'CC-3'
      )
      expect(result.status).toBe('fail')
    })

    it('passes when there is nothing to explain', () => {
      expect(check(evaluateCompletionChecks({ ...healthy(), variance: [] }), 'CC-3').status).toBe(
        'pass'
      )
    })

    it('leaves CC-3 not_evaluated when no variance was supplied at all', () => {
      // Absent is not empty: a caller that forgot to load yesterday must not be
      // told the day is clean.
      const result = check(evaluateCompletionChecks(healthy()), 'CC-3')
      expect(result.status).toBe('not_evaluated')
      expect(result.ownedBy).toBe('Phase 8')
    })

    it('passes on a day-one stand-up, which has no yesterday', () => {
      const result = check(
        evaluateCompletionChecks({
          ...healthy(),
          shape: 'day_one',
          variance: [varianceRow({ requiresRevision: true })]
        }),
        'CC-3'
      )
      expect(result.status).toBe('pass')
    })

    it('blocks completion when it fails', () => {
      const results = evaluateCompletionChecks({
        ...healthy(),
        variance: [varianceRow({ requiresRevision: true })]
      })
      expect(blockingFailures(results).map((row) => row.checkId)).toContain('CC-3')
    })
  })

  describe('the four checks still unanswerable', () => {
    it('reports them as not_evaluated, never as passing', () => {
      const results = evaluateCompletionChecks(healthy())

      for (const id of ['CC-4', 'CC-8', 'CC-9', 'CC-11']) {
        expect(check(results, id).status).toBe('not_evaluated')
      }
    })

    it('names the phase that will implement each one', () => {
      const results = evaluateCompletionChecks(healthy())

      expect(check(results, 'CC-4').ownedBy).toBe('Phase 9')
      expect(check(results, 'CC-8').ownedBy).toBe('Phase 11')
      expect(check(results, 'CC-9').ownedBy).toBe('Phase 10')
      expect(check(results, 'CC-11').ownedBy).toBe('Phase 10')
    })

    it('does not block completion, because an unbuilt check has failed nothing', () => {
      expect(blockingFailures(evaluateCompletionChecks(healthy()))).toEqual([])
    })
  })

  describe('CC-1 — every present member is planned to capacity', () => {
    it('fails an under-allocated member and names them with their numbers', () => {
      const results = evaluateCompletionChecks({
        shape: 'mid_sprint',
        members: [
          member({
            capacity: capacity({ allocatedMinutes: m(300), gapMinutes: m(180), status: 'under' }),
            allocations: [allocation({ plannedMinutes: m(300), remainingEstimateMinutes: m(300) })]
          })
        ]
      })

      const cc1 = check(results, 'CC-1')
      expect(cc1.status).toBe('fail')
      expect(cc1.overridable).toBe(true)
      expect(cc1.message).toBe('1 member is not planned to full capacity.')
      expect(cc1.entities).toEqual([
        {
          memberId: KASUN,
          name: 'Kasun',
          effectiveMinutes: 480,
          allocatedMinutes: 300,
          gapMinutes: 180
        }
      ])
    })

    it('pluralises the message on more than one', () => {
      const under = capacity({ allocatedMinutes: m(300), gapMinutes: m(180), status: 'under' })
      const results = evaluateCompletionChecks({
        shape: 'mid_sprint',
        members: [
          member({ capacity: under, allocations: [] }),
          member({ memberId: AMAL, name: 'Amal', capacity: under, allocations: [] })
        ]
      })

      expect(check(results, 'CC-1').message).toBe('2 members are not planned to full capacity.')
    })

    it('ignores an unavailable member — ALO-3 says no action is needed', () => {
      const results = evaluateCompletionChecks({
        shape: 'mid_sprint',
        members: [
          member({
            attendance: 'absent_planned',
            capacity: capacity({
              effectiveMinutes: m(0),
              adjustedMinutes: m(0),
              allocatedMinutes: m(0),
              gapMinutes: m(0),
              status: 'unavailable',
              isUnavailable: true
            }),
            allocations: []
          })
        ]
      })

      expect(check(results, 'CC-1').status).toBe('pass')
    })

    it('ignores an over-allocated member — that is CC-6, and reporting both is telling the PM the same thing twice', () => {
      const results = evaluateCompletionChecks({
        shape: 'mid_sprint',
        members: [
          member({
            capacity: capacity({ allocatedMinutes: m(600), gapMinutes: m(-120), status: 'over' })
          })
        ]
      })

      expect(check(results, 'CC-1').status).toBe('pass')
      expect(check(results, 'CC-6').status).toBe('fail')
    })
  })

  describe('CC-2 — every allocation references an estimated task', () => {
    it('fails and is never overridable', () => {
      const results = evaluateCompletionChecks({
        shape: 'mid_sprint',
        members: [member({ allocations: [allocation({ remainingEstimateMinutes: m(0) })] })]
      })

      const cc2 = check(results, 'CC-2')
      expect(cc2.status).toBe('fail')
      expect(cc2.overridable).toBe(false)
      expect(cc2.message).toBe('KAN-214 has no estimate. Estimate it before allocating.')
      expect(cc2.entities).toEqual([{ taskId: 't1', key: 'KAN-214' }])
    })

    it('names only the first task in the message but lists them all', () => {
      const results = evaluateCompletionChecks({
        shape: 'mid_sprint',
        members: [
          member({
            allocations: [
              allocation({ remainingEstimateMinutes: m(0) }),
              allocation({
                allocationId: 'a2',
                taskId: 't2',
                taskKey: 'KAN-231',
                remainingEstimateMinutes: m(0)
              })
            ]
          })
        ]
      })

      expect(check(results, 'CC-2').entities).toHaveLength(2)
    })
  })

  describe('CC-5 — no empty allocations', () => {
    it('fails a zero-hour row', () => {
      const results = evaluateCompletionChecks({
        shape: 'mid_sprint',
        members: [member({ allocations: [allocation({ plannedMinutes: 0 as any })] })]
      })

      const cc5 = check(results, 'CC-5')
      expect(cc5.status).toBe('fail')
      expect(cc5.overridable).toBe(false)
      expect(cc5.message).toBe('Remove or set hours on 1 empty allocation.')
    })
  })

  describe('CC-6 — nobody is over capacity', () => {
    it('fails an over-allocated member and is overridable', () => {
      const results = evaluateCompletionChecks({
        shape: 'mid_sprint',
        members: [
          member({
            capacity: capacity({ allocatedMinutes: m(600), gapMinutes: m(-120), status: 'over' })
          })
        ]
      })

      const cc6 = check(results, 'CC-6')
      expect(cc6.status).toBe('fail')
      expect(cc6.overridable).toBe(true)
      expect(cc6.message).toBe('1 member is over allocated.')
      expect(cc6.entities[0]).toMatchObject({ memberId: KASUN, gapMinutes: -120 })
    })
  })

  describe('CC-7 — attendance is set for everybody expected', () => {
    it('fails when a member has no attendance recorded', () => {
      const results = evaluateCompletionChecks({
        shape: 'mid_sprint',
        members: [member({ attendance: undefined, allocations: [] })]
      })

      const cc7 = check(results, 'CC-7')
      expect(cc7.status).toBe('fail')
      expect(cc7.overridable).toBe(false)
      expect(cc7.message).toBe('Set attendance for 1 member.')
      expect(cc7.entities).toEqual([{ memberId: KASUN, name: 'Kasun' }])
    })

    it('passes when everybody has a state, including the absent ones', () => {
      const results = evaluateCompletionChecks({
        shape: 'mid_sprint',
        members: [
          member({ attendance: 'present' }),
          member({
            memberId: AMAL,
            name: 'Amal',
            attendance: 'absent_unplanned',
            capacity: capacity({
              memberId: AMAL,
              effectiveMinutes: m(0),
              allocatedMinutes: m(0),
              gapMinutes: m(0),
              status: 'unavailable',
              isUnavailable: true
            }),
            allocations: []
          })
        ]
      })

      expect(check(results, 'CC-7').status).toBe('pass')
    })
  })

  describe('CC-10 — one task, one member', () => {
    it('fails when two members hold the same task', () => {
      const shared = { taskId: 't9', taskKey: 'KAN-300' }
      const results = evaluateCompletionChecks({
        shape: 'mid_sprint',
        members: [
          member({ allocations: [allocation({ ...shared, memberId: KASUN })] }),
          member({
            memberId: AMAL,
            name: 'Amal',
            capacity: capacity({ memberId: AMAL }),
            allocations: [allocation({ ...shared, allocationId: 'a2', memberId: AMAL })]
          })
        ]
      })

      const cc10 = check(results, 'CC-10')
      expect(cc10.status).toBe('fail')
      expect(cc10.overridable).toBe(true)
      expect(cc10.message).toBe('KAN-300 is allocated to two people.')
      expect(cc10.entities).toEqual([
        { taskId: 't9', key: 'KAN-300', memberIds: [KASUN, AMAL] }
      ])
    })

    it('passes when the pairing was confirmed deliberate (ALO-9, E24)', () => {
      const shared = { taskId: 't9', taskKey: 'KAN-300', pairedDeliberately: true }
      const results = evaluateCompletionChecks({
        shape: 'mid_sprint',
        members: [
          member({ allocations: [allocation({ ...shared, memberId: KASUN })] }),
          member({
            memberId: AMAL,
            name: 'Amal',
            capacity: capacity({ memberId: AMAL }),
            allocations: [allocation({ ...shared, allocationId: 'a2', memberId: AMAL })]
          })
        ]
      })

      expect(check(results, 'CC-10').status).toBe('pass')
    })

    it('needs every row on the task marked, not just one', () => {
      // One member ticking "deliberate pairing" while the other row is an
      // accident is exactly the case CC-10 exists to catch.
      const shared = { taskId: 't9', taskKey: 'KAN-300' }
      const results = evaluateCompletionChecks({
        shape: 'mid_sprint',
        members: [
          member({
            allocations: [allocation({ ...shared, memberId: KASUN, pairedDeliberately: true })]
          }),
          member({
            memberId: AMAL,
            name: 'Amal',
            capacity: capacity({ memberId: AMAL }),
            allocations: [allocation({ ...shared, allocationId: 'a2', memberId: AMAL })]
          })
        ]
      })

      expect(check(results, 'CC-10').status).toBe('fail')
    })

    it('ignores a detached row — the absent owner does not count as a second person', () => {
      const shared = { taskId: 't9', taskKey: 'KAN-300' }
      const results = evaluateCompletionChecks({
        shape: 'mid_sprint',
        members: [
          member({
            allocations: [
              allocation({ ...shared, memberId: KASUN, detachedReason: 'owner_absent' })
            ]
          }),
          member({
            memberId: AMAL,
            name: 'Amal',
            capacity: capacity({ memberId: AMAL }),
            allocations: [allocation({ ...shared, allocationId: 'a2', memberId: AMAL })]
          })
        ]
      })

      // Kasun is absent and Amal has taken the work over. Failing here would
      // make every RUN-7 reassignment un-completable.
      expect(check(results, 'CC-10').status).toBe('pass')
    })
  })

  describe('blockingFailures', () => {
    it('returns only hard failures, in table order', () => {
      const results = evaluateCompletionChecks({
        shape: 'mid_sprint',
        members: [
          member({
            attendance: undefined,
            capacity: capacity({ allocatedMinutes: m(300), gapMinutes: m(180), status: 'under' }),
            allocations: [allocation({ remainingEstimateMinutes: m(0), plannedMinutes: m(300) })]
          })
        ]
      })

      expect(blockingFailures(results).map((r) => r.checkId)).toEqual([
        'CC-1',
        'CC-2',
        'CC-7'
      ])
    })

    it('is empty on a healthy stand-up, so the complete button enables', () => {
      expect(blockingFailures(evaluateCompletionChecks(healthy()))).toEqual([])
    })
  })

  describe('an empty stand-up', () => {
    it('passes everything rather than crashing — a cancelled day has no members', () => {
      const results = evaluateCompletionChecks({ shape: 'mid_sprint', members: [] })

      expect(blockingFailures(results)).toEqual([])
    })
  })

  describe('CC-9 — every blocker has an owner and a target date (Phase 10)', () => {
    const blocker = (overrides: Record<string, unknown> = {}) => ({
      blockerId: 'b1',
      taskKey: 'KAN-214',
      hasOwner: true,
      hasTargetDate: true,
      ...overrides
    })

    it('is not_evaluated when no blockers were supplied at all', () => {
      const result = check(evaluateCompletionChecks(healthy()), 'CC-9')
      expect(result.status).toBe('not_evaluated')
      expect(result.ownedBy).toBe('Phase 10')
    })

    it('warns when a blocker lacks an owner or a target date', () => {
      const result = check(
        evaluateCompletionChecks({ ...healthy(), blockers: [blocker({ hasOwner: false })] }),
        'CC-9'
      )
      expect(result.status).toBe('warn')
      expect(result.entities).toEqual([{ blockerId: 'b1', taskKey: 'KAN-214' }])
    })

    it('passes when every blocker has an owner and a target date', () => {
      const result = check(
        evaluateCompletionChecks({ ...healthy(), blockers: [blocker()] }),
        'CC-9'
      )
      expect(result.status).toBe('pass')
    })

    it('is soft — never appears among blocking failures', () => {
      const results = evaluateCompletionChecks({
        ...healthy(),
        blockers: [blocker({ hasOwner: false, hasTargetDate: false })]
      })
      expect(check(results, 'CC-9').hard).toBe(false)
      expect(blockingFailures(results).map((r) => r.checkId)).not.toContain('CC-9')
    })
  })

  describe('CC-11 — remaining scope fits remaining sprint capacity (Phase 10)', () => {
    it('is not_evaluated when sprint health was not supplied', () => {
      const result = check(evaluateCompletionChecks(healthy()), 'CC-11')
      expect(result.status).toBe('not_evaluated')
      expect(result.ownedBy).toBe('Phase 10')
    })

    it('passes when remaining estimate fits remaining capacity', () => {
      const result = check(
        evaluateCompletionChecks({
          ...healthy(),
          sprintHealth: { remainingEstimateMinutes: m(100), remainingCapacityMinutes: m(200) }
        }),
        'CC-11'
      )
      expect(result.status).toBe('pass')
    })

    it('warns when remaining estimate exceeds remaining capacity', () => {
      const result = check(
        evaluateCompletionChecks({
          ...healthy(),
          sprintHealth: { remainingEstimateMinutes: m(300), remainingCapacityMinutes: m(200) }
        }),
        'CC-11'
      )
      expect(result.status).toBe('warn')
      expect(result.message).toContain('1.7h')
    })

    it('treats an exact match as not exceeding', () => {
      const result = check(
        evaluateCompletionChecks({
          ...healthy(),
          sprintHealth: { remainingEstimateMinutes: m(200), remainingCapacityMinutes: m(200) }
        }),
        'CC-11'
      )
      expect(result.status).toBe('pass')
    })

    it('is soft — never appears among blocking failures', () => {
      const results = evaluateCompletionChecks({
        ...healthy(),
        sprintHealth: { remainingEstimateMinutes: m(300), remainingCapacityMinutes: m(200) }
      })
      expect(check(results, 'CC-11').hard).toBe(false)
      expect(blockingFailures(results).map((r) => r.checkId)).not.toContain('CC-11')
    })
  })
})
