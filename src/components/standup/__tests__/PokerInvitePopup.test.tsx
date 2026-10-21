/**
 * @jest-environment jsdom
 */
/**
 * The "Sprint 7 is being estimated" popup: shown for rounds the user was invited
 * to (live via the bus, or recovered from `open-for-me`), gone once they visit
 * that sprint's planning page, the round ends, or they dismiss it.
 */
import { act, render, screen, waitFor } from '@testing-library/react'

import { PokerInvitePopup } from '../PokerInvitePopup'
import {
  publishNotificationStreamConnected,
  publishPokerInviteEvent
} from '@/lib/poker-invite-bus'

let mockPathname = '/dashboard'
jest.mock('next/navigation', () => ({
  usePathname: () => mockPathname
}))

const open = { sessionId: 's1', sprintId: 'sp1', sprintName: 'Sprint 7', projectName: 'Kanvaro' }

function mockOpenForMe(sessions: unknown[]) {
  global.fetch = jest.fn(() =>
    Promise.resolve({ ok: true, json: () => Promise.resolve({ data: { sessions } }) })
  ) as any
}

describe('PokerInvitePopup', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    mockPathname = '/dashboard'
    window.localStorage.clear()
    publishNotificationStreamConnected(true)
  })

  afterEach(() => {
    global.fetch = originalFetch
    publishNotificationStreamConnected(false)
  })

  it('shows a round the user was invited to when they load the app (offline at invite time)', async () => {
    mockOpenForMe([open])
    render(<PokerInvitePopup />)

    expect(await screen.findByText('Sprint 7 is being estimated')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Go to planning' })).toHaveAttribute(
      'href',
      '/sprints/sp1/planning'
    )
  })

  it('shows a live invite and removes it when the round closes', async () => {
    mockOpenForMe([])
    render(<PokerInvitePopup />)
    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    expect(screen.queryByText('Sprint 7 is being estimated')).not.toBeInTheDocument()

    act(() =>
      publishPokerInviteEvent({
        type: 'poker_invite',
        data: { sessionId: 's1', sprintId: 'sp1', sprintName: 'Sprint 7' }
      })
    )
    expect(await screen.findByText('Sprint 7 is being estimated')).toBeInTheDocument()

    act(() => publishPokerInviteEvent({ type: 'poker_closed', data: { sessionId: 's1' } }))
    await waitFor(() =>
      expect(screen.queryByText('Sprint 7 is being estimated')).not.toBeInTheDocument()
    )
  })

  it('is hidden on that sprint planning page and stays dismissed after leaving it', async () => {
    mockOpenForMe([open])
    mockPathname = '/sprints/sp1/planning'
    const { rerender } = render(<PokerInvitePopup />)

    // Visiting the page is recorded as the acknowledgement once the invite is
    // known; wait for that rather than for the fetch merely being issued.
    await waitFor(() =>
      expect(window.localStorage.getItem('kanvaro:poker-invite-dismissed')).toContain('s1')
    )
    expect(screen.queryByText('Sprint 7 is being estimated')).not.toBeInTheDocument()

    mockPathname = '/dashboard'
    rerender(<PokerInvitePopup />)
    expect(screen.queryByText('Sprint 7 is being estimated')).not.toBeInTheDocument()
  })

  it('shows only one notification even when several rounds are open', async () => {
    mockOpenForMe([
      open,
      { sessionId: 's2', sprintId: 'sp2', sprintName: 'Sprint 8', projectName: 'Other' }
    ])
    render(<PokerInvitePopup />)

    expect(await screen.findByText('Sprint 7 is being estimated')).toBeInTheDocument()
    expect(screen.getAllByRole('alert')).toHaveLength(1)
    expect(screen.queryByText('Sprint 8 is being estimated')).not.toBeInTheDocument()
  })

  it('does not come back after being dismissed, even on a reload or a refocus', async () => {
    mockOpenForMe([open])
    const first = render(<PokerInvitePopup />)

    const dismiss = await screen.findByRole('button', { name: 'Dismiss' })
    act(() => dismiss.click())
    expect(screen.queryByText('Sprint 7 is being estimated')).not.toBeInTheDocument()
    first.unmount()

    // A fresh mount (page reload / new tab) still sees the round as open on the
    // server, but remembers it was already dealt with.
    render(<PokerInvitePopup />)
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2))
    expect(screen.queryByText('Sprint 7 is being estimated')).not.toBeInTheDocument()

    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(screen.queryByText('Sprint 7 is being estimated')).not.toBeInTheDocument()
  })

  it('can be dismissed', async () => {
    mockOpenForMe([open])
    render(<PokerInvitePopup />)

    const dismiss = await screen.findByRole('button', { name: 'Dismiss' })
    act(() => dismiss.click())

    expect(screen.queryByText('Sprint 7 is being estimated')).not.toBeInTheDocument()
  })
})
