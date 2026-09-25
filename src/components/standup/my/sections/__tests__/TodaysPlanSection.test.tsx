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
  it('summarises the plan: task count and what the gap leaves (R1)', () => {
    render(
      <TodaysPlanSection capacity={{ gapMinutes: minutes(0) }}
        allocations={[
          allocation(),
          allocation({ allocationId: 'a2', taskId: 't2', taskKey: 'KAN-2', plannedMinutes: minutes(240) })
        ]}
        readOnly={false}
        onChangeHours={jest.fn()}
      />
    )
    expect(screen.getByRole('heading', { name: /today's plan/i })).toBeInTheDocument()
    expect(screen.getByText('2 tasks planned • fully planned')).toBeInTheDocument()
  })

  it('reports the unplanned gap as surplus available', () => {
    render(
      <TodaysPlanSection
        capacity={{ gapMinutes: minutes(90) }}
        allocations={[allocation()]}
        readOnly={false}
        onChangeHours={jest.fn()}
      />
    )
    expect(screen.getByText('1 task planned • 1.5h surplus available')).toBeInTheDocument()
  })

  it('shows where each row came from', () => {
    render(
      <TodaysPlanSection capacity={{ gapMinutes: minutes(0) }} allocations={[allocation({ source: 'carried_forward' })]} readOnly={false} onChangeHours={jest.fn()} />
    )
    expect(screen.getByText(/carried/i)).toBeInTheDocument()
  })

  it('calls onChangeHours with minutes when a typed hours value is committed', () => {
    const onChangeHours = jest.fn()
    render(<TodaysPlanSection capacity={{ gapMinutes: minutes(0) }} allocations={[allocation()]} readOnly={false} onChangeHours={onChangeHours} />)
    const input = screen.getByLabelText(/planned hours for fix the thing/i)
    fireEvent.change(input, { target: { value: '3' } })
    fireEvent.blur(input)
    expect(onChangeHours).toHaveBeenCalledWith('a1', 180)
  })

  /**
   * The field used to show and accept raw minutes (e.g. "120") right next to
   * a separately formatted "2.0h" label for the same figure — nothing on the
   * box itself said which one it was. It must now speak hours throughout,
   * matching the PM run screen's own `HourStepper`.
   */
  it('shows the planned-hours field in hours, not raw minutes', () => {
    render(
      <TodaysPlanSection capacity={{ gapMinutes: minutes(0) }}
        allocations={[allocation({ plannedMinutes: minutes(120) })]}
        readOnly={false}
        onChangeHours={jest.fn()}
      />
    )
    const input = screen.getByLabelText(/planned hours for fix the thing/i) as HTMLInputElement
    expect(input.value).toBe('2')
  })

  it('states the lock reason when read-only, rather than a silent disable', () => {
    render(<TodaysPlanSection capacity={{ gapMinutes: minutes(0) }} allocations={[allocation()]} readOnly onChangeHours={jest.fn()} />)
    expect(screen.getByLabelText(/hours for fix the thing/i)).toBeDisabled()
    expect(screen.getByText(/editing is locked/i)).toBeInTheDocument()
    expect(screen.getByText('Locked')).toBeInTheDocument()
  })

  it('says so plainly when nothing is planned yet', () => {
    render(<TodaysPlanSection capacity={{ gapMinutes: minutes(0) }} allocations={[]} readOnly={false} onChangeHours={jest.fn()} />)
    expect(screen.getByText(/nothing planned for you yet/i)).toBeInTheDocument()
  })
})
