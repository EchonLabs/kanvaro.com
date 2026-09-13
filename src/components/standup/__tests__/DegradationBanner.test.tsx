/**
 * @jest-environment jsdom
 */
import { fireEvent, render, screen } from '@testing-library/react'

import { DegradationBanner } from '@/components/standup/DegradationBanner'
import type { Degradation } from '@/lib/standup/degradation'

const degradation = (over: Partial<Degradation> = {}): Degradation => ({
  code: 'SCHEDULER_STALE',
  severity: 'warning',
  message: 'Stand-ups are not being promoted automatically.',
  detectedAt: new Date(),
  ...over
})

describe('DegradationBanner', () => {
  it('renders nothing when there is nothing wrong', () => {
    const { container } = render(<DegradationBanner degradations={[]} />)

    expect(container).toBeEmptyDOMElement()
  })

  it('shows the message and its action link', () => {
    render(
      <DegradationBanner
        degradations={[degradation({ action: { label: 'How to fix this', href: '/docs/x' } })]}
      />
    )

    expect(screen.getByText(/not being promoted automatically/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'How to fix this' })).toHaveAttribute('href', '/docs/x')
  })

  it('makes a blocking notice non-dismissible and an alert', () => {
    render(<DegradationBanner degradations={[degradation({ severity: 'blocking' })]} />)

    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /dismiss/i })).not.toBeInTheDocument()
  })

  it('lets a warning be dismissed', () => {
    render(<DegradationBanner degradations={[degradation({ severity: 'warning' })]} />)

    expect(screen.getByRole('button', { name: /dismiss/i })).toBeInTheDocument()
  })

  it('orders blocking before warning, and puts info behind a collapsed summary', () => {
    render(
      <DegradationBanner
        degradations={[
          degradation({
            code: 'CRON_ROUTES_UNAUTHENTICATED',
            severity: 'info',
            message: 'Info one.'
          }),
          degradation({
            code: 'COMPLETION_INTERRUPTED',
            severity: 'blocking',
            message: 'Blocking one.'
          })
        ]}
      />
    )

    // The blocking notice is prominent immediately; the info one is not — a
    // standing configuration note doesn't earn a full-width row every day.
    expect(screen.getByText('Blocking one.')).toBeInTheDocument()
    expect(screen.queryByText('Info one.')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /1 configuration notice/i }))
    expect(screen.getByText('Info one.')).toBeInTheDocument()
  })
})
