/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent } from '@testing-library/react'
import { MyStandupScreen } from '../my/MyStandupScreen'
import type { CapacityBreakdown } from '@/lib/standup/capacity'
import { minutes } from '@/lib/standup/minutes'
import { standupStrings } from '@/lib/standup/strings'

/**
 * Builds a complete `CapacityBreakdown` fixture. `MyStandupMember.capacity`
 * keeps the full type (not narrowed) because Task 15's read-only leave
 * display reads `member.capacity.adjustments` — matching how
 * `RunScreenMember.capacity: CapacityBreakdown` already works in
 * `StandupRunScreen.tsx`. Mirrors the `capacity()` helper in
 * `standup-run-screen.test.tsx`.
 */
function capacity(overrides: Partial<CapacityBreakdown> = {}): CapacityBreakdown {
  return {
    memberId: 'u1',
    date: '2026-09-05',
    nominalMinutes: minutes(480),
    adjustments: [],
    adjustedMinutes: minutes(480),
    outstandingDebtMinutes: minutes(0),
    overrunPolicy: 'absorb',
    effectiveMinutes: minutes(480),
    allocatedMinutes: minutes(120),
    gapMinutes: minutes(360),
    status: 'under',
    isUnavailable: false,
    strandedMinutes: minutes(0),
    ...overrides
  }
}

const member = {
  memberId: 'u1',
  name: 'Amal',
  attendance: 'present' as const,
  capacity: capacity(),
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

/**
 * No `removeAllocation` mock: `MyStandupApi` no longer declares one. ALO-22's
 * member surface is additions only, this screen renders no control that could
 * call it, and the DELETE route stays PM-only.
 */
function setup(overrides: Partial<React.ComponentProps<typeof MyStandupScreen>> = {}) {
  const api = {
    addAllocation: jest.fn().mockResolvedValue({ standupVersion: 2 }),
    changeHours: jest.fn().mockResolvedValue({ standupVersion: 2 })
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

  it('falls back to the plain date when the dual-timezone fields are absent (NFR-20)', () => {
    setup()
    expect(screen.getByText('2026-09-05')).toBeInTheDocument()
  })

  it('renders the dual-timezone string once all three fields are present (NFR-20)', () => {
    setup({
      scheduledStartAt: '2026-09-05T09:00:00Z',
      viewerTimeZone: 'America/New_York',
      projectTimeZone: 'Asia/Colombo'
    })
    expect(screen.getByText(/05:00.*project time.*14:30/i)).toBeInTheDocument()
    expect(screen.queryByText('2026-09-05')).not.toBeInTheDocument()
  })

  it('shows a read-only leave line from the capacity breakdown, never an edit control', () => {
    setup({
      member: {
        ...member,
        capacity: {
          ...member.capacity,
          adjustments: [{ type: 'leave', label: 'Approved leave', minutes: minutes(240) }]
        }
      }
    })
    expect(screen.getByText(/Approved leave/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /edit leave/i })).not.toBeInTheDocument()
  })

  /**
   * Every refusal here is a server decision the screen cannot predict —
   * `allowSelfSelect` off, a stale version, the stand-up having moved on. With
   * no `catch` each was a silent no-op plus an unhandled rejection: the member
   * is told nothing and believes the change stuck.
   */
  describe('when the server refuses', () => {
    it('says so when an hours edit is rejected', async () => {
      const api = setup()
      api.changeHours.mockRejectedValue(new Error('refused'))

      fireEvent.blur(screen.getByLabelText(/hours for Fix the thing/i), {
        target: { value: '180' }
      })

      expect(await screen.findByRole('status')).toHaveTextContent(
        standupStrings.my.editRejected()
      )
    })

    it('says so when self-selecting a task is rejected (e.g. self-select turned off)', async () => {
      const api = setup({
        poolTasks: [
          { taskId: 't2', key: 'KAN-2', title: 'Pool task', remainingEstimateMinutes: minutes(60) }
        ]
      })
      api.addAllocation.mockRejectedValue(new Error('refused'))

      fireEvent.click(screen.getByRole('button', { name: /add kan-2/i }))

      expect(await screen.findByRole('status')).toHaveTextContent(
        standupStrings.my.addRejected()
      )
    })

    it('shows nothing until something actually fails', () => {
      setup()
      expect(screen.queryByRole('status')).not.toBeInTheDocument()
    })
  })
})
