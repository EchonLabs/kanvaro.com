/**
 * @jest-environment jsdom
 */
/**
 * PokerModal over SSE, with polling as the fallback.
 *
 * The stream only says *when* to re-read the session; `sync()` still derives
 * all state. These tests pin that contract: a signal triggers a re-read, the
 * 4s poll slows to a safety net while connected and comes back when the stream
 * drops, and a card already cast is restored when the modal is reopened.
 */
import { act, render, screen, waitFor } from '@testing-library/react'

import { PokerModal } from '../PokerModal'
import { ToastProvider } from '@/components/ui/Toast'

class FakeEventSource {
  static instances: FakeEventSource[] = []
  onopen: (() => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  onerror: (() => void) | null = null
  closed = false

  constructor(public url: string) {
    FakeEventSource.instances.push(this)
  }

  close() {
    this.closed = true
  }

  open() {
    this.onopen?.()
  }

  emit(message: Record<string, unknown>) {
    this.onmessage?.({ data: JSON.stringify(message) })
  }
}

const queue = [{ taskId: 't1', key: 'KAN-1', title: 'Invoice model', status: 'voting' }]

function sessionPayload(extra: Record<string, unknown> = {}) {
  return {
    session: {
      queue: [{ task: 't1', status: 'voting', roundCount: 1 }],
      currentTask: 't1',
      status: 'open',
      ...extra
    }
  }
}

function jsonResponse(data: unknown) {
  return Promise.resolve({ ok: true, json: () => Promise.resolve({ data }) }) as any
}

function renderModal(props: Partial<React.ComponentProps<typeof PokerModal>> = {}) {
  return render(
    <ToastProvider>
      <PokerModal
        open
        onOpenChange={jest.fn()}
        sessionId="session-1"
        cards={[1, 2, 3, 5, 8]}
        queue={queue}
        currentTaskId="t1"
        isFacilitator={false}
        isParticipant
        pointsToHours={1}
        estimationUnit="story_points"
        onEstimated={jest.fn()}
        {...props}
      />
    </ToastProvider>
  )
}

describe('PokerModal — SSE with polling fallback', () => {
  const originalFetch = global.fetch
  const originalEventSource = (global as any).EventSource
  let sessionFetches: () => number
  let setIntervalSpy: jest.SpyInstance

  beforeEach(() => {
    FakeEventSource.instances = []
    ;(global as any).EventSource = FakeEventSource
    setIntervalSpy = jest.spyOn(global, 'setInterval')
  })

  afterEach(() => {
    global.fetch = originalFetch
    ;(global as any).EventSource = originalEventSource
    setIntervalSpy.mockRestore()
    jest.clearAllMocks()
  })

  function mockFetch(session: Record<string, unknown> = sessionPayload()) {
    const fetchMock = jest.fn((url: string) => {
      if (url.endsWith('/reveal-state')) return jsonResponse({ revealed: false })
      if (url === '/api/poker-sessions/session-1') return jsonResponse(session)
      throw new Error(`Unexpected fetch: ${url}`)
    })
    global.fetch = fetchMock as any
    sessionFetches = () =>
      fetchMock.mock.calls.filter(([url]) => url === '/api/poker-sessions/session-1').length
    return fetchMock
  }

  const pollDelays = () =>
    setIntervalSpy.mock.calls.map(([, delay]) => delay).filter((delay) => delay === 4000 || delay === 30000)

  it('opens the session stream while the modal is open and closes it with the modal', async () => {
    mockFetch()
    const { unmount } = renderModal()

    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1))
    expect(FakeEventSource.instances[0].url).toBe('/api/poker-sessions/session-1/stream')

    unmount()
    expect(FakeEventSource.instances[0].closed).toBe(true)
  })

  it('re-reads the session when the stream signals a change, without waiting for the poll', async () => {
    mockFetch()
    renderModal()
    await waitFor(() => expect(sessionFetches()).toBe(1))

    const source = FakeEventSource.instances[0]
    act(() => source.open())
    // Connected: the stream's own `connected` message triggers a catch-up read.
    act(() => source.emit({ type: 'connected' }))
    await waitFor(() => expect(sessionFetches()).toBeGreaterThanOrEqual(2))

    const before = sessionFetches()
    act(() => source.emit({ type: 'poker_changed', reason: 'vote', taskId: 't1', round: 1 }))
    await waitFor(() => expect(sessionFetches()).toBeGreaterThan(before))
  })

  it('polls every 4s until connected, drops to the 30s safety net, and goes back to 4s when the stream fails', async () => {
    mockFetch()
    renderModal()
    await waitFor(() => expect(pollDelays()).toContain(4000))

    const source = FakeEventSource.instances[0]
    act(() => source.open())
    await waitFor(() => expect(pollDelays()).toContain(30000))

    setIntervalSpy.mockClear()
    act(() => source.onerror?.())
    await waitFor(() => expect(pollDelays()).toContain(4000))
  })

  it('keeps polling as before when EventSource is unavailable', async () => {
    delete (global as any).EventSource
    mockFetch()
    renderModal()

    await waitFor(() => expect(sessionFetches()).toBe(1))
    expect(FakeEventSource.instances).toHaveLength(0)
    expect(pollDelays()).toEqual([4000])
  })

  it('restores the card this viewer already cast when the modal is reopened', async () => {
    mockFetch(sessionPayload({ myVote: { taskId: 't1', round: 1, card: '5' } }))
    renderModal()

    // `selected` is only non-null once a vote exists; the button then offers an update.
    await waitFor(() => expect(screen.getByText('Update vote')).toBeInTheDocument())
  })

  it('does not stream a session that has already closed', async () => {
    mockFetch(sessionPayload({ status: 'completed' }))
    renderModal()

    await waitFor(() => expect(sessionFetches()).toBeGreaterThanOrEqual(1))
    await waitFor(() => expect(FakeEventSource.instances.every((source) => source.closed)).toBe(true))
  })
})
