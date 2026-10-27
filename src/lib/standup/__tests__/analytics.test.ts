import {
  ageHistogram,
  chronicUnderAllocation,
  computeAccuracy,
  computeDayHealth,
  computeDebtTrend,
  debtChange,
  computeDiscipline,
  spillChains
} from '@/lib/standup/analytics'

describe('computeDayHealth', () => {
  const day = { standupId: 's1', standupDate: '2026-10-01', dayNumber: 1 }

  it('splits an over-allocated member into full and over', () => {
    const health = computeDayHealth({
      ...day,
      members: [{ memberId: 'm1', effectiveMinutes: 360, allocatedMinutes: 420 }]
    })

    expect(health).toMatchObject({ effectiveMinutes: 360, fullMinutes: 360, underMinutes: 0, overMinutes: 60 })
  })

  it('splits an under-allocated member into full and under', () => {
    const health = computeDayHealth({
      ...day,
      members: [{ memberId: 'm1', effectiveMinutes: 360, allocatedMinutes: 300 }]
    })

    expect(health).toMatchObject({ fullMinutes: 300, underMinutes: 60, overMinutes: 0 })
  })

  it('sums across members and keeps the day facts', () => {
    const health = computeDayHealth({
      ...day,
      members: [
        { memberId: 'm1', effectiveMinutes: 360, allocatedMinutes: 300 },
        { memberId: 'm2', effectiveMinutes: 240, allocatedMinutes: 300 }
      ]
    })

    expect(health).toEqual({
      ...day,
      effectiveMinutes: 600,
      fullMinutes: 540,
      underMinutes: 60,
      overMinutes: 60
    })
  })

  it('gives zeros for a day with no members', () => {
    expect(computeDayHealth({ ...day, members: [] })).toMatchObject({
      effectiveMinutes: 0,
      fullMinutes: 0,
      underMinutes: 0,
      overMinutes: 0
    })
  })
})

describe('computeDebtTrend', () => {
  it('accumulates the ledger up to each date', () => {
    const trend = computeDebtTrend(
      [
        { memberId: 'a', entryType: 'accrual', minutes: 120, standupDate: '2026-10-02' },
        { memberId: 'a', entryType: 'settlement', minutes: 30, standupDate: '2026-10-03' }
      ],
      ['2026-10-01', '2026-10-02', '2026-10-03']
    )

    expect(trend.map((point) => point.outstandingMinutes)).toEqual([0, 120, 90])
    expect(trend.map((point) => point.date)).toEqual(['2026-10-01', '2026-10-02', '2026-10-03'])
  })

  it('sorts unsorted dates and never goes negative', () => {
    const trend = computeDebtTrend(
      [{ memberId: 'a', entryType: 'credit', minutes: 60, standupDate: '2026-10-01' }],
      ['2026-10-02', '2026-10-01']
    )

    expect(trend).toEqual([
      { date: '2026-10-01', outstandingMinutes: 0 },
      { date: '2026-10-02', outstandingMinutes: 0 }
    ])
  })
})

describe('computeDebtTrend per member', () => {
  it("floors each member at zero so one member's surplus never hides another's debt", () => {
    const trend = computeDebtTrend(
      [
        { memberId: 'a', entryType: 'accrual', minutes: 90, standupDate: '2026-10-01' },
        { memberId: 'b', entryType: 'credit', minutes: 60, standupDate: '2026-10-01' }
      ],
      ['2026-10-01']
    )

    expect(trend).toEqual([{ date: '2026-10-01', outstandingMinutes: 90 }])
  })
})

describe('debtChange', () => {
  const trend = [
    { date: '2026-10-01', outstandingMinutes: 60 },
    { date: '2026-10-05', outstandingMinutes: 120 },
    { date: '2026-10-09', outstandingMinutes: 150 }
  ]

  it('compares the latest point with the last point at least seven days earlier', () => {
    expect(debtChange(trend)).toBe(90)
  })

  it('compares with zero when the sprint is younger than seven days', () => {
    expect(debtChange(trend.slice(1))).toBe(150)
  })

  it('is zero for an empty trend', () => {
    expect(debtChange([])).toBe(0)
  })
})

describe('computeAccuracy', () => {
  it('has no percentage when nothing has completed', () => {
    const accuracy = computeAccuracy([])

    expect(accuracy.team).toEqual({ taskCount: 0, estimatedMinutes: 0, loggedMinutes: 0, percent: null })
    expect(accuracy.members).toEqual([])
  })

  it('divides estimated by logged, for the team and each member', () => {
    const accuracy = computeAccuracy([
      { taskId: 't1', memberId: 'a', originalEstimateMinutes: 60, totalLoggedMinutesOnTask: 120 },
      { taskId: 't2', memberId: 'b', originalEstimateMinutes: 120, totalLoggedMinutesOnTask: 120 }
    ])

    expect(accuracy.team.percent).toBeCloseTo(75)
    expect(accuracy.team.taskCount).toBe(2)
    expect(accuracy.members.find((row) => row.memberId === 'a')?.percent).toBeCloseTo(50)
    expect(accuracy.members.find((row) => row.memberId === 'b')?.percent).toBeCloseTo(100)
  })

  it('has no percentage when nothing was logged', () => {
    const accuracy = computeAccuracy([
      { taskId: 't1', memberId: 'a', originalEstimateMinutes: 60, totalLoggedMinutesOnTask: 0 }
    ])

    expect(accuracy.team.percent).toBeNull()
  })
})

describe('ageHistogram', () => {
  it('buckets ages and flags the chronic band', () => {
    const histogram = ageHistogram([1, 1, 5, 8, 12])

    expect(histogram.chronicCount).toBe(2)
    expect(histogram.buckets.map((bucket) => bucket.label)).toEqual(['1', '2', '3', '4-5', '6-7', '8+'])
    expect(histogram.buckets.find((bucket) => bucket.label === '1')?.count).toBe(2)
    expect(histogram.buckets.find((bucket) => bucket.label === '4-5')?.count).toBe(1)
    expect(histogram.buckets.find((bucket) => bucket.label === '8+')).toMatchObject({ count: 2, chronic: true })
    expect(histogram.buckets.filter((bucket) => bucket.chronic)).toHaveLength(1)
  })

  it('is all zeros for no items', () => {
    const histogram = ageHistogram([])

    expect(histogram.chronicCount).toBe(0)
    expect(histogram.buckets.every((bucket) => bucket.count === 0)).toBe(true)
  })
})

describe('chronicUnderAllocation', () => {
  it('returns members with three or more under-allocation overrides', () => {
    const under = (ids: string[]) => ({ type: 'under_allocation', affectedMemberIds: ids })

    const chronic = chronicUnderAllocation([
      under(['a', 'b']),
      under(['a']),
      under(['a', 'b']),
      { type: 'over_allocation', affectedMemberIds: ['b'] }
    ])

    expect(chronic).toEqual([{ memberId: 'a', count: 3 }])
  })

  it('honours a custom threshold and sorts by count', () => {
    const under = (ids: string[]) => ({ type: 'under_allocation', affectedMemberIds: ids })

    expect(chronicUnderAllocation([under(['a', 'b']), under(['b'])], 1)).toEqual([
      { memberId: 'b', count: 2 },
      { memberId: 'a', count: 1 }
    ])
  })
})

describe('computeDiscipline', () => {
  it('counts on-time completions against completed plus missed', () => {
    const completed = (minutes: number, wasBackfilled = false) => ({
      status: 'Completed',
      wasBackfilled,
      actualDurationMinutes: minutes
    })

    const discipline = computeDiscipline([
      completed(10),
      completed(12),
      completed(14),
      completed(14),
      completed(15),
      completed(16),
      completed(18),
      completed(20, true),
      { status: 'Missed', wasBackfilled: false },
      { status: 'Scheduled', wasBackfilled: false },
      { status: 'Skipped_Holiday', wasBackfilled: false }
    ])

    expect(discipline.completedCount).toBe(8)
    expect(discipline.missedCount).toBe(1)
    expect(discipline.onTimeRate).toBeCloseTo((7 / 9) * 100)
    expect(discipline.medianDurationMinutes).toBe(14.5)
  })

  it('has no rate or median with nothing to measure', () => {
    expect(computeDiscipline([])).toEqual({
      completedCount: 0,
      missedCount: 0,
      onTimeRate: null,
      medianDurationMinutes: null
    })
  })
})

describe('spillChains', () => {
  const totals = new Map([
    ['t1', { originalEstimateMinutes: 480, totalLoggedMinutesOnTask: 1080 }],
    ['t2', { originalEstimateMinutes: 120, totalLoggedMinutesOnTask: 60 }]
  ])

  it('measures a chain by its distinct stand-ups and drops single-day work', () => {
    const chains = spillChains(
      [
        { allocationId: 'a1', taskId: 't1', standupId: 's1' },
        { allocationId: 'a2', carryChainRoot: 'a1', taskId: 't1', standupId: 's2' },
        { allocationId: 'a3', carryChainRoot: 'a1', taskId: 't1', standupId: 's3' },
        { allocationId: 'b1', taskId: 't2', standupId: 's1' }
      ],
      totals
    )

    expect(chains).toEqual([
      { taskId: 't1', chainLength: 3, originalEstimateMinutes: 480, loggedMinutes: 1080 }
    ])
  })

  it('sorts longest first and honours the limit', () => {
    const chains = spillChains(
      [
        { allocationId: 'a1', taskId: 't1', standupId: 's1' },
        { allocationId: 'a2', carryChainRoot: 'a1', taskId: 't1', standupId: 's2' },
        { allocationId: 'b1', taskId: 't2', standupId: 's1' },
        { allocationId: 'b2', carryChainRoot: 'b1', taskId: 't2', standupId: 's2' },
        { allocationId: 'b3', carryChainRoot: 'b1', taskId: 't2', standupId: 's3' }
      ],
      totals,
      1
    )

    expect(chains.map((chain) => chain.taskId)).toEqual(['t2'])
  })

  it('reports zero hours for a task with no totals', () => {
    const chains = spillChains(
      [
        { allocationId: 'c1', taskId: 't9', standupId: 's1' },
        { allocationId: 'c2', carryChainRoot: 'c1', taskId: 't9', standupId: 's2' }
      ],
      totals
    )

    expect(chains[0]).toEqual({ taskId: 't9', chainLength: 2, originalEstimateMinutes: 0, loggedMinutes: 0 })
  })
})
