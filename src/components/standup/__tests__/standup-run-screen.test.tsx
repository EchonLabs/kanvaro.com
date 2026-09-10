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
import type { BlockerRow } from '@/components/standup/run/BlockerPanel'
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
  refresh: jest.fn().mockResolvedValue(data()),
  completeStandup: jest.fn().mockResolvedValue({ status: 'completed', summaryId: 'summary-1' }),
  issueOverride: jest.fn().mockResolvedValue({
    type: 'under_allocation',
    affectedMemberIds: ['kasun'],
    affectedTaskIds: []
  })
})

/** A CC-1 (under-allocation) failure: Kasun present but planned to 0 of 480. */
const underAllocatedMember = () => [
  {
    memberId: 'kasun',
    name: 'Kasun',
    attendance: 'present' as const,
    capacity: capacity({ allocatedMinutes: m(0), gapMinutes: m(480), status: 'under' as const }),
    allocations: []
  }
]

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

  it('falls back to the plain date when the dual-timezone fields are absent (NFR-20)', () => {
    renderScreen()
    expect(screen.getByText('2026-08-17')).toBeInTheDocument()
  })

  it('renders the dual-timezone string once all three fields are present (NFR-20)', () => {
    renderScreen({
      scheduledStartAt: '2026-09-05T09:00:00Z',
      viewerTimeZone: 'America/New_York',
      projectTimeZone: 'Asia/Colombo'
    })
    expect(screen.getByText(/05:00.*project time.*14:30/i)).toBeInTheDocument()
    expect(screen.queryByText('2026-08-17')).not.toBeInTheDocument()
  })
})

describe('Start stand-up (RUN-2/3, AC-5, Task 1)', () => {
  it('renders when Ready and api.start is provided', () => {
    const api = { ...okApi(), start: jest.fn().mockResolvedValue(undefined) }
    renderScreen({ status: 'Ready' }, api)

    expect(
      screen.getByRole('button', { name: standupStrings.run.start() })
    ).toBeInTheDocument()
  })

  it('does not render once the stand-up has started', () => {
    const api = { ...okApi(), start: jest.fn().mockResolvedValue(undefined) }
    renderScreen({ status: 'In_Progress' }, api)

    expect(
      screen.queryByRole('button', { name: standupStrings.run.start() })
    ).not.toBeInTheDocument()
  })

  it('does not render once the stand-up is completed', () => {
    const api = { ...okApi(), start: jest.fn().mockResolvedValue(undefined) }
    renderScreen({ status: 'Completed' }, api)

    expect(
      screen.queryByRole('button', { name: standupStrings.run.start() })
    ).not.toBeInTheDocument()
  })

  it('does not render when the api has not wired a start method', () => {
    renderScreen({ status: 'Ready' })

    expect(
      screen.queryByRole('button', { name: standupStrings.run.start() })
    ).not.toBeInTheDocument()
  })

  // I2: a Scheduled stand-up whose lead boundary has passed is legitimately
  // startable (promote-to-ready.ts may simply not have ticked yet). The
  // server (assertStartable) remains the real authority and correctly
  // refuses a genuinely-too-early attempt; the button must not hide the
  // option client-side while the background job is stale.
  it('renders when Scheduled and api.start is provided (I2)', () => {
    const api = { ...okApi(), start: jest.fn().mockResolvedValue(undefined) }
    renderScreen({ status: 'Scheduled' }, api)

    expect(
      screen.getByRole('button', { name: standupStrings.run.start() })
    ).toBeInTheDocument()
  })

  it('calls api.start and shows the success notice, then reloads', async () => {
    const api = { ...okApi(), start: jest.fn().mockResolvedValue(undefined) }
    renderScreen({ status: 'Ready' }, api)

    fireEvent.click(screen.getByRole('button', { name: standupStrings.run.start() }))

    expect(await screen.findByRole('status')).toHaveTextContent(
      standupStrings.run.startSuccess()
    )
    await waitFor(() => expect(api.start).toHaveBeenCalled())
    await waitFor(() => expect(api.refresh).toHaveBeenCalled())
  })

  it('names the planning gate when the sprint never completed planning', async () => {
    const api = {
      ...okApi(),
      start: jest.fn().mockRejectedValue({ code: 'PLANNING_GATE_NOT_PASSED' })
    }
    renderScreen({ status: 'Ready' }, api)

    fireEvent.click(screen.getByRole('button', { name: standupStrings.run.start() }))

    expect(await screen.findByRole('status')).toHaveTextContent(
      standupStrings.run.startPlanningGateFailed()
    )
  })

  it('reloads rather than guessing when the version was stale', async () => {
    const api = { ...okApi(), start: jest.fn().mockRejectedValue({ code: 'STALE_STANDUP' }) }
    renderScreen({ status: 'Ready' }, api)

    fireEvent.click(screen.getByRole('button', { name: standupStrings.run.start() }))

    expect(await screen.findByRole('status')).toHaveTextContent(
      standupStrings.run.staleReload()
    )
    await waitFor(() => expect(api.refresh).toHaveBeenCalled())
  })

  it('shows the generic failure notice for anything else', async () => {
    const api = { ...okApi(), start: jest.fn().mockRejectedValue(new Error('nope')) }
    renderScreen({ status: 'Ready' }, api)

    fireEvent.click(screen.getByRole('button', { name: standupStrings.run.start() }))

    expect(await screen.findByRole('status')).toHaveTextContent(
      standupStrings.run.startFailed()
    )
  })
})

describe('the elapsed-time timer (E57, §15.8.2)', () => {
  afterEach(() => {
    jest.useRealTimers()
  })

  it('renders when In_Progress with a startedAt', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-17T10:05:00.000Z'))

    renderScreen({
      status: 'In_Progress',
      startedAt: '2026-08-17T10:00:00.000Z',
      durationMinutes: 15
    })

    expect(screen.getByTestId('standup-timer')).toBeInTheDocument()
  })

  it('does not render when Scheduled, even with a startedAt somehow present', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-17T10:05:00.000Z'))

    renderScreen({
      status: 'Scheduled',
      startedAt: '2026-08-17T10:00:00.000Z',
      durationMinutes: 15
    })

    expect(screen.queryByTestId('standup-timer')).not.toBeInTheDocument()
  })

  it('does not render when Completed', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-17T10:05:00.000Z'))

    renderScreen({
      status: 'Completed',
      startedAt: '2026-08-17T10:00:00.000Z',
      durationMinutes: 15
    })

    expect(screen.queryByTestId('standup-timer')).not.toBeInTheDocument()
  })

  it('does not render when In_Progress but never started', () => {
    renderScreen({ status: 'In_Progress', durationMinutes: 15 })

    expect(screen.queryByTestId('standup-timer')).not.toBeInTheDocument()
  })

  it('is neutral before the configured duration elapses', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-17T10:05:00.000Z'))

    renderScreen({
      status: 'In_Progress',
      startedAt: '2026-08-17T10:00:00.000Z',
      durationMinutes: 15
    })

    // 5 of 15 minutes elapsed.
    expect(screen.getByTestId('standup-timer')).toHaveAttribute('data-tone', 'timer-neutral')
  })

  it('turns amber at 100% of the configured duration', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-17T10:05:00.000Z'))

    renderScreen({
      status: 'In_Progress',
      startedAt: '2026-08-17T10:00:00.000Z',
      durationMinutes: 15
    })

    act(() => {
      jest.setSystemTime(new Date('2026-08-17T10:16:00.000Z'))
      jest.advanceTimersByTime(1000)
    })

    // 16 of 15 minutes elapsed — past 100%, short of 130%.
    expect(screen.getByTestId('standup-timer')).toHaveAttribute('data-tone', 'timer-amber')
  })

  it('turns red at 130% of the configured duration', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-17T10:05:00.000Z'))

    renderScreen({
      status: 'In_Progress',
      startedAt: '2026-08-17T10:00:00.000Z',
      durationMinutes: 15
    })

    act(() => {
      jest.setSystemTime(new Date('2026-08-17T10:20:00.000Z'))
      jest.advanceTimersByTime(1000)
    })

    // 20 of 15 minutes elapsed — 133%, past the 130% threshold.
    expect(screen.getByTestId('standup-timer')).toHaveAttribute('data-tone', 'timer-red')
  })

  it('never disables Complete no matter how red the timer runs (advisory-only, D-6)', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-17T10:05:00.000Z'))

    renderScreen({
      status: 'In_Progress',
      startedAt: '2026-08-17T10:00:00.000Z',
      durationMinutes: 15
    })

    act(() => {
      jest.setSystemTime(new Date('2026-08-17T10:25:00.000Z'))
      jest.advanceTimersByTime(1000)
    })

    expect(screen.getByTestId('standup-timer')).toHaveAttribute('data-tone', 'timer-red')
    expect(
      screen.getByRole('button', { name: standupStrings.run.complete() })
    ).not.toBeDisabled()
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

  it('renders Panel 5 as the top panel on day one, per spec §15.8.10', () => {
    renderScreen({ shape: 'day_one' })

    const panelFive = screen.getByRole('heading', { name: standupStrings.run.panel5() })
    const attendanceHeading = screen.getByRole('heading', {
      name: standupStrings.run.attendanceTitle()
    })

    // compareDocumentPosition returns a bitmask; DOCUMENT_POSITION_FOLLOWING
    // (4) means the *other* node comes after this one in document order — so
    // asserting it here proves Panel 5 precedes Attendance in the DOM.
    expect(
      panelFive.compareDocumentPosition(attendanceHeading) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
  })

  it('keeps Attendance before Panel 5 mid-sprint (unchanged order)', () => {
    renderScreen()

    const attendanceHeading = screen.getByRole('heading', {
      name: standupStrings.run.attendanceTitle()
    })
    const panelFive = screen.getByRole('heading', { name: standupStrings.run.panel5() })

    expect(
      attendanceHeading.compareDocumentPosition(panelFive) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
  })
})

describe('the panel nobody has built yet', () => {
  it('no longer renders any panel as a stub — Phase 10 built the last one', () => {
    renderScreen()

    // A screen missing a step looks finished unless the gap announces
    // itself. All seven panels are now built, so no stub should remain.
    expect(screen.queryAllByTestId('panel-stub')).toHaveLength(0)
  })
})

describe('Panel 4 — carry forward (CFW-10/11)', () => {
  it('renders the register when it is loaded', () => {
    renderScreen({
      carryForward: {
        items: [
          {
            itemId: 'cf1',
            type: 'unfinished_task',
            status: 'open',
            taskKey: 'KAN-214',
            originDate: '2026-08-14',
            ageInStandups: 3,
            ageBand: 'note_required',
            requiresNoteToday: true,
            notedToday: false,
            tags: [],
            notes: [],
            validResolutions: ['done', 'reassigned', 'descoped', 'other']
          }
        ],
        summary: { totalOpen: 1, needingNoteToday: 1, escalated: 0, resolvedYesterday: 0 }
      }
    })

    expect(screen.getByTestId('carry-forward-summary')).toBeInTheDocument()
    expect(screen.getByTestId('carry-forward-item-cf1')).toHaveTextContent('KAN-214')
  })

  it('does not render the panel while the register has not loaded', () => {
    renderScreen()
    expect(screen.queryByTestId('carry-forward-summary')).not.toBeInTheDocument()
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

  it('evaluates CC-3 from Panel 3’s own variance data, not a stub', () => {
    renderScreen({
      variance: {
        rows: [
          {
            allocationId: 'a1',
            taskId: 't1',
            taskKey: 'KAN-214',
            title: 'Invoice model',
            memberId: 'kasun',
            memberName: 'Kasun',
            outcome: 'open_over_consumed',
            plannedMinutes: m(480),
            loggedMinutesOnDay: m(540),
            dayVarianceMinutes: m(60),
            originalEstimateMinutes: m(480),
            totalLoggedMinutesOnTask: m(540),
            taskVarianceMinutes: m(60),
            requiresRevision: true,
            requiresReason: false,
            spillChainLength: 0,
            chronicSpill: false,
            explanation: 'Ran over today’s plan.'
          }
        ],
        members: []
      }
    })

    const button = screen.getByRole('button', { name: standupStrings.run.complete() })
    expect(button).toBeDisabled()
    expect(button).toHaveAccessibleDescription(/still needs an answer/)
  })

  it('passes CC-3 trivially on a day-one stand-up with no yesterday to load', () => {
    renderScreen({ shape: 'day_one' })

    expect(
      screen.queryByText(standupStrings.run.checkNotEvaluated({ phase: 'Phase 8' }))
    ).not.toBeInTheDocument()
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

describe('Panel 7 — the Override action (Task 22)', () => {
  it('opens the modal with the right type and affected member on a CC-1 failure', () => {
    renderScreen({ members: underAllocatedMember() })

    fireEvent.click(screen.getByRole('button', { name: standupStrings.run.override() }))

    const dialog = screen.getByRole('dialog')
    expect(
      within(dialog).getByText(standupStrings.override.title({ type: 'under_allocation' }))
    ).toBeInTheDocument()
    expect(
      within(dialog).getByText(
        standupStrings.override.gapLine({
          name: 'Kasun',
          gapMinutes: 480,
          allocatedMinutes: 0,
          effectiveMinutes: 480
        })
      )
    ).toBeInTheDocument()
  })

  it('submits the override to the right endpoint with the right body', async () => {
    const api = okApi()
    renderScreen({ members: underAllocatedMember() }, api)

    fireEvent.click(screen.getByRole('button', { name: standupStrings.run.override() }))
    const dialog = screen.getByRole('dialog')

    fireEvent.change(
      within(dialog).getByLabelText(standupStrings.override.justificationLabel()),
      { target: { value: 'Kasun is covering the support rota all day today.' } }
    )
    fireEvent.click(within(dialog).getByRole('button', { name: standupStrings.override.submit() }))

    await waitFor(() =>
      expect(api.issueOverride).toHaveBeenCalledWith({
        type: 'under_allocation',
        affectedMemberIds: ['kasun'],
        affectedTaskIds: [],
        reasonCode: 'no_work_available',
        justification: 'Kasun is covering the support rota all day today.',
        memberAcknowledged: false
      })
    )
  })

  it('re-enables Complete client-side after a successful override, without a reload', async () => {
    const api = okApi()
    // `refresh()` returns the same still-failing board — proving the local
    // `overridesIssued` state, not the reload, is what lifts the block.
    api.refresh.mockResolvedValue(data({ members: underAllocatedMember() }))
    renderScreen({ members: underAllocatedMember() }, api)

    const completeButton = screen.getByRole('button', { name: standupStrings.run.complete() })
    expect(completeButton).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: standupStrings.run.override() }))
    const dialog = screen.getByRole('dialog')
    fireEvent.change(
      within(dialog).getByLabelText(standupStrings.override.justificationLabel()),
      { target: { value: 'Kasun is covering the support rota all day today.' } }
    )
    fireEvent.click(within(dialog).getByRole('button', { name: standupStrings.override.submit() }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(
      screen.getByRole('button', { name: standupStrings.run.complete() })
    ).not.toBeDisabled()
    expect(api.refresh).toHaveBeenCalled()
  })

  it('closes without submitting when the PM cancels', () => {
    const api = okApi()
    renderScreen({ members: underAllocatedMember() }, api)

    fireEvent.click(screen.getByRole('button', { name: standupStrings.run.override() }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: standupStrings.override.cancel() }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(api.issueOverride).not.toHaveBeenCalled()
  })

  it('shows an error notice and keeps the modal open when the server refuses', async () => {
    const api = okApi()
    api.issueOverride.mockRejectedValue({ code: 'INVALID_JUSTIFICATION' })
    renderScreen({ members: underAllocatedMember() }, api)

    fireEvent.click(screen.getByRole('button', { name: standupStrings.run.override() }))
    const dialog = screen.getByRole('dialog')
    fireEvent.change(
      within(dialog).getByLabelText(standupStrings.override.justificationLabel()),
      { target: { value: 'Kasun is covering the support rota all day today.' } }
    )
    fireEvent.click(within(dialog).getByRole('button', { name: standupStrings.override.submit() }))

    expect(await screen.findByRole('status')).toHaveTextContent(
      standupStrings.run.overrideFailed()
    )
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('does not render an Override action for a non-overridable failing check', () => {
    renderScreen({
      members: [
        {
          memberId: 'kasun',
          name: 'Kasun',
          attendance: undefined,
          capacity: capacity(),
          allocations: []
        }
      ]
    })

    // CC-7 (missing attendance) fails here and is never overridable.
    expect(
      screen.queryByRole('button', { name: standupStrings.run.override() })
    ).not.toBeInTheDocument()
  })
})

describe('final-day sprint close', () => {
  it('renders the readiness panel only when shape is final_day and sprintClose data is present', () => {
    renderScreen({ shape: 'final_day', sprintClose: { openTasks: [], carryForwardItems: [] } })
    expect(screen.getByText(/sprint close readiness/i)).toBeInTheDocument()
  })

  it('omits the panel on a mid_sprint stand-up even if sprintClose data is present', () => {
    renderScreen({ shape: 'mid_sprint', sprintClose: { openTasks: [], carryForwardItems: [] } })
    expect(screen.queryByText(/sprint close readiness/i)).not.toBeInTheDocument()
  })

  it('blocks Complete when an open task has no disposition, independent of the eleven checks', () => {
    renderScreen({
      shape: 'final_day',
      members: [],
      sprintClose: {
        openTasks: [
          {
            taskId: 't1',
            taskKey: 'KAN-1',
            remainingEstimateMinutes: m(60),
            hoursAvailableTodayMinutes: m(60),
            projectedOutcome: 'will_finish'
          }
        ],
        carryForwardItems: []
      }
    })
    expect(screen.getByText(/complete stand-up/i)).toBeDisabled()
  })

  it('blocks Complete when a carry-forward item is still open on the final day, even with CC-8 satisfied', () => {
    renderScreen({
      shape: 'final_day',
      members: [],
      sprintClose: {
        openTasks: [],
        carryForwardItems: [{ itemId: 'c1', taskKey: 'KAN-2', status: 'open', hasResolution: false }]
      }
    })
    expect(screen.getByText(/complete stand-up/i)).toBeDisabled()
  })

  it('does not let CFW-9 block Complete on a non-final-day board', () => {
    // The panel that would explain the block is `final_day`-only, so an
    // ungated CFW-9 memo disables Complete with nothing on screen saying why.
    // `cc8()` and the panel's own render condition both self-gate on shape;
    // this memo now does too.
    renderScreen({
      shape: 'mid_sprint',
      members: [],
      sprintClose: {
        openTasks: [],
        carryForwardItems: [{ itemId: 'c1', taskKey: 'KAN-2', status: 'open', hasResolution: false }]
      }
    })
    expect(screen.getByText(/complete stand-up/i)).not.toBeDisabled()
  })
})

describe('Panel 6 — blockers, the resolve fix (Task 5)', () => {
  const openBlocker = (overrides: Partial<BlockerRow> = {}): BlockerRow => ({
    blockerId: 'blk-1',
    taskKey: 'KAN-1',
    description: 'Vendor sandbox is down',
    blockerType: 'external_party',
    severity: 'high',
    status: 'open',
    overdue: false,
    blockerLabel: 'BLK-1',
    ...overrides
  })

  it('shows an open blocker row', () => {
    renderScreen({ blockers: [openBlocker()] })
    expect(screen.getByTestId('blocker-row')).toBeInTheDocument()
  })

  // The bug the reviewer caught: `BlockerPanel`'s own status check (line 89
  // there) only hides the row's Resolve *button*, not the row itself — so
  // without this screen filtering `board.blockers` before handing them to
  // the panel, a resolved blocker would sit in Panel 6 forever, sans button.
  it('does not render a blocker that is already resolved on the board', () => {
    renderScreen({ blockers: [openBlocker({ status: 'resolved' })] })
    expect(screen.queryByTestId('blocker-row')).not.toBeInTheDocument()
  })

  it('does not render a blocker marked wont_resolve either', () => {
    renderScreen({ blockers: [openBlocker({ status: 'wont_resolve' })] })
    expect(screen.queryByTestId('blocker-row')).not.toBeInTheDocument()
  })

  it('removes the row once the PM resolves it and the board reloads', async () => {
    const api = { ...okApi(), resolveBlocker: jest.fn().mockResolvedValue(undefined) }
    // The server's own state after the PATCH: the blocker is now resolved.
    // `onSubmitResolveBlocker` has to call `reload()` (i.e. `api.refresh`)
    // for this to reach the screen at all — `board` is this component's own
    // state and is never re-synced from the `data` prop after mount.
    api.refresh.mockResolvedValue(data({ blockers: [openBlocker({ status: 'resolved' })] }))
    renderScreen({ blockers: [openBlocker()] }, api)

    expect(screen.getByTestId('blocker-row')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: standupStrings.blocker.resolve() }))
    const dialog = screen.getByRole('dialog')

    fireEvent.change(within(dialog).getByLabelText(/resolution note/i), {
      target: { value: 'Vendor sandbox came back up.' }
    })
    fireEvent.click(within(dialog).getByRole('button', { name: /resolve/i }))

    await waitFor(() =>
      expect(api.resolveBlocker).toHaveBeenCalledWith({
        blockerId: 'blk-1',
        status: 'resolved',
        resolutionNote: 'Vendor sandbox came back up.'
      })
    )
    await waitFor(() => expect(api.refresh).toHaveBeenCalled())
    await waitFor(() => expect(screen.queryByTestId('blocker-row')).not.toBeInTheDocument())
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('shows an error notice and keeps the dialog open when the server refuses', async () => {
    const api = {
      ...okApi(),
      resolveBlocker: jest.fn().mockRejectedValue(new Error('nope'))
    }
    renderScreen({ blockers: [openBlocker()] }, api)

    fireEvent.click(screen.getByRole('button', { name: standupStrings.blocker.resolve() }))
    const dialog = screen.getByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText(/resolution note/i), {
      target: { value: 'Vendor sandbox came back up.' }
    })
    fireEvent.click(within(dialog).getByRole('button', { name: /resolve/i }))

    expect(await screen.findByRole('status')).toHaveTextContent(
      standupStrings.blocker.resolveFailed()
    )
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})

describe('Panel 6 — blockers, the raise fix (Task 4 fix)', () => {
  it('appears in the panel once the PM raises it and the board reloads', async () => {
    const api = { ...okApi(), raiseBlocker: jest.fn().mockResolvedValue(undefined) }
    const raised: BlockerRow = {
      blockerId: 'blk-new',
      description: 'Waiting on the vendor sandbox',
      blockerType: 'external_party',
      severity: 'medium',
      status: 'open',
      overdue: false,
      blockerLabel: 'BLK-2'
    }
    // The server's own state after the POST: the new blocker now exists.
    // `onSubmitRaiseBlocker` has to call `reload()` (i.e. `api.refresh`) for
    // this to reach the screen at all — same reason as the resolve-path fix
    // above: `board` is this component's own state and is never re-synced
    // from the `data` prop after mount.
    api.refresh.mockResolvedValue(data({ blockers: [raised] }))
    renderScreen({ blockers: [] }, api)

    expect(screen.queryByTestId('blocker-row')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: standupStrings.blocker.raise() }))
    const dialog = screen.getByRole('dialog')

    fireEvent.change(within(dialog).getByLabelText(/description/i), {
      target: { value: 'Waiting on the vendor sandbox' }
    })
    fireEvent.click(within(dialog).getByRole('button', { name: /raise a blocker/i }))

    await waitFor(() =>
      expect(api.raiseBlocker).toHaveBeenCalledWith(
        expect.objectContaining({ description: 'Waiting on the vendor sandbox' })
      )
    )
    await waitFor(() => expect(api.refresh).toHaveBeenCalled())
    await waitFor(() => expect(screen.getByTestId('blocker-row')).toBeInTheDocument())
    expect(screen.getByTestId('blocker-row')).toHaveTextContent('Waiting on the vendor sandbox')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('offers actively-allocated tasks (not the pool) so a real allocationId reaches the payload (Important 5)', async () => {
    // The default fixture's `pool` is empty — every task on this board is an
    // active allocation (Kasun's `KAN-214`). Before the fix, `RaiseBlockerModal`
    // was fed `poolTasks` (`board.pool.unassigned + assignedNotPlanned`), which
    // structurally excludes tasks with a live allocation — so this option could
    // never have appeared, and `linkedAllocationId` could never populate.
    const api = { ...okApi(), raiseBlocker: jest.fn().mockResolvedValue(undefined) }
    renderScreen({}, api)

    fireEvent.click(screen.getByRole('button', { name: standupStrings.blocker.raise() }))
    const dialog = screen.getByRole('dialog')

    const taskSelect = within(dialog).getByLabelText(/linked task/i)
    expect(within(taskSelect).getByRole('option', { name: /KAN-214/ })).toBeInTheDocument()

    fireEvent.change(taskSelect, { target: { value: 't1' } })
    fireEvent.change(within(dialog).getByLabelText(/description/i), {
      target: { value: 'Blocked on the invoice model migration' }
    })
    fireEvent.click(within(dialog).getByRole('button', { name: /raise a blocker/i }))

    await waitFor(() =>
      expect(api.raiseBlocker).toHaveBeenCalledWith(
        expect.objectContaining({ taskId: 't1', linkedAllocationId: 'a1' })
      )
    )
  })
})
