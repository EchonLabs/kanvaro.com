/**
 * @jest-environment jsdom
 */
import { fireEvent, render, screen } from '@testing-library/react'
import { BlockersSection } from '../BlockersSection'
import type { BlockerPanelRow } from '@/lib/standup/blocker-service'

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
        onRaise={jest.fn()}
      />
    )
    const descriptions = screen.getAllByText(/one$/)
    expect(descriptions[0]).toHaveTextContent('Overdue one')
  })

  it('files a roadblock from the inline form, as a medium general blocker by default', () => {
    const onRaise = jest.fn()
    render(<BlockersSection memberId="u1" blockers={[]} onRaise={onRaise} />)

    const submit = screen.getByRole('button', { name: /file roadblock/i })
    expect(submit).toBeDisabled()

    fireEvent.change(screen.getByLabelText(/raise new roadblock/i), {
      target: { value: 'Blocked on something real' }
    })
    fireEvent.click(submit)

    expect(onRaise).toHaveBeenCalledWith({
      description: 'Blocked on something real',
      blockerType: 'other',
      severity: 'medium'
    })
  })

  it('files an urgent roadblock as critical', () => {
    const onRaise = jest.fn()
    render(<BlockersSection memberId="u1" blockers={[]} onRaise={onRaise} />)

    fireEvent.click(screen.getByRole('switch', { name: /mark as urgent/i }))
    fireEvent.change(screen.getByLabelText(/raise new roadblock/i), {
      target: { value: 'Production is down for us' }
    })
    fireEvent.click(screen.getByRole('button', { name: /file roadblock/i }))

    expect(onRaise).toHaveBeenCalledWith(expect.objectContaining({ severity: 'critical' }))
  })

  it('says nothing is blocked when there are none', () => {
    render(<BlockersSection memberId="u1" blockers={[]} onRaise={jest.fn()} />)
    expect(screen.getByText(/no open blockers/i)).toBeInTheDocument()
  })

  it('renders its own failure state without throwing when blockers is undefined', () => {
    render(<BlockersSection memberId="u1" blockers={undefined} onRaise={jest.fn()} />)
    expect(screen.getByText(/could not load this section/i)).toBeInTheDocument()
  })
})
