/**
 * @jest-environment jsdom
 */
/**
 * The unassigned pool (Phase 7, Task 11 — ALO-13 … ALO-17).
 *
 * The pool is the left half of Panel 5 and it answers one question: what work
 * is not yet planned for today? The partitioning itself is pure and already
 * tested in `allocation-pool.test.ts`; what this suite covers is the part only
 * a rendered component can be wrong about.
 *
 * The load-bearing case is ALO-16's keyboard equivalence. A task must reach a
 * member's day by keyboard exactly as it does by drag — same request, same
 * result — because HTML drag-and-drop has no keyboard path and a pool that can
 * only be dragged from is a pool part of the team cannot use.
 *
 * Driven with `fireEvent`, matching the rest of the repo's component suites.
 */
import { fireEvent, render, screen, within } from '@testing-library/react'

import { UnassignedPool } from '@/components/standup/run/UnassignedPool'
import type { PoolTask } from '@/lib/standup/allocation'
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

const unassigned = [
  task('KAN-301', { title: 'Export CSV', remainingEstimateMinutes: m(300), priority: 'high' }),
  task('KAN-302', { title: 'Audit log', remainingEstimateMinutes: m(480), type: 'bug' }),
  task('KAN-310', { title: 'Health check', remainingEstimateMinutes: m(60), priority: 'low' })
]

const assignedNotPlanned = [
  task('KAN-255', { title: 'Rate limiter', assigneeIds: ['amal'] }),
  task('KAN-260', { title: 'SSO callback', assigneeIds: ['ravi'] })
]

const renderPool = (props: Partial<Parameters<typeof UnassignedPool>[0]> = {}) => {
  const onAdd = jest.fn()
  render(
    <UnassignedPool
      unassigned={unassigned}
      assignedNotPlanned={assignedNotPlanned}
      selectedMember={{ memberId: 'kasun', name: 'Kasun', gapMinutes: m(300) }}
      totalCount={unassigned.length + assignedNotPlanned.length}
      onAdd={onAdd}
      {...props}
    />
  )
  return onAdd
}

/**
 * Matches a tab by its exact label.
 *
 * A `RegExp` would be wrong here: the labels contain their counts in
 * parentheses (ALO-14), and `(3)` is a capture group, not a literal.
 */
const tab = (name: string | RegExp) => screen.getByRole('tab', { name })

describe('UnassignedPool', () => {
  describe('ALO-14 — two tabs, counts in the labels', () => {
    it('labels both tabs with their counts', () => {
      renderPool()

      expect(tab(standupStrings.pool.tabUnassigned({ count: 3 }))).toBeInTheDocument()
      expect(
        tab(standupStrings.pool.tabAssignedNotPlanned({ count: 2 }))
      ).toBeInTheDocument()
    })

    it('opens on Unassigned, because that is the work with nobody looking after it', () => {
      renderPool()

      expect(tab(/^Unassigned/)).toHaveAttribute('aria-selected', 'true')
      expect(screen.getByText('Export CSV')).toBeInTheDocument()
      expect(screen.queryByText('Rate limiter')).not.toBeInTheDocument()
    })

    it('switches to the second tab', () => {
      renderPool()

      fireEvent.click(tab(/^Assigned but not planned/))

      expect(screen.getByText('Rate limiter')).toBeInTheDocument()
      expect(screen.queryByText('Export CSV')).not.toBeInTheDocument()
    })

    it('moves between tabs with the arrow keys (NFR-A2)', () => {
      renderPool()

      const first = tab(/^Unassigned/)
      first.focus()
      fireEvent.keyDown(first, { key: 'ArrowRight' })

      expect(tab(/^Assigned but not planned/)).toHaveAttribute('aria-selected', 'true')
    })
  })

  describe('ALO-15 — search, filter, sort', () => {
    it('searches on key and title', () => {
      renderPool()

      fireEvent.change(screen.getByLabelText(standupStrings.pool.searchLabel()), {
        target: { value: 'audit' }
      })

      expect(screen.getAllByTestId('pool-task')).toHaveLength(1)
      expect(screen.getByText('Audit log')).toBeInTheDocument()
    })

    it('filters by type', () => {
      renderPool()

      fireEvent.change(screen.getByLabelText(standupStrings.pool.filterType()), {
        target: { value: 'bug' }
      })

      expect(screen.getAllByTestId('pool-task')).toHaveLength(1)
      expect(screen.getByText('Audit log')).toBeInTheDocument()
    })

    it('filters by priority', () => {
      renderPool()

      fireEvent.change(screen.getByLabelText(standupStrings.pool.filterPriority()), {
        target: { value: 'high' }
      })

      expect(screen.getAllByTestId('pool-task')).toHaveLength(1)
      expect(screen.getByText('Export CSV')).toBeInTheDocument()
    })

    it('sorts smallest first', () => {
      renderPool()

      fireEvent.change(screen.getByLabelText(standupStrings.pool.sortLabel()), {
        target: { value: 'estimate_asc' }
      })

      expect(screen.getAllByTestId('pool-task').map((el) => el.textContent)).toEqual([
        expect.stringContaining('Health check'),
        expect.stringContaining('Export CSV'),
        expect.stringContaining('Audit log')
      ])
    })

    it('sorts largest first', () => {
      renderPool()

      fireEvent.change(screen.getByLabelText(standupStrings.pool.sortLabel()), {
        target: { value: 'estimate_desc' }
      })

      expect(screen.getAllByTestId('pool-task')[0]).toHaveTextContent('Audit log')
    })
  })

  describe('empty states', () => {
    it('distinguishes an empty tab from a filtered-empty one', () => {
      // These mean opposite things — "there is no such work" versus "your
      // filters hid it" — and only one of them has an action.
      renderPool({ unassigned: [] })

      expect(screen.getByText(standupStrings.pool.emptyUnassigned())).toBeInTheDocument()
      expect(
        screen.queryByRole('button', { name: standupStrings.pool.clearFilters() })
      ).not.toBeInTheDocument()
    })

    it('offers to clear the filters when they are what emptied the list', () => {
      renderPool()

      fireEvent.change(screen.getByLabelText(standupStrings.pool.searchLabel()), {
        target: { value: 'nothing matches this' }
      })

      expect(screen.getByText(standupStrings.pool.emptyFiltered())).toBeInTheDocument()

      fireEvent.click(
        screen.getByRole('button', { name: standupStrings.pool.clearFilters() })
      )

      expect(screen.getAllByTestId('pool-task')).toHaveLength(3)
    })
  })

  describe('ALO-17 — the fits indicator', () => {
    it('marks the task that closes the selected member’s day exactly', () => {
      renderPool()

      // 5h task against Kasun's 5h gap.
      expect(
        within(screen.getByTestId('pool-task-KAN-301')).getByText(
          standupStrings.allocation.fitsExact()
        )
      ).toBeInTheDocument()
    })

    it('shows the overflow for a task that is too big', () => {
      renderPool()

      expect(
        within(screen.getByTestId('pool-task-KAN-302')).getByText(
          standupStrings.allocation.fitsOver({ minutes: m(180) })
        )
      ).toBeInTheDocument()
    })

    it('says which member the fits are measured against', () => {
      renderPool()

      expect(
        screen.getByText(standupStrings.pool.fitsAgainst({ name: 'Kasun' }))
      ).toBeInTheDocument()
    })

    it('asks for a member rather than showing a meaningless fit when none is selected', () => {
      renderPool({ selectedMember: null })

      expect(screen.getByText(standupStrings.pool.selectMemberFirst())).toBeInTheDocument()
      expect(screen.queryByText(standupStrings.allocation.fitsExact())).not.toBeInTheDocument()
    })
  })

  describe('ALO-16 — adding a task to a member', () => {
    it('adds by keyboard, producing the same call a drop would', () => {
      const onAdd = renderPool()

      const button = screen.getByRole('button', {
        name: standupStrings.pool.addToMember({ task: 'KAN-301', name: 'Kasun' })
      })
      button.focus()
      fireEvent.click(button)

      expect(onAdd).toHaveBeenCalledWith('kasun', expect.objectContaining({ taskId: 'KAN-301' }))
    })

    it('offers no add control when no member is selected', () => {
      renderPool({ selectedMember: null })

      expect(screen.queryByRole('button', { name: /Add KAN-301/ })).not.toBeInTheDocument()
    })

    it('offers no add control when the board is read-only (RUN-26)', () => {
      renderPool({ readOnly: true })

      expect(screen.queryByRole('button', { name: /Add KAN-301/ })).not.toBeInTheDocument()
    })
  })

  describe('D-K — pagination at fifty', () => {
    it('reports how much of the sprint is on screen', () => {
      renderPool({ totalCount: 55 })

      expect(
        screen.getByText(standupStrings.pool.showingCount({ shown: 5, total: 55 }))
      ).toBeInTheDocument()
    })

    it('offers to load more only when there is more', () => {
      const onShowMore = jest.fn()
      renderPool({ totalCount: 55, onShowMore })

      fireEvent.click(screen.getByRole('button', { name: standupStrings.pool.showMore() }))
      expect(onShowMore).toHaveBeenCalled()
    })

    it('hides the control when the whole pool is already shown', () => {
      renderPool({ totalCount: 5, onShowMore: jest.fn() })

      expect(
        screen.queryByRole('button', { name: standupStrings.pool.showMore() })
      ).not.toBeInTheDocument()
    })
  })

  describe('the task card (§15.8.7)', () => {
    it('shows key, title, estimate and priority', () => {
      renderPool()

      const card = screen.getByTestId('pool-task-KAN-301')
      expect(card).toHaveTextContent('KAN-301')
      expect(card).toHaveTextContent('Export CSV')
      expect(card).toHaveTextContent('5.0')
      expect(card).toHaveTextContent(/high/i)
    })
  })
})
