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
