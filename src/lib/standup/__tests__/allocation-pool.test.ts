/**
 * The unassigned pool (Phase 7, Task 4 — ALO-13 … ALO-17).
 *
 * The pool answers one question: what work is not yet planned for today? It is
 * pure partitioning over the sprint's tasks and this stand-up's allocations,
 * and it is the half of Panel 5 that decides whether the PM can actually fill
 * eight hours or spends the meeting hunting for tasks.
 *
 * The case worth naming is the detached one. When a member is marked absent,
 * RUN-7 detaches their allocations (§6.4 OB-13) rather than deleting them, so
 * Phase 9 can sweep them into the register. If the pool went on treating those
 * tasks as allocated, the reassign prompt would have nothing to offer and the
 * work would vanish from the board for the rest of the day — which is exactly
 * the silent failure `strandedMinutes` exists to prevent. A detached allocation
 * must return its task to the pool.
 */
import {
  fitsIndicator,
  filterPool,
  partitionPool,
  sortPool,
  type PoolAllocation,
  type PoolTask
} from '../allocation'
import { minutes } from '../minutes'

const m = minutes

const DONE = ['done', 'released']

function task(id: string, overrides: Partial<PoolTask> = {}): PoolTask {
  return {
    taskId: id,
    key: id,
    title: `Task ${id}`,
    status: 'in_progress',
    type: 'task',
    priority: 'medium',
    labels: [],
    remainingEstimateMinutes: m(120),
    position: 0,
    assigneeIds: [],
    ...overrides
  }
}

function allocation(taskId: string, overrides: Partial<PoolAllocation> = {}): PoolAllocation {
  return { taskId, memberId: 'kasun', ...overrides }
}

describe('partitionPool (ALO-13, ALO-14)', () => {
  it('puts a task with no assignee in the Unassigned tab', () => {
    const pool = partitionPool([task('KAN-301')], [], DONE)

    expect(pool.unassigned.map((t) => t.taskId)).toEqual(['KAN-301'])
    expect(pool.assignedNotPlanned).toEqual([])
  })

  it('puts an assigned but unallocated task in the second tab', () => {
    const pool = partitionPool([task('KAN-302', { assigneeIds: ['kasun'] })], [], DONE)

    expect(pool.unassigned).toEqual([])
    expect(pool.assignedNotPlanned.map((t) => t.taskId)).toEqual(['KAN-302'])
  })

  it('excludes a task in a done status from both tabs', () => {
    const pool = partitionPool([task('KAN-303', { status: 'done' })], [], DONE)

    expect(pool.unassigned).toEqual([])
    expect(pool.assignedNotPlanned).toEqual([])
  })

  it('excludes a task already allocated today', () => {
    const pool = partitionPool(
      [task('KAN-304', { assigneeIds: ['kasun'] })],
      [allocation('KAN-304')],
      DONE
    )

    expect(pool.unassigned).toEqual([])
    expect(pool.assignedNotPlanned).toEqual([])
  })

  describe('RUN-7 detachment (§6.4 OB-13)', () => {
    it('returns a task to the pool when its only allocation was detached by an absence', () => {
      const pool = partitionPool(
        [task('KAN-277', { assigneeIds: ['nuwan'] })],
        [allocation('KAN-277', { memberId: 'nuwan', detachedReason: 'owner_absent' })],
        DONE
      )

      // Without this the "Reassign Nuwan's 2 open tasks?" prompt has nothing to
      // hand the PM, and six hours of work silently leave the board.
      expect(pool.assignedNotPlanned.map((t) => t.taskId)).toEqual(['KAN-277'])
    })

    it('keeps a task out of the pool once it has been reassigned to somebody live', () => {
      const pool = partitionPool(
        [task('KAN-277', { assigneeIds: ['nuwan'] })],
        [
          allocation('KAN-277', { memberId: 'nuwan', detachedReason: 'owner_absent' }),
          allocation('KAN-277', { memberId: 'amal' })
        ],
        DONE
      )

      expect(pool.unassigned).toEqual([])
      expect(pool.assignedNotPlanned).toEqual([])
    })
  })

  it('keeps a blocked-but-excluded task out of the pool — it is planned, just not counted', () => {
    // RUN-15 excludes a blocked task from the member's hours. That is a
    // capacity decision, not an un-planning: the row is still on the board and
    // offering it again in the pool would let the PM allocate it twice.
    const pool = partitionPool(
      [task('KAN-260', { assigneeIds: ['ravi'] })],
      [allocation('KAN-260', { memberId: 'ravi', excludedFromCapacity: true })],
      DONE
    )

    expect(pool.assignedNotPlanned).toEqual([])
  })

  it('is case-insensitive about done statuses, because project workflows are typed by hand', () => {
    const pool = partitionPool([task('KAN-305', { status: 'Done' })], [], DONE)

    expect(pool.unassigned).toEqual([])
  })
})

describe('sortPool (ALO-15)', () => {
  const tasks = [
    task('A', { priority: 'low', remainingEstimateMinutes: m(300), position: 3 }),
    task('B', { priority: 'critical', remainingEstimateMinutes: m(60), position: 1 }),
    task('C', { priority: 'medium', remainingEstimateMinutes: m(120), position: 2 })
  ]

  it('sorts by priority, most urgent first', () => {
    expect(sortPool(tasks, 'priority').map((t) => t.taskId)).toEqual(['B', 'C', 'A'])
  })

  it('sorts by estimate ascending', () => {
    expect(sortPool(tasks, 'estimate_asc').map((t) => t.taskId)).toEqual(['B', 'C', 'A'])
  })

  it('sorts by estimate descending', () => {
    expect(sortPool(tasks, 'estimate_desc').map((t) => t.taskId)).toEqual(['A', 'C', 'B'])
  })

  it('sorts by backlog rank', () => {
    expect(sortPool(tasks, 'backlog_rank').map((t) => t.taskId)).toEqual(['B', 'C', 'A'])
  })

  it('does not mutate its input', () => {
    const original = [...tasks]
    sortPool(tasks, 'estimate_desc')
    expect(tasks).toEqual(original)
  })
})

describe('filterPool (ALO-15)', () => {
  const tasks = [
    task('A', { type: 'bug', priority: 'high', labels: ['api'], epicId: 'e1', remainingEstimateMinutes: m(60) }),
    task('B', { type: 'feature', priority: 'low', labels: ['ui'], epicId: 'e2', remainingEstimateMinutes: m(480) })
  ]

  it('filters by type', () => {
    expect(filterPool(tasks, { types: ['bug'] }).map((t) => t.taskId)).toEqual(['A'])
  })

  it('filters by priority', () => {
    expect(filterPool(tasks, { priorities: ['low'] }).map((t) => t.taskId)).toEqual(['B'])
  })

  it('filters by label', () => {
    expect(filterPool(tasks, { labels: ['ui'] }).map((t) => t.taskId)).toEqual(['B'])
  })

  it('filters by epic', () => {
    expect(filterPool(tasks, { epicIds: ['e1'] }).map((t) => t.taskId)).toEqual(['A'])
  })

  it('filters by estimate band', () => {
    expect(
      filterPool(tasks, { maxEstimateMinutes: m(120) }).map((t) => t.taskId)
    ).toEqual(['A'])
  })

  it('searches key and title', () => {
    expect(filterPool(tasks, { search: 'task b' }).map((t) => t.taskId)).toEqual(['B'])
  })

  it('combines filters conjunctively', () => {
    expect(filterPool(tasks, { types: ['bug'], priorities: ['low'] })).toEqual([])
  })

  it('returns everything for an empty filter', () => {
    expect(filterPool(tasks, {})).toHaveLength(2)
  })
})

describe('fitsIndicator (ALO-17)', () => {
  it('reports an exact fit — the task that closes the gap precisely', () => {
    expect(fitsIndicator(m(180), m(180))).toBe('exact')
  })

  it('reports a fit below the gap', () => {
    expect(fitsIndicator(m(120), m(180))).toBe('fits')
  })

  it('reports an overflow above the gap', () => {
    expect(fitsIndicator(m(240), m(180))).toBe('overflows')
  })

  it('reports an overflow against a closed gap, whatever the estimate', () => {
    expect(fitsIndicator(m(15), m(0))).toBe('overflows')
  })
})
