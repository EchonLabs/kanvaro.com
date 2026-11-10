/**
 * @jest-environment jsdom
 */
/**
 * Regression: `updateYesterdayRow` handed `YesterdaySection` the new version
 * and stopped there. The yesterday rows, the Done/Logged totals and the
 * variance sentence are read from the page's loaded data, so a member who
 * logged hours or marked a task done saw the old values until a manual
 * reload, although the server had saved the change. Driven through the
 * captured `api`, for the reason `page.changeHours-reload.test.tsx` gives.
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
  sprintName: 'Sprint 3',
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

describe('MyStandupDetailPage — api.updateYesterdayRow reloads the screen', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
    jest.clearAllMocks()
    capturedApi = null
  })

  function mockFetch(patchResponse: () => Promise<any>) {
    const calls = { yesterdayGets: 0 }
    global.fetch = jest.fn((url: string, init?: { method?: string }) => {
      if (url.endsWith('/yesterday') && init?.method === 'PATCH') return patchResponse()
      if (url.endsWith('/yesterday')) {
        calls.yesterdayGets += 1
        return failed
      }
      if (url.endsWith('/allocations')) return jsonOk(board)
      if (url.endsWith('/variance')) return failed
      if (url.endsWith('/carry-forward')) return failed
      if (url.endsWith('/blockers')) return failed
      if (url.includes('/api/my/standup/candidates')) return jsonOk([])
      throw new Error(`Unexpected fetch: ${url}`)
    }) as any
    ;(useRouter as jest.Mock).mockReturnValue({ push: jest.fn() })
    return calls
  }

  it('refetches after saving logged hours, so the row and totals show what was saved', async () => {
    const calls = mockFetch(() => jsonOk({ standupVersion: 2, panel: { buckets: [] } }))

    render(<MyStandupDetailPage params={{ standupId: 's1' }} />)
    await screen.findByText('my-standup-screen-mounted')
    expect(calls.yesterdayGets).toBe(1)

    await act(async () => {
      await capturedApi!.updateYesterdayRow({ taskId: 't1', loggedMinutes: 180, expectedVersion: 1 })
    })

    await waitFor(() => expect(calls.yesterdayGets).toBe(2))
  })

  it('does not reload when the server refuses the change', async () => {
    const calls = mockFetch(
      () =>
        Promise.resolve({
          ok: false,
          json: () => Promise.resolve({ error: { code: 'STALE_STANDUP', message: 'stale' } })
        }) as any
    )

    render(<MyStandupDetailPage params={{ standupId: 's1' }} />)
    await screen.findByText('my-standup-screen-mounted')

    await expect(
      act(async () => {
        await capturedApi!.updateYesterdayRow({ taskId: 't1', status: 'done', expectedVersion: 1 })
      })
    ).rejects.toThrow()

    expect(calls.yesterdayGets).toBe(1)
  })
})
