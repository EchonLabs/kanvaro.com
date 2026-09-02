import { isOverridable, validateJustification } from '../override'

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
