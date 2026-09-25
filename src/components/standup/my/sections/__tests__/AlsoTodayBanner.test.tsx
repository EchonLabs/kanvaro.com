/**
 * @jest-environment jsdom
 */
import { fireEvent, render, screen } from '@testing-library/react'
import { AlsoTodayBanner } from '../AlsoTodayBanner'

describe('AlsoTodayBanner', () => {
  it('renders nothing when there are no other stand-ups', () => {
    const { container } = render(<AlsoTodayBanner candidates={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows a "View Stand-ups" button instead of listing stand-ups up front', () => {
    render(
      <AlsoTodayBanner
        candidates={[
          {
            standupId: 's2',
            status: 'Ready',
            scheduledStartAt: '2026-09-11T09:00:00.000Z',
            projectId: 'p2',
            projectName: 'Project Beta'
          }
        ]}
      />
    )
    expect(screen.getByRole('button', { name: 'View Stand-ups' })).toBeInTheDocument()
    expect(screen.queryByText(/project beta/i)).not.toBeInTheDocument()
  })

  it('reveals each other stand-up by project name, linking to it, once the button is pressed', () => {
    render(
      <AlsoTodayBanner
        candidates={[
          {
            standupId: 's2',
            status: 'Ready',
            scheduledStartAt: '2026-09-11T09:00:00.000Z',
            projectId: 'p2',
            projectName: 'Project Beta'
          }
        ]}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'View Stand-ups' }))

    expect(screen.getByText(/project beta/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /project beta/i })).toHaveAttribute(
      'href',
      '/my/standup/s2'
    )
  })
})
