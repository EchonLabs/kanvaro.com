/**
 * @jest-environment jsdom
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { YesterdaySection } from '../YesterdaySection'
import { minutes } from '@/lib/standup/minutes'
import type { YesterdayPanelData } from '@/lib/standup/yesterday-service'
import type { VarianceRow } from '@/lib/standup/variance-service'

function panel(overrides: Partial<YesterdayPanelData> = {}): YesterdayPanelData {
  return {
    standupId: 's1',
    previousStandupId: 's0',
    previousStandupDate: '2026-09-10',
    buckets: [
      {
        bucket: 'completed',
        rows: [
          {
            allocationId: 'a1',
            taskId: 't1',
            taskKey: 'KAN-1',
            title: 'Done thing',
            memberId: 'u1',
            memberName: 'Amal',
            previousStatus: 'in_progress',
            currentStatus: 'done',
            plannedMinutes: minutes(120),
            loggedMinutes: minutes(120),
            dayVarianceMinutes: minutes(0),
            remainingEstimateMinutes: minutes(0),
            ageInStandups: 1,
            unplanned: false
          }
        ]
      },
      {
        bucket: 'in_progress',
        rows: [
          {
            allocationId: 'a2',
            taskId: 't2',
            taskKey: 'KAN-2',
            title: 'Open thing',
            memberId: 'u1',
            memberName: 'Amal',
            previousStatus: 'in_progress',
            currentStatus: 'in_progress',
            plannedMinutes: minutes(180),
            loggedMinutes: minutes(240),
            dayVarianceMinutes: minutes(60),
            remainingEstimateMinutes: minutes(60),
            ageInStandups: 2,
            unplanned: false
          }
        ]
      },
      { bucket: 'not_started', rows: [] },
      { bucket: 'blocked', rows: [] }
    ],
    addedAfterCompletion: [],
    computedAt: '2026-09-11T00:00:00.000Z',
    ...overrides
  }
}

function varianceRow(overrides: Partial<VarianceRow> = {}): VarianceRow {
  return {
    allocationId: 'a2',
    outcome: 'open_over_consumed',
    dayVarianceMinutes: minutes(60),
    taskVarianceMinutes: minutes(60),
    overrunMinutes: minutes(60),
    creditMinutes: minutes(0),
    remainingAfterMinutes: minutes(60),
    requiresRevision: true,
    requiresReason: false,
    warnsNoTimeLogged: false,
    sharedContribution: false,
    reassigned: false,
    taskId: 't2',
    taskKey: 'KAN-2',
    title: 'Open thing',
    memberId: 'u1',
    memberName: 'Amal',
    plannedMinutes: minutes(180),
    loggedMinutesOnDay: minutes(240),
    originalEstimateMinutes: minutes(180),
    totalLoggedMinutesOnTask: minutes(240),
    remainingBeforeMinutes: minutes(60),
    spillChainLength: 1,
    chronicSpill: false,
    explanation: 'You logged 4.0h against a 3.0h plan on KAN-2, 1.0h over.',
    ...overrides
  }
}

describe('YesterdaySection', () => {
  it('shows the header count derived from the panel (R1)', () => {
    render(
      <YesterdaySection
        standupId="s1"
        memberId="u1"
        panel={panel()}
        readOnly={false}
        api={{ updateYesterdayRow: jest.fn() }}
        expectedVersion={1}
        onVersionChange={jest.fn()}
      />
    )
    expect(screen.getByText(/yesterday/i)).toBeInTheDocument()
    expect(screen.getByText(/1 of 2 done/i)).toBeInTheDocument()
  })

  it('only shows rows belonging to this member', () => {
    render(
      <YesterdaySection
        standupId="s1"
        memberId="u1"
        panel={panel({
          buckets: [
            { bucket: 'completed', rows: [] },
            {
              bucket: 'in_progress',
              rows: [
                {
                  allocationId: 'a3',
                  taskId: 't3',
                  taskKey: 'KAN-3',
                  title: 'Someone else’s task',
                  memberId: 'u2',
                  memberName: 'Someone Else',
                  previousStatus: 'in_progress',
                  currentStatus: 'in_progress',
                  plannedMinutes: minutes(60),
                  loggedMinutes: minutes(60),
                  dayVarianceMinutes: minutes(0),
                  remainingEstimateMinutes: minutes(0),
                  ageInStandups: 1,
                  unplanned: false
                }
              ]
            },
            { bucket: 'not_started', rows: [] },
            { bucket: 'blocked', rows: [] }
          ]
        })}
        readOnly={false}
        api={{ updateYesterdayRow: jest.fn() }}
        expectedVersion={1}
        onVersionChange={jest.fn()}
      />
    )
    expect(screen.queryByText('KAN-3')).not.toBeInTheDocument()
  })

  it('calls updateYesterdayRow with the new status when changed', async () => {
    const updateYesterdayRow = jest.fn().mockResolvedValue({ standupVersion: 2, panel: panel() })
    const onVersionChange = jest.fn()
    render(
      <YesterdaySection
        standupId="s1"
        memberId="u1"
        panel={panel()}
        readOnly={false}
        api={{ updateYesterdayRow }}
        expectedVersion={1}
        onVersionChange={onVersionChange}
      />
    )
    fireEvent.change(screen.getByLabelText(/status for KAN-2/i), { target: { value: 'done' } })
    await waitFor(() =>
      expect(updateYesterdayRow).toHaveBeenCalledWith(
        expect.objectContaining({ taskId: 't2', status: 'done', expectedVersion: 1 })
      )
    )
    expect(onVersionChange).toHaveBeenCalledWith(2)
  })

  it('disables every control when readOnly', () => {
    render(
      <YesterdaySection
        standupId="s1"
        memberId="u1"
        panel={panel()}
        readOnly
        api={{ updateYesterdayRow: jest.fn() }}
        expectedVersion={1}
        onVersionChange={jest.fn()}
      />
    )
    expect(screen.getByLabelText(/status for KAN-2/i)).toBeDisabled()
  })

  it('renders the server-supplied explanation sentence when variance data is available', () => {
    render(
      <YesterdaySection
        standupId="s1"
        memberId="u1"
        panel={panel()}
        varianceRows={[varianceRow()]}
        readOnly={false}
        api={{ updateYesterdayRow: jest.fn() }}
        expectedVersion={1}
        onVersionChange={jest.fn()}
      />
    )
    expect(screen.getByText(/you logged 4\.0h against a 3\.0h plan/i)).toBeInTheDocument()
  })

  it('shows a chronic-spill badge for a task carried 3 or more stand-ups', () => {
    render(
      <YesterdaySection
        standupId="s1"
        memberId="u1"
        panel={panel()}
        varianceRows={[varianceRow({ spillChainLength: 3, chronicSpill: true, explanation: 'On track.' })]}
        readOnly={false}
        api={{ updateYesterdayRow: jest.fn() }}
        expectedVersion={1}
        onVersionChange={jest.fn()}
      />
    )
    expect(screen.getByText(/carried 3 stand-ups/i)).toBeInTheDocument()
  })

  it('says so plainly when there is no previous stand-up', () => {
    render(
      <YesterdaySection
        standupId="s1"
        memberId="u1"
        panel={panel({ previousStandupId: undefined, previousStandupDate: undefined, buckets: [] })}
        readOnly={false}
        api={{ updateYesterdayRow: jest.fn() }}
        expectedVersion={1}
        onVersionChange={jest.fn()}
      />
    )
    expect(screen.getByText(/nothing to review yet/i)).toBeInTheDocument()
  })

  it('renders its own failure state without throwing when panel is undefined', () => {
    render(
      <YesterdaySection
        standupId="s1"
        memberId="u1"
        panel={undefined}
        readOnly={false}
        api={{ updateYesterdayRow: jest.fn() }}
        expectedVersion={1}
        onVersionChange={jest.fn()}
      />
    )
    expect(screen.getByText(/could not load this section/i)).toBeInTheDocument()
  })
})
