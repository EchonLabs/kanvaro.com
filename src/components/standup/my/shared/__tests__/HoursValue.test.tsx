/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import { HoursValue } from '../HoursValue'
import { minutes } from '@/lib/standup/minutes'

describe('HoursValue', () => {
  it('renders the formatted hours', () => {
    render(<HoursValue minutes={minutes(120)} />)
    expect(screen.getByText('2.0h')).toBeInTheDocument()
  })

  it('announces the value with a unit for screen readers (NFR-A4)', () => {
    // `describeMinutes` drops the decimal for a whole number of hours ("2
    // hours", not "2.0 hours") — the displayed text still shows "2.0h" via
    // `formatMinutesAsHours`, but the two formatters intentionally diverge.
    render(<HoursValue minutes={minutes(120)} label="Planned" />)
    expect(screen.getByLabelText(/planned 2 hours/i)).toBeInTheDocument()
  })

  it('announces a fractional value with its decimal (NFR-A4)', () => {
    render(<HoursValue minutes={minutes(90)} label="Planned" />)
    expect(screen.getByLabelText(/planned 1\.5 hours/i)).toBeInTheDocument()
  })

  it('renders a sign when signed and the value is positive', () => {
    render(<HoursValue minutes={minutes(120)} signed />)
    expect(screen.getByText('+2.0h')).toBeInTheDocument()
  })
})
