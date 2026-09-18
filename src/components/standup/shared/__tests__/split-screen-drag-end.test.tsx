/**
 * @jest-environment jsdom
 */
/**
 * The drag-end *glue*, as opposed to the pure resolver.
 *
 * `resolveMemberDrop` is tested on its own in
 * `task-assignment-split-screen.test.tsx`, but the code that feeds it — the
 * `tasks.find(...)` lookup for the current assignee, the `typeof overId ===
 * 'string'` narrowing, and the hand-off to the awaited `onAssign` — was not
 * covered by anything. A drop that passed the wrong task, the wrong target or
 * a stale assignee into the resolver would ship green.
 *
 * jsdom cannot honestly simulate dnd-kit's pointer mechanics, so instead of
 * faking a drag this substitutes `DndContext` with a component that captures
 * its `onDragEnd` prop and hands it back. The handler under test is then
 * called with exactly the event shape dnd-kit would hand it. Every other
 * dnd-kit export is the real one.
 */
import { act, render, screen } from '@testing-library/react'
import type { DragEndEvent } from '@dnd-kit/core'

let capturedOnDragEnd: ((event: DragEndEvent) => void) | undefined

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

import type {
  AssignableMemberView,
  AssignableTaskView
} from '@/components/standup/shared/AssignableTask'
import {
  POOL_DROPPABLE_ID,
  TaskAssignmentSplitScreen
} from '@/components/standup/shared/TaskAssignmentSplitScreen'

const members: AssignableMemberView[] = [
  { id: 'kasun', name: 'Kasun Perera', tasks: [] },
  { id: 'nimal', name: 'Nimal Silva', tasks: [] }
]

function renderScreen(tasks: AssignableTaskView[]) {
  const onAssign = jest.fn().mockResolvedValue(undefined)
  render(
    <TaskAssignmentSplitScreen tasks={tasks} members={members} onAssign={onAssign} />
  )
  if (!capturedOnDragEnd) throw new Error('DndContext was rendered without onDragEnd')
  return { onAssign, dragEnd: capturedOnDragEnd }
}

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

describe('TaskAssignmentSplitScreen — handleDragEnd', () => {
  it('reaches onAssign with the dropped task and the member it landed on', async () => {
    const { onAssign, dragEnd } = renderScreen([{ id: 't1', title: 'Wire the webhook' }])

    await act(async () => {
      dragEnd(dropEvent('task-t1', 'member-nimal'))
    })

    expect(onAssign).toHaveBeenCalledTimes(1)
    expect(onAssign).toHaveBeenCalledWith('t1', 'nimal')
  })

  it('clears the assignment when the card is dropped back on the repository', async () => {
    const { onAssign, dragEnd } = renderScreen([
      { id: 't1', title: 'Wire the webhook', assigneeId: 'kasun' }
    ])

    await act(async () => {
      dragEnd(dropEvent('task-t1', POOL_DROPPABLE_ID))
    })

    expect(onAssign).toHaveBeenCalledWith('t1', null)
  })

  it('reads the current assignee off the dropped task, not off some other one', async () => {
    // The lookup is the part worth pinning: with the wrong task, a drop onto
    // the owner a *different* task has would fire instead of being a no-op.
    const { onAssign, dragEnd } = renderScreen([
      { id: 't1', title: 'First', assigneeId: 'nimal' },
      { id: 't2', title: 'Second', assigneeId: 'kasun' }
    ])

    await act(async () => {
      dragEnd(dropEvent('task-t2', 'member-kasun'))
    })
    expect(onAssign).not.toHaveBeenCalled()

    await act(async () => {
      dragEnd(dropEvent('task-t2', 'member-nimal'))
    })
    expect(onAssign).toHaveBeenCalledTimes(1)
    expect(onAssign).toHaveBeenCalledWith('t2', 'nimal')
  })

  it('does nothing when the drag ended outside any drop target', async () => {
    const { onAssign, dragEnd } = renderScreen([
      { id: 't1', title: 'Wire the webhook', assigneeId: 'kasun' }
    ])

    await act(async () => {
      dragEnd(dropEvent('task-t1', null))
    })

    expect(onAssign).not.toHaveBeenCalled()
  })

  it('ignores a drop whose active id is not one of our task cards', async () => {
    const { onAssign, dragEnd } = renderScreen([{ id: 't1', title: 'Wire the webhook' }])

    await act(async () => {
      dragEnd(dropEvent('readonly-kasun-t1', 'member-nimal'))
    })

    expect(onAssign).not.toHaveBeenCalled()
  })

  it('locks the surface while the assignment is in flight', async () => {
    let release: (() => void) | undefined
    const onAssign = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          release = resolve
        })
    )
    render(
      <TaskAssignmentSplitScreen
        tasks={[{ id: 't1', title: 'Wire the webhook' }]}
        members={members}
        onAssign={onAssign}
      />
    )
    const dragEnd = capturedOnDragEnd!

    await act(async () => {
      dragEnd(dropEvent('task-t1', 'member-kasun'))
    })

    expect(screen.getByLabelText('Assign Wire the webhook to')).toBeDisabled()

    await act(async () => {
      release!()
    })

    expect(screen.getByLabelText('Assign Wire the webhook to')).not.toBeDisabled()
  })
})
