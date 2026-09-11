/**
 * @jest-environment jsdom
 */
import { fireEvent, render, screen } from '@testing-library/react'
import { BlockersSection } from '../BlockersSection'
import { minutes } from '@/lib/standup/minutes'
import type { BlockerPanelRow } from '@/lib/standup/blocker-service'
import type { BoardAllocationView } from '@/components/standup/run/CapacityBoard'

function blocker(overrides: Partial<BlockerPanelRow> = {}): BlockerPanelRow {
  return {
    blockerId: 'b1',
    taskKey: 'KAN-1',
    description: 'Waiting on vendor',
    blockerType: 'external_party',
    severity: 'high',
    status: 'open',
    raisedById: 'u1',
    overdue: false,
    blockerLabel: 'BLK-000001',
    ...overrides
  }
}

describe('BlockersSection', () => {
  it('shows only blockers raised by this member', () => {
    render(
      <BlockersSection
        memberId="u1"
        blockers={[blocker(), blocker({ blockerId: 'b2', raisedById: 'u2', taskKey: 'KAN-2', description: 'Someone else’s blocker' })]}
        allocations={[]}
        onRaise={jest.fn()}
      />
    )
    expect(screen.getByText('Waiting on vendor')).toBeInTheDocument()
    expect(screen.queryByText('Someone else’s blocker')).not.toBeInTheDocument()
  })

  it('sorts an overdue blocker first', () => {
    render(
      <BlockersSection
        memberId="u1"
        blockers={[
          blocker({ blockerId: 'b1', description: 'Normal one', overdue: false }),
          blocker({ blockerId: 'b2', description: 'Overdue one', overdue: true })
        ]}
        allocations={[]}
        onRaise={jest.fn()}
      />
    )
    const descriptions = screen.getAllByText(/one$/)
    expect(descriptions[0]).toHaveTextContent('Overdue one')
  })

  it('opens the raise-blocker modal and forwards its submit', () => {
    const onRaise = jest.fn()
    const allocation: BoardAllocationView = {
      allocationId: 'a1',
      taskId: 't1',
      taskKey: 'KAN-1',
      title: 'Fix the thing',
      plannedMinutes: minutes(60),
      remainingEstimateMinutes: minutes(60),
      source: 'assigned_in_standup',
      isBlocked: false,
      excludedFromCapacity: false,
      pairedDeliberately: false
    }
    render(<BlockersSection memberId="u1" blockers={[]} allocations={[allocation]} onRaise={onRaise} />)

    fireEvent.click(screen.getByRole('button', { name: /report a blocker/i }))
    fireEvent.change(screen.getByLabelText(/description/i), { target: { value: 'Blocked on something real' } })
    fireEvent.click(screen.getByRole('button', { name: /^raise a blocker$/i }))

    expect(onRaise).toHaveBeenCalledWith(expect.objectContaining({ description: 'Blocked on something real' }))
  })

  it('says nothing is blocked when there are none', () => {
    render(<BlockersSection memberId="u1" blockers={[]} allocations={[]} onRaise={jest.fn()} />)
    expect(screen.getByText(/no open blockers/i)).toBeInTheDocument()
  })

  it('renders its own failure state without throwing when blockers is undefined', () => {
    render(<BlockersSection memberId="u1" blockers={undefined} allocations={[]} onRaise={jest.fn()} />)
    expect(screen.getByText(/could not load this section/i)).toBeInTheDocument()
  })
})
