/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent } from '@testing-library/react'
import { MyStandupScreen } from '../my/MyStandupScreen'
import { minutes } from '@/lib/standup/minutes'

const member = {
  memberId: 'u1',
  name: 'Amal',
  attendance: 'present' as const,
  capacity: {
    status: 'under' as const,
    nominalMinutes: minutes(480),
    effectiveMinutes: minutes(480),
    allocatedMinutes: minutes(120),
    gapMinutes: minutes(360),
    strandedMinutes: minutes(0),
    adjustments: []
  },
  allocations: [
    {
      allocationId: 'a1',
      taskId: 't1',
      taskKey: 'KAN-1',
      title: 'Fix the thing',
      plannedMinutes: minutes(120),
      remainingEstimateMinutes: minutes(180),
      source: 'assigned_in_standup' as const,
      isBlocked: false,
      excludedFromCapacity: false,
      pairedDeliberately: false
    }
  ]
}

function setup(overrides: Partial<React.ComponentProps<typeof MyStandupScreen>> = {}) {
  const api = {
    addAllocation: jest.fn().mockResolvedValue({ standupVersion: 2 }),
    changeHours: jest.fn().mockResolvedValue({ standupVersion: 2 }),
    removeAllocation: jest.fn().mockResolvedValue({ standupVersion: 2 }),
    refresh: jest.fn()
  }
  render(
    <MyStandupScreen
      standupId="s1"
      standupVersion={1}
      status="Ready"
      date="2026-09-05"
      member={member}
      poolTasks={[]}
      allowSelfSelect
      api={api as any}
      {...overrides}
    />
  )
  return api
}

describe('MyStandupScreen', () => {
  it('shows the member’s own allocations', () => {
    setup()
    expect(screen.getByText('KAN-1')).toBeInTheDocument()
  })

  it('allows editing while the stand-up is Ready', () => {
    setup()
    expect(screen.getByLabelText(/hours for Fix the thing/i)).not.toBeDisabled()
  })

  it('locks editing once the stand-up is In_Progress (RUN-26)', () => {
    setup({ status: 'In_Progress' })
    expect(screen.getByLabelText(/hours for Fix the thing/i)).toBeDisabled()
    expect(screen.getByText(/read-only/i)).toBeInTheDocument()
  })

  it('calls addAllocation with selfSelect: true when self-selecting a pool task', () => {
    const api = setup({
      poolTasks: [{ taskId: 't2', key: 'KAN-2', title: 'Pool task', remainingEstimateMinutes: minutes(60) }]
    })
    fireEvent.click(screen.getByRole('button', { name: /add kan-2/i }))
    expect(api.addAllocation).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: 't2', memberId: 'u1', selfSelect: true })
    )
  })
})
