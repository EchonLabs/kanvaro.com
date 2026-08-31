/**
 * @jest-environment jsdom
 */
/**
 * The run screen shell, Panel 1, Panel 5 and Panel 7 (Phase 7, Task 12).
 *
 * This is the screen the module lives or dies on (§15.8), and Phase 7 builds
 * three of its seven panels. The other four render as **stubs naming the phase
 * that will fill them**, which is the point of several tests below: a screen
 * that silently omits three of its seven steps looks finished, and a PM has no
 * way to tell a missing panel from an empty one. The same reasoning governs
 * `not_evaluated` completion checks.
 *
 * The two behaviours that are genuinely hard and therefore heavily covered:
 *
 *   RUN-25 — an optimistic row edit that the server rejects must roll back
 *            *visibly*. A silent revert is worse than no optimism at all: the
 *            PM believes the change stuck and finds out at completion.
 *   RUN-26 — a member's own row locks the moment the stand-up starts.
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'

import { StandupRunScreen } from '@/components/standup/run/StandupRunScreen'
import type { RunScreenData } from '@/components/standup/run/StandupRunScreen'
import type { CapacityBreakdown } from '@/lib/standup/capacity'
import { evaluateCompletionChecks } from '@/lib/standup/completion-checks'
import { minutes } from '@/lib/standup/minutes'
import { standupStrings } from '@/lib/standup/strings'

const m = minutes

function capacity(overrides: Partial<CapacityBreakdown> = {}): CapacityBreakdown {
  return {
    memberId: 'kasun',
    date: '2026-08-17',
    nominalMinutes: m(480),
    adjustments: [],
    adjustedMinutes: m(480),
    outstandingDebtMinutes: m(0),
    overrunPolicy: 'absorb',
    effectiveMinutes: m(480),
    allocatedMinutes: m(480),
    gapMinutes: m(0),
    status: 'full',
    isUnavailable: false,
    strandedMinutes: m(0),
    ...overrides
  }
}

function data(overrides: Partial<RunScreenData> = {}): RunScreenData {
  return {
    standupId: 's1',
    standupVersion: 3,
    date: '2026-08-17',
    sprintDayNumber: 4,
    totalSprintDays: 10,
    shape: 'mid_sprint',
    status: 'In_Progress',
    facilitatorName: 'Priya',
    ceremoniesConsumeCapacity: true,
    members: [
      {
        memberId: 'kasun',
        name: 'Kasun',
        attendance: 'present',
        capacity: capacity(),
        allocations: [
          {
            allocationId: 'a1',
            taskId: 't1',
            taskKey: 'KAN-214',
            title: 'Invoice model',
            plannedMinutes: m(480),
            remainingEstimateMinutes: m(480),
            source: 'carried_forward',
            isBlocked: false,
            excludedFromCapacity: false,
            pairedDeliberately: false
          }
        ]
      }
    ],
    pool: { unassigned: [], assignedNotPlanned: [] },
    poolTotal: 0,
    ...overrides
  }
}

/** Succeeds, echoing back an incremented version the way the server does. */
const okApi = () => ({
  setAttendance: jest.fn().mockResolvedValue({ standupVersion: 4 }),
  changeHours: jest.fn().mockResolvedValue({ standupVersion: 4 }),
  removeAllocation: jest.fn().mockResolvedValue({ standupVersion: 4 }),
  addAllocation: jest.fn().mockResolvedValue({ standupVersion: 4 }),
  reassignDetached: jest.fn().mockResolvedValue({ standupVersion: 4 }),
  refresh: jest.fn().mockResolvedValue(data())
})

const renderScreen = (
  overrides: Partial<RunScreenData> = {},
  api = okApi(),
  props: Record<string, unknown> = {}
) => {
  render(<StandupRunScreen data={data(overrides)} api={api} {...props} />)
  return api
}

describe('the header (§15.8.2)', () => {
  it('shows the working-day ordinal, never a calendar count', () => {
    renderScreen()

    expect(
      screen.getByText(standupStrings.run.dayOf({ day: 4, total: 10 }))
    ).toBeInTheDocument()
  })

  it('names the facilitator', () => {
    renderScreen()
    expect(
      screen.getByText(standupStrings.run.facilitator({ name: 'Priya' }))
    ).toBeInTheDocument()
  })

  it('hides Join call when no meeting URL is configured', () => {
    renderScreen()
    expect(
      screen.queryByRole('link', { name: standupStrings.run.joinCall() })
    ).not.toBeInTheDocument()
  })

  it('shows Join call when there is one', () => {
    renderScreen({ meetingUrl: 'https://meet.example/kanvaro' })
    expect(
      screen.getByRole('link', { name: standupStrings.run.joinCall() })
    ).toHaveAttribute('href', 'https://meet.example/kanvaro')
  })

  it('does not render presence avatars — descoped, register row 4', () => {
    renderScreen()
    expect(screen.queryByTestId('presence-avatars')).not.toBeInTheDocument()
  })
})

describe('the jump bar and the shapes (§15.8.10)', () => {
  it('lists all seven panels mid-sprint', () => {
    renderScreen()

    const bar = screen.getByRole('navigation', { name: /panels/i })
    expect(within(bar).getAllByRole('link')).toHaveLength(7)
  })

  it('hides panels 2, 3 and 4 on day one', () => {
    renderScreen({ shape: 'day_one' })

    expect(screen.queryByText(standupStrings.run.panel2())).not.toBeInTheDocument()
    expect(screen.queryByText(standupStrings.run.panel3())).not.toBeInTheDocument()
    expect(screen.queryByText(standupStrings.run.panel4())).not.toBeInTheDocument()
  })

  it('shows the ALO-20 progress meter on day one', () => {
    renderScreen({
      shape: 'day_one',
      dayOne: { assignedTasks: 18, totalTasks: 24, placedMinutes: m(11760), sprintCapacityMinutes: m(16080) }
    })

    expect(screen.getByTestId('day-one-progress')).toHaveTextContent('18 of 24 tasks assigned')
  })

  it('warns softly about unassigned tasks on day one (ALO-21)', () => {
    renderScreen({
      shape: 'day_one',
      dayOne: {
        assignedTasks: 18,
        totalTasks: 24,
        placedMinutes: m(11760),
        sprintCapacityMinutes: m(16080),
        stillUnassigned: 6
      }
    })

    expect(
      screen.getByText(standupStrings.run.dayOneUnassignedWarning({ count: 6 }))
    ).toBeInTheDocument()
  })

  it('does not show the day-one meter mid-sprint', () => {
    renderScreen()
    expect(screen.queryByTestId('day-one-progress')).not.toBeInTheDocument()
  })
})

describe('the panels Phase 7 does not own', () => {
  it('renders them as stubs naming their phase, rather than omitting them', () => {
    renderScreen()

    // A screen missing three of seven steps looks finished. It is not.
    const stubs = screen.getAllByTestId('panel-stub')
    expect(stubs.length).toBeGreaterThanOrEqual(3)
    expect(stubs[0]).toHaveTextContent(/arrives in Phase/)
  })
})

describe('Panel 1 — attendance (RUN-6, RUN-7)', () => {
  it('sends the state and the version the client last read', async () => {
    const api = renderScreen()

    fireEvent.change(
      screen.getByLabelText(standupStrings.run.attendanceFor({ name: 'Kasun' })),
      { target: { value: 'absent_planned' } }
    )

    await waitFor(() =>
      expect(api.setAttendance).toHaveBeenCalledWith(
        expect.objectContaining({
          memberId: 'kasun',
          state: 'absent_planned',
          expectedVersion: 3
        })
      )
    )
  })

  it('asks for hours only when the state is partial', () => {
    renderScreen()

    expect(
      screen.queryByLabelText(standupStrings.run.partialHoursFor({ name: 'Kasun' }))
    ).not.toBeInTheDocument()

    fireEvent.change(
      screen.getByLabelText(standupStrings.run.attendanceFor({ name: 'Kasun' })),
      { target: { value: 'partial' } }
    )

    expect(
      screen.getByLabelText(standupStrings.run.partialHoursFor({ name: 'Kasun' }))
    ).toBeInTheDocument()
  })

  it('raises the RUN-7 reassign prompt when the server returns one', async () => {
    const api = okApi()
    api.setAttendance.mockResolvedValue({
      standupVersion: 4,
      reassignPrompt: {
        memberId: 'kasun',
        taskCount: 2,
        totalMinutes: m(360),
        tasks: [
          { allocationId: 'a1', taskId: 't1', key: 'KAN-277', plannedMinutes: m(180) },
          { allocationId: 'a2', taskId: 't2', key: 'KAN-278', plannedMinutes: m(180) }
        ]
      }
    })
    renderScreen({}, api)

    fireEvent.change(
      screen.getByLabelText(standupStrings.run.attendanceFor({ name: 'Kasun' })),
      { target: { value: 'absent_planned' } }
    )

    expect(
      await screen.findByText(
        standupStrings.run.reassignPrompt({ name: 'Kasun', count: 2 })
      )
    ).toBeInTheDocument()
  })

  it('does not raise the prompt when nothing was detached', async () => {
    const api = okApi()
    api.setAttendance.mockResolvedValue({ standupVersion: 4, reassignPrompt: null })
    renderScreen({}, api)

    fireEvent.change(
      screen.getByLabelText(standupStrings.run.attendanceFor({ name: 'Kasun' })),
      { target: { value: 'absent_planned' } }
    )

    await waitFor(() => expect(api.setAttendance).toHaveBeenCalled())
    expect(screen.queryByText(/Reassign/)).not.toBeInTheDocument()
  })
})

describe('RUN-25 — optimistic edits roll back visibly', () => {
  it('shows the new hours immediately, before the server has answered', async () => {
    const api = okApi()
    let resolve: (value: unknown) => void = () => {}
    api.changeHours.mockReturnValue(new Promise((r) => { resolve = r }))
    renderScreen({}, api)

    fireEvent.click(
      screen.getByRole('button', { name: standupStrings.allocation.stepperIncrease() })
    )

    // 8.0h → 8.25h, on screen with no round trip.
    expect(screen.getByRole('spinbutton')).toHaveValue(8.25)

    await act(async () => {
      resolve({ standupVersion: 4 })
    })
  })

  it('puts the row back and says so when the server refuses', async () => {
    const api = okApi()
    api.changeHours.mockRejectedValue(new Error('nope'))
    renderScreen({}, api)

    fireEvent.click(
      screen.getByRole('button', { name: standupStrings.allocation.stepperIncrease() })
    )

    // A silent revert is worse than no optimism: the PM believes it stuck.
    expect(await screen.findByRole('status')).toHaveTextContent(
      standupStrings.run.editRejected()
    )
    await waitFor(() => expect(screen.getByRole('spinbutton')).toHaveValue(8))
  })

  it('reloads rather than guessing when the version was stale', async () => {
    const api = okApi()
    api.changeHours.mockRejectedValue({ code: 'STALE_STANDUP' })
    renderScreen({}, api)

    fireEvent.click(
      screen.getByRole('button', { name: standupStrings.allocation.stepperIncrease() })
    )

    expect(await screen.findByRole('status')).toHaveTextContent(
      standupStrings.run.staleReload()
    )
    await waitFor(() => expect(api.refresh).toHaveBeenCalled())
  })

  it('carries the server’s new version into the next write', async () => {
    const api = renderScreen()

    fireEvent.click(
      screen.getByRole('button', { name: standupStrings.allocation.stepperIncrease() })
    )
    await waitFor(() => expect(api.changeHours).toHaveBeenCalled())

    fireEvent.click(
      screen.getByRole('button', { name: standupStrings.allocation.stepperIncrease() })
    )
    await waitFor(() =>
      expect(api.changeHours).toHaveBeenLastCalledWith(
        expect.objectContaining({ expectedVersion: 4 })
      )
    )
  })
})

describe('RUN-26 — a member’s own row locks when the stand-up starts', () => {
  it('is editable while the stand-up is Ready', () => {
    renderScreen({ status: 'Ready' }, okApi(), {
      viewer: { userId: 'kasun', canAllocateOthers: false }
    })

    expect(screen.getByRole('spinbutton')).not.toBeDisabled()
  })

  it('locks the moment it moves to In_Progress', () => {
    renderScreen({ status: 'In_Progress' }, okApi(), {
      viewer: { userId: 'kasun', canAllocateOthers: false }
    })

    expect(screen.getByRole('spinbutton')).toBeDisabled()
  })

  it('does not lock the PM out — they are the one running it', () => {
    renderScreen({ status: 'In_Progress' }, okApi(), {
      viewer: { userId: 'priya', canAllocateOthers: true }
    })

    expect(screen.getByRole('spinbutton')).not.toBeDisabled()
  })
})

describe('Panel 7 — completion (§15.8.9)', () => {
  it('lists every check, including the ones no phase has built', () => {
    renderScreen()

    const rows = screen.getAllByTestId('check-row')
    expect(rows).toHaveLength(evaluateCompletionChecks({ shape: 'mid_sprint', members: [] }).length)
  })

  it('names the owning phase on an unbuilt check', () => {
    renderScreen()

    expect(
      screen.getByText(standupStrings.run.checkNotEvaluated({ phase: 'Phase 8' }))
    ).toBeInTheDocument()
  })

  it('enables Complete when nothing blocks', () => {
    renderScreen()

    expect(
      screen.getByRole('button', { name: standupStrings.run.complete() })
    ).not.toBeDisabled()
  })

  it('disables Complete and names the first blocking failure', () => {
    renderScreen({
      members: [
        {
          memberId: 'kasun',
          name: 'Kasun',
          attendance: undefined,
          capacity: capacity({ allocatedMinutes: m(0), gapMinutes: m(480), status: 'under' }),
          allocations: []
        }
      ]
    })

    const button = screen.getByRole('button', { name: standupStrings.run.complete() })
    expect(button).toBeDisabled()
    expect(button).toHaveAccessibleDescription(/not planned to full capacity/)
  })

  it('offers a jump link to the offending row (RUN-19)', () => {
    renderScreen({
      members: [
        {
          memberId: 'kasun',
          name: 'Kasun',
          attendance: 'present',
          capacity: capacity({ allocatedMinutes: m(0), gapMinutes: m(480), status: 'under' }),
          allocations: []
        }
      ]
    })

    expect(
      screen.getAllByRole('link', { name: standupStrings.run.jumpToFailure() }).length
    ).toBeGreaterThan(0)
  })
})
