/**
 * Estimate-debt arithmetic (Phase 8, Task 5 — VAR-6, VAR-7, VAR-17, E42, E43).
 *
 * Two rules here decide what a member reads about themselves every morning,
 * which is why they are pinned this hard.
 *
 * **A negative balance is never negative debt (VAR-6, E42).** It is surplus,
 * and it gets its own word — "ahead of estimate by 2.0h". The distinction is
 * not cosmetic: debt is something to work off, surplus is not, and a screen
 * that renders "-2.0h debt" has told somebody they owe negative work.
 *
 * **The reduce policy settles once (AC-16, E43).** Debt taken out of today's
 * capacity must be recorded as consumed at completion, or tomorrow takes it
 * out again and the member is charged twice for one overrun.
 */
import { hoursToMinutes, type Minutes } from '../minutes'
import { computeDebtPosition, estimationAccuracy, settlementMinutes } from '../debt'

const h = (hours: number): Minutes => hoursToMinutes(hours)

describe('computeDebtPosition (VAR-6)', () => {
  it('sums the ledger per VAR-6', () => {
    const position = computeDebtPosition([
      { entryType: 'accrual', minutes: h(2) },
      { entryType: 'carry_in', minutes: h(1) },
      { entryType: 'credit', minutes: h(0.5) }
    ])
    expect(position.outstandingMinutes).toBe(h(2.5))
    expect(position.surplusMinutes).toBe(0)
  })

  it('reports a negative balance as surplus and never as negative debt (E42)', () => {
    const position = computeDebtPosition([
      { entryType: 'accrual', minutes: h(1) },
      { entryType: 'credit', minutes: h(3) }
    ])
    expect(position.outstandingMinutes).toBe(0)
    expect(position.surplusMinutes).toBe(h(2))
  })

  it('lets a credit clear debt before any of it becomes surplus (VAR-7)', () => {
    const position = computeDebtPosition([
      { entryType: 'accrual', minutes: h(2) },
      { entryType: 'credit', minutes: h(2) }
    ])
    expect(position.outstandingMinutes).toBe(0)
    expect(position.surplusMinutes).toBe(0)
  })

  it('treats a settlement and a write-off as reductions', () => {
    const position = computeDebtPosition([
      { entryType: 'accrual', minutes: h(4) },
      { entryType: 'settlement', minutes: h(1) },
      { entryType: 'writeoff', minutes: h(1) }
    ])
    expect(position.outstandingMinutes).toBe(h(2))
  })

  it('reports every component total alongside the balance', () => {
    const position = computeDebtPosition([
      { entryType: 'accrual', minutes: h(3) },
      { entryType: 'accrual', minutes: h(1) },
      { entryType: 'credit', minutes: h(1) },
      { entryType: 'settlement', minutes: h(1) },
      { entryType: 'writeoff', minutes: h(0.5) },
      { entryType: 'carry_in', minutes: h(2) }
    ])
    expect(position).toMatchObject({
      accruedMinutes: h(4),
      creditedMinutes: h(1),
      settledMinutes: h(1),
      writtenOffMinutes: h(0.5),
      carriedInMinutes: h(2),
      outstandingMinutes: h(3.5),
      surplusMinutes: 0
    })
  })

  it('reads an empty ledger as no debt and no surplus', () => {
    expect(computeDebtPosition([])).toMatchObject({ outstandingMinutes: 0, surplusMinutes: 0 })
  })

  it('never reports debt and surplus at the same time', () => {
    for (const entries of [
      [{ entryType: 'accrual' as const, minutes: h(2) }],
      [{ entryType: 'credit' as const, minutes: h(2) }],
      []
    ]) {
      const position = computeDebtPosition(entries)
      expect(position.outstandingMinutes === 0 || position.surplusMinutes === 0).toBe(true)
    }
  })
})

describe('settlementMinutes (AC-16, E43)', () => {
  it('settles nothing under the absorb policy', () => {
    expect(
      settlementMinutes({ outstandingMinutes: h(2), adjustedMinutes: h(8), policy: 'absorb' })
    ).toBe(0)
  })

  it('settles the debt the reduce policy consumed', () => {
    expect(
      settlementMinutes({ outstandingMinutes: h(2), adjustedMinutes: h(8), policy: 'reduce' })
    ).toBe(h(2))
  })

  it('settles only what the day could absorb when debt exceeds a full day (E43)', () => {
    expect(
      settlementMinutes({ outstandingMinutes: h(11), adjustedMinutes: h(8), policy: 'reduce' })
    ).toBe(h(8))
  })

  it('settles nothing when there is no debt', () => {
    expect(
      settlementMinutes({ outstandingMinutes: h(0), adjustedMinutes: h(8), policy: 'reduce' })
    ).toBe(0)
  })

  it('settles nothing on a day with no capacity at all', () => {
    // A member on leave has no capacity for debt to eat into, so nothing was
    // consumed and nothing may be recorded as settled.
    expect(
      settlementMinutes({ outstandingMinutes: h(2), adjustedMinutes: h(0), policy: 'reduce' })
    ).toBe(0)
  })
})

describe('estimationAccuracy (VAR-17)', () => {
  it('returns undefined when nothing completed', () => {
    expect(estimationAccuracy([])).toBeUndefined()
  })

  it('computes estimate over actual as a percentage', () => {
    expect(
      estimationAccuracy([{ originalEstimateMinutes: h(6), totalLoggedMinutesOnTask: h(8) }])
    ).toBeCloseTo(75)
  })

  it('reads above one hundred percent when the team finishes faster than estimated', () => {
    expect(
      estimationAccuracy([{ originalEstimateMinutes: h(8), totalLoggedMinutesOnTask: h(6) }])
    ).toBeCloseTo(133.33, 1)
  })

  it('aggregates across tasks rather than averaging per-task ratios', () => {
    // 10h estimated against 20h logged is 50%, not the mean of 100% and 25%.
    expect(
      estimationAccuracy([
        { originalEstimateMinutes: h(2), totalLoggedMinutesOnTask: h(2) },
        { originalEstimateMinutes: h(8), totalLoggedMinutesOnTask: h(18) }
      ])
    ).toBeCloseTo(50)
  })

  it('returns undefined when the tasks logged no time at all, rather than dividing by zero', () => {
    expect(
      estimationAccuracy([{ originalEstimateMinutes: h(6), totalLoggedMinutesOnTask: h(0) }])
    ).toBeUndefined()
  })
})
