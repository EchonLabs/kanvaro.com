/**
 * @jest-environment jsdom
 */
/**
 * Final-review fix wave, Critical 2 + Important 3.
 *
 * Critical 2 — a non-facilitator voter's local `reveal` state was only ever
 * set-if-null (`current ?? revealPayload.data`), so a re-vote on the same
 * task (which never changes `taskId`, only flips the queue entry back to
 * `voting` and bumps `roundCount`) left every non-facilitator staring at
 * round 1's stale spread forever, with no way to vote again — the card grid
 * renders under `{!reveal && ...}`.
 *
 * Important 3 — the reveal-state poll used a separately-computed
 * `visibleTaskId` (`session.currentTask ?? currentTaskId`, the stale prop),
 * rather than the local `taskId` the UI actually renders (resolved through
 * `resolveVisibleTask`'s own fallback logic), so it could fetch reveal state
 * for the wrong task entirely.
 */
import { render, screen, waitFor } from '@testing-library/react'

import { PokerModal } from '../PokerModal'
import { ToastProvider } from '@/components/ui/Toast'

function jsonResponse(data: unknown, ok = true) {
  return Promise.resolve({
    ok,
    json: () => Promise.resolve({ data })
  }) as any
}

const baseQueue = [{ taskId: 't1', key: 'KAN-1', title: 'Invoice model', status: 'voting' }]

const revealedRound1 = {
  revealed: true,
  round: 1,
  spread: 3,
  min: 2,
  max: 5,
  median: 3,
  unanimous: false,
  suggestedValue: 3,
  abstainCount: 0,
  votes: [{ voterId: 'u1', voterName: 'Kasun', card: 5, value: 5, isOutlier: true }]
}

function renderModal(props: Partial<React.ComponentProps<typeof PokerModal>> = {}) {
  const onEstimated = jest.fn()
  const onOpenChange = jest.fn()
  render(
    <ToastProvider>
      <PokerModal
        open
        onOpenChange={onOpenChange}
        sessionId="session-1"
        cards={[1, 2, 3, 5, 8, '?', 'coffee']}
        queue={baseQueue}
        currentTaskId="t1"
        isFacilitator={false}
        pointsToHours={1}
        estimationUnit="story_points"
        onEstimated={onEstimated}
        {...props}
      />
    </ToastProvider>
  )
  return { onEstimated, onOpenChange }
}

describe('PokerModal — non-facilitator reveal polling', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
    jest.clearAllMocks()
  })

  it('shows the reveal once the poll reports the current task revealed, fetching the task actually on screen (Important 3)', async () => {
    const fetchMock = jest.fn((url: string) => {
      if (url.includes('/api/poker-sessions/session-1/tasks/t1/reveal-state')) {
        return jsonResponse(revealedRound1)
      }
      if (url === '/api/poker-sessions/session-1') {
        return jsonResponse({
          session: {
            queue: baseQueue.map((entry) => ({ task: entry.taskId, status: 'revealed', roundCount: 1 })),
            currentTask: 't1',
            status: 'open'
          }
        })
      }
      throw new Error(`Unexpected fetch: ${url}`)
    })
    global.fetch = fetchMock as any

    renderModal()

    // Card grid first (nothing revealed yet).
    expect(screen.getByText('Your card')).toBeInTheDocument()

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      '/api/poker-sessions/session-1/tasks/t1/reveal-state'
    ))
    await waitFor(() => expect(screen.getByText('Votes')).toBeInTheDocument())

    // Fetched reveal-state for `t1` — the task the modal actually renders —
    // not some separately-computed id.
    expect(fetchMock).toHaveBeenCalledWith('/api/poker-sessions/session-1/tasks/t1/reveal-state')
  })

  it('clears a stale reveal and lets the voter vote again once a revote flips the poll back to unrevealed (Critical 2)', async () => {
    let revealed = true
    const fetchMock = jest.fn((url: string) => {
      if (url.includes('/reveal-state')) {
        return revealed ? jsonResponse(revealedRound1) : jsonResponse({ revealed: false })
      }
      if (url === '/api/poker-sessions/session-1') {
        return jsonResponse({
          session: {
            queue: baseQueue.map((entry) => ({
              task: entry.taskId,
              status: revealed ? 'revealed' : 'voting',
              roundCount: revealed ? 1 : 2
            })),
            currentTask: 't1',
            status: 'open'
          }
        })
      }
      throw new Error(`Unexpected fetch: ${url}`)
    })
    global.fetch = fetchMock as any

    renderModal()

    // Round 1: the voter sees the revealed spread, locked out of voting.
    await waitFor(() => expect(screen.getByText('Votes')).toBeInTheDocument())
    expect(screen.queryByText('Your card')).not.toBeInTheDocument()

    // The facilitator revotes: the server now reports the same task back in
    // `voting` with a bumped round, and reveal-state now says `revealed: false`.
    revealed = false

    // Real timers: the poll fires every 4s (`POLL_INTERVAL_MS`), so give
    // `waitFor` enough headroom to catch the next tick.
    await waitFor(() => expect(screen.getByText('Your card')).toBeInTheDocument(), {
      timeout: 6000,
      interval: 250
    })
    expect(screen.queryByText('Votes')).not.toBeInTheDocument()
  }, 10000)
})
