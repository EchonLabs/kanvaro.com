/**
 * @jest-environment jsdom
 */
/**
 * Final-review fix wave, Important 7.
 *
 * `page.tsx`'s "give a not-started reason" dialog (`givingReason`) was the one
 * dialog Task 6's ModalOverlay-wrapping pass missed: it rendered
 * `role="dialog" aria-modal="true"` on a plain in-flow `<div>` with no
 * backdrop, no focus trap, and no Escape handling. This proves it is now
 * wrapped in the same `ModalOverlay` primitive as the other five dialogs on
 * this screen (revise-estimate, override, debt-ledger, raise-blocker,
 * resolve-blocker): a real backdrop is present, there is exactly one
 * `role="dialog"` element (not a redundant nested one), and Escape closes it.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useRouter } from 'next/navigation'

import StandupRunPage from '../page'

jest.mock('next/navigation', () => ({
  useRouter: jest.fn()
}))

jest.mock('@/components/layout/MainLayout', () => ({
  MainLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>
}))

const board = {
  standupId: 's1',
  standupVersion: 1,
  date: '2026-08-17',
  sprintDayNumber: 2,
  totalSprintDays: 10,
  shape: 'mid_sprint',
  status: 'In_Progress',
  facilitatorName: 'Priya',
  ceremoniesConsumeCapacity: true,
  members: [],
  pool: { unassigned: [], assignedNotPlanned: [] }
}

const variance = {
  rows: [
    {
      allocationId: 'a1',
      taskId: 't1',
      taskKey: 'KAN-1',
      title: 'Invoice model',
      memberId: 'kasun',
      memberName: 'Kasun',
      outcome: 'not_started',
      plannedMinutes: 60,
      loggedMinutesOnDay: 0,
      dayVarianceMinutes: -60,
      originalEstimateMinutes: 60,
      totalLoggedMinutesOnTask: 0,
      taskVarianceMinutes: -60,
      requiresRevision: false,
      requiresReason: true,
      spillChainLength: 0,
      chronicSpill: false,
      explanation: 'Planned but nothing was logged.'
    }
  ],
  members: []
}

function jsonOk(data: unknown) {
  return Promise.resolve({ ok: true, json: () => Promise.resolve({ data }) }) as any
}

function mockFetch() {
  return jest.fn((url: string) => {
    if (url.endsWith('/allocations')) return jsonOk(board)
    if (url.endsWith('/variance')) return jsonOk(variance)
    if (url.endsWith('/yesterday')) return jsonOk(null)
    if (url.endsWith('/carry-forward')) return jsonOk(null)
    if (url.endsWith('/sprint-close')) return jsonOk(null)
    if (url.endsWith('/blockers')) return jsonOk(null)
    if (url.includes('/standup/health')) return jsonOk({ degradations: [] })
    throw new Error(`Unexpected fetch: ${url}`)
  })
}

describe("page.tsx's give-a-reason dialog (Important 7)", () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    ;(useRouter as jest.Mock).mockReturnValue({ push: jest.fn() })
  })

  afterEach(() => {
    global.fetch = originalFetch
    jest.clearAllMocks()
  })

  it('opens behind a real backdrop, as a single dialog element, and closes on Escape', async () => {
    global.fetch = mockFetch() as any

    render(
      <StandupRunPage params={{ id: 'proj-1', sprintId: 'sprint-1', standupId: 's1' }} />
    )

    const trigger = await screen.findByRole('button', { name: /give a reason for kan-1/i })
    fireEvent.click(trigger)

    // Exactly one dialog — not the old bare div plus anything nested.
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAttribute('aria-labelledby', 'reason-title')

    // ModalOverlay's real backdrop, not a plain in-flow div.
    expect(screen.getByTestId('modal-overlay-backdrop')).toBeInTheDocument()

    fireEvent.keyDown(dialog, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })
})
