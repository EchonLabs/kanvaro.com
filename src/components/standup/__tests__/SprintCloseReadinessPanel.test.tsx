/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent } from '@testing-library/react'
import { SprintCloseReadinessPanel } from '../run/SprintCloseReadinessPanel'
import { minutes } from '@/lib/standup/minutes'

const task = {
  taskId: 't1',
  taskKey: 'KAN-1',
  ownerName: 'Amal',
  remainingEstimateMinutes: minutes(120),
  hoursAvailableTodayMinutes: minutes(60),
  projectedOutcome: 'at_risk' as const,
  disposition: undefined
}

describe('SprintCloseReadinessPanel', () => {
  it('renders one row per open task with its projected outcome', () => {
    render(
      <SprintCloseReadinessPanel
        openTasks={[task]}
        carryForwardOffenders={[]}
        onSetDisposition={jest.fn()}
        disabled={false}
      />
    )
    expect(screen.getByText('KAN-1')).toBeInTheDocument()
    expect(screen.getByText(/at risk/i)).toBeInTheDocument()
    expect(screen.getByText('Amal')).toBeInTheDocument()
    expect(screen.getByText(/1\.0h/)).toBeInTheDocument()
  })

  it('renders no owner name when the task has none', () => {
    render(
      <SprintCloseReadinessPanel
        openTasks={[{ ...task, ownerName: undefined }]}
        carryForwardOffenders={[]}
        onSetDisposition={jest.fn()}
        disabled={false}
      />
    )
    expect(screen.getByText('KAN-1')).toBeInTheDocument()
  })

  it('calls onSetDisposition with the chosen type when a disposition is picked', () => {
    const onSetDisposition = jest.fn()
    render(
      <SprintCloseReadinessPanel
        openTasks={[task]}
        carryForwardOffenders={[]}
        onSetDisposition={onSetDisposition}
        disabled={false}
      />
    )
    fireEvent.change(screen.getByLabelText(/disposition for KAN-1/i), {
      target: { value: 'descope' }
    })
    expect(onSetDisposition).toHaveBeenCalledWith('t1', 'descope')
  })

  it('lists an offending carry-forward item by its task key', () => {
    render(
      <SprintCloseReadinessPanel
        openTasks={[]}
        carryForwardOffenders={[{ itemId: 'c1', taskKey: 'KAN-2', status: 'open', hasResolution: false }]}
        onSetDisposition={jest.fn()}
        disabled={false}
      />
    )
    expect(screen.getByText('KAN-2')).toBeInTheDocument()
  })

  // Regression: a blocker has no task key, and the banner printed its raw
  // database id instead.
  it('names a carry-forward item with no task key by its label, never its id', () => {
    render(
      <SprintCloseReadinessPanel
        openTasks={[]}
        carryForwardOffenders={[
          { itemId: '6af2a4878a5c490b3bb93cfc', label: 'Open blocker', status: 'open', hasResolution: false }
        ]}
        onSetDisposition={jest.fn()}
        disabled={false}
      />
    )
    expect(screen.getByText('Open blocker')).toBeInTheDocument()
    expect(screen.queryByText('6af2a4878a5c490b3bb93cfc')).not.toBeInTheDocument()
  })

  it('falls back to a generic name, not the id, when a row carries no label', () => {
    render(
      <SprintCloseReadinessPanel
        openTasks={[]}
        carryForwardOffenders={[{ itemId: 'c9', status: 'open', hasResolution: false }]}
        onSetDisposition={jest.fn()}
        disabled={false}
      />
    )
    expect(screen.getByText('Carried forward')).toBeInTheDocument()
    expect(screen.queryByText('c9')).not.toBeInTheDocument()
  })

  it('disables every select when disabled is true', () => {
    render(
      <SprintCloseReadinessPanel
        openTasks={[task]}
        carryForwardOffenders={[]}
        onSetDisposition={jest.fn()}
        disabled
      />
    )
    expect(screen.getByLabelText(/disposition for KAN-1/i)).toBeDisabled()
  })
})
