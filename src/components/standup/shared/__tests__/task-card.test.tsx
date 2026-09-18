/**
 * @jest-environment jsdom
 */
/**
 * `TaskCard` renders one canonical task for both contexts, and the two
 * contexts do not carry the same fields: a planning-screen task has no
 * priority and no skills. What matters here is that the absent fields are
 * *absent* rather than rendered empty — a blank priority pill or a stray "0.0h"
 * would read as data, and a PM scanning the repository would act on it.
 */
import { DndContext } from '@dnd-kit/core'
import { render, screen } from '@testing-library/react'

import { TaskCard } from '@/components/standup/shared/TaskCard'
import type { AssignableTaskView } from '@/components/standup/shared/AssignableTask'

function renderCard(task: AssignableTaskView, props: Record<string, unknown> = {}) {
  return render(
    <DndContext>
      <TaskCard task={task} {...props} />
    </DndContext>
  )
}

const bare: AssignableTaskView = { id: 't1', title: 'Wire the webhook' }

describe('TaskCard — what the canonical shape guarantees', () => {
  it('renders the title', () => {
    renderCard(bare)

    expect(screen.getByText('Wire the webhook')).toBeInTheDocument()
  })

  it('renders the display id beside the title when there is one', () => {
    renderCard({ ...bare, displayId: 'KAN-12' })

    expect(screen.getByText('KAN-12')).toBeInTheDocument()
  })

  it('omits the display id when the task has none', () => {
    renderCard(bare)

    expect(screen.queryByText(/KAN-/)).not.toBeInTheDocument()
  })
})

describe('TaskCard — the optional fields', () => {
  it('renders a priority badge when priority is present', () => {
    renderCard({ ...bare, priority: 'critical' })

    expect(screen.getByTestId('task-priority')).toHaveTextContent('critical')
  })

  it('omits the priority badge entirely for a planning-context task', () => {
    renderCard(bare)

    expect(screen.queryByTestId('task-priority')).not.toBeInTheDocument()
  })

  it('formats the estimate as hours', () => {
    renderCard({ ...bare, estimateMinutes: 150 })

    expect(screen.getByTestId('task-estimate')).toHaveTextContent('2.5h')
  })

  it('omits the estimate when the task is unestimated', () => {
    renderCard(bare)

    expect(screen.queryByTestId('task-estimate')).not.toBeInTheDocument()
  })

  it('renders a zero estimate rather than hiding it — 0.0h is a real answer', () => {
    renderCard({ ...bare, estimateMinutes: 0 })

    expect(screen.getByTestId('task-estimate')).toHaveTextContent('0.0h')
  })

  it('renders each skill as its own chip', () => {
    renderCard({ ...bare, skills: ['backend', 'infra'] })

    const chips = screen.getByTestId('task-skills')
    expect(chips).toHaveTextContent('backend')
    expect(chips).toHaveTextContent('infra')
  })

  it('omits the skills list when there are none', () => {
    renderCard(bare)

    expect(screen.queryByTestId('task-skills')).not.toBeInTheDocument()
  })

  it('omits the skills list for an empty array, not just an absent one', () => {
    renderCard({ ...bare, skills: [] })

    expect(screen.queryByTestId('task-skills')).not.toBeInTheDocument()
  })
})

describe('TaskCard — the keyboard path', () => {
  it('shows no picker when the caller supplied no options', () => {
    renderCard(bare)

    expect(screen.queryByLabelText('Assign Wire the webhook to')).not.toBeInTheDocument()
  })

  it('offers every member plus Unassigned when options are supplied', () => {
    renderCard(bare, {
      onAssignVia: jest.fn(),
      assignOptions: [{ id: 'kasun', name: 'Kasun' }]
    })

    const picker = screen.getByLabelText('Assign Wire the webhook to')
    expect(picker).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Unassigned' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Kasun' })).toBeInTheDocument()
  })
})
