import { formatToTitleCase } from '@/lib/utils'

import {
  applyLines,
  classify,
  computeRemaining,
  computeTotal,
  exceedsThreshold,
  maxAllowedFor,
  parseChangeLines,
  parseReason,
  roleLabel,
  summarize
} from '../workload'

const P1 = 'aaaaaaaaaaaaaaaaaaaaaaaa'
const P2 = 'bbbbbbbbbbbbbbbbbbbbbbbb'

describe('classify', () => {
  it.each([
    [0, 100, 'unallocated'],
    [40, 100, 'partial'],
    [100, 100, 'full'],
    [101, 100, 'over'],
    [110, 120, 'full'],
    [90, 80, 'over'],
    [130, 120, 'over']
  ])('classify(%p, threshold %p) = %p', (total, threshold, expected) => {
    expect(classify(total, threshold)).toBe(expected)
  })
})

describe('totals', () => {
  it('sums percents', () => {
    expect(computeTotal([50, 30, 20])).toBe(100)
    expect(computeTotal([])).toBe(0)
  })

  it('never reports negative remaining capacity', () => {
    expect(computeRemaining(120)).toBe(0)
    expect(computeRemaining(35)).toBe(65)
  })
})

describe('exceedsThreshold', () => {
  it('blocks a change that raises the total above the threshold', () => {
    expect(exceedsThreshold(80, 120, 100)).toBe(true)
  })

  it('allows reaching the threshold exactly', () => {
    expect(exceedsThreshold(80, 100, 100)).toBe(false)
  })

  it('allows a change that lowers an already-over member, even if still over', () => {
    expect(exceedsThreshold(130, 110, 100)).toBe(false)
  })
})

describe('maxAllowedFor', () => {
  it('is what is left under the threshold, capped to 0..100', () => {
    expect(maxAllowedFor(50, 100)).toBe(50)
    expect(maxAllowedFor(0, 100)).toBe(100)
    expect(maxAllowedFor(0, 150)).toBe(100)
    expect(maxAllowedFor(110, 100)).toBe(0)
  })
})

describe('parseChangeLines', () => {
  it.each([
    ['a fractional percent', [{ projectId: P1, newPercent: 50.5 }]],
    ['a negative percent', [{ projectId: P1, newPercent: -1 }]],
    ['a percent over 100', [{ projectId: P1, newPercent: 101 }]],
    ['a string percent', [{ projectId: P1, newPercent: 'abc' }]],
    ['a numeric string percent', [{ projectId: P1, newPercent: '50' }]],
    ['a null percent', [{ projectId: P1, newPercent: null }]],
    ['a malformed project id', [{ projectId: 'nope', newPercent: 10 }]],
    ['a duplicate project', [{ projectId: P1, newPercent: 10 }, { projectId: P1, newPercent: 20 }]],
    ['an empty list', []],
    ['a non-array', 'x']
  ])('rejects %s', (_label, raw) => {
    expect(() => parseChangeLines(raw)).toThrow(expect.objectContaining({ code: 'VALIDATION_FAILED' }))
  })

  it('accepts a line that sets a project to 0', () => {
    expect(parseChangeLines([{ projectId: P1, newPercent: 0 }])).toEqual([{ projectId: P1, newPercent: 0 }])
  })
})

describe('parseReason', () => {
  it('rejects a blank reason', () => {
    expect(() => parseReason('   ')).toThrow(expect.objectContaining({ code: 'VALIDATION_FAILED' }))
  })

  it('rejects a reason over 500 characters', () => {
    expect(() => parseReason('x'.repeat(501))).toThrow(expect.objectContaining({ code: 'VALIDATION_FAILED' }))
  })

  it('rejects a non-string reason', () => {
    expect(() => parseReason(42)).toThrow(expect.objectContaining({ code: 'VALIDATION_FAILED' }))
  })

  it('trims the reason', () => {
    expect(parseReason('  ok ')).toBe('ok')
  })
})

describe('applyLines', () => {
  it('returns a new map, dropping projects that go to 0', () => {
    const current = new Map([[P1, 50]])
    const after = applyLines(current, [
      { projectId: P1, newPercent: 0 },
      { projectId: P2, newPercent: 30 }
    ])
    expect(Array.from(after.entries())).toEqual([[P2, 30]])
    expect(current.get(P1)).toBe(50)
  })
})

describe('summarize', () => {
  it('computes KPIs and a per-role summary', () => {
    const result = summarize(
      [
        { total: 120, roleLabel: 'QA Engineer' },
        { total: 100, roleLabel: 'QA Engineer' },
        { total: 40, roleLabel: 'Team Member' },
        { total: 0, roleLabel: 'Team Member' }
      ],
      100
    )

    expect(result.kpis).toEqual({
      totalResources: 4,
      fullyAllocated: 2,
      partiallyAllocated: 1,
      unallocated: 1,
      overallocated: 1,
      availableCapacity: 160
    })
    expect(result.byRole).toEqual([
      { roleLabel: 'QA Engineer', resources: 2, allocated: 220, available: 0 },
      { roleLabel: 'Team Member', resources: 2, allocated: 40, available: 160 }
    ])
  })
})

describe('roleLabel', () => {
  it('uses the custom role name when there is one', () => {
    expect(roleLabel({ role: 'team_member', customRole: { name: 'Designer' } })).toBe('Designer')
  })

  it('falls back to the title-cased system role', () => {
    expect(roleLabel({ role: 'qa_engineer' })).toBe(formatToTitleCase('qa_engineer'))
    expect(roleLabel({ role: 'qa_engineer', customRole: null })).toBe(formatToTitleCase('qa_engineer'))
  })
})
