/**
 * @jest-environment jsdom
 */
/**
 * A task row's Fix leads to the edit form, its key to the task itself.
 *
 * Fix used to open the task page in a new tab: the edit made there had no way
 * back to planning, and saving landed on /tasks. The workspace now routes Fix
 * through `onFixTask`, which carries the planning screen as `returnTo`.
 */
import { fireEvent, render, screen } from '@testing-library/react'

import { PlanningChecklist } from '@/components/standup/PlanningChecklist'

const oversized = {
  id: 'task-1',
  key: 'KAN-12',
  title: 'Rebuild the export pipeline',
  originalEstimateMinutes: 13 * 60,
  hasDescription: true
}

function mount(props: Partial<React.ComponentProps<typeof PlanningChecklist>> = {}) {
  const handlers = {
    onOpenTask: jest.fn(),
    onFixTask: jest.fn(),
    onEstimateTask: jest.fn().mockResolvedValue(undefined),
    onAcknowledge: jest.fn()
  }
  render(
    <PlanningChecklist
      items={[
        {
          checkId: 'PA-3',
          kind: 'advisory',
          passed: false,
          message: '1 task is larger than a day',
          offendingIds: ['task-1']
        }
      ]}
      offendingTasks={[oversized]}
      offendingMembers={[]}
      acknowledged={[]}
      {...handlers}
      {...props}
    />
  )
  return handlers
}

describe('PlanningChecklist — task Fix', () => {
  it('sends Fix to the edit handler', () => {
    const { onFixTask, onOpenTask } = mount()

    fireEvent.click(screen.getByRole('button', { name: 'Fix' }))

    expect(onFixTask).toHaveBeenCalledWith('task-1')
    expect(onOpenTask).not.toHaveBeenCalled()
  })

  it('still opens the task from its key', () => {
    const { onFixTask, onOpenTask } = mount()

    fireEvent.click(screen.getByRole('button', { name: 'KAN-12' }))

    expect(onOpenTask).toHaveBeenCalledWith('task-1')
    expect(onFixTask).not.toHaveBeenCalled()
  })

  it('counts acknowledged advisories in the group heading', () => {
    mount({ acknowledged: ['PA-3'] })

    expect(screen.getByText('Advisory · 1 · 1 acknowledged')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Acknowledged/ }).getAttribute('aria-pressed')).toBe('true')
  })

  it('falls back to opening the task when no edit handler is given', () => {
    const { onOpenTask } = mount({ onFixTask: undefined })

    fireEvent.click(screen.getByRole('button', { name: 'Fix' }))

    expect(onOpenTask).toHaveBeenCalledWith('task-1')
  })
})
