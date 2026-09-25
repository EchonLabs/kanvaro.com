/**
 * @jest-environment jsdom
 */
/**
 * The redirect button used to never render at all: `AllocationBoard` never
 * carried `projectId`/`sprintId`, so `MyStandupScreen`'s permission check was
 * always evaluated against `undefined` and the button silently disappeared
 * for every viewer, PM or not (UI-12). This proves the wiring end to end —
 * from the fetched board payload, through this page's adapter, to the
 * rendered button's actual click destination — not just that the pieces work
 * in isolation.
 */
import { fireEvent, render, screen } from '@testing-library/react'
import { useRouter } from 'next/navigation'

import MyStandupDetailPage from '../page'

jest.mock('next/navigation', () => ({
  useRouter: jest.fn()
}))

jest.mock('@/components/layout/MainLayout', () => ({
  MainLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>
}))

jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'u1' }, isLoading: false })
}))

const mockHasPermission = jest.fn().mockReturnValue(true)
jest.mock('@/lib/permissions/permission-context', () => ({
  usePermissions: () => ({ hasPermission: mockHasPermission })
}))

const board = {
  standupId: 's1',
  standupVersion: 1,
  status: 'Ready',
  date: '2026-08-17',
  projectId: 'p1',
  sprintId: 'sp1',
  projectName: 'Acme Redesign',
  members: [
    {
      memberId: 'u1',
      name: 'Amal',
      capacity: {
        memberId: 'u1',
        date: '2026-08-17',
        nominalMinutes: 480,
        adjustments: [],
        adjustedMinutes: 480,
        outstandingDebtMinutes: 0,
        overrunPolicy: 'absorb',
        effectiveMinutes: 480,
        allocatedMinutes: 0,
        gapMinutes: 480,
        status: 'zero',
        isUnavailable: false,
        strandedMinutes: 0
      },
      allocations: []
    }
  ],
  pool: { unassigned: [] }
}

function jsonOk(data: unknown) {
  return Promise.resolve({ ok: true, json: () => Promise.resolve({ data }) }) as any
}

/** Matches `safeJson`'s read-tolerant contract: a failed response resolves to `undefined`, not a `{ data: null }` object the screen would otherwise treat as present. */
const failed = Promise.resolve({ ok: false }) as any

function mockFetch() {
  return jest.fn((url: string) => {
    if (url.endsWith('/allocations')) return jsonOk(board)
    if (url.endsWith('/yesterday')) return failed
    if (url.endsWith('/variance')) return failed
    if (url.endsWith('/carry-forward')) return failed
    if (url.endsWith('/blockers')) return failed
    if (url.includes('/api/my/standup/candidates')) return jsonOk([])
    throw new Error(`Unexpected fetch: ${url}`)
  })
}

describe('MyStandupDetailPage — the board’s projectId/sprintId/projectName reach the screen', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
    jest.clearAllMocks()
  })

  it('shows the project name and points "open full stand-up" at this exact sprint stand-up', async () => {
    global.fetch = mockFetch() as any
    const push = jest.fn()
    ;(useRouter as jest.Mock).mockReturnValue({ push })

    render(<MyStandupDetailPage params={{ standupId: 's1' }} />)

    expect(await screen.findByText('Acme Redesign')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /open full stand-up/i }))
    expect(push).toHaveBeenCalledWith('/projects/p1/sprints/sp1/standups/s1')
  })
})
