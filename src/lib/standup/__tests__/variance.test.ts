/**
 * The twelve-outcome variance classifier (Phase 8, Task 4 — spec §12.2).
 *
 * VAR-2 demands every allocation land in **exactly one** outcome, and §12.2's
 * conditions overlap — a task can be blocked and over-consumed, reassigned and
 * delivered, absent and untouched. So the tests below assert the precedence as
 * hard as they assert the arithmetic: which rule wins is a decision, and a
 * decision nobody wrote down gets re-decided differently by the next reader.
 *
 * The ±0.25h tolerance is the other thing pinned here. §12.2 writes it as
 * `abs(A - P) <= 0.25`, so exactly fifteen minutes over is *on estimate* and
 * sixteen is over. Both sides of that line carry a test, because an off-by-one
 * there quietly reclassifies every close day in the sprint.
 */
import { hoursToMinutes, minutes, type Minutes } from '../minutes'
import {
  classifyAll,
  classifyAllocation,
  VARIANCE_TOLERANCE_MINUTES,
  type ClassifyInput
} from '../variance'

const h = (hours: number): Minutes => hoursToMinutes(hours)
const m = (value: number): Minutes => minutes(value)

const statusSets = {
  done: ['done', 'released'],
  inProgress: ['in_progress', 'in_review'],
  blocked: ['blocked']
}

/** 6h planned on a 6h estimate, still in progress, nothing exceptional. */
const base: ClassifyInput = {
  allocationId: 'alloc-1',
  memberId: 'kasun',
  taskId: 'kan-214',
  plannedMinutes: h(6),
  loggedMinutesOnDay: h(6),
  originalEstimateMinutes: h(6),
  totalLoggedMinutesOnTask: h(6),
  remainingBeforeMinutes: h(6),
  taskStatusAtClose: 'in_progress',
  taskStatusAtAllocation: 'in_progress',
  statusSets,
  descoped: false,
  reassigned: false,
  ownsTaskVariance: true
}

const at = (patch: Partial<ClassifyInput>): ClassifyInput => ({ ...base, ...patch })

describe('classifyAllocation — the twelve outcomes (§12.2)', () => {
  it.each([
    ['V1  delivered_under', { loggedMinutesOnDay: h(4), taskStatusAtClose: 'done' }, 'delivered_under'],
    ['V2  delivered_on_estimate', { loggedMinutesOnDay: h(6), taskStatusAtClose: 'done' }, 'delivered_on_estimate'],
    ['V3  delivered_over', { loggedMinutesOnDay: h(8), taskStatusAtClose: 'done' }, 'delivered_over'],
    ['V4  open_under_consumed', { loggedMinutesOnDay: h(3) }, 'open_under_consumed'],
    ['V5  open_fully_consumed', { loggedMinutesOnDay: h(6) }, 'open_fully_consumed'],
    ['V6  open_over_consumed', { loggedMinutesOnDay: h(8) }, 'open_over_consumed'],
    ['V7  not_started', { loggedMinutesOnDay: h(0), taskStatusAtClose: 'todo', taskStatusAtAllocation: 'todo' }, 'not_started'],
    ['V8  blocked', { loggedMinutesOnDay: h(2), taskStatusAtClose: 'blocked' }, 'blocked'],
    ['V9  descoped', { descoped: true }, 'descoped'],
    ['V10 reassigned', { loggedMinutesOnDay: h(3), reassigned: true }, 'reassigned'],
    ['V11 owner_absent', { loggedMinutesOnDay: h(0), detachedReason: 'owner_absent' as const }, 'owner_absent'],
    ['V12 progressed unlogged', { loggedMinutesOnDay: h(0), taskStatusAtClose: 'in_progress', taskStatusAtAllocation: 'todo' }, 'no_time_logged_but_progressed']
  ])('%s classifies to exactly that outcome', (_name, patch, expected) => {
    expect(classifyAllocation(at(patch as Partial<ClassifyInput>)).outcome).toBe(expected)
  })
})

describe('classifyAllocation — precedence, where §12.2 conditions overlap', () => {
  it('puts a descoped task in descoped even when it also overran', () => {
    expect(classifyAllocation(at({ descoped: true, loggedMinutesOnDay: h(9) })).outcome).toBe(
      'descoped'
    )
  })

  it('puts an absent owner ahead of a blocked status', () => {
    expect(
      classifyAllocation(at({ detachedReason: 'owner_absent', taskStatusAtClose: 'blocked' }))
        .outcome
    ).toBe('owner_absent')
  })

  it('puts blocked ahead of the open branch even when hours were burned', () => {
    expect(
      classifyAllocation(at({ taskStatusAtClose: 'blocked', loggedMinutesOnDay: h(9) })).outcome
    ).toBe('blocked')
  })

  it('treats a reassigned task that finished as a delivery, not a reassignment', () => {
    expect(
      classifyAllocation(at({ reassigned: true, taskStatusAtClose: 'done', loggedMinutesOnDay: h(8) }))
        .outcome
    ).toBe('delivered_over')
  })

  it('treats a reassigned task still open as a reassignment', () => {
    expect(classifyAllocation(at({ reassigned: true, loggedMinutesOnDay: h(8) })).outcome).toBe(
      'reassigned'
    )
  })

  it('separates zero logged hours with an advanced status from zero with none', () => {
    expect(
      classifyAllocation(
        at({ loggedMinutesOnDay: h(0), taskStatusAtAllocation: 'todo', taskStatusAtClose: 'in_progress' })
      ).outcome
    ).toBe('no_time_logged_but_progressed')
    expect(
      classifyAllocation(
        at({ loggedMinutesOnDay: h(0), taskStatusAtAllocation: 'todo', taskStatusAtClose: 'todo' })
      ).outcome
    ).toBe('not_started')
  })
})

describe('classifyAllocation — the ±0.25h tolerance', () => {
  it('is fifteen minutes', () => {
    expect(VARIANCE_TOLERANCE_MINUTES).toBe(15)
  })

  it('treats exactly the tolerance over as on estimate and one minute past it as over', () => {
    expect(
      classifyAllocation(at({ loggedMinutesOnDay: m(360 + 15), taskStatusAtClose: 'done' })).outcome
    ).toBe('delivered_on_estimate')
    expect(
      classifyAllocation(at({ loggedMinutesOnDay: m(360 + 16), taskStatusAtClose: 'done' })).outcome
    ).toBe('delivered_over')
  })

  it('treats exactly the tolerance under as on estimate and one minute past it as under', () => {
    expect(
      classifyAllocation(at({ loggedMinutesOnDay: m(360 - 15), taskStatusAtClose: 'done' })).outcome
    ).toBe('delivered_on_estimate')
    expect(
      classifyAllocation(at({ loggedMinutesOnDay: m(360 - 16), taskStatusAtClose: 'done' })).outcome
    ).toBe('delivered_under')
  })

  it('applies the same boundary to an open task', () => {
    expect(classifyAllocation(at({ loggedMinutesOnDay: m(360 + 15) })).outcome).toBe(
      'open_fully_consumed'
    )
    expect(classifyAllocation(at({ loggedMinutesOnDay: m(360 + 16) })).outcome).toBe(
      'open_over_consumed'
    )
  })
})

describe('classifyAllocation — the numbers', () => {
  it('reports the worked example exactly (§12.3)', () => {
    const kan214 = classifyAllocation(
      at({
        plannedMinutes: h(6),
        loggedMinutesOnDay: h(8),
        originalEstimateMinutes: h(6),
        totalLoggedMinutesOnTask: h(8),
        remainingBeforeMinutes: h(6)
      })
    )
    expect(kan214.outcome).toBe('open_over_consumed')
    expect(kan214.dayVarianceMinutes).toBe(h(2))
    expect(kan214.taskVarianceMinutes).toBe(h(2))
    expect(kan214.overrunMinutes).toBe(h(2))
    expect(kan214.creditMinutes).toBe(0)
    expect(kan214.requiresRevision).toBe(true)
    expect(kan214.remainingAfterMinutes).toBe(0)
  })

  it('reports the worked example second row exactly (§12.3, KAN-231)', () => {
    const kan231 = classifyAllocation(
      at({
        plannedMinutes: h(2),
        loggedMinutesOnDay: h(0),
        originalEstimateMinutes: h(2),
        totalLoggedMinutesOnTask: h(0),
        remainingBeforeMinutes: h(2),
        taskStatusAtClose: 'todo',
        taskStatusAtAllocation: 'todo'
      })
    )
    expect(kan231.outcome).toBe('not_started')
    expect(kan231.dayVarianceMinutes).toBe(h(-2))
    expect(kan231.overrunMinutes).toBe(0)
    expect(kan231.requiresReason).toBe(true)
    // V7 carries forward at its full remaining — nothing was consumed.
    expect(kan231.remainingAfterMinutes).toBe(h(2))
  })

  it('credits the unused hours when a task is delivered under (V1, AC-19)', () => {
    const result = classifyAllocation(
      at({ plannedMinutes: h(4), loggedMinutesOnDay: h(3), taskStatusAtClose: 'done' })
    )
    expect(result.creditMinutes).toBe(h(1))
    expect(result.overrunMinutes).toBe(0)
  })

  it('keeps a negative task variance while the day variance is positive (E38)', () => {
    const result = classifyAllocation(
      at({
        plannedMinutes: h(2),
        loggedMinutesOnDay: h(4),
        originalEstimateMinutes: h(20),
        totalLoggedMinutesOnTask: h(6),
        taskStatusAtClose: 'done'
      })
    )
    expect(result.dayVarianceMinutes).toBe(h(2))
    expect(result.taskVarianceMinutes).toBe(h(-14))
  })

  it('floors the remaining estimate at zero rather than going negative', () => {
    const result = classifyAllocation(
      at({ remainingBeforeMinutes: h(2), loggedMinutesOnDay: h(5) })
    )
    expect(result.remainingAfterMinutes).toBe(0)
  })

  it('demands a revision on V5 only when nothing is left on an unfinished task', () => {
    const nothingLeft = classifyAllocation(
      at({ plannedMinutes: h(6), loggedMinutesOnDay: h(6), remainingBeforeMinutes: h(6) })
    )
    expect(nothingLeft.outcome).toBe('open_fully_consumed')
    expect(nothingLeft.requiresRevision).toBe(true)

    const someLeft = classifyAllocation(
      at({ plannedMinutes: h(6), loggedMinutesOnDay: h(6), remainingBeforeMinutes: h(10) })
    )
    expect(someLeft.outcome).toBe('open_fully_consumed')
    expect(someLeft.requiresRevision).toBe(false)
  })

  it('posts no overrun and no credit for an absent owner (V11)', () => {
    const result = classifyAllocation(
      at({ loggedMinutesOnDay: h(9), detachedReason: 'owner_absent' })
    )
    expect(result.overrunMinutes).toBe(0)
    expect(result.creditMinutes).toBe(0)
    expect(result.requiresRevision).toBe(false)
    expect(result.requiresReason).toBe(false)
  })

  it('posts no overrun for a blocked row (V8)', () => {
    expect(
      classifyAllocation(at({ taskStatusAtClose: 'blocked', loggedMinutesOnDay: h(9) }))
        .overrunMinutes
    ).toBe(0)
  })

  it('posts no debt for work that never started (V7)', () => {
    expect(
      classifyAllocation(at({ loggedMinutesOnDay: h(0), taskStatusAtClose: 'todo', taskStatusAtAllocation: 'todo' }))
        .overrunMinutes
    ).toBe(0)
  })

  it('warns but accrues nothing when the status moved with no logged time (V12, E37)', () => {
    const result = classifyAllocation(
      at({ loggedMinutesOnDay: h(0), taskStatusAtAllocation: 'todo', taskStatusAtClose: 'done' })
    )
    expect(result.outcome).toBe('no_time_logged_but_progressed')
    expect(result.warnsNoTimeLogged).toBe(true)
    expect(result.overrunMinutes).toBe(0)
    expect(result.creditMinutes).toBe(0)
  })
})

describe('classifyAllocation — D-D shared tasks', () => {
  it('zeroes the task variance on a non-owner allocation and flags it shared', () => {
    const result = classifyAllocation(at({ ownsTaskVariance: false, loggedMinutesOnDay: h(8) }))
    expect(result.taskVarianceMinutes).toBe(0)
    expect(result.sharedContribution).toBe(true)
    // The member's own day overrun is still theirs: they really did burn it.
    expect(result.overrunMinutes).toBe(h(2))
  })

  it('leaves the owner row carrying the task variance', () => {
    const result = classifyAllocation(at({ ownsTaskVariance: true, totalLoggedMinutesOnTask: h(10) }))
    expect(result.taskVarianceMinutes).toBe(h(4))
    expect(result.sharedContribution).toBe(false)
  })
})

describe('classifyAll — VAR-3 re-runnability', () => {
  it('produces a deeply equal result for the same input twice', () => {
    expect(classifyAllocation(base)).toEqual(classifyAllocation(base))
  })

  it('does not mutate its input', () => {
    const input = at({ loggedMinutesOnDay: h(8) })
    const before = JSON.stringify(input)
    classifyAllocation(input)
    expect(JSON.stringify(input)).toBe(before)
  })

  it('classifies a list in order, one result per input', () => {
    const results = classifyAll([
      at({ allocationId: 'a', loggedMinutesOnDay: h(8) }),
      at({ allocationId: 'b', loggedMinutesOnDay: h(0), taskStatusAtClose: 'todo', taskStatusAtAllocation: 'todo' })
    ])
    expect(results.map((row) => row.allocationId)).toEqual(['a', 'b'])
    expect(results.map((row) => row.outcome)).toEqual(['open_over_consumed', 'not_started'])
  })
})
