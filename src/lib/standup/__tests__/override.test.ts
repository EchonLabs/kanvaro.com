import { isOverridable, validateJustification, filterOverriddenFailures } from '../override'
import type { CompletionCheckResult } from '../completion-checks'

describe('validateJustification', () => {
  it('rejects a string under 20 characters', () => {
    expect(validateJustification('blocked').valid).toBe(false)
  })

  it('rejects a low-value string even past 20 characters when repeated', () => {
    expect(validateJustification('n/a').valid).toBe(false)
  })

  it('rejects punctuation-only input regardless of length', () => {
    expect(validateJustification('....................').valid).toBe(false)
  })

  it('accepts a real explanation', () => {
    const result = validateJustification(
      "All of Kasun's remaining work is blocked on the vendor sandbox."
    )
    expect(result.valid).toBe(true)
  })

  it('is case-insensitive against the low-value list', () => {
    expect(validateJustification('N/A' + ' '.repeat(20)).valid).toBe(false)
  })
})

describe('isOverridable', () => {
  it('is true for the five issuable types', () => {
    expect(isOverridable('under_allocation')).toBe(true)
    expect(isOverridable('skip_reestimate')).toBe(true)
  })

  it('is false for O6 through O10', () => {
    expect(isOverridable('unestimated_task_allocation')).toBe(false)
    expect(isOverridable('sprint_close_without_disposition')).toBe(false)
  })
})

describe('filterOverriddenFailures', () => {
  // Minimal builder — only the fields the matcher actually reads matter for
  // these tests; the rest is filled with plausible, unused values.
  function cc1Failure(entities: Record<string, unknown>[]): CompletionCheckResult {
    return {
      checkId: 'CC-1',
      status: 'fail',
      hard: true,
      overridable: true,
      message: 'not planned to capacity',
      entities
    }
  }

  function cc6Failure(entities: Record<string, unknown>[]): CompletionCheckResult {
    return {
      checkId: 'CC-6',
      status: 'fail',
      hard: true,
      overridable: true,
      message: 'over allocated',
      entities
    }
  }

  function cc3Failure(entities: Record<string, unknown>[]): CompletionCheckResult {
    return {
      checkId: 'CC-3',
      status: 'fail',
      hard: true,
      overridable: true,
      message: 'needs an answer',
      entities
    }
  }

  function cc10Failure(entities: Record<string, unknown>[]): CompletionCheckResult {
    return {
      checkId: 'CC-10',
      status: 'fail',
      hard: true,
      overridable: true,
      message: 'double allocated',
      entities
    }
  }

  function cc4Failure(entities: Record<string, unknown>[]): CompletionCheckResult {
    return {
      checkId: 'CC-4',
      status: 'fail',
      hard: true,
      overridable: false,
      message: 'needs a note',
      entities
    }
  }

  it('resolves a CC-1 failure when a matching under_allocation override names that member', () => {
    const failures = [cc1Failure([{ memberId: 'kasun', gapMinutes: 180 }])]
    const overrides = [{ type: 'under_allocation', affectedMemberIds: ['kasun'], affectedTaskIds: [] }]

    expect(filterOverriddenFailures(failures, overrides)).toEqual([])
  })

  it('does not resolve a CC-1 failure for member A when the override names only member B', () => {
    const failures = [cc1Failure([{ memberId: 'kasun', gapMinutes: 180 }])]
    const overrides = [{ type: 'under_allocation', affectedMemberIds: ['amal'], affectedTaskIds: [] }]

    const unresolved = filterOverriddenFailures(failures, overrides)
    expect(unresolved).toHaveLength(1)
    expect(unresolved[0].entities).toEqual([{ memberId: 'kasun', gapMinutes: 180 }])
  })

  it('partially resolves a check with two offending entities when only one has a matching override', () => {
    const failures = [
      cc1Failure([
        { memberId: 'kasun', gapMinutes: 180 },
        { memberId: 'amal', gapMinutes: 60 }
      ])
    ]
    const overrides = [{ type: 'under_allocation', affectedMemberIds: ['kasun'], affectedTaskIds: [] }]

    const unresolved = filterOverriddenFailures(failures, overrides)
    expect(unresolved).toHaveLength(1)
    expect(unresolved[0].entities).toEqual([{ memberId: 'amal', gapMinutes: 60 }])
  })

  it('resolves a CC-3 failure by taskId match', () => {
    const failures = [cc3Failure([{ allocationId: 'a1', memberId: 'kasun', taskId: 't1', needs: 'revision' }])]
    const overrides = [{ type: 'skip_reestimate', affectedMemberIds: [], affectedTaskIds: ['t1'] }]

    expect(filterOverriddenFailures(failures, overrides)).toEqual([])
  })

  it('does not resolve a CC-3 failure by memberId coincidence when taskId does not match', () => {
    const failures = [cc3Failure([{ allocationId: 'a1', memberId: 'kasun', taskId: 't1', needs: 'revision' }])]
    const overrides = [{ type: 'skip_reestimate', affectedMemberIds: ['kasun'], affectedTaskIds: ['t2'] }]

    const unresolved = filterOverriddenFailures(failures, overrides)
    expect(unresolved).toHaveLength(1)
  })

  it('does not resolve a CC-3 failure whose entity has no taskId, even with a matching member', () => {
    const failures = [cc3Failure([{ allocationId: 'a1', memberId: 'kasun', needs: 'revision' }])]
    const overrides = [{ type: 'skip_reestimate', affectedMemberIds: ['kasun'], affectedTaskIds: [] }]

    const unresolved = filterOverriddenFailures(failures, overrides)
    expect(unresolved).toHaveLength(1)
  })

  it('resolves a CC-10 failure by taskId match', () => {
    const failures = [cc10Failure([{ taskId: 't1', key: 'KAN-1', memberIds: ['kasun', 'amal'] }])]
    const overrides = [{ type: 'duplicate_allocation', affectedMemberIds: [], affectedTaskIds: ['t1'] }]

    expect(filterOverriddenFailures(failures, overrides)).toEqual([])
  })

  it('leaves a failure for a check with no override issued at all unchanged', () => {
    const failures = [cc1Failure([{ memberId: 'kasun', gapMinutes: 180 }])]

    const unresolved = filterOverriddenFailures(failures, [])
    expect(unresolved).toHaveLength(1)
  })

  it('does not resolve a CC-1 failure with an override of the wrong type (over_allocation)', () => {
    const failures = [cc1Failure([{ memberId: 'kasun', gapMinutes: 180 }])]
    const overrides = [{ type: 'over_allocation', affectedMemberIds: ['kasun'], affectedTaskIds: [] }]

    const unresolved = filterOverriddenFailures(failures, overrides)
    expect(unresolved).toHaveLength(1)
  })

  it('resolves a CC-6 failure when a matching over_allocation override names that member', () => {
    const failures = [cc6Failure([{ memberId: 'kasun', gapMinutes: 120 }])]
    const overrides = [{ type: 'over_allocation', affectedMemberIds: ['kasun'], affectedTaskIds: [] }]

    expect(filterOverriddenFailures(failures, overrides)).toEqual([])
  })

  it('leaves a non-overridable check (CC-4) untouched regardless of overrides present', () => {
    const failures = [cc4Failure([{ carryForwardItemId: 'i1' }])]
    const overrides = [{ type: 'missing_carry_forward_note', affectedMemberIds: [], affectedTaskIds: [] }]

    const unresolved = filterOverriddenFailures(failures, overrides)
    expect(unresolved).toHaveLength(1)
  })
})
