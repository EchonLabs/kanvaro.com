/**
 * @jest-environment jsdom
 */
/**
 * Panel 5's assignment surface (Phase 7, Task 11 — ALO-13 … ALO-17), as
 * rebuilt in Task 8 on the shared `TaskAssignmentSplitScreen`.
 *
 * The partitioning and the sorts are pure and already tested in
 * `allocation-pool.test.ts`, and the split screen's own filter/sort/drag
 * mechanics are tested in `shared/__tests__`. What this suite covers is the
 * part only this composition can be wrong about: ALO-14's two tabs choosing
 * which pool the shared surface is handed, the run-only content the member
 * cards render through the render props, and ALO-16's keyboard equivalence.
 *
 * The load-bearing case is still ALO-16: a task must reach a member's day by
 * keyboard exactly as it does by drag — same call, same result — because HTML
 * drag-and-drop has no keyboard path. It is also why the collapsed-card drop
 * is pinned below: the card most drops land on is the one nobody expanded.
 */
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import type { DragEndEvent } from '@dnd-kit/core'

let capturedOnDragEnd: ((event: DragEndEvent) => void) | undefined

// jsdom cannot honestly simulate dnd-kit's pointer mechanics, so the drop
// tests call the handler with the event shape dnd-kit would hand it. Every
// other dnd-kit export stays real — the droppable/draggable registrations the
// cards make are part of what is under test.
jest.mock('@dnd-kit/core', () => {
  const actual = jest.requireActual('@dnd-kit/core')
  return {
    ...actual,
    DndContext: ({
      children,
      onDragEnd
    }: {
      children: React.ReactNode
      onDragEnd?: (event: DragEndEvent) => void
    }) => {
      capturedOnDragEnd = onDragEnd
      return <>{children}</>
    }
  }
})

import { UnassignedPool } from '@/components/standup/run/UnassignedPool'
import type { BoardMemberView } from '@/components/standup/run/CapacityBoard'
import type { PoolTask } from '@/lib/standup/allocation'
import type { CapacityBreakdown } from '@/lib/standup/capacity'
import { minutes } from '@/lib/standup/minutes'
import { standupStrings } from '@/lib/standup/strings'

const m = minutes

function task(id: string, overrides: Partial<PoolTask> = {}): PoolTask {
  return {
    taskId: id,
    key: id,
    title: `Task ${id}`,
    status: 'todo',
    type: 'task',
    priority: 'medium',
    labels: [],
    remainingEstimateMinutes: m(120),
    position: 0,
    assigneeIds: [],
    ...overrides
  }
}

// Every task in the pool is owned: the run screen shows only the
// assigned-but-not-planned pile (there is no Unassigned view).
const assignedNotPlanned = [
  task('KAN-301', {
    title: 'Export CSV',
    remainingEstimateMinutes: m(300),
    priority: 'high',
    assigneeIds: ['amal'],
    assigneeNames: ['Amal Perera']
  }),
  task('KAN-302', {
    title: 'Audit log',
    remainingEstimateMinutes: m(480),
    type: 'bug',
    assigneeIds: ['ravi'],
    assigneeNames: ['Ravi Silva']
  }),
  task('KAN-310', {
    title: 'Health check',
    remainingEstimateMinutes: m(60),
    priority: 'low',
    assigneeIds: ['amal'],
    assigneeNames: ['Amal Perera']
  })
]

function capacity(overrides: Partial<CapacityBreakdown> = {}): CapacityBreakdown {
  return {
    memberId: 'kasun',
    date: '2026-08-17',
    nominalMinutes: m(480),
    adjustments: [],
    adjustedMinutes: m(480),
    outstandingDebtMinutes: m(0),
    overrunPolicy: 'absorb',
    effectiveMinutes: m(480),
    allocatedMinutes: m(180),
    gapMinutes: m(300),
    status: 'under',
    isUnavailable: false,
    strandedMinutes: m(0),
    ...overrides
  }
}

const members: BoardMemberView[] = [
  {
    memberId: 'kasun',
    name: 'Kasun',
    capacity: capacity(),
    allocations: [
      {
        allocationId: 'a1',
        taskId: 't1',
        taskKey: 'KAN-214',
        title: 'Invoice model',
        plannedMinutes: m(180),
        remainingEstimateMinutes: m(420),
        source: 'carried_forward',
        isBlocked: false,
        excludedFromCapacity: false,
        pairedDeliberately: false
      }
    ]
  },
  {
    memberId: 'nimal',
    name: 'Nimal',
    capacity: capacity({ memberId: 'nimal', allocatedMinutes: m(0), gapMinutes: m(480) }),
    allocations: []
  }
]

const renderPool = (props: Partial<Parameters<typeof UnassignedPool>[0]> = {}) => {
  const onAssign = jest.fn()
  render(
    <UnassignedPool
      unassigned={[]}
      assignedNotPlanned={assignedNotPlanned}
      members={members}
      totalCount={assignedNotPlanned.length}
      onAssign={onAssign}
      {...props}
    />
  )
  return onAssign
}

const cards = () => screen.getAllByTestId('task-card')

/** The shape dnd-kit hands `onDragEnd`, narrowed to what the handler reads. */
function dropEvent(activeId: string, overId: string | null): DragEndEvent {
  return {
    active: { id: activeId, data: { current: undefined }, rect: { current: {} } },
    over: overId === null ? null : { id: overId, data: { current: undefined }, rect: {} }
  } as unknown as DragEndEvent
}

beforeEach(() => {
  capturedOnDragEnd = undefined
})

describe('UnassignedPool', () => {
  describe('ALO-14 — one list, no Unassigned view', () => {
    it('has no tabs, and no Unassigned control', () => {
      renderPool()

      expect(screen.queryByRole('tab')).not.toBeInTheDocument()
      expect(
        screen.queryByText(standupStrings.pool.tabUnassigned({ count: 0 }))
      ).not.toBeInTheDocument()
    })

    it('titles the list with the count of assigned-but-not-planned tasks', () => {
      renderPool()

      expect(
        screen.getByText(standupStrings.pool.tabAssignedNotPlanned({ count: 3 }))
      ).toBeInTheDocument()
    })

    it('lists only the assigned-but-not-planned tasks, even if the server sent unassigned ones', () => {
      renderPool({ unassigned: [task('KAN-999', { title: 'Orphan task' })] })

      expect(screen.queryByText('Orphan task')).not.toBeInTheDocument()
      expect(screen.getByText('Export CSV')).toBeInTheDocument()
    })

    it('hands a task over with no assignee, so it can be dropped on its own owner', () => {
      // These tasks *are* assigned — they have no allocation on this stand-up,
      // which is what the right-hand side is about. Carrying the assignee
      // through would make the most common drop a no-op.
      renderPool()

      expect(screen.getByLabelText('Assign Export CSV to')).toHaveValue('')
    })
  })

  describe('assignee on the card', () => {
    it("names each task's current assignee, so the PM knows who to give it to for the day", () => {
      renderPool()

      const card = cards().find((el) => el.textContent?.includes('Export CSV'))!
      expect(within(card).getByTestId('task-assignee')).toHaveTextContent('Amal Perera')
    })

    it('shows no assignee line when the name is not known', () => {
      renderPool({
        assignedNotPlanned: [task('KAN-255', { title: 'Rate limiter', assigneeIds: ['amal'] })]
      })

      expect(within(cards()[0]).queryByTestId('task-assignee')).not.toBeInTheDocument()
    })
  })

  describe('ALO-15 — search, filter, sort', () => {
    it('searches on key and title', () => {
      renderPool()

      fireEvent.change(screen.getByLabelText('Search tasks'), {
        target: { value: 'audit' }
      })

      expect(cards()).toHaveLength(1)
      expect(screen.getByText('Audit log')).toBeInTheDocument()
    })

    it('filters by type', () => {
      renderPool()

      fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'bug' } })

      expect(cards()).toHaveLength(1)
      expect(screen.getByText('Audit log')).toBeInTheDocument()
    })

    it('offers type and sort only — no priority or skill filter', () => {
      renderPool()

      expect(screen.getByLabelText('Type')).toBeInTheDocument()
      expect(screen.getByLabelText('Sort')).toBeInTheDocument()
      expect(screen.queryByLabelText('Priority')).not.toBeInTheDocument()
      expect(screen.queryByLabelText('Skill')).not.toBeInTheDocument()
    })

    it('sorts smallest first', () => {
      renderPool()

      fireEvent.change(screen.getByLabelText('Sort'), {
        target: { value: 'estimate_asc' }
      })

      expect(cards().map((el) => el.textContent)).toEqual([
        expect.stringContaining('Health check'),
        expect.stringContaining('Export CSV'),
        expect.stringContaining('Audit log')
      ])
    })

    it('sorts largest first', () => {
      renderPool()

      fireEvent.change(screen.getByLabelText('Sort'), {
        target: { value: 'estimate_desc' }
      })

      expect(cards()[0]).toHaveTextContent('Audit log')
    })
  })

  describe('empty states', () => {
    it('says so when planning gave every task a day already', () => {
      // "There is no such work" — no filters are involved, so no action offered.
      renderPool({ assignedNotPlanned: [] })

      expect(
        screen.getByText(standupStrings.pool.emptyAssignedNotPlanned())
      ).toBeInTheDocument()
      expect(
        screen.queryByRole('button', { name: standupStrings.pool.clearFilters() })
      ).not.toBeInTheDocument()
    })

    it('offers to clear the filters when they are what emptied the list', () => {
      renderPool()

      fireEvent.change(screen.getByLabelText('Search tasks'), {
        target: { value: 'nothing matches this' }
      })

      expect(screen.getByText('No task matches these filters.')).toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))

      expect(cards()).toHaveLength(3)
    })
  })

  describe('ALO-16 — adding a task to a member', () => {
    it('adds by keyboard, producing the same call a drop would', async () => {
      const onAssign = renderPool()

      // Awaited: the split screen locks itself for the duration of the
      // assignment, so the unlock is a state update this test owns.
      await act(async () => {
        fireEvent.change(screen.getByLabelText('Assign Export CSV to'), {
          target: { value: 'nimal' }
        })
      })

      expect(onAssign).toHaveBeenCalledWith('nimal', 'KAN-301')
    })

    it('offers every member, not only one that has been selected first', () => {
      renderPool()

      const picker = screen.getByLabelText('Export CSV', { exact: false })
      expect(within(picker).getByRole('option', { name: 'Kasun' })).toBeInTheDocument()
      expect(within(picker).getByRole('option', { name: 'Nimal' })).toBeInTheDocument()
    })

    it('locks the pickers when the board is read-only (RUN-26)', () => {
      renderPool({ readOnly: true })

      expect(screen.getByLabelText('Assign Export CSV to')).toBeDisabled()
    })

    it('drops onto a collapsed member card — the state most drops land on', async () => {
      const onAssign = renderPool()

      // Nothing was expanded, and nothing needs to be: the whole card is the
      // drop target, not a list inside it.
      expect(
        screen.getByRole('button', { name: "Expand Nimal's details" })
      ).toHaveAttribute('aria-expanded', 'false')

      await act(async () => {
        capturedOnDragEnd!(dropEvent('task-KAN-301', 'member-nimal'))
      })

      expect(onAssign).toHaveBeenCalledWith('nimal', 'KAN-301')
    })

    it('ignores a drop back onto the repository, because nothing in the pool is planned yet', async () => {
      const onAssign = renderPool()

      await act(async () => {
        capturedOnDragEnd!(dropEvent('task-KAN-301', 'assignment-pool'))
      })

      expect(onAssign).not.toHaveBeenCalled()
    })
  })

  describe('the member cards', () => {
    it('expands and collapses one member without touching the others', () => {
      renderPool()

      const toggle = screen.getByRole('button', { name: "Expand Kasun's details" })
      expect(toggle).toHaveAttribute('aria-expanded', 'false')

      fireEvent.click(toggle)

      const expanded = screen.getByRole('button', { name: "Collapse Kasun's details" })
      expect(expanded).toHaveAttribute('aria-expanded', 'true')
      expect(screen.getByText('Invoice model')).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: "Expand Nimal's details" })
      ).toHaveAttribute('aria-expanded', 'false')

      fireEvent.click(expanded)

      expect(
        screen.getByRole('button', { name: "Expand Kasun's details" })
      ).toHaveAttribute('aria-expanded', 'false')
    })

    it('renders whatever the run screen supplies through the render props', () => {
      renderPool({
        renderMemberAlways: (member) => <span>always-{member.id}</span>,
        renderMemberExpanded: (member) => <span>expanded-{member.id}</span>
      })

      // The always-visible half is visible with nothing expanded; the other
      // half is not.
      expect(screen.getByText('always-kasun')).toBeInTheDocument()
      expect(screen.queryByText('expanded-kasun')).not.toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: "Expand Kasun's details" }))

      expect(screen.getByText('expanded-kasun')).toBeInTheDocument()
    })
  })

  describe('D-K — pagination at fifty', () => {
    it('reports how much of the sprint is on screen', () => {
      renderPool({ totalCount: 55 })

      expect(
        screen.getByText(standupStrings.pool.showingCount({ shown: 3, total: 55 }))
      ).toBeInTheDocument()
    })

    it('offers to load more only when there is more', () => {
      const onShowMore = jest.fn()
      renderPool({ totalCount: 55, onShowMore })

      fireEvent.click(screen.getByRole('button', { name: standupStrings.pool.showMore() }))
      expect(onShowMore).toHaveBeenCalled()
    })

    it('hides the control when the whole pool is already shown', () => {
      renderPool({ totalCount: 3, onShowMore: jest.fn() })

      expect(
        screen.queryByRole('button', { name: standupStrings.pool.showMore() })
      ).not.toBeInTheDocument()
    })
  })

  describe('the task card (§15.8.7)', () => {
    it('shows key, title, estimate and priority', () => {
      renderPool()

      const card = cards().find((el) => el.textContent?.includes('Export CSV'))!
      expect(card).toHaveTextContent('KAN-301')
      expect(card).toHaveTextContent('Export CSV')
      expect(card).toHaveTextContent('5.0')
      expect(card).toHaveTextContent(/high/i)
    })

    it('names the sprint once, in the header, rather than on every card', () => {
      renderPool({ sprintLabel: 'Sprint 12' })

      expect(screen.getAllByText('Sprint 12')).toHaveLength(1)
    })
  })
})
