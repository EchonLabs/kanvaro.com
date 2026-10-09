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
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'

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
        cards={[1, 2, 3, 5, 8, 13, 21, '?', 'coffee']}
        queue={baseQueue}
        currentTaskId="t1"
        isFacilitator={false}
        isParticipant
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
    await waitFor(() => expect(screen.getByText('The table has spoken')).toBeInTheDocument())

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
    await waitFor(() => expect(screen.getByText('The table has spoken')).toBeInTheDocument())
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
    expect(screen.queryByText('The table has spoken')).not.toBeInTheDocument()
  }, 10000)
})

describe('PokerModal — viewer mode for non-participants (PLN-11)', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
    jest.clearAllMocks()
  })

  it('never shows the card grid to someone off the participant list, and never lets them cast a vote', async () => {
    const fetchMock = jest.fn((url: string) => {
      if (url.includes('/reveal-state')) return jsonResponse({ revealed: false })
      if (url === '/api/poker-sessions/session-1') {
        return jsonResponse({
          session: {
            queue: baseQueue.map((entry) => ({ task: entry.taskId, status: 'voting', roundCount: 1 })),
            currentTask: 't1',
            status: 'open',
            progress: { round: 1, voted: 1, expected: 2 }
          }
        })
      }
      throw new Error(`Unexpected fetch: ${url}`)
    })
    global.fetch = fetchMock as any

    renderModal({ isFacilitator: false, isParticipant: false })

    expect(screen.queryByText('Your card')).not.toBeInTheDocument()
    expect(screen.getByText('You are not part of this vote. Watching the round.')).toBeInTheDocument()

    // A watcher may see how far the round has got — those are counts, not
    // cards — but never the control that ends it.
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/poker-sessions/session-1'))
    expect(screen.queryByRole('button', { name: /Reveal/i })).not.toBeInTheDocument()
  })

  it('gives a facilitator who opted out of voting the Reveal control once the poll reports progress', async () => {
    const fetchMock = jest.fn((url: string) => {
      if (url.includes('/reveal-state')) return jsonResponse({ revealed: false })
      if (url === '/api/poker-sessions/session-1') {
        return jsonResponse({
          session: {
            queue: baseQueue.map((entry) => ({ task: entry.taskId, status: 'voting', roundCount: 1 })),
            currentTask: 't1',
            status: 'open',
            autoRevealOnAllVoted: false,
            progress: { round: 1, voted: 2, expected: 2 }
          }
        })
      }
      throw new Error(`Unexpected fetch: ${url}`)
    })
    global.fetch = fetchMock as any

    renderModal({ isFacilitator: true, isParticipant: false })

    expect(screen.queryByText('Your card')).not.toBeInTheDocument()
    expect(screen.getByText("You're facilitating this round without voting yourself.")).toBeInTheDocument()

    await waitFor(() => expect(screen.getByText('2 of 2 voted')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /Reveal/i })).toBeEnabled()
  })

  it('names the person the task is assigned to, without fetching anything extra', async () => {
    // The same task is a different size for different people — an intern
    // asking for more than a senior would is a legitimate estimate, not an
    // outlier — so the round has to say whose work is being sized.
    //
    // The name is prop-drilled from the planning workspace, which already has
    // it. That is load-bearing: this modal polls every four seconds, so a
    // fetch added here is another request per round per viewer, and the mock
    // below throws on any URL it does not recognise.
    const fetchMock = jest.fn((url: string) => {
      if (url.includes('/reveal-state')) return jsonResponse({ revealed: false })
      if (url === '/api/poker-sessions/session-1') {
        return jsonResponse({
          session: {
            queue: baseQueue.map((entry) => ({ task: entry.taskId, status: 'voting', roundCount: 1 })),
            currentTask: 't1',
            status: 'open',
            autoRevealOnAllVoted: false
          }
        })
      }
      throw new Error(`Unexpected fetch: ${url}`)
    })
    global.fetch = fetchMock as any

    renderModal({
      queue: [{ ...baseQueue[0], assigneeName: 'Kasun Perera' }]
    })

    expect(screen.getByText('Assigned to Kasun Perera')).toBeInTheDocument()

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/poker-sessions/session-1'))
    for (const [url] of fetchMock.mock.calls) {
      expect(url).toMatch(/^\/api\/poker-sessions\/session-1/)
    }
  })

  it('says nothing about an assignee when the queue entry has none', () => {
    // Keeps the line out of every other fixture's output: an unassigned task
    // should read as silent, not as "Assigned to undefined".
    global.fetch = jest.fn(() => jsonResponse({ revealed: false })) as any

    renderModal()

    expect(screen.queryByText(/^Assigned to/)).not.toBeInTheDocument()
  })
})

describe('PokerModal — task detail from the server', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
    jest.clearAllMocks()
  })

  function fetchMockWithTask(queueEntry: Record<string, unknown>) {
    return jest.fn((url: string) => {
      if (url.includes('/reveal-state')) return jsonResponse({ revealed: false })
      if (url === '/api/poker-sessions/session-1') {
        return jsonResponse({
          session: {
            queue: [{ task: 't1', status: 'voting', roundCount: 1, ...queueEntry }],
            currentTask: 't1',
            status: 'open',
            autoRevealOnAllVoted: false
          }
        })
      }
      throw new Error(`Unexpected fetch: ${url}`)
    })
  }

  it('names the task from the session even when the opener passed no title', async () => {
    // The regression: the queue is a snapshot the planning screen builds from
    // whatever it has in `scope` when the round opens, and it is never
    // rebuilt. A task missing from that snapshot rendered as "— Task" for the
    // whole round.
    global.fetch = fetchMockWithTask({
      title: 'Add SSO to the workspace',
      displayId: 'KAN-142',
      description: null
    }) as any

    render(
      <ToastProvider>
        <PokerModal
          open
          onOpenChange={jest.fn()}
          sessionId="session-1"
          cards={[1, 2, 3, 5, 8]}
          queue={[{ taskId: 't1', key: '', title: 'Task', status: 'voting' }]}
          currentTaskId="t1"
          isFacilitator={false}
          isParticipant
          pointsToHours={1}
          estimationUnit="story_points"
          onEstimated={jest.fn()}
        />
      </ToastProvider>
    )

    await waitFor(() =>
      expect(screen.getByText('KAN-142 — Add SSO to the workspace')).toBeInTheDocument()
    )
    expect(screen.queryByText('— Task')).not.toBeInTheDocument()
  })

  it('collapses the description by default and expands it on click', async () => {
    global.fetch = fetchMockWithTask({
      title: 'Add SSO',
      displayId: 'KAN-142',
      description: '<p>Supports SAML and OIDC.</p><ul><li>Okta</li></ul>'
    }) as any

    renderModal()

    const toggle = await screen.findByRole('button', { name: /Task description/i })
    // The section renders before the first poll lands, so it starts disabled
    // with nothing to show — wait for the description to arrive.
    await waitFor(() => expect(toggle).toBeEnabled())
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText(/Supports SAML/)).not.toBeInTheDocument()

    fireEvent.click(toggle)

    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    // HTML is flattened to text rather than injected as markup.
    expect(screen.getByText(/Supports SAML and OIDC\./)).toBeInTheDocument()
    expect(screen.getByText(/• Okta/)).toBeInTheDocument()
  })

  it('disables the toggle and says so when the task has no description', async () => {
    global.fetch = fetchMockWithTask({
      title: 'Add SSO',
      displayId: 'KAN-142',
      description: '   '
    }) as any

    renderModal()

    const toggle = await screen.findByRole('button', { name: /Task description/i })
    expect(toggle).toBeDisabled()
    expect(within(toggle).getByText('None')).toBeInTheDocument()
  })
})

describe('PokerModal — the roster panel', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
    jest.clearAllMocks()
  })

  function fetchMockWithRoster(session: Record<string, unknown>) {
    return jest.fn((url: string) => {
      if (url.includes('/reveal-state')) return jsonResponse({ revealed: false })
      if (url === '/api/poker-sessions/session-1') {
        return jsonResponse({
          session: {
            queue: baseQueue.map((entry) => ({ task: entry.taskId, status: 'voting', roundCount: 1 })),
            currentTask: 't1',
            status: 'open',
            autoRevealOnAllVoted: false,
            ...session
          }
        })
      }
      throw new Error(`Unexpected fetch: ${url}`)
    })
  }

  it('names every participant from the server, including a facilitator outside the project team', async () => {
    // The regression this guards: participant ids were matched against the
    // project roster the planning screen had loaded, which contains only
    // `project.teamMembers`. `resolveParticipants` always appends the
    // facilitator, so a PM facilitator fell through to a placeholder name and
    // appeared as an unidentified extra voter.
    global.fetch = fetchMockWithRoster({
      participants: ['u1', 'u2', 'pm'],
      participantProfiles: [
        { memberId: 'u1', name: 'Kasun Perera' },
        { memberId: 'u2', name: 'Maya Silva' },
        { memberId: 'pm', name: 'Dilini Fernando' }
      ],
      progress: { round: 1, voted: 1, expected: 3, votedVoterIds: ['u1'] }
    }) as any

    renderModal()

    await waitFor(() => expect(screen.getByText('Dilini Fernando')).toBeInTheDocument())
    expect(screen.getByText('Kasun Perera')).toBeInTheDocument()
    expect(screen.getByText('Maya Silva')).toBeInTheDocument()
    expect(screen.queryByText('Teammate')).not.toBeInTheDocument()
    expect(screen.getByText('3 voters')).toBeInTheDocument()
  })

  it('separates who has cast from who the round is still waiting on', async () => {
    global.fetch = fetchMockWithRoster({
      participants: ['u1', 'u2'],
      participantProfiles: [
        { memberId: 'u1', name: 'Kasun Perera' },
        { memberId: 'u2', name: 'Maya Silva' }
      ],
      progress: { round: 1, voted: 1, expected: 2, votedVoterIds: ['u1'] }
    }) as any

    renderModal()

    await waitFor(() => expect(screen.getByText('Voted')).toBeInTheDocument())
    expect(screen.getByText('Choosing…')).toBeInTheDocument()
    expect(screen.getByText('Waiting for Maya Silva to choose a card')).toBeInTheDocument()
  })

  it('names nobody when the round hides voter identity', async () => {
    // `hideVoterIdentity` returns no profiles at all — a named roster would
    // put back the identities the setting exists to withhold.
    global.fetch = fetchMockWithRoster({
      participants: ['u1', 'u2'],
      participantProfiles: [],
      progress: { round: 1, voted: 1, expected: 2, votedVoterIds: ['u1'] }
    }) as any

    renderModal()

    await waitFor(() =>
      expect(
        screen.getByText(
          '1 of 2 have voted. This round is anonymous, so voters are not named.'
        )
      ).toBeInTheDocument()
    )
    expect(screen.getByText('2 voters')).toBeInTheDocument()
  })
})

describe('PokerModal — explicit Confirm, no vote-on-pick', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
    jest.clearAllMocks()
  })

  function fetchMockFor(voteResponse: unknown) {
    return jest.fn((url: string, init?: RequestInit) => {
      if (url.includes('/vote')) return jsonResponse(voteResponse)
      if (url.includes('/reveal-state')) return jsonResponse({ revealed: false })
      if (url === '/api/poker-sessions/session-1') {
        return jsonResponse({
          session: {
            queue: baseQueue.map((entry) => ({ task: entry.taskId, status: 'voting', roundCount: 1 })),
            currentTask: 't1',
            status: 'open'
          }
        })
      }
      throw new Error(`Unexpected fetch: ${url} ${init?.body ?? ''}`)
    })
  }

  it('picking a card only stages a candidate — the vote endpoint is not called until Confirm', async () => {
    const fetchMock = fetchMockFor({ voted: 1, expected: 2, readyToReveal: false, autoReveal: true })
    global.fetch = fetchMock as any

    renderModal()

    fireEvent.click(screen.getByRole('option', { name: 'Card 21' }))
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/vote'))).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/poker-sessions/session-1/tasks/t1/vote',
        expect.objectContaining({ body: JSON.stringify({ card: 21 }) })
      )
    )
  })

  it('disables Confirm until a card is picked, and again once the pick matches the cast vote', async () => {
    const fetchMock = fetchMockFor({ voted: 1, expected: 2, readyToReveal: false, autoReveal: true })
    global.fetch = fetchMock as any

    renderModal()

    expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled()

    fireEvent.click(screen.getByRole('option', { name: 'Card 21' }))
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeEnabled()

    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))

    // Wait for the vote POST to actually resolve (not just for the button's
    // optimistic label/disabled state, which flips immediately on click,
    // before `busy` clears) — `progress` is only set once the response lands.
    await waitFor(() => expect(screen.getByText('1 of 2 voted')).toBeInTheDocument())

    // Once cast, the button relabels to "Update vote" (matching the current
    // pick), and stays disabled since nothing new has been picked since.
    expect(screen.getByRole('button', { name: 'Update vote' })).toBeDisabled()
  })

  it('relabels to "Update vote" and re-confirms after an already-cast vote is re-picked', async () => {
    const fetchMock = fetchMockFor({ voted: 1, expected: 2, readyToReveal: false, autoReveal: true })
    global.fetch = fetchMock as any

    renderModal()

    fireEvent.click(screen.getByRole('option', { name: 'Card 21' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    await waitFor(() => expect(screen.getByText('1 of 2 voted')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('option', { name: 'Card 13' }))
    const updateButton = screen.getByRole('button', { name: 'Update vote' })
    expect(updateButton).toBeEnabled()

    fireEvent.click(updateButton)

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/poker-sessions/session-1/tasks/t1/vote',
        expect.objectContaining({ body: JSON.stringify({ card: 13 }) })
      )
    )
  })

  it('shows the renamed title', () => {
    global.fetch = jest.fn(() => jsonResponse({ revealed: false })) as any

    renderModal()

    expect(screen.getByText("Let's Poker-Through it!")).toBeInTheDocument()
  })
})

describe('PokerModal — reveal layout (votes grid, median stat, quick-pick estimate)', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
    jest.clearAllMocks()
  })

  function fetchMockRevealed(isFacilitator: boolean) {
    return jest.fn((url: string) => {
      if (url.includes('/reveal-state')) return jsonResponse(revealedRound1)
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
  }

  it('shows min, median, and max as distinct stats once revealed', async () => {
    global.fetch = fetchMockRevealed(false) as any

    renderModal({ isFacilitator: false })

    await waitFor(() => expect(screen.getByText('The table has spoken')).toBeInTheDocument())

    expect(screen.getByTestId('poker-stat-min')).toHaveTextContent('2')
    expect(screen.getByTestId('poker-stat-median')).toHaveTextContent('3')
    expect(screen.getByTestId('poker-stat-max')).toHaveTextContent('5')
  })

  it('renders each revealed vote as its own tile naming the voter and their card', async () => {
    global.fetch = fetchMockRevealed(false) as any

    renderModal({ isFacilitator: false })

    await waitFor(() => expect(screen.getByText('The table has spoken')).toBeInTheDocument())

    const tile = screen.getByTestId('poker-vote-tile')
    expect(tile).toHaveTextContent('Kasun')
    expect(tile).toHaveTextContent('5')
    expect(tile).toHaveTextContent('Outlier')
  })

  it('sets the final estimate from the deck, and carries the pick into the footer action', async () => {
    // The redesign drops the free-text number field: every legal estimate is
    // a card on the deck, so the deck itself is the control. `suggestedValue`
    // (the median) arrives preselected.
    global.fetch = fetchMockRevealed(true) as any

    renderModal({ isFacilitator: true })

    await waitFor(() => expect(screen.getByText('The table has spoken')).toBeInTheDocument())

    expect(screen.getByRole('group', { name: 'Quick-pick estimate' })).toBeInTheDocument()

    // revealedRound1.suggestedValue is 3.
    const input = screen.getByLabelText('Final estimate') as HTMLInputElement
    await waitFor(() => expect(input.value).toBe('3'))
    expect(screen.getByRole('button', { name: '3' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Set estimate · 3 points' })).toBeEnabled()

    const chip = screen.getByRole('button', { name: '5' })
    expect(chip).toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(chip)

    expect(chip).toHaveAttribute('aria-pressed', 'true')
    expect(input.value).toBe('5')
    expect(screen.getByRole('button', { name: 'Set estimate · 5 points' })).toBeEnabled()
  })

  it('still accepts an off-deck estimate typed into the field (E16)', async () => {
    // The facilitator may set a value nobody voted — the deck is the usual
    // answer, not the only legal one.
    global.fetch = fetchMockRevealed(true) as any

    renderModal({ isFacilitator: true })

    await waitFor(() => expect(screen.getByText('The table has spoken')).toBeInTheDocument())

    const input = screen.getByLabelText('Final estimate') as HTMLInputElement
    fireEvent.change(input, { target: { value: '6.5' } })

    expect(input.value).toBe('6.5')
    // No deck chip claims it, and the footer action carries it regardless.
    expect(screen.getByRole('button', { name: '5' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Set estimate · 6.5 points' })).toBeEnabled()
  })
})

describe('PokerModal — Back/Next task preview', () => {
  const originalFetch = global.fetch
  const twoTaskQueue = [
    { taskId: 't1', key: 'KAN-1', title: 'Invoice model', status: 'voting' },
    { taskId: 't2', key: 'KAN-2', title: 'Payment webhook', status: 'pending' }
  ]

  afterEach(() => {
    global.fetch = originalFetch
    jest.clearAllMocks()
  })

  function fetchMockForQueue(currentTask: string) {
    return jest.fn((url: string) => {
      if (url.includes('/reveal-state')) return jsonResponse({ revealed: false })
      if (url === '/api/poker-sessions/session-1') {
        return jsonResponse({
          session: {
            queue: twoTaskQueue.map((entry) => ({
              task: entry.taskId,
              status: entry.taskId === currentTask ? 'voting' : 'pending',
              roundCount: 1
            })),
            currentTask,
            status: 'open'
          }
        })
      }
      throw new Error(`Unexpected fetch: ${url}`)
    })
  }

  it('Next pages to the next task read-only, without touching the live task or voting', async () => {
    global.fetch = fetchMockForQueue('t1') as any

    renderModal({ queue: twoTaskQueue })

    expect(screen.getByText('Task 1 of 2')).toBeInTheDocument()
    expect(screen.getByText('Your card')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /next task/i }))

    expect(screen.getByText('Task 2 of 2 (preview)')).toBeInTheDocument()
    expect(screen.queryByText('Your card')).not.toBeInTheDocument()
    // Named twice while previewing: once in the nav strip, once in the
    // read-only panel that replaces the arc.
    expect(screen.getAllByText('KAN-2 — Payment webhook').length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole('button', { name: /previous task/i }))
    expect(screen.getByText('Task 1 of 2')).toBeInTheDocument()
    expect(screen.getByText('Your card')).toBeInTheDocument()
  })

  it('disables Back at the first task and Next at the last task', () => {
    global.fetch = fetchMockForQueue('t1') as any

    renderModal({ queue: twoTaskQueue })

    expect(screen.getByRole('button', { name: /previous task/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /next task/i })).toBeEnabled()
  })

  it('drops a stale preview once the live task moves on', async () => {
    global.fetch = fetchMockForQueue('t1') as any

    renderModal({ queue: twoTaskQueue })

    fireEvent.click(screen.getByRole('button', { name: /next task/i }))
    expect(screen.getByText('Task 2 of 2 (preview)')).toBeInTheDocument()

    // The facilitator advances the round: the server now reports t2 as live.
    global.fetch = fetchMockForQueue('t2') as any

    await waitFor(() => expect(screen.getByText('Task 2 of 2')).toBeInTheDocument(), {
      timeout: 6000,
      interval: 250
    })
    expect(screen.queryByText('(preview)')).not.toBeInTheDocument()
  }, 10000)
})

describe('PokerModal — estimating in hours', () => {
  const originalFetch = global.fetch
  const hoursDeck = [0.5, 1, 2, 3, 4, 6, 8, 12, 16, 24, 40, '?', 'coffee']

  afterEach(() => {
    global.fetch = originalFetch
    jest.clearAllMocks()
  })

  function votingFetch() {
    return jest.fn((url: string, _init?: RequestInit) => {
      if (url.includes('/vote')) {
        return jsonResponse({ voted: 1, expected: 2, readyToReveal: false, autoReveal: true })
      }
      if (url.includes('/reveal-state')) return jsonResponse({ revealed: false })
      if (url === '/api/poker-sessions/session-1') {
        return jsonResponse({
          session: {
            queue: baseQueue.map((entry) => ({ task: entry.taskId, status: 'voting', roundCount: 1 })),
            currentTask: 't1',
            status: 'open'
          }
        })
      }
      throw new Error(`Unexpected fetch: ${url}`)
    })
  }

  const renderHours = (props: Partial<React.ComponentProps<typeof PokerModal>> = {}) =>
    renderModal({
      cards: hoursDeck,
      deckType: 'hours',
      estimationUnit: 'hours',
      // A factor that would visibly inflate the number if it were applied.
      pointsToHours: 4,
      ...props
    })

  const summary = () => screen.getByTestId('poker-candidate-summary')

  it('reads a 4 card as four hours, not sixteen', () => {
    global.fetch = votingFetch() as any
    renderHours()

    fireEvent.click(screen.getByRole('option', { name: 'Card 4' }))

    expect(summary()).toHaveTextContent(/^4 hours$/)
    expect(summary()).not.toHaveTextContent('16')
    expect(summary()).not.toHaveTextContent('≈')
  })

  it('reads a 6 card as six hours', () => {
    global.fetch = votingFetch() as any
    renderHours()

    fireEvent.click(screen.getByRole('option', { name: 'Card 6' }))

    expect(summary()).toHaveTextContent(/^6 hours$/)
  })

  it('reads a 1 card in the singular', () => {
    global.fetch = votingFetch() as any
    renderHours()

    fireEvent.click(screen.getByRole('option', { name: 'Card 1' }))

    expect(summary()).toHaveTextContent(/^1 hour$/)
  })

  it('offers ? and coffee on the hours deck', () => {
    global.fetch = votingFetch() as any
    renderHours()

    expect(screen.getByRole('option', { name: 'Unsure card' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Coffee break card' })).toBeInTheDocument()
  })

  it('says what ? means once picked, and casts it as a vote', async () => {
    const fetchMock = votingFetch()
    global.fetch = fetchMock as any
    renderHours()

    fireEvent.click(screen.getByRole('option', { name: 'Unsure card' }))
    expect(summary()).toHaveTextContent('Unsure')
    expect(summary()).not.toHaveTextContent('Not chosen yet')

    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/poker-sessions/session-1/tasks/t1/vote',
        expect.objectContaining({ body: JSON.stringify({ card: '?' }) })
      )
    )
  })

  it('says what coffee means once picked, and casts it as a vote', async () => {
    const fetchMock = votingFetch()
    global.fetch = fetchMock as any
    renderHours()

    fireEvent.click(screen.getByRole('option', { name: 'Coffee break card' }))
    expect(summary()).toHaveTextContent('Asking the room for a break')

    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/poker-sessions/session-1/tasks/t1/vote',
        expect.objectContaining({ body: JSON.stringify({ card: 'coffee' }) })
      )
    )
  })

  const hoursReveal = {
    revealed: true,
    round: 1,
    spread: 4,
    min: 4,
    max: 8,
    median: 6,
    unanimous: false,
    suggestedValue: 6,
    abstainCount: 2,
    votes: [
      { voterId: 'u1', voterName: 'Kasun', card: 4, value: 4, isOutlier: false },
      { voterId: 'u2', voterName: 'Maya', card: 8, value: 8, isOutlier: false },
      { voterId: 'u3', voterName: 'Iris', card: '?', value: null, isOutlier: false },
      { voterId: 'u4', voterName: 'Ravi', card: 'coffee', value: null, isOutlier: false }
    ]
  }

  function revealedFetch() {
    return jest.fn((url: string, _init?: RequestInit) => {
      if (url.includes('/finalize')) return jsonResponse({ nextTaskId: null })
      if (url.includes('/reveal-state')) return jsonResponse(hoursReveal)
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
  }

  it('preselects the 6h median and labels the action in hours, with no conversion', async () => {
    global.fetch = revealedFetch() as any
    renderHours({ isFacilitator: true })

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Set estimate · 6 hours' })).toBeEnabled()
    )
    expect(screen.getByRole('button', { name: '6' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByTestId('poker-final-conversion')).not.toBeInTheDocument()
  })

  it('sends the hours exactly as chosen when the estimate is set', async () => {
    const fetchMock = revealedFetch()
    global.fetch = fetchMock as any
    renderHours({ isFacilitator: true })

    const chip = await screen.findByRole('button', { name: '4' })
    fireEvent.click(chip)
    fireEvent.click(screen.getByRole('button', { name: 'Set estimate · 4 hours' }))

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/poker-sessions/session-1/tasks/t1/finalize',
        expect.objectContaining({ body: JSON.stringify({ finalValue: 4 }) })
      )
    )
  })

  it('names the unsure and break votes, and tells the room someone wants a break', async () => {
    global.fetch = revealedFetch() as any
    renderHours({ isFacilitator: true })

    await waitFor(() => expect(screen.getByText('The table has spoken')).toBeInTheDocument())

    const tiles = screen.getAllByTestId('poker-vote-tile')
    expect(tiles[2]).toHaveTextContent('Unsure')
    expect(tiles[3]).toHaveTextContent('Wants a break')
    expect(screen.getByTestId('poker-break-request')).toHaveTextContent('Ravi asked for a break.')
    expect(screen.getByText(/1 unsure/)).toBeInTheDocument()
  })

  it('keeps abstentions out of the numbers', async () => {
    global.fetch = revealedFetch() as any
    renderHours({ isFacilitator: true })

    await waitFor(() => expect(screen.getByText('The table has spoken')).toBeInTheDocument())

    expect(screen.getByTestId('poker-stat-min')).toHaveTextContent('4')
    expect(screen.getByTestId('poker-stat-median')).toHaveTextContent('6')
    expect(screen.getByTestId('poker-stat-max')).toHaveTextContent('8')
  })

  it('shows no break banner when nobody played coffee', async () => {
    global.fetch = jest.fn((url: string) => {
      if (url.includes('/reveal-state')) return jsonResponse(revealedRound1)
      return jsonResponse({
        session: {
          queue: baseQueue.map((entry) => ({ task: entry.taskId, status: 'revealed', roundCount: 1 })),
          currentTask: 't1',
          status: 'open'
        }
      })
    }) as any
    renderHours({ isFacilitator: true })

    await waitFor(() => expect(screen.getByText('The table has spoken')).toBeInTheDocument())
    expect(screen.queryByTestId('poker-break-request')).not.toBeInTheDocument()
  })
})

describe('PokerModal — estimating in story points', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('shows the points and what they convert to', () => {
    global.fetch = jest.fn(() => jsonResponse({ revealed: false })) as any
    renderModal({ pointsToHours: 4 })

    fireEvent.click(screen.getByRole('option', { name: 'Card 3' }))

    expect(screen.getByTestId('poker-candidate-summary')).toHaveTextContent(
      '3 points · ≈ 12 hours'
    )
  })
})

describe('PokerModal — the preselected final estimate belongs to one task and round', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
    jest.clearAllMocks()
  })

  const twoTasks = [
    { taskId: 't1', key: 'KAN-1', title: 'Invoice model', status: 'voting' },
    { taskId: 't2', key: 'KAN-2', title: 'Payment webhook', status: 'pending' }
  ]

  const nobodyVotedANumber = {
    revealed: true,
    round: 1,
    spread: null,
    min: null,
    max: null,
    median: null,
    unanimous: false,
    suggestedValue: null,
    abstainCount: 2,
    votes: [
      { voterId: 'u1', voterName: 'Kasun', card: '?', value: null, isOutlier: false },
      { voterId: 'u2', voterName: 'Maya', card: 'coffee', value: null, isOutlier: false }
    ]
  }

  it("never carries the previous task's estimate into a task nobody put a number on", async () => {
    // The live regression: setting task 1's estimate moved the round to task 2,
    // but a poll for task 1 already in flight landed afterwards and put task 1's
    // reveal — and its preselected 3 — back on screen. Task 2, where nobody
    // voted a number, then offered "Set estimate · 3" one click from saving.
    let current = 't1'
    let t1Polls = 0
    let releaseStaleT1: (() => void) | null = null

    global.fetch = jest.fn((url: string) => {
      if (url.endsWith('/tasks/t1/finalize')) {
        current = 't2'
        return jsonResponse({ nextTaskId: 't2' })
      }
      if (url.endsWith('/tasks/t1/reveal-state')) {
        t1Polls += 1
        if (t1Polls === 1) return jsonResponse(revealedRound1)
        // Every later poll for task 1 hangs until the test releases it.
        return new Promise((resolve) => {
          releaseStaleT1 = () => resolve({ ok: true, json: () => Promise.resolve({ data: revealedRound1 }) })
        })
      }
      if (url.endsWith('/tasks/t2/reveal-state')) return jsonResponse(nobodyVotedANumber)
      if (url === '/api/poker-sessions/session-1') {
        return jsonResponse({
          session: {
            queue: twoTasks.map((entry) => ({
              task: entry.taskId,
              status: entry.taskId === current ? 'revealed' : entry.taskId === 't1' ? 'estimated' : 'pending',
              roundCount: 1
            })),
            currentTask: current,
            status: 'open'
          }
        })
      }
      throw new Error(`Unexpected fetch: ${url}`)
    }) as any

    renderModal({ isFacilitator: true, queue: twoTasks })

    // Task 1 reveals with 3 preselected.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Set estimate · 3 points' })).toBeEnabled()
    )

    // Let the next poll for task 1 start and hang.
    await waitFor(() => expect(releaseStaleT1).not.toBeNull(), { timeout: 6000, interval: 100 })

    fireEvent.click(screen.getByRole('button', { name: 'Set estimate · 3 points' }))
    await waitFor(() => expect(screen.getByText('Task 2 of 2')).toBeInTheDocument())

    // The stale task-1 poll now lands.
    releaseStaleT1!()

    await waitFor(() => expect(screen.getByText('No numeric votes')).toBeInTheDocument(), {
      timeout: 6000,
      interval: 100
    })
    expect((screen.getByLabelText('Final estimate') as HTMLInputElement).value).toBe('')
    expect(screen.getByRole('button', { name: 'Set estimate' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: /Set estimate · 3/ })).not.toBeInTheDocument()
    expect(
      screen.getByText('Nobody voted a number. Enter the final estimate, or revote.')
    ).toBeInTheDocument()
  }, 15000)

  it("preselects the new round's median after a revote, not the old one", async () => {
    let round = 1
    global.fetch = jest.fn((url: string, init?: RequestInit) => {
      if (url.endsWith('/finalize') && String(init?.body).includes('revote')) {
        round = 2
        return jsonResponse({ round: 2, status: 'voting' })
      }
      if (url.includes('/reveal-state')) {
        return round === 1
          ? jsonResponse(revealedRound1)
          : jsonResponse({ ...revealedRound1, round: 2, median: 8, suggestedValue: 8, min: 8, max: 8 })
      }
      if (url === '/api/poker-sessions/session-1') {
        return jsonResponse({
          session: {
            queue: baseQueue.map((entry) => ({ task: entry.taskId, status: 'revealed', roundCount: round })),
            currentTask: 't1',
            status: 'open'
          }
        })
      }
      throw new Error(`Unexpected fetch: ${url}`)
    }) as any

    renderModal({ isFacilitator: true })

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Set estimate · 3 points' })).toBeEnabled()
    )

    fireEvent.click(screen.getByRole('button', { name: /Revote/ }))

    await waitFor(
      () => expect(screen.getByRole('button', { name: 'Set estimate · 8 points' })).toBeEnabled(),
      { timeout: 8000, interval: 100 }
    )
    expect((screen.getByLabelText('Final estimate') as HTMLInputElement).value).toBe('8')
  }, 15000)

  it('lets a voter cast the same card again after a revote', async () => {
    // Found end to end: after a revote, a voter whose new answer matched the
    // old one saw Confirm disabled — their round-1 vote was still held as
    // "your vote", though round 2 had none from them.
    let round = 1
    let revealed = false
    const fetchMock = jest.fn((url: string, _init?: RequestInit) => {
      if (url.includes('/vote')) {
        return jsonResponse({ round, voted: 1, expected: 2, readyToReveal: false, autoReveal: true })
      }
      if (url.includes('/reveal-state')) {
        return revealed ? jsonResponse(revealedRound1) : jsonResponse({ revealed: false })
      }
      if (url === '/api/poker-sessions/session-1') {
        return jsonResponse({
          session: {
            queue: baseQueue.map((entry) => ({
              task: entry.taskId,
              status: revealed ? 'revealed' : 'voting',
              roundCount: round
            })),
            currentTask: 't1',
            status: 'open',
            autoRevealOnAllVoted: false,
            // As in the live run: round 1 voted and revealed between two polls,
            // so the poll never reported it — only the vote response did.
            progress: round === 2 ? { round, voted: 0, expected: 2, votedVoterIds: [] } : undefined
          }
        })
      }
      throw new Error(`Unexpected fetch: ${url}`)
    })
    global.fetch = fetchMock as any

    renderModal({ isFacilitator: false })

    fireEvent.click(screen.getByRole('option', { name: 'Card 5' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Update vote' })).toBeDisabled())

    // Round 1 reveals, then the facilitator revotes into round 2.
    revealed = true
    await waitFor(() => expect(screen.getByText('The table has spoken')).toBeInTheDocument(), {
      timeout: 6000,
      interval: 100
    })
    revealed = false
    round = 2
    await waitFor(() => expect(screen.getByText('Your card')).toBeInTheDocument(), {
      timeout: 6000,
      interval: 100
    })

    fireEvent.click(screen.getByRole('option', { name: 'Card 5' }))
    const confirm = screen.getByRole('button', { name: 'Confirm' })
    expect(confirm).toBeEnabled()
    fireEvent.click(confirm)

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.filter(([url]) => String(url).includes('/vote'))
      ).toHaveLength(2)
    )
  }, 20000)

  it('keeps a pick made before the revote reaches this screen, and lets it be cast', async () => {
    // The voter never saw the reveal — round 1 revealed and was revoted
    // between two of their polls — and re-picked their card in that gap.
    let round = 1
    const fetchMock = jest.fn((url: string, _init?: RequestInit) => {
      if (url.includes('/vote')) {
        return jsonResponse({ round, voted: 1, expected: 2, readyToReveal: false, autoReveal: true })
      }
      if (url.includes('/reveal-state')) return jsonResponse({ revealed: false })
      if (url === '/api/poker-sessions/session-1') {
        return jsonResponse({
          session: {
            queue: baseQueue.map((entry) => ({ task: entry.taskId, status: 'voting', roundCount: round })),
            currentTask: 't1',
            status: 'open',
            autoRevealOnAllVoted: false,
            progress: round === 2 ? { round, voted: 0, expected: 2, votedVoterIds: [] } : undefined
          }
        })
      }
      throw new Error(`Unexpected fetch: ${url}`)
    })
    global.fetch = fetchMock as any

    renderModal({ isFacilitator: false })

    fireEvent.click(screen.getByRole('option', { name: 'Card 5' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    await waitFor(() => expect(screen.getByText('1 of 2 voted')).toBeInTheDocument())

    // The revote happens server-side; this screen re-picks 5 before it knows.
    round = 2
    fireEvent.click(screen.getByRole('option', { name: 'Card 3' }))
    fireEvent.click(screen.getByRole('option', { name: 'Card 5' }))

    // Once the poll reports round 2, the old vote is gone but the pick stays.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Confirm' })).toBeEnabled(), {
      timeout: 6000,
      interval: 100
    })
    expect(screen.getByTestId('poker-candidate-summary')).toHaveTextContent('5 points')
  }, 15000)

  it("keeps the facilitator's own edit while the same round is on screen", async () => {
    global.fetch = jest.fn((url: string) => {
      if (url.includes('/reveal-state')) return jsonResponse(revealedRound1)
      return jsonResponse({
        session: {
          queue: baseQueue.map((entry) => ({ task: entry.taskId, status: 'revealed', roundCount: 1 })),
          currentTask: 't1',
          status: 'open'
        }
      })
    }) as any

    renderModal({ isFacilitator: true })

    const input = (await screen.findByLabelText('Final estimate')) as HTMLInputElement
    await waitFor(() => expect(input.value).toBe('3'))
    fireEvent.change(input, { target: { value: '5' } })

    // Survives the next poll of the same round.
    await new Promise((resolve) => setTimeout(resolve, 4500))
    expect(input.value).toBe('5')
  }, 10000)
})
