/**
 * @jest-environment jsdom
 */
/**
 * The split-screen assignment surface.
 *
 * The drag half is tested through `resolveMemberDrop`, pure, for the same
 * reason `assignment-board.test.tsx` tests `resolveAssignmentDrop` that way:
 * dnd-kit's pointer mechanics are not something jsdom can honestly simulate,
 * and the part actually worth asserting — which member a drop resolves to,
 * and when a drop is a no-op — needs no DOM at all.
 *
 * The rest is what the PM does with the left panel: narrow a long repository
 * down to the task they are looking for, and assign it without a pointer.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import type {
  AssignableMemberView,
  AssignableTaskView
} from '@/components/standup/shared/AssignableTask'
import {
  filterAssignableTasks,
  POOL_DROPPABLE_ID,
  resolveMemberDrop,
  sortAssignableTasks,
  TaskAssignmentSplitScreen
} from '@/components/standup/shared/TaskAssignmentSplitScreen'
import { taskIdFromDraggableId } from '@/components/standup/shared/TaskCard'

const tasks: AssignableTaskView[] = [
  {
    id: 't1',
    displayId: 'KAN-1',
    title: 'Wire the webhook',
    priority: 'low',
    estimateMinutes: 480,
    skills: ['backend']
  },
  {
    id: 't2',
    displayId: 'KAN-2',
    title: 'Fix the login redirect',
    priority: 'critical',
    estimateMinutes: 60,
    skills: ['frontend']
  },
  {
    id: 't3',
    displayId: 'KAN-3',
    title: 'Polish the empty state',
    priority: 'medium',
    estimateMinutes: 120
  }
]

const members: AssignableMemberView[] = [
  {
    id: 'kasun',
    name: 'Kasun Perera',
    role: 'developer',
    assignedMinutes: 480,
    capacityMinutes: 2400,
    tasks: []
  },
  { id: 'nimal', name: 'Nimal Silva', tasks: [] }
]

function renderScreen(overrides: Partial<React.ComponentProps<typeof TaskAssignmentSplitScreen>> = {}) {
  const onAssign = jest.fn().mockResolvedValue(undefined)
  render(
    <TaskAssignmentSplitScreen
      sprintLabel="Sprint 12"
      tasks={tasks}
      members={members}
      onAssign={onAssign}
      {...overrides}
    />
  )
  return onAssign
}

const visibleTitles = () =>
  screen.getAllByTestId('task-card').map((card) => card.textContent ?? '')

describe('resolveMemberDrop', () => {
  it('assigns to the member card the task landed on', () => {
    expect(resolveMemberDrop('task-t1', 'member-kasun', null)).toEqual({
      taskId: 't1',
      memberId: 'kasun'
    })
  })

  it('clears the assignment when dropped back on the repository', () => {
    expect(resolveMemberDrop('task-t1', POOL_DROPPABLE_ID, 'kasun')).toEqual({
      taskId: 't1',
      memberId: null
    })
  })

  it('reassigns from one member to another', () => {
    expect(resolveMemberDrop('task-t1', 'member-nimal', 'kasun')).toEqual({
      taskId: 't1',
      memberId: 'nimal'
    })
  })

  it('does nothing when the task is dropped back on its current owner', () => {
    expect(resolveMemberDrop('task-t1', 'member-kasun', 'kasun')).toBeNull()
  })

  it('does nothing when an unassigned task is dropped back on the repository', () => {
    expect(resolveMemberDrop('task-t1', POOL_DROPPABLE_ID, null)).toBeNull()
  })

  it('does nothing when the drop landed outside any target', () => {
    expect(resolveMemberDrop('task-t1', null, 'kasun')).toBeNull()
  })

  it('treats a drop on something that is not one of our targets as a cancel', () => {
    // Not an unassign: a cancelled drag must not silently strip an owner.
    expect(resolveMemberDrop('task-t1', 'some-other-droppable', 'kasun')).toBeNull()
  })
})

describe('filterAssignableTasks / sortAssignableTasks', () => {
  it('matches the search against key and title, case-insensitively', () => {
    expect(filterAssignableTasks(tasks, { search: 'kan-2' }).map((t) => t.id)).toEqual(['t2'])
    expect(filterAssignableTasks(tasks, { search: 'LOGIN' }).map((t) => t.id)).toEqual(['t2'])
  })

  it('drops tasks with no priority when a priority filter is on', () => {
    const unprioritised: AssignableTaskView = { id: 't9', title: 'No priority' }
    expect(
      filterAssignableTasks([...tasks, unprioritised], { priorities: ['low'] }).map((t) => t.id)
    ).toEqual(['t1'])
  })

  it('keeps only tasks carrying the requested skill', () => {
    expect(filterAssignableTasks(tasks, { skills: ['frontend'] }).map((t) => t.id)).toEqual(['t2'])
  })

  it('is conjunctive across criteria', () => {
    expect(
      filterAssignableTasks(tasks, { search: 'the', priorities: ['critical'] }).map((t) => t.id)
    ).toEqual(['t2'])
  })

  it('sorts by urgency first', () => {
    expect(sortAssignableTasks(tasks, 'priority').map((t) => t.id)).toEqual(['t2', 't3', 't1'])
  })

  it('sorts by estimate in both directions, sinking unestimated tasks', () => {
    const unestimated: AssignableTaskView = { id: 't9', title: 'Unknown size' }
    expect(sortAssignableTasks([...tasks, unestimated], 'estimate_asc').map((t) => t.id)).toEqual([
      't2',
      't3',
      't1',
      't9'
    ])
    expect(sortAssignableTasks(tasks, 'estimate_desc').map((t) => t.id)).toEqual([
      't1',
      't3',
      't2'
    ])
  })

  it('leaves the caller’s array undisturbed', () => {
    const order = tasks.map((t) => t.id)
    sortAssignableTasks(tasks, 'estimate_desc')
    expect(tasks.map((t) => t.id)).toEqual(order)
  })
})

describe('TaskAssignmentSplitScreen — the left panel', () => {
  it('states the sprint once, in the header, rather than on every card', () => {
    renderScreen()

    expect(screen.getAllByText('Sprint 12')).toHaveLength(1)
  })

  it('narrows the list as the PM searches', () => {
    renderScreen()
    expect(screen.getAllByTestId('task-card')).toHaveLength(3)

    fireEvent.change(screen.getByLabelText('Search tasks'), { target: { value: 'login' } })

    const visible = visibleTitles()
    expect(visible).toHaveLength(1)
    expect(visible[0]).toContain('Fix the login redirect')
  })

  it('narrows the list by priority', () => {
    renderScreen()

    fireEvent.change(screen.getByLabelText('Priority'), { target: { value: 'critical' } })

    expect(visibleTitles()).toHaveLength(1)
    expect(visibleTitles()[0]).toContain('KAN-2')
  })

  it('narrows the list by skill, and only offers skills the tasks actually carry', () => {
    renderScreen()

    fireEvent.change(screen.getByLabelText('Skill'), { target: { value: 'backend' } })

    expect(visibleTitles()).toHaveLength(1)
    expect(visibleTitles()[0]).toContain('KAN-1')
  })

  it('hides the skill filter entirely when no task has a skill', () => {
    // The planning context: `AssignableTaskView.skills` has no source there,
    // and an always-empty dropdown is a dead control.
    renderScreen({ tasks: [{ id: 't1', title: 'Plain task' }] })

    expect(screen.queryByLabelText('Skill')).not.toBeInTheDocument()
  })

  it('reorders the list when the sort changes', () => {
    renderScreen()
    expect(visibleTitles()[0]).toContain('KAN-2')

    fireEvent.change(screen.getByLabelText('Sort'), { target: { value: 'estimate_desc' } })

    expect(visibleTitles()[0]).toContain('KAN-1')
  })

  it('distinguishes a filtered-empty list from an empty one', () => {
    renderScreen()

    fireEvent.change(screen.getByLabelText('Search tasks'), { target: { value: 'zzz' } })
    expect(screen.getByText('No task matches these filters.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(screen.getAllByTestId('task-card')).toHaveLength(3)
  })

  it('shows the caller’s own empty message when the repository is genuinely empty', () => {
    renderScreen({ tasks: [], emptyPoolMessage: 'Nothing left to plan.' })

    expect(screen.getByText('Nothing left to plan.')).toBeInTheDocument()
  })
})

describe('TaskAssignmentSplitScreen — assignment', () => {
  it('assigns through the per-card picker, exactly as a drop would', async () => {
    const onAssign = renderScreen()

    fireEvent.change(screen.getByLabelText('Assign Fix the login redirect to'), {
      target: { value: 'kasun' }
    })

    await waitFor(() => expect(onAssign).toHaveBeenCalledWith('t2', 'kasun'))
    expect(onAssign).toHaveBeenCalledTimes(1)
  })

  it('clears an assignment through the same control', async () => {
    const onAssign = renderScreen({
      tasks: [{ ...tasks[0], assigneeId: 'kasun' }]
    })

    fireEvent.change(screen.getByLabelText('Assign Wire the webhook to'), {
      target: { value: '' }
    })

    await waitFor(() => expect(onAssign).toHaveBeenCalledWith('t1', null))
  })

  it('does not fire when the picker is set to the owner the task already had', () => {
    const onAssign = renderScreen({
      tasks: [{ ...tasks[0], assigneeId: 'kasun' }]
    })

    fireEvent.change(screen.getByLabelText('Assign Wire the webhook to'), {
      target: { value: 'kasun' }
    })

    expect(onAssign).not.toHaveBeenCalled()
  })
})

describe('TaskAssignmentSplitScreen — the right panel', () => {
  it('renders one drop target per member', () => {
    renderScreen()

    expect(screen.getAllByTestId('member-card')).toHaveLength(2)
    expect(
      screen.getAllByTestId('member-card')[0].querySelector('[data-testid="member-name"]')
    ).toHaveTextContent('Kasun Perera')
  })

  it('expands a member card on demand and shows the work they already hold', () => {
    renderScreen({
      members: [{ ...members[0], tasks: [tasks[1]] }]
    })

    const toggle = screen.getByRole('button', { name: "Expand Kasun Perera's details" })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(toggle)

    expect(
      screen.getByRole('button', { name: "Collapse Kasun Perera's details" })
    ).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Assigned work')).toBeInTheDocument()
    expect(screen.getByText('Daily workload')).toBeInTheDocument()
    // No skills sub-section: member skills have no data source.
    expect(screen.queryByText('Skills')).not.toBeInTheDocument()
  })

  it('never registers the same dnd-kit id twice when a task shows in both panels', () => {
    // The left panel is not filtered by assignee, so an assigned task is in
    // both places at once. dnd-kit's registry is keyed by id and `disabled`
    // does not unregister a node, so a shared id would let the read-only copy
    // overwrite the real card's node ref and corrupt its drag rect.
    renderScreen({
      tasks: [{ ...tasks[1], assigneeId: 'kasun' }],
      members: [{ ...members[0], tasks: [{ ...tasks[1], assigneeId: 'kasun' }] }]
    })

    fireEvent.click(screen.getByRole('button', { name: "Expand Kasun Perera's details" }))

    const ids = screen
      .getAllByTestId('task-card')
      .map((card) => card.getAttribute('data-drag-id'))

    expect(ids).toHaveLength(2)
    expect(new Set(ids).size).toBe(2)
    expect(ids).toContain('task-t2')
    // And the read-only copy's id can never be parsed back into a task, so no
    // drop can resolve through it.
    const readOnlyId = ids.find((id) => id !== 'task-t2')!
    expect(taskIdFromDraggableId(readOnlyId)).toBeNull()
  })

  it('renders the caller’s injected content at the end of the expanded card', () => {
    renderScreen({
      renderMemberExpanded: (member) => <p>Extra for {member.name}</p>
    })

    fireEvent.click(screen.getByRole('button', { name: "Expand Nimal Silva's details" }))

    expect(screen.getByText('Extra for Nimal Silva')).toBeInTheDocument()
  })
})
