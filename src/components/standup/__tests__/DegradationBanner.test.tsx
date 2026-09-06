/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react'

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

  it('orders blocking before warning before info', () => {
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

    const messages = screen.getAllByTestId('degradation-message').map((n) => n.textContent)
    expect(messages).toEqual(['Blocking one.', 'Info one.'])
  })
})
