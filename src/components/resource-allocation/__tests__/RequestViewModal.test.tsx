/**
 * @jest-environment jsdom
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { RequestViewModal } from '@/components/resource-allocation/RequestViewModal'

const data = {
  _id: 'r1',
  status: 'pending',
  reason: 'Need design help',
  member: { _id: 'u1', name: 'Aruni Perera' },
  requestedBy: { _id: 'me', name: 'Dion Perera', roleLabel: 'Project Manager' },
  lines: [{ projectId: 'p1', projectName: 'AVO', previousPercent: 0, newPercent: 30, currentPercent: 0 }],
  totalBefore: 50,
  totalAfter: 80,
  createdAt: '2026-11-20T10:00:00.000Z',
  stale: false,
  liveTotalBefore: 50,
  liveTotalAfter: 80,
  exceedsThresholdNow: false,
  threshold: 100
}

const json = (status: number, body: unknown) =>
  Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) } as Response)

describe('RequestViewModal', () => {
  it('shows the request read-only and lets the requester cancel it', async () => {
    const fetchMock = jest.fn((url: string, init?: RequestInit) => {
      if (init?.method === 'POST' && url.endsWith('/cancel')) {
        return json(200, { success: true, data: { status: 'cancelled' } })
      }
      return json(200, { success: true, data })
    })
    global.fetch = fetchMock as unknown as typeof fetch
    const onCancelled = jest.fn()

    render(<RequestViewModal requestId="r1" open onClose={jest.fn()} onCancelled={onCancelled} />)

    expect(await screen.findByText('Need design help')).toBeInTheDocument()
    expect(screen.getByText('Awaiting approval')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Confirm' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Cancel request' }))
    await waitFor(() => expect(onCancelled).toHaveBeenCalled())
  })

  it('describes the dialog while the request is still loading', () => {
    global.fetch = jest.fn(() => new Promise(() => {})) as unknown as typeof fetch
    render(<RequestViewModal requestId="r1" open onClose={jest.fn()} onCancelled={jest.fn()} />)

    expect(screen.getByRole('dialog')).toHaveAccessibleDescription('Loading the request…')
  })
})
