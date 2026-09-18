/**
 * @jest-environment jsdom
 */
/**
 * The planning assignment board (PC-8).
 *
 * Two things matter here and neither is the drag animation.
 *
 * The first is that the keyboard path and the drag path produce the *same*
 * assignment. This screen is a hard gate on starting a sprint, and HTML
 * drag-and-drop has no keyboard equivalent — a board that can only be dragged
 * on is a gate part of the team cannot pass. `resolveAssignmentDrop` is the
 * drag half, tested purely, because dnd-kit's pointer mechanics are not
 * something jsdom can honestly simulate.
 *
 * The second is that a no-op drop stays a no-op: dropping a task back on the
 * lane it came from must not fire a request, or the assignee is emailed that
 * they have been assigned work they already had.
 */
import { fireEvent, render, screen } from '@testing-library/react'

import {
  AssignmentBoard,
  resolveAssignmentDrop
} from '@/components/standup/planning/AssignmentBoard'
import type { AssignableMember, ScopeTask } from '@/components/standup/planning/types'

const task = (id: string, assigneeId?: string): ScopeTask => ({
  _id: id,
  displayId: `KAN-${id}`,
  title: `Task ${id}`,
  ...(assigneeId ? { assignedTo: [{ user: { _id: assigneeId, firstName: 'X' } }] } : {})
})

const members: AssignableMember[] = [
  {
    memberId: 'kasun',
    name: 'Kasun',
    onSprintTeam: true,
    assignedMinutes: 480,
    capacityMinutes: 2400
  },
  { memberId: 'nimal', name: 'Nimal QA', onSprintTeam: false, role: 'project_qa_lead' }
]

function renderBoard(tasks: ScopeTask[], roster: AssignableMember[] = members) {
  const onAssign = jest.fn().mockResolvedValue(undefined)
  render(<AssignmentBoard tasks={tasks} members={roster} busy={false} onAssign={onAssign} />)
  return onAssign
}

describe('resolveAssignmentDrop', () => {
  it('assigns to the lane the task landed on', () => {
    expect(resolveAssignmentDrop('kasun', null)).toEqual({ assigneeId: 'kasun' })
  })

  it('clears the assignment on the unassigned lane', () => {
    expect(resolveAssignmentDrop('unassigned', 'kasun')).toEqual({ assigneeId: null })
  })

  it('reassigns from one member to another', () => {
    expect(resolveAssignmentDrop('nimal', 'kasun')).toEqual({ assigneeId: 'nimal' })
  })

  it('does nothing when the task is dropped back where it started', () => {
    expect(resolveAssignmentDrop('kasun', 'kasun')).toBeNull()
  })

  it('does nothing when an unassigned task is dropped on the unassigned lane', () => {
    expect(resolveAssignmentDrop('unassigned', null)).toBeNull()
  })
})

describe('AssignmentBoard — the keyboard path', () => {
  it('assigns through the per-task picker, exactly as a drop would', () => {
    const onAssign = renderBoard([task('1')])

    fireEvent.change(screen.getByLabelText('Assign Task 1 to'), {
      target: { value: 'kasun' }
    })

    expect(onAssign).toHaveBeenCalledTimes(1)
    expect(onAssign).toHaveBeenCalledWith(
      '1',
      'kasun',
      expect.objectContaining({ memberId: 'kasun' })
    )
  })

  it('passes the member through so a QA off the sprint team can be admitted', () => {
    // The third argument is what makes the workspace send `addToSprintTeam`:
    // an assignee missing from `Sprint.teamMembers` would have their minutes
    // vanish from every capacity figure on the planning screen.
    const onAssign = renderBoard([task('1')])

    fireEvent.change(screen.getByLabelText('Assign Task 1 to'), {
      target: { value: 'nimal' }
    })

    expect(onAssign).toHaveBeenCalledWith(
      '1',
      'nimal',
      expect.objectContaining({ memberId: 'nimal', onSprintTeam: false })
    )
  })

  it('unassigns through the same control', () => {
    const onAssign = renderBoard([task('1', 'kasun')])

    fireEvent.change(screen.getByLabelText('Assign Task 1 to'), { target: { value: '' } })

    expect(onAssign).toHaveBeenCalledWith('1', null, undefined)
  })

  it('offers a QA who is off the sprint team under a group that says they will join it', () => {
    // Assigning to them changes the roster. The picker has to say so before
    // the choice, not leave the PM to discover it from a toast afterwards.
    renderBoard([task('1')])

    const picker = screen.getByLabelText('Assign Task 1 to')
    const group = picker.querySelector('optgroup')

    expect(group).toHaveAttribute('label', 'QA — will be added to the sprint team')
    expect(group).toHaveTextContent('Nimal QA')
    // The sprint team itself is offered plainly, not inside that group.
    expect(picker.querySelector('option[value="kasun"]')?.closest('optgroup')).toBeNull()
  })

  it('does not offer somebody off the sprint team who is not QA', () => {
    // Only QA are admitted by an assignment; offering anyone else would
    // promise a roster change the workspace does not make.
    renderBoard([task('1')], [
      ...members,
      { memberId: 'stranger', name: 'Stranger', onSprintTeam: false, role: 'project_member' }
    ])

    expect(screen.queryByRole('option', { name: 'Stranger' })).not.toBeInTheDocument()
  })

  it('does not fire when the picker is set to the assignee it already had', () => {
    const onAssign = renderBoard([task('1', 'kasun')])

    fireEvent.change(screen.getByLabelText('Assign Task 1 to'), {
      target: { value: 'kasun' }
    })

    expect(onAssign).not.toHaveBeenCalled()
  })
})

describe('AssignmentBoard — what is left to do', () => {
  it('counts the tasks still needing an owner', () => {
    renderBoard([task('1'), task('2'), task('3', 'kasun')])

    expect(screen.getByText('2 tasks still need an assignee')).toBeInTheDocument()
  })

  it('uses the singular for one', () => {
    renderBoard([task('1'), task('2', 'kasun')])

    expect(screen.getByText('1 task still needs an assignee')).toBeInTheDocument()
  })

  it('says so once PC-8 would pass', () => {
    renderBoard([task('1', 'kasun')])

    expect(screen.getByText('Every task has an owner.')).toBeInTheDocument()
  })

  it('parks a task assigned to somebody off the board in Unassigned', () => {
    // PC-8 blocks on this too, and hiding the task in a lane nobody can see
    // would leave the PM with a blocking check and no row to fix it on.
    renderBoard([task('1', 'stranger')])

    expect(screen.getByText('1 task still needs an assignee')).toBeInTheDocument()
  })
})
