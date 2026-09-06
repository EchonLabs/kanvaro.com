/**
 * @jest-environment jsdom
 */
/**
 * The Schedule hub list (spec §15.6, UI-8, UI-9).
 *
 * Two behaviours here are requirements rather than styling choices, and both
 * are the kind that quietly regress into a filter:
 *
 * UI-8 — today's row is pinned and dominant. A PM opening this screen at 08:55
 * should not have to find the row.
 * UI-9 — skipped days stay visible *with their reason*. Hiding them makes a
 * sprint that lost a day to a holiday indistinguishable from a shorter sprint.
 */
import { render, screen, within } from '@testing-library/react'

import { StandupSchedule } from '@/components/standup/StandupSchedule'
import type { ScheduleDay, SprintSchedule } from '@/lib/standup/schedule'

const day = (over: Partial<ScheduleDay> = {}): ScheduleDay => ({
  standupId: `standup-${over.date ?? '2026-08-10'}`,
  date: '2026-08-10',
  status: 'Scheduled',
  shape: 'mid_sprint',
  sprintDayNumber: 1,
  totalSprintDays: 5,
  scheduledStartAt: '2026-08-10T03:30:00.000Z',
  durationMinutes: 15,
  facilitatorId: 'user-1',
  expectedAttendeeIds: ['member-1'],
  wasBackfilled: false,
  hasCalendarAnomaly: false,
  ...over
})

const schedule = (over: Partial<SprintSchedule> = {}): SprintSchedule => ({
  sprintId: 'sprint-1',
  sprintName: 'Sprint 14',
  projectId: 'project-1',
  timezone: 'Asia/Colombo',
  today: '2026-08-11',
  dateRange: { from: '2026-08-10', to: '2026-08-14' },
  totalSprintDays: 5,
  days: [
    day({ date: '2026-08-10', sprintDayNumber: 1, shape: 'day_one', status: 'Completed' }),
    day({ date: '2026-08-11', sprintDayNumber: 2, status: 'Ready' }),
    day({
      date: '2026-08-12',
      sprintDayNumber: 3,
      status: 'Skipped_Holiday',
      skippedReason: 'Nikini Full Moon Poya Day'
    }),
    day({ date: '2026-08-13', sprintDayNumber: 4 }),
    day({ date: '2026-08-14', sprintDayNumber: 5, shape: 'final_day' })
  ],
  ...over
})

describe('StandupSchedule', () => {
  it('lists every day of the sprint', () => {
    render(<StandupSchedule schedule={schedule()} />)

    // Today is lifted out of the list into its own row (UI-8), so the count
    // spans both testids.
    expect(screen.getAllByTestId(/^schedule-(day|today)$/)).toHaveLength(5)
  })

  it('UI-8: marks today`s row as the pinned one', () => {
    render(<StandupSchedule schedule={schedule()} />)

    const today = screen.getByTestId('schedule-today')
    expect(within(today).getByText(/11 Aug/i)).toBeInTheDocument()
    expect(today).toHaveAttribute('data-today', 'true')
  })

  it('UI-8: pins nothing when today falls outside the sprint', () => {
    render(<StandupSchedule schedule={schedule({ today: '2026-09-01' })} />)

    expect(screen.queryByTestId('schedule-today')).not.toBeInTheDocument()
    expect(screen.getAllByTestId('schedule-day')).toHaveLength(5)
  })

  it('UI-9: shows a skipped day and its reason rather than hiding it', () => {
    render(<StandupSchedule schedule={schedule()} />)

    expect(screen.getByText('Nikini Full Moon Poya Day')).toBeInTheDocument()
  })

  it('UI-9: a skipped day is not a link — there is nothing to open', () => {
    render(<StandupSchedule schedule={schedule()} />)

    const links = screen.getAllByRole('link')
    expect(links.map((link) => link.getAttribute('href'))).not.toContain(
      '/standups/standup-2026-08-12'
    )
  })

  it('names day one and the final day', () => {
    render(<StandupSchedule schedule={schedule()} />)

    expect(screen.getByText(/day one/i)).toBeInTheDocument()
    expect(screen.getByText(/final day/i)).toBeInTheDocument()
  })

  it('shows the frozen day number on a completed stand-up whose schedule moved (CAL-14)', () => {
    render(
      <StandupSchedule
        schedule={schedule({
          days: [day({ date: '2026-08-10', sprintDayNumber: 1, displayedDayNumber: 3, status: 'Completed' })]
        })}
      />
    )

    expect(screen.getByText(/ran as day 3/i)).toBeInTheDocument()
  })

  it('says so plainly when a sprint has no schedule yet', () => {
    render(<StandupSchedule schedule={schedule({ days: [], totalSprintDays: 0 })} />)

    expect(screen.getByText(/no stand-ups have been generated/i)).toBeInTheDocument()
  })
})
