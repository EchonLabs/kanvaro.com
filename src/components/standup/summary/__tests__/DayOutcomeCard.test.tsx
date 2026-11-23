/**
 * @jest-environment jsdom
 */
/**
 * The "How the day went" section. The record is frozen at the start of the
 * day, so this section is the one place the day's result appears, written
 * back by the next stand-up.
 */
import { render, screen } from '@testing-library/react'

import { DayOutcomeCard } from '@/components/standup/summary/DayOutcomeCard'
import type { DayOutcome } from '@/components/standup/summary/types'
import { standupStrings } from '@/lib/standup/strings'

const s = standupStrings.summary

const outcome: DayOutcome = {
  recordedAt: '2026-08-18T04:00:00.000Z',
  recordedByStandup: 'standup-2',
  recordedByStandupDate: '2026-08-18',
  completedTasks: [{ taskId: 't1', taskKey: 'KAN-1', title: 'Login page' }],
  varianceTable: [],
  memberTotals: [
    { memberId: 'm1', name: 'Nadeesha', plannedMinutes: 240, loggedMinutesOnDay: 270, dayVarianceMinutes: 30 }
  ]
}

describe('DayOutcomeCard', () => {
  it('says the outcome is pending before the next stand-up has run', () => {
    render(<DayOutcomeCard isFinalDay={false} />)
    expect(screen.getByText(s.sectionDayOutcome())).toBeInTheDocument()
    expect(screen.getByText(s.dayOutcomePending())).toBeInTheDocument()
  })

  it('explains the gap on the final day instead of promising a later record', () => {
    render(<DayOutcomeCard isFinalDay />)
    expect(screen.getByText(s.dayOutcomeFinalDay())).toBeInTheDocument()
    expect(screen.queryByText(s.dayOutcomePending())).not.toBeInTheDocument()
  })

  it('shows planned vs logged per member and the tasks completed once recorded', () => {
    render(<DayOutcomeCard outcome={outcome} isFinalDay={false} />)

    expect(screen.getAllByTestId('day-outcome-row')).toHaveLength(1)
    expect(screen.getByText('Nadeesha')).toBeInTheDocument()
    expect(screen.getByText(s.dayOutcomeCompleted({ count: 1 }))).toBeInTheDocument()
    expect(screen.getByTestId('day-outcome-completed-row')).toHaveTextContent('KAN-1')
    expect(screen.getByText(/Recorded at the/)).toBeInTheDocument()
  })

  it('says nothing was completed rather than leaving the list blank', () => {
    render(<DayOutcomeCard outcome={{ ...outcome, completedTasks: [] }} isFinalDay={false} />)
    expect(screen.getByText(s.dayOutcomeNothingCompleted())).toBeInTheDocument()
  })
})
