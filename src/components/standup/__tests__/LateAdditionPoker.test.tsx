/**
 * @jest-environment jsdom
 *
 * The sprint-page entry point for poker on tasks added after planning (E14).
 *
 * Pins when the button is offered and when it may submit. The rules themselves
 * (reason, unestimated-only, freeze on finalize) are enforced server side and
 * tested in `poker-late-addition.test.ts`.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { LateAdditionPoker } from '../LateAdditionPoker'

jest.mock('@/contexts/AuthContext', () => ({
  useAuthContext: () => ({ user: { id: 'pm-1' } })
}))
jest.mock('@/lib/notify', () => ({
  useNotify: () => ({ error: jest.fn(), info: jest.fn(), warning: jest.fn() })
}))
jest.mock('../PokerModal', () => ({ PokerModal: () => <div data-testid="poker-modal" /> }))
jest.mock('../PlanningWorkspace', () => ({ buildPokerQueue: () => [] }))
jest.mock('@/components/ui/ResponsiveDialog', () => ({
  ResponsiveDialog: ({ open, title, children }: any) =>
    open ? (
      <div role="dialog" aria-label={title}>
        {children}
      </div>
    ) : null
}))

const unestimated = { _id: 't1', displayId: 'T-1', title: 'Fix login' }
const estimated = { _id: 't2', displayId: 'T-2', title: 'Has estimate', originalEstimateMinutes: 120 }

function mockApi({ tasks = [unestimated], sessions = [] as any[] } = {}) {
  global.fetch = jest.fn(async (url: any) => {
    const target = String(url)
    const data = target.includes('/api/tasks')
      ? { data: tasks }
      : target.includes('/poker-sessions')
        ? { data: { sessions } }
        : { data: { members: [] } }
    return { ok: true, json: async () => data } as any
  }) as any
}

const renderIt = (props: Partial<React.ComponentProps<typeof LateAdditionPoker>> = {}) =>
  render(
    <LateAdditionPoker
      sprintId="sp1"
      sprintStatus="active"
      projectId="pr1"
      teamMemberIds={['dev-1']}
      canFacilitate
      {...props}
    />
  )

describe('LateAdditionPoker', () => {
  it('offers the button on an active sprint with an unestimated task', async () => {
    mockApi()
    renderIt()
    expect(await screen.findByRole('button', { name: /estimate with poker/i })).toBeInTheDocument()
  })

  it.each(['planning', 'planned', 'completed'])('renders nothing on a %s sprint', async (status) => {
    mockApi()
    const { container } = renderIt({ sprintStatus: status })
    await waitFor(() => expect(container).toBeEmptyDOMElement())
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('does not offer the button when every task already has an estimate', async () => {
    mockApi({ tasks: [estimated as any] })
    renderIt()
    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    expect(screen.queryByRole('button', { name: /estimate with poker/i })).not.toBeInTheDocument()
  })

  it('does not offer a task estimated at creation (only estimatedHours set)', async () => {
    mockApi({ tasks: [{ _id: 't3', displayId: 'T-3', title: 'Created with hours', estimatedHours: 3 } as any] })
    renderIt()
    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    expect(screen.queryByRole('button', { name: /estimate with poker/i })).not.toBeInTheDocument()
  })

  it('does not offer the button to someone who cannot facilitate', async () => {
    mockApi()
    renderIt({ canFacilitate: false })
    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    expect(screen.queryByRole('button', { name: /estimate with poker/i })).not.toBeInTheDocument()
  })

  it('shows Join to a voter when a round is open', async () => {
    mockApi({ sessions: [{ _id: 's1', status: 'open', deckType: 'fibonacci', queue: [] }] })
    renderIt({ canFacilitate: false })
    expect(await screen.findByRole('button', { name: /join planning poker/i })).toBeInTheDocument()
  })

  it('lists only unestimated tasks and keeps Start disabled until the reason is long enough', async () => {
    mockApi({ tasks: [unestimated, estimated as any] })
    renderIt()
    fireEvent.click(await screen.findByRole('button', { name: /estimate with poker/i }))

    expect(screen.getByText('Fix login')).toBeInTheDocument()
    expect(screen.queryByText('Has estimate')).not.toBeInTheDocument()

    const start = screen.getByRole('button', { name: /start round/i })
    expect(start).toBeDisabled()

    fireEvent.change(screen.getByLabelText(/why are these tasks/i), { target: { value: 'too short' } })
    expect(start).toBeDisabled()

    fireEvent.change(screen.getByLabelText(/why are these tasks/i), {
      target: { value: 'Customer escalation pulled this in' }
    })
    expect(start).toBeEnabled()
  })
})
