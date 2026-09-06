/**
 * Estimate rules (spec PLN-13, VAR-15/16, NFR-P3).
 */
import {
  MIN_REVISION_DETAIL_LENGTH,
  REVISION_REASONS,
  buildRevision,
  deriveEstimateMinutes,
  isEstimateLocked,
  projectedTotalMinutes
} from '../estimates'

describe('deriveEstimateMinutes — PLN-13', () => {
  it('takes hours at face value', () => {
    expect(deriveEstimateMinutes({ value: 6, unit: 'hours' })).toBe(360)
    expect(deriveEstimateMinutes({ value: 0.25, unit: 'hours' })).toBe(15)
  })

  it('multiplies story points by the project factor', () => {
    expect(deriveEstimateMinutes({ value: 8, unit: 'story_points', pointsToHours: 4 })).toBe(1920)
    expect(deriveEstimateMinutes({ value: 3, unit: 'story_points', pointsToHours: 6 })).toBe(1080)
  })

  it('defaults the factor to 4 when the project has not set one', () => {
    expect(deriveEstimateMinutes({ value: 2, unit: 'story_points' })).toBe(480)
  })

  it('NFR-P3 — rounds to the nearest whole minute at finalisation', () => {
    // 1 point × 3.33h = 3.33h = 199.8 minutes.
    expect(deriveEstimateMinutes({ value: 1, unit: 'story_points', pointsToHours: 3.33 })).toBe(200)
  })

  it('never stores a fractional minute, however awkward the factor', () => {
    for (const factor of [0.7, 1.3, 2.4, 3.7, 4.9]) {
      for (const points of [1, 2, 3, 5, 8, 13, 21]) {
        const result = deriveEstimateMinutes({
          value: points,
          unit: 'story_points',
          pointsToHours: factor
        })
        expect(Number.isInteger(result)).toBe(true)
      }
    }
  })

  it('rejects a zero or negative estimate', () => {
    expect(() => deriveEstimateMinutes({ value: 0, unit: 'hours' })).toThrow(/greater than zero/)
    expect(() => deriveEstimateMinutes({ value: -3, unit: 'hours' })).toThrow(/greater than zero/)
  })

  it('rejects a non-finite estimate', () => {
    expect(() => deriveEstimateMinutes({ value: NaN, unit: 'hours' })).toThrow()
    expect(() => deriveEstimateMinutes({ value: Infinity, unit: 'hours' })).toThrow()
  })

  it('rejects a nonsensical points factor', () => {
    expect(() =>
      deriveEstimateMinutes({ value: 3, unit: 'story_points', pointsToHours: 0 })
    ).toThrow(/points-to-hours/)
  })
})

describe('buildRevision — VAR-15/16', () => {
  const base = { previousRemainingMinutes: 360, newRemainingMinutes: 180 }

  it('builds an entry carrying both values', () => {
    const revision = buildRevision({ ...base, reason: 'underestimated' })

    expect(revision).toEqual({
      previousRemainingMinutes: 360,
      newRemainingMinutes: 180,
      reason: 'underestimated'
    })
  })

  it('accepts every reason in the fixed list', () => {
    for (const reason of REVISION_REASONS) {
      const detail = reason === 'other' ? 'Vendor changed the contract terms' : undefined
      expect(() => buildRevision({ ...base, reason, detail })).not.toThrow()
    }
  })

  it('rejects a reason outside the list', () => {
    expect(() => buildRevision({ ...base, reason: 'because' as any })).toThrow(
      /is not a revision reason/
    )
  })

  it('requires free text when the reason is other', () => {
    expect(() => buildRevision({ ...base, reason: 'other' })).toThrow(
      new RegExp(`${MIN_REVISION_DETAIL_LENGTH} characters`)
    )
    expect(() => buildRevision({ ...base, reason: 'other', detail: 'too short' })).toThrow()
  })

  it('does not count surrounding whitespace towards the detail minimum', () => {
    expect(() => buildRevision({ ...base, reason: 'other', detail: '   short   ' })).toThrow()
  })

  it('trims the detail it stores', () => {
    const revision = buildRevision({
      ...base,
      reason: 'other',
      detail: '  Vendor changed the contract terms  '
    })
    expect(revision.detail).toBe('Vendor changed the contract terms')
  })

  it('allows revising to zero — the work is believed finished', () => {
    expect(buildRevision({ ...base, newRemainingMinutes: 0, reason: 'scope_grew' })
      .newRemainingMinutes).toBe(0)
  })

  it('rejects a negative remaining estimate', () => {
    expect(() =>
      buildRevision({ ...base, newRemainingMinutes: -60, reason: 'rework_required' })
    ).toThrow(/cannot be negative/)
  })

  it('rejects a fractional minute count', () => {
    expect(() =>
      buildRevision({ ...base, newRemainingMinutes: 90.5, reason: 'rework_required' })
    ).toThrow(/whole number of minutes/)
  })

  it('allows revising upwards, which is the common case', () => {
    const revision = buildRevision({
      previousRemainingMinutes: 0,
      newRemainingMinutes: 180,
      reason: 'unexpected_complexity'
    })
    expect(revision.newRemainingMinutes).toBe(180)
  })
})

describe('projectedTotalMinutes — §15.11', () => {
  it('is logged plus the new remaining, not the original estimate', () => {
    // The spec's worked example: 8.0h logged, revised remaining 3.0h → 11.0h,
    // against a 6.0h original. Seeing 11 against 6 is the point of the line.
    expect(projectedTotalMinutes(480, 180)).toBe(660)
  })

  it('handles nothing logged yet', () => {
    expect(projectedTotalMinutes(0, 360)).toBe(360)
  })
})

describe('isEstimateLocked — DAT-6', () => {
  it('is unlocked while the sprint is still planning', () => {
    expect(isEstimateLocked({})).toBe(false)
    expect(isEstimateLocked({ estimateLockedAt: null })).toBe(false)
  })

  it('is locked once stamped', () => {
    expect(isEstimateLocked({ estimateLockedAt: new Date() })).toBe(true)
  })
})
