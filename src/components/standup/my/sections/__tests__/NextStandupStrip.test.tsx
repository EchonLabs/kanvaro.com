/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import { NextStandupStrip } from '../NextStandupStrip'

describe('NextStandupStrip', () => {
  it('shows the join link when a meeting URL is configured', () => {
    render(
      <NextStandupStrip
        status="Ready"
        scheduledStartAt="2026-09-11T03:30:00.000Z"
        durationMinutes={15}
        meetingUrl="https://meet.example/kanvaro"
      />
    )
    expect(screen.getByRole('link', { name: /join/i })).toHaveAttribute(
      'href',
      'https://meet.example/kanvaro'
    )
  })

  it('hides the join link when no meeting URL is set', () => {
    render(<NextStandupStrip status="Ready" durationMinutes={15} />)
    expect(screen.queryByRole('link', { name: /join/i })).not.toBeInTheDocument()
  })

  it('shows the day ordinal when present', () => {
    render(<NextStandupStrip status="Ready" sprintDayNumber={4} totalSprintDays={10} />)
    expect(screen.getByText(/day 4 of 10/i)).toBeInTheDocument()
  })
})
