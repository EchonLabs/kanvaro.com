/**
 * Panel 2's bucket rules, pure (Phase 8, Task 11 — RUN-9).
 *
 * The bucket a row lands in is what the PM reads first, and two of the four
 * boundaries are easy to get subtly wrong:
 *
 *   - `not_started` needs **both** zero logged hours and an unchanged status.
 *     A task somebody moved without logging time is progress nobody recorded,
 *     not work nobody did — and the two demand different conversations.
 *   - `blocked` outranks everything, including hours burned. Whatever else
 *     happened to that row, the blocker is what the meeting has to resolve.
 */
import { minutes, type Minutes } from '../minutes'
import {
  bucketCounts,
  bucketOf,
  partitionYesterday,
  YESTERDAY_BUCKETS,
  type YesterdayRow
} from '../yesterday'

const m = (value: number): Minutes => minutes(value)

const statusSets = {
  done: ['done', 'released'],
  inProgress: ['in_progress', 'in_review'],
  blocked: ['blocked']
}

const row = (overrides: Partial<YesterdayRow> = {}): YesterdayRow => ({
  allocationId: 'alloc-1',
  taskId: 'kan-214',
  taskKey: 'KAN-214',
  title: 'Invoice model',
  memberId: 'kasun',
  memberName: 'Kasun Perera',
  previousStatus: 'in_progress',
  currentStatus: 'in_progress',
  plannedMinutes: m(360),
  loggedMinutes: m(480),
  dayVarianceMinutes: m(120),
  remainingEstimateMinutes: m(180),
  ageInStandups: 1,
  unplanned: false,
  ...overrides
})

const bucketRows = (buckets: ReturnType<typeof partitionYesterday>, name: string) =>
  buckets.find((entry) => entry.bucket === name)!.rows

describe('partitionYesterday', () => {
  it('returns all four buckets in the RUN-9 order even when three are empty', () => {
    const buckets = partitionYesterday({ rows: [row()], statusSets })
    expect(buckets.map((entry) => entry.bucket)).toEqual(YESTERDAY_BUCKETS)
    expect(bucketRows(buckets, 'in_progress')).toHaveLength(1)
    expect(bucketRows(buckets, 'completed')).toEqual([])
    expect(bucketRows(buckets, 'not_started')).toEqual([])
    expect(bucketRows(buckets, 'blocked')).toEqual([])
  })

  it('puts every row in exactly one bucket', () => {
    const rows = [
      row({ currentStatus: 'done' }),
      row({ currentStatus: 'blocked' }),
      row({ currentStatus: 'todo', previousStatus: 'todo', loggedMinutes: m(0) }),
      row()
    ]
    const buckets = partitionYesterday({ rows, statusSets })
    const total = buckets.reduce((sum, entry) => sum + entry.rows.length, 0)
    expect(total).toBe(rows.length)
  })

  it('counts each bucket for its heading', () => {
    const buckets = partitionYesterday({
      rows: [row({ currentStatus: 'done' }), row({ currentStatus: 'done' }), row()],
      statusSets
    })
    expect(bucketCounts(buckets)).toEqual({
      completed: 2,
      in_progress: 1,
      not_started: 0,
      blocked: 0
    })
  })
})

describe('bucketOf', () => {
  it('sends a done task to completed', () => {
    expect(bucketOf(row({ currentStatus: 'done' }), statusSets)).toBe('completed')
  })

  it('puts a row whose status is unchanged and whose logged hours are zero in not_started', () => {
    expect(
      bucketOf(row({ previousStatus: 'todo', currentStatus: 'todo', loggedMinutes: m(0) }), statusSets)
    ).toBe('not_started')
  })

  it('puts a row with zero logged hours but an advanced status in in_progress, not not_started', () => {
    expect(
      bucketOf(
        row({ previousStatus: 'todo', currentStatus: 'in_progress', loggedMinutes: m(0) }),
        statusSets
      )
    ).toBe('in_progress')
  })

  it('puts a row with hours logged and an unchanged status in in_progress', () => {
    expect(
      bucketOf(
        row({ previousStatus: 'in_progress', currentStatus: 'in_progress', loggedMinutes: m(120) }),
        statusSets
      )
    ).toBe('in_progress')
  })

  it('sends a blocked row to blocked regardless of logged hours', () => {
    expect(bucketOf(row({ currentStatus: 'blocked', loggedMinutes: m(240) }), statusSets)).toBe(
      'blocked'
    )
    expect(bucketOf(row({ currentStatus: 'blocked', loggedMinutes: m(0) }), statusSets)).toBe(
      'blocked'
    )
  })

  it('sends a blocked row to blocked even when it also reached a done status name', () => {
    // Nonsense in practice, but the precedence has to be decided rather than
    // depending on which branch happens to be written first.
    expect(
      bucketOf(row({ currentStatus: 'blocked' }), {
        ...statusSets,
        done: ['blocked']
      })
    ).toBe('blocked')
  })

  it('matches statuses case-insensitively', () => {
    expect(bucketOf(row({ currentStatus: 'Done' }), statusSets)).toBe('completed')
  })

  it('puts an unplanned row in the bucket its status implies (E39)', () => {
    expect(
      bucketOf(row({ unplanned: true, allocationId: undefined, currentStatus: 'done' }), statusSets)
    ).toBe('completed')
  })
})
