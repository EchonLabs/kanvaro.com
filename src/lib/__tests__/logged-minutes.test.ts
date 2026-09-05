/**
 * getLoggedMinutes is the contract the whole stand-up variance engine rests on
 * (spec §18.2): it supplies `A`, the actual logged hours, in every V1–V12
 * outcome classification. If it is wrong, every debt number the module shows a
 * PM is wrong, so it is proven here rather than assumed.
 */
import {
  getLoggedMinutes,
  getLoggedMinutesBulk,
  getTotalLoggedMinutesForTask,
  loggedMinutesKey,
  STANDUP_MANUAL_TIME_ENTRY_CATEGORY
} from '../time-tracking-server'
import { TimeEntry } from '@/models/TimeEntry'

jest.mock('@/models/TimeEntry', () => ({
  TimeEntry: { aggregate: jest.fn() }
}))

const mockAggregate = TimeEntry.aggregate as jest.Mock

// Kasun's day 3 from the spec's worked example (§12.3).
const TASK_KAN_214 = '507f1f77bcf86cd799439011'
const TASK_KAN_231 = '507f1f77bcf86cd799439012'
const MEMBER_KASUN = '507f1f77bcf86cd799439021'
const MEMBER_AMAL = '507f1f77bcf86cd799439022'

const DAY_3 = {
  from: new Date('2026-08-05T00:00:00.000Z'),
  to: new Date('2026-08-06T00:00:00.000Z')
}

/** Pulls the $match stage out of the aggregation pipeline the code built. */
const matchStage = () => mockAggregate.mock.calls[0][0][0].$match

beforeEach(() => {
  jest.clearAllMocks()
})

describe('getLoggedMinutes', () => {
  it('returns the summed duration for one member on one task', async () => {
    mockAggregate.mockResolvedValue([{ _id: null, totalDuration: 480 }])

    // The headline case: 8.0h logged against a 6.0h plan.
    await expect(getLoggedMinutes(TASK_KAN_214, MEMBER_KASUN, DAY_3)).resolves.toBe(480)
  })

  it('returns 0 rather than undefined when nothing was logged', async () => {
    mockAggregate.mockResolvedValue([])

    // Outcome V7 (not_started) depends on this being exactly 0.
    await expect(getLoggedMinutes(TASK_KAN_231, MEMBER_KASUN, DAY_3)).resolves.toBe(0)
  })

  it('scopes the query to the task, the member and a half-open date range', async () => {
    mockAggregate.mockResolvedValue([])
    await getLoggedMinutes(TASK_KAN_214, MEMBER_KASUN, DAY_3)

    const match = matchStage()
    expect(match.task.toString()).toBe(TASK_KAN_214)
    expect(match.user.toString()).toBe(MEMBER_KASUN)
    // $gte/$lt, not $gte/$lte — midnight must belong to exactly one day.
    expect(match.startTime).toEqual({ $gte: DAY_3.from, $lt: DAY_3.to })
  })

  it('excludes cancelled entries so abandoned work never counts as logged', async () => {
    mockAggregate.mockResolvedValue([])
    await getLoggedMinutes(TASK_KAN_214, MEMBER_KASUN, DAY_3)

    expect(matchStage().status).toEqual({ $nin: ['cancelled'] })
  })

  it('always returns whole minutes', async () => {
    // Legacy rows can hold fractional durations; stand-up arithmetic is
    // integer-minutes only (DAT-2, NFR-P1) so it must round at this boundary.
    mockAggregate.mockResolvedValue([{ _id: null, totalDuration: 479.6 }])

    const result = await getLoggedMinutes(TASK_KAN_214, MEMBER_KASUN, DAY_3)
    expect(Number.isInteger(result)).toBe(true)
    expect(result).toBe(480)
  })

  it('rejects a malformed id instead of silently reporting zero hours', async () => {
    await expect(getLoggedMinutes('not-an-id', MEMBER_KASUN, DAY_3)).rejects.toThrow(/invalid taskId/)
    await expect(getLoggedMinutes(TASK_KAN_214, 'not-an-id', DAY_3)).rejects.toThrow(/invalid memberId/)
    expect(mockAggregate).not.toHaveBeenCalled()
  })
})

describe('getLoggedMinutesBulk', () => {
  it('resolves a whole stand-up in a single aggregation', async () => {
    mockAggregate.mockResolvedValue([
      { _id: { task: TASK_KAN_214, user: MEMBER_KASUN }, totalDuration: 480 }
    ])

    const totals = await getLoggedMinutesBulk(
      [
        { taskId: TASK_KAN_214, memberId: MEMBER_KASUN },
        { taskId: TASK_KAN_231, memberId: MEMBER_KASUN }
      ],
      DAY_3
    )

    // One round trip regardless of allocation count — NFR-1/NFR-3 depend on it.
    expect(mockAggregate).toHaveBeenCalledTimes(1)
    expect(totals.get(loggedMinutesKey(TASK_KAN_214, MEMBER_KASUN))).toBe(480)
  })

  it('reports 0 for requested pairs that logged nothing', async () => {
    mockAggregate.mockResolvedValue([])

    const totals = await getLoggedMinutesBulk(
      [{ taskId: TASK_KAN_231, memberId: MEMBER_KASUN }],
      DAY_3
    )

    // Present-with-zero, so callers never conflate "absent" with "none logged".
    expect(totals.has(loggedMinutesKey(TASK_KAN_231, MEMBER_KASUN))).toBe(true)
    expect(totals.get(loggedMinutesKey(TASK_KAN_231, MEMBER_KASUN))).toBe(0)
  })

  it('discards cross-product pairs that were never requested', async () => {
    // $in on task and $in on user matches every combination, so Amal's time on
    // Kasun's task comes back even though nobody asked for that pair.
    mockAggregate.mockResolvedValue([
      { _id: { task: TASK_KAN_214, user: MEMBER_KASUN }, totalDuration: 480 },
      { _id: { task: TASK_KAN_214, user: MEMBER_AMAL }, totalDuration: 120 }
    ])

    const totals = await getLoggedMinutesBulk(
      [
        { taskId: TASK_KAN_214, memberId: MEMBER_KASUN },
        { taskId: TASK_KAN_231, memberId: MEMBER_AMAL }
      ],
      DAY_3
    )

    expect(totals.get(loggedMinutesKey(TASK_KAN_214, MEMBER_KASUN))).toBe(480)
    expect(totals.has(loggedMinutesKey(TASK_KAN_214, MEMBER_AMAL))).toBe(false)
    expect(totals.size).toBe(2)
  })

  it('short-circuits on an empty request without querying', async () => {
    const totals = await getLoggedMinutesBulk([], DAY_3)

    expect(totals.size).toBe(0)
    expect(mockAggregate).not.toHaveBeenCalled()
  })
})

describe('getTotalLoggedMinutesForTask', () => {
  it('sums across every member and is not date-bounded', async () => {
    mockAggregate.mockResolvedValue([{ _id: null, totalDuration: 660 }])

    // Task variance (§12.1) compares lifetime logged against the original
    // estimate, so this must not filter by member or by date.
    await expect(getTotalLoggedMinutesForTask(TASK_KAN_214)).resolves.toBe(660)

    const match = matchStage()
    expect(match.user).toBeUndefined()
    expect(match.startTime).toBeUndefined()
  })
})

describe('manual time entry fallback', () => {
  it('exposes the category used when a project has no timer (E74)', () => {
    expect(STANDUP_MANUAL_TIME_ENTRY_CATEGORY).toBe('standup_manual')
  })
})
