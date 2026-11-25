/**
 * @jest-environment jsdom
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'

import { HistoryTab } from '@/components/resource-allocation/HistoryTab'

const entry = (id: string, status: string, over: Record<string, unknown> = {}) => ({
  id,
  date: '2026-09-30T10:32:00.000Z',
  member: { _id: 'u1', name: 'Dulmi Kaushalya' },
  changedBy: { _id: 'hr', name: 'Buddhini Perera', roleLabel: 'Human Resource' },
  project: { _id: 'p1', name: 'AVO' },
  previousPercent: 100,
  newPercent: 70,
  reason: 'Project workload change',
  status,
  ...over
})

const json = (body: unknown) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) } as Response)

describe('HistoryTab', () => {
  it('renders Updated/Approved/Rejected statuses and paginates', async () => {
    const fetchMock = jest.fn((url: string) => {
      const page = new URL(url, 'http://x').searchParams.get('page')
      const items =
        page === '2'
          ? [entry('e4', 'updated', { member: { _id: 'u4', name: 'Kavindu Silva' } })]
          : [
              entry('e1', 'updated'),
              entry('e2', 'approved', { approvedBy: { _id: 'hr', name: 'Buddhini Perera' } }),
              entry('e3', 'rejected')
            ]
      return json({ success: true, data: { items, total: 13 } })
    })
    global.fetch = fetchMock as unknown as typeof fetch

    render(<HistoryTab />)

    expect(await screen.findByText('Updated')).toBeInTheDocument()
    expect(screen.getByText('Approved')).toBeInTheDocument()
    expect(screen.getByText('Rejected')).toBeInTheDocument()
    const row = screen.getAllByText('Dulmi Kaushalya')[0].closest('tr') as HTMLElement
    expect(within(row).getByText('Buddhini Perera')).toBeInTheDocument()
    expect(within(row).getByText('Human Resource')).toBeInTheDocument()
    expect(within(row).getByText('100%')).toBeInTheDocument()
    expect(within(row).getByText('70%')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(await screen.findByText('Kavindu Silva')).toBeInTheDocument()
  })

  it('searches history', async () => {
    const fetchMock = jest.fn((_url: string) => json({ success: true, data: { items: [], total: 0 } }))
    global.fetch = fetchMock as unknown as typeof fetch

    render(<HistoryTab />)
    fireEvent.change(screen.getByPlaceholderText('Search history...'), { target: { value: 'avo' } })

    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes('q=avo'))).toBe(true)
    )
    expect(await screen.findByText('No allocation changes yet.')).toBeInTheDocument()
  })
})
