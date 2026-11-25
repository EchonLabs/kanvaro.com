/**
 * @jest-environment jsdom
 */
import { renderHook, waitFor } from '@testing-library/react'

import { useMemberAllocationTotals } from '@/components/resource-allocation/useMemberAllocationTotals'

const row = (memberId: string, total: number) => ({ memberId, total })

const json = (body: unknown) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) } as Response)

describe('useMemberAllocationTotals', () => {
  it('loads every page of the sheet into a member → total map', async () => {
    const fetchMock = jest.fn((url: string) => {
      const page = new URL(url, 'http://x').searchParams.get('page')
      const data =
        page === '2'
          ? { rows: [row('u3', 0)], threshold: 120, pagination: { page: 2, limit: 100, total: 3, totalPages: 2 } }
          : { rows: [row('u1', 80), row('u2', 130)], threshold: 120, pagination: { page: 1, limit: 100, total: 3, totalPages: 2 } }
      return json({ success: true, data })
    })
    global.fetch = fetchMock as unknown as typeof fetch

    const { result } = renderHook(() => useMemberAllocationTotals(true))

    await waitFor(() => expect(result.current.totals.size).toBe(3))
    expect(result.current.totals.get('u2')).toBe(130)
    expect(result.current.threshold).toBe(120)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('does nothing for people who cannot view allocations', async () => {
    const fetchMock = jest.fn()
    global.fetch = fetchMock as unknown as typeof fetch

    const { result } = renderHook(() => useMemberAllocationTotals(false))

    expect(result.current.totals.size).toBe(0)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
