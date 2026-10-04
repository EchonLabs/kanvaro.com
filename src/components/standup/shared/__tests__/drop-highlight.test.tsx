/**
 * @jest-environment jsdom
 */
/**
 * The drop highlight is the planning board's ring-on-hover. It is drawn with a
 * ring (outside the box) so nothing reflows as a card passes over, and a
 * transparent ring rests in the base state. These pin both halves; the
 * repository's hover state comes from `useDroppable`, so it is forced.
 */
import { DndContext } from '@dnd-kit/core'
import { render, screen } from '@testing-library/react'

import { ExpandableMemberCard } from '@/components/standup/shared/ExpandableMemberCard'
import { TaskAssignmentSplitScreen } from '@/components/standup/shared/TaskAssignmentSplitScreen'

let forcedOver = false
jest.mock('@dnd-kit/core', () => {
  const actual = jest.requireActual('@dnd-kit/core')
  return {
    ...actual,
    useDroppable: (args: Parameters<typeof actual.useDroppable>[0]) => {
      const real = actual.useDroppable(args)
      return { ...real, isOver: forcedOver }
    }
  }
})

const RING = 'ring-[var(--plan-accent)]'
// Closing bracket included: `--plan-accent-ink` also contains `--plan-accent`.
const HINT_BORDER = 'border-[var(--plan-accent)]'
const HINT_INK = 'text-[var(--plan-accent-ink)]'

function renderMember() {
  render(
    <DndContext>
      <ExpandableMemberCard
        member={{ id: 'kasun', name: 'Kasun Perera', tasks: [] }}
        expanded={false}
        onToggle={() => {}}
      />
    </DndContext>
  )
  return screen.getByTestId('member-card')
}

function renderRepository() {
  render(
    <TaskAssignmentSplitScreen
      tasks={[{ id: 't1', title: 'Wire the webhook' }]}
      members={[{ id: 'kasun', name: 'Kasun Perera', tasks: [] }]}
      onAssign={jest.fn().mockResolvedValue(undefined)}
    />
  )
  return screen.getByLabelText('Task repository')
}

beforeEach(() => {
  forcedOver = false
})

describe('ExpandableMemberCard drop highlight', () => {
  it('has no accent ring and a quiet hint at rest', () => {
    const card = renderMember()
    expect(card.className).not.toContain(RING)
    expect(card.className).toContain('ring-transparent')
    const hint = screen.getByText('Drop a task here')
    expect(hint.className).not.toContain(HINT_BORDER)
    expect(hint.className).not.toContain(HINT_INK)
    expect(hint.className).toContain('text-[var(--plan-muted)]')
  })

  it('draws the accent ring when useDroppable reports a hover', () => {
    forcedOver = true
    const card = renderMember()
    expect(card.className).toContain(RING)
  })

  it('lights the inner drop hint in accent border and accent ink when hovered', () => {
    forcedOver = true
    renderMember()
    const hint = screen.getByText('Drop a task here')
    expect(hint.className).toContain(HINT_BORDER)
    expect(hint.className).toContain(HINT_INK)
    expect(hint.className).not.toContain('text-[var(--plan-muted)]')
  })
})

describe('Task repository drop highlight', () => {
  it('has no accent ring when nothing is over it', () => {
    expect(renderRepository().className).not.toContain(RING)
  })

  it('draws the accent ring when a card is over it', () => {
    forcedOver = true
    expect(renderRepository().className).toContain(RING)
  })
})
