/**
 * @jest-environment jsdom
 */
/**
 * `changeHours` used to hand `MyStandupScreen` the new version and stop
 * there — the row itself showed the number the member typed, but
 * `member.capacity` (the ring, the gap sentence, whether Pull More Work has
 * anything left to offer) came from the board payload and never refreshed,
 * unlike `addAllocation` and `raiseBlocker`, which both already trigger a
 * reload. This drives `page.tsx`'s `api.changeHours` directly — by capturing
 * the `api` object it hands to `MyStandupScreen` rather than simulating a
 * blur through the real `<input>` — because React 18 delegates `onBlur` via
 * a bubbling `focusout` listener at the root, which a raw DOM event dispatch
 * does not reliably reach in this test environment; the section-level tests
 * already cover the input's own commit behaviour in isolation.
 */
import { render, screen, act, waitFor } from '@testing-library/react'
import { useRouter } from 'next/navigation'

import MyStandupDetailPage from '../page'
import type { MyStandupApi } from '@/components/standup/my/MyStandupScreen'

jest.mock('next/navigation', () => ({
  useRouter: jest.fn()
}))

jest.mock('@/components/layout/MainLayout', () => ({
  MainLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>
}))

jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'u1' }, isLoading: false })
}))

jest.mock('@/lib/permissions/permission-context', () => ({
  usePermissions: () => ({ hasPermission: () => true })
}))

let capturedApi: MyStandupApi | null = null
jest.mock('@/components/standup/my/MyStandupScreen', () => ({
  MyStandupScreen: (props: { api: MyStandupApi }) => {
    capturedApi = props.api
    return <div>my-standup-screen-mounted</div>
  }
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
        allocatedMinutes: 120,
        gapMinutes: 360,
        status: 'under',
        isUnavailable: false,
        strandedMinutes: 0
      },
      allocations: [
        {
          allocationId: 'a1',
          taskId: 't1',
          taskKey: 'KAN-1',
          title: 'Fix the thing',
          plannedMinutes: 120,
          remainingEstimateMinutes: 180,
          source: 'assigned_in_standup',
          isBlocked: false,
          excludedFromCapacity: false,
          pairedDeliberately: false
        }
      ]
    }
  ],
  pool: { unassigned: [] }
}

function jsonOk(data: unknown) {
  return Promise.resolve({ ok: true, json: () => Promise.resolve({ data }) }) as any
}

const failed = Promise.resolve({ ok: false }) as any

describe('MyStandupDetailPage — api.changeHours reloads the board', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
    jest.clearAllMocks()
    capturedApi = null
  })

  it('refetches the board after changing planned hours, so capacity and the gap stay in sync', async () => {
    let getAllocationsCalls = 0
    global.fetch = jest.fn((url: string) => {
      if (url.endsWith('/allocations')) {
        getAllocationsCalls += 1
        return jsonOk(board)
      }
      if (/\/allocations\/a1$/.test(url)) return jsonOk({ standupVersion: 2 })
      if (url.endsWith('/yesterday')) return failed
      if (url.endsWith('/variance')) return failed
      if (url.endsWith('/carry-forward')) return failed
      if (url.endsWith('/blockers')) return failed
      if (url.includes('/api/my/standup/candidates')) return jsonOk([])
      throw new Error(`Unexpected fetch: ${url}`)
    }) as any
    ;(useRouter as jest.Mock).mockReturnValue({ push: jest.fn() })

    render(<MyStandupDetailPage params={{ standupId: 's1' }} />)
    await screen.findByText('my-standup-screen-mounted')
    expect(getAllocationsCalls).toBe(1)
    expect(capturedApi).not.toBeNull()

    await act(async () => {
      await capturedApi!.changeHours({ allocationId: 'a1', plannedMinutes: 180 as any, expectedVersion: 1 })
    })

    await waitFor(() => expect(getAllocationsCalls).toBe(2))
  })

  it('does not reload when the server refuses the change', async () => {
    let getAllocationsCalls = 0
    global.fetch = jest.fn((url: string) => {
      if (url.endsWith('/allocations')) {
        getAllocationsCalls += 1
        return jsonOk(board)
      }
      if (/\/allocations\/a1$/.test(url)) {
        return Promise.resolve({
          ok: false,
          json: () => Promise.resolve({ error: { code: 'STALE_STANDUP', message: 'stale' } })
        }) as any
      }
      if (url.endsWith('/yesterday')) return failed
      if (url.endsWith('/variance')) return failed
      if (url.endsWith('/carry-forward')) return failed
      if (url.endsWith('/blockers')) return failed
      if (url.includes('/api/my/standup/candidates')) return jsonOk([])
      throw new Error(`Unexpected fetch: ${url}`)
    }) as any
    ;(useRouter as jest.Mock).mockReturnValue({ push: jest.fn() })

    render(<MyStandupDetailPage params={{ standupId: 's1' }} />)
    await screen.findByText('my-standup-screen-mounted')
    expect(getAllocationsCalls).toBe(1)

    await expect(
      act(async () => {
        await capturedApi!.changeHours({ allocationId: 'a1', plannedMinutes: 180 as any, expectedVersion: 1 })
      })
    ).rejects.toThrow()

    expect(getAllocationsCalls).toBe(1)
  })
})
