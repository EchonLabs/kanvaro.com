/**
 * @jest-environment jsdom
 */
import { fireEvent, render, screen } from '@testing-library/react'
import { TodaysPlanSection } from '../TodaysPlanSection'
import { minutes } from '@/lib/standup/minutes'
import type { BoardAllocationView } from '@/components/standup/run/CapacityBoard'

function allocation(overrides: Partial<BoardAllocationView> = {}): BoardAllocationView {
  return {
    allocationId: 'a1',
    taskId: 't1',
    taskKey: 'KAN-1',
    title: 'Fix the thing',
    plannedMinutes: minutes(120),
    remainingEstimateMinutes: minutes(180),
    source: 'assigned_in_standup',
    isBlocked: false,
    excludedFromCapacity: false,
    pairedDeliberately: false,
    ...overrides
  }
}

describe('TodaysPlanSection', () => {
  it('shows the header total derived from the allocations (R1)', () => {
    render(
      <TodaysPlanSection
        allocations={[
          allocation(),
          allocation({ allocationId: 'a2', taskId: 't2', taskKey: 'KAN-2', plannedMinutes: minutes(240) })
        ]}
        readOnly={false}
        onChangeHours={jest.fn()}
      />
    )
    expect(screen.getByText(/today/i)).toBeInTheDocument()
    expect(screen.getByText(/6\.0h planned/i)).toBeInTheDocument()
  })

  it('shows each source as a pill', () => {
    render(
      <TodaysPlanSection allocations={[allocation({ source: 'carried_forward' })]} readOnly={false} onChangeHours={jest.fn()} />
    )
    expect(screen.getByText(/carried/i)).toBeInTheDocument()
  })

  it('calls onChangeHours when the hours input is edited', () => {
    const onChangeHours = jest.fn()
    render(<TodaysPlanSection allocations={[allocation()]} readOnly={false} onChangeHours={onChangeHours} />)
    fireEvent.blur(screen.getByLabelText(/hours for fix the thing/i), { target: { value: '180' } })
    expect(onChangeHours).toHaveBeenCalledWith('a1', 180)
  })

  it('states the lock reason when read-only, rather than a silent disable', () => {
    render(<TodaysPlanSection allocations={[allocation()]} readOnly onChangeHours={jest.fn()} />)
    expect(screen.getByLabelText(/hours for fix the thing/i)).toBeDisabled()
    expect(screen.getByText(/your day is locked/i)).toBeInTheDocument()
  })

  it('says so plainly when nothing is planned yet', () => {
    render(<TodaysPlanSection allocations={[]} readOnly={false} onChangeHours={jest.fn()} />)
    expect(screen.getByText(/nothing planned for you yet/i)).toBeInTheDocument()
  })
})
