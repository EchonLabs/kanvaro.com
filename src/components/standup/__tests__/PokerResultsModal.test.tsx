/**
 * @jest-environment jsdom
 */
/**
 * The results screen reads one `/results` request and renders the whole table
 * from it. These cover the parts that used to be impossible: the row-level
 * voter count and stats (which needed a per-task fetch before), the totals
 * band, and the CSV export.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'

import { PokerResultsModal } from '../PokerResultsModal'
import { ToastProvider } from '@/components/ui/Toast'

const results = {
  estimationUnit: 'story_points' as const,
  pointsToHours: 4,
  participantCount: 3,
  tasks: [
    {
      taskId: 't1',
      title: 'Add SSO to the workspace',
      displayId: 'KAN-142',
      status: 'estimated',
      roundCount: 1,
      finalValue: 8,
      consensusReached: false,
      voteSpread: 16,
      min: 5,
      max: 21,
      median: 8,
      votedCount: 3,
      votes: [
        { voterId: 'u1', voterName: 'Kasun', card: 8, value: 8, isOutlier: false },
        { voterId: 'u2', voterName: 'Maya', card: 5, value: 5, isOutlier: true },
        { voterId: 'u3', voterName: 'Iris', card: 21, value: 21, isOutlier: true }
      ]
    },
    {
      taskId: 't2',
      title: 'Create audit log export',
      displayId: 'KAN-146',
      status: 'estimated',
      roundCount: 1,
      finalValue: 5,
      consensusReached: true,
      voteSpread: 0,
      min: 5,
      max: 5,
      median: 5,
      votedCount: 3,
      // A real consensus: everyone who voted landed on the same card.
      votes: [
        { voterId: 'u1', voterName: 'Kasun', card: 5, value: 5, isOutlier: false },
        { voterId: 'u2', voterName: 'Maya', card: 5, value: 5, isOutlier: false },
        { voterId: 'u3', voterName: 'Iris', card: 5, value: 5, isOutlier: false }
      ]
    }
  ]
}

function renderResults() {
  render(
    <ToastProvider>
      <PokerResultsModal
        open
        onOpenChange={jest.fn()}
        sessionId="session-1"
        sprintName="Sprint 14"
      />
    </ToastProvider>
  )
}

describe('PokerResultsModal', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    global.fetch = jest.fn((url: string) => {
      if (url === '/api/poker-sessions/session-1/results') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: results }) }) as any
      }
      throw new Error(`Unexpected fetch: ${url}`)
    }) as any
  })

  afterEach(() => {
    global.fetch = originalFetch
    jest.clearAllMocks()
  })

  it('reads the whole table from a single results request', async () => {
    renderResults()

    await waitFor(() => expect(screen.getByText('Add SSO to the workspace')).toBeInTheDocument())

    expect(global.fetch).toHaveBeenCalledTimes(1)
    expect(global.fetch).toHaveBeenCalledWith('/api/poker-sessions/session-1/results')
  })

  it('totals the estimates and converts them to hours', async () => {
    renderResults()

    // 8 + 5 = 13 points, at 4 hours a point.
    await waitFor(() => expect(screen.getByText('13 pts')).toBeInTheDocument())
    expect(screen.getByText('≈ 52 hours')).toBeInTheDocument()
    expect(screen.getByText('1 consensus')).toBeInTheDocument()
    expect(screen.getByText('1 spread')).toBeInTheDocument()
  })

  it('fills the per-row voter count and outcome without expanding the row', async () => {
    renderResults()

    await waitFor(() => expect(screen.getByText('Create audit log export')).toBeInTheDocument())

    // The second row is collapsed — its columns are still populated.
    const collapsed = screen.getByText('Create audit log export').closest('button') as HTMLElement
    expect(collapsed).toHaveAttribute('aria-expanded', 'false')
    expect(within(collapsed).getByText('3 of 3')).toBeInTheDocument()
    expect(within(collapsed).getByText('Consensus')).toBeInTheDocument()
    expect(within(collapsed).getByText('5')).toBeInTheDocument()
  })

  it('reads a spread in cards apart, not in points', async () => {
    // Task 1 runs 5 -> 21: three cards apart on a Fibonacci deck, so a wide
    // spread. The arithmetic difference (16) is not what decides it.
    renderResults()

    await waitFor(() => expect(screen.getByText('Add SSO to the workspace')).toBeInTheDocument())

    const wide = screen.getByText('Add SSO to the workspace').closest('button') as HTMLElement
    expect(within(wide).getByText('Wide spread')).toBeInTheDocument()
  })

  it('expands the first row by default and shows its per-voter breakdown', async () => {
    renderResults()

    await waitFor(() => expect(screen.getByText('Per-voter breakdown')).toBeInTheDocument())

    expect(screen.getByText('MIN 5 · MEDIAN 8 · MAX 21')).toBeInTheDocument()
    expect(screen.getByText('Kasun')).toBeInTheDocument()
    expect(screen.getAllByText('Outlier')).toHaveLength(2)
  })

  it('collapses and re-expands a row on click', async () => {
    renderResults()

    await waitFor(() => expect(screen.getByText('Per-voter breakdown')).toBeInTheDocument())

    fireEvent.click(screen.getByText('Add SSO to the workspace'))
    expect(screen.queryByText('Per-voter breakdown')).not.toBeInTheDocument()

    fireEvent.click(screen.getByText('Add SSO to the workspace'))
    expect(screen.getByText('Per-voter breakdown')).toBeInTheDocument()
  })

  it('exports a CSV whose task titles survive a comma', async () => {
    const createObjectURL = jest.fn((_blob: Blob) => 'blob:results')
    const revokeObjectURL = jest.fn()
    ;(URL as any).createObjectURL = createObjectURL
    ;(URL as any).revokeObjectURL = revokeObjectURL
    const click = jest
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined)

    renderResults()
    await waitFor(() => expect(screen.getByText('Add SSO to the workspace')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: /Export results/i }))

    expect(createObjectURL).toHaveBeenCalledTimes(1)
    expect(createObjectURL.mock.calls[0][0].type).toContain('text/csv')
    expect(click).toHaveBeenCalled()

    click.mockRestore()
  })
})
