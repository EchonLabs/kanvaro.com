/**
 * @jest-environment jsdom
 */
/**
 * Task 3: the sprint header's Start/Complete Sprint row used to stack an
 * always-visible reason `<span>` beneath the buttons, whose height varied by
 * sprint state (nothing while `planned`, one line while `planning`) and
 * pushed the header's total height around. That caption is replaced with an
 * `InfoTooltip` rendered inline in the button row itself, so the row's DOM
 * shape no longer depends on message length — only on whether an explanation
 * exists at all.
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useParams, useRouter } from 'next/navigation'

import SprintDetailPage from '../page'
import { useAuthContext } from '@/contexts/AuthContext'
import { usePermissions } from '@/lib/permissions/permission-context'
import { Permission } from '@/lib/permissions/permission-definitions'
import { TooltipProvider } from '@/components/ui/tooltip'

jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
  useParams: jest.fn()
}))

jest.mock('@/components/layout/MainLayout', () => ({
  MainLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>
}))

jest.mock('@/contexts/AuthContext', () => ({
  useAuthContext: jest.fn()
}))

jest.mock('@/lib/permissions/permission-context', () => {
  const actual = jest.requireActual('@/lib/permissions/permission-context')
  return {
    ...actual,
    usePermissions: jest.fn()
  }
})

// Variables referenced inside a jest.mock factory must be prefixed with
// "mock" (babel-plugin-jest-hoist allows it) so the same jest.fn() instances
// are shared between the mocked module and the assertions below.
const mockNotifyError = jest.fn()
const mockNotifySuccess = jest.fn()

jest.mock('@/lib/notify', () => ({
  useNotify: () => ({
    success: mockNotifySuccess,
    error: mockNotifyError,
    info: jest.fn(),
    warning: jest.fn()
  })
}))

function buildSprint(status: 'planning' | 'planned' | 'active', totalTasks = 0) {
  return {
    _id: 'sprint-1',
    name: 'Sprint 1',
    description: '',
    status,
    project: { _id: 'proj-1', name: 'Project 1' },
    startDate: '2026-08-01',
    endDate: '2026-08-14',
    goal: '',
    capacity: 40,
    velocity: 0,
    teamMembers: [],
    createdBy: { firstName: 'A', lastName: 'B', email: 'a@b.com' },
    progress: {
      completionPercentage: 0,
      tasksCompleted: 0,
      totalTasks,
      storyPointsCompleted: 0,
      totalStoryPoints: 0,
      estimatedHours: 0,
      actualHours: 0
    },
    tasks: [],
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z'
  }
}

function jsonOk(data: unknown) {
  return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, data }) }) as any
}

function mockFetchFor(sprint: ReturnType<typeof buildSprint>) {
  return jest.fn((url: string) => {
    if (url === `/api/sprints/${sprint._id}`) return jsonOk(sprint)
    if (url.startsWith('/api/projects')) return jsonOk([])
    return jsonOk(null)
  })
}

async function renderPageFor(status: 'planning' | 'planned' | 'active', totalTasks = 0) {
  const sprint = buildSprint(status, totalTasks)
  const fetchMock = mockFetchFor(sprint)
  global.fetch = fetchMock as any

  render(
    <TooltipProvider>
      <SprintDetailPage />
    </TooltipProvider>
  )

  await screen.findByRole('heading', { name: 'Sprint 1' })
  return fetchMock
}

describe('sprint header action-button row (Task 3)', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    ;(useRouter as jest.Mock).mockReturnValue({ push: jest.fn(), back: jest.fn() })
    ;(useParams as jest.Mock).mockReturnValue({ id: 'sprint-1' })
    ;(useAuthContext as jest.Mock).mockReturnValue({
      user: { _id: 'u1' },
      isAuthenticated: true,
      isLoading: false
    })
    ;(usePermissions as jest.Mock).mockReturnValue({
      hasPermission: (permission: Permission) =>
        [
          Permission.SPRINT_VIEW,
          Permission.SPRINT_START,
          Permission.SPRINT_COMPLETE
        ].includes(permission)
    })
  })

  afterEach(() => {
    global.fetch = originalFetch
    jest.clearAllMocks()
  })

  it('no longer renders the old always-visible reason caption while planning', async () => {
    await renderPageFor('planning')

    // The old caption was a plain, visually-rendered <span> stacked under the
    // button row. The only element carrying this text now must be the
    // permanently sr-only span InfoTooltip mounts for aria-describedby.
    const reasonNode = screen.getByText(standupBlockedText())
    expect(reasonNode.tagName).toBe('SPAN')
    expect(reasonNode).toHaveClass('sr-only')
    expect(reasonNode).not.toHaveClass('text-[11px]')
  })

  it("shows the InfoTooltip's sr-only text, matching the Start Sprint button's aria-describedby, while planning", async () => {
    await renderPageFor('planning')

    const startButton = screen.getByRole('button', { name: 'Start Sprint' })
    expect(startButton).toHaveAttribute('aria-describedby', 'start-sprint-reason')

    const srSpan = document.getElementById('start-sprint-reason')
    expect(srSpan).not.toBeNull()
    expect(srSpan).toHaveTextContent(standupBlockedText())
    expect(srSpan).toHaveClass('sr-only')
  })

  it('renders no reason element at all once the sprint is planned (ready to start)', async () => {
    await renderPageFor('planned')

    expect(screen.getByRole('button', { name: 'Start Sprint' })).toBeInTheDocument()
    expect(document.getElementById('start-sprint-reason')).toBeNull()
  })

  it("keeps the button row's structure independent of message length: only an info-icon button is added, not extra wrapper rows", async () => {
    await renderPageFor('planning')
    const planningRow = screen.getByRole('button', { name: 'Start Sprint' }).parentElement as HTMLElement
    // Start Sprint button + InfoTooltip's trigger button + its permanent
    // sr-only span = 3 element children, regardless of how long the
    // explanation text is.
    expect(planningRow.children).toHaveLength(3)

    cleanup()
    await renderPageFor('planned')
    const plannedRow = screen.getByRole('button', { name: 'Start Sprint' }).parentElement as HTMLElement
    // No explanation needed once planned: just the Start Sprint button.
    expect(plannedRow.children).toHaveLength(1)
  })
  it('blocks Start Sprint when clicked while status is not planned, and never calls the start API', async () => {
    // hasTasks must be true so the click reaches the status guard in
    // handleStartSprint rather than the earlier "add tasks" guard.
    const fetchMock = await renderPageFor('planning', 5)

    const startButton = screen.getByRole('button', { name: 'Start Sprint' })
    fireEvent.click(startButton)

    await waitFor(() => {
      expect(mockNotifyError).toHaveBeenCalledWith({ title: standupBlockedText() })
    })

    // The blocked-guard path must return before making any network call to
    // the start-sprint endpoint.
    const startCalls = fetchMock.mock.calls.filter(([url]: [string]) =>
      url === '/api/sprints/sprint-1/start'
    )
    expect(startCalls).toHaveLength(0)
  })
})

function standupBlockedText() {
  return 'This sprint cannot start until planning is complete. Open Plan Sprint and finish the checklist.'
}
