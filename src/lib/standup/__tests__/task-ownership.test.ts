/**
 * D-D — which allocation carries a task's variance (Phase 8, Task 3).
 *
 * The rule exists because a task two people worked on has one estimate and one
 * overrun, but two allocations. Without a single owner the ledger accrues the
 * task's overrun twice and the sprint report doubles it, which is exactly the
 * kind of wrong number §12's risk note says destroys trust in the module.
 */
import { ownsTaskVariance, resolveStandupOwner } from '../task-ownership'

describe('resolveStandupOwner', () => {
  it('falls back to the first assignee when no owner is set', () => {
    expect(resolveStandupOwner({ assignedTo: ['kasun', 'amal'] })).toBe('kasun')
  })

  it('prefers an explicit owner over the assignee order', () => {
    expect(resolveStandupOwner({ standupOwner: 'amal', assignedTo: ['kasun', 'amal'] })).toBe(
      'amal'
    )
  })

  it('returns undefined for an unassigned task', () => {
    expect(resolveStandupOwner({ assignedTo: [] })).toBeUndefined()
  })

  it('returns undefined when assignedTo is absent entirely', () => {
    expect(resolveStandupOwner({})).toBeUndefined()
  })

  it('honours an explicit owner who is not in the assignee list', () => {
    // The run screen may hand the task to somebody mid-sprint without
    // rewriting assignedTo; the explicit choice is still the choice.
    expect(resolveStandupOwner({ standupOwner: 'nuwan', assignedTo: ['kasun'] })).toBe('nuwan')
  })
})

describe('ownsTaskVariance', () => {
  it('gives exactly one of two allocations on a shared task the task variance', () => {
    const task = { assignedTo: ['kasun', 'amal'] }
    expect(ownsTaskVariance({ memberId: 'kasun' }, task)).toBe(true)
    expect(ownsTaskVariance({ memberId: 'amal' }, task)).toBe(false)
  })

  it('follows the explicit owner rather than the assignee order', () => {
    const task = { standupOwner: 'amal', assignedTo: ['kasun', 'amal'] }
    expect(ownsTaskVariance({ memberId: 'kasun' }, task)).toBe(false)
    expect(ownsTaskVariance({ memberId: 'amal' }, task)).toBe(true)
  })

  it('gives nobody the task variance when the task is unassigned', () => {
    expect(ownsTaskVariance({ memberId: 'kasun' }, { assignedTo: [] })).toBe(false)
  })

  it('gives nobody the task variance when the owner is somebody else entirely', () => {
    // A member allocated to a task they do not own contributes their own day
    // variance and nothing at task scope.
    expect(ownsTaskVariance({ memberId: 'kasun' }, { standupOwner: 'nuwan' })).toBe(false)
  })

  it('is true for exactly one member across every allocation on a shared task', () => {
    const task = { assignedTo: ['kasun', 'amal', 'nuwan'] }
    const owners = ['kasun', 'amal', 'nuwan'].filter((memberId) =>
      ownsTaskVariance({ memberId }, task)
    )
    expect(owners).toEqual(['kasun'])
  })
})
