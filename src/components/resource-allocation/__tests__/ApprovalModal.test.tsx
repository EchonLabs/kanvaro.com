/**
 * @jest-environment jsdom
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { ApprovalModal } from '@/components/resource-allocation/ApprovalModal'

const P1 = 'aaaaaaaaaaaaaaaaaaaaaaaa'
const P2 = 'bbbbbbbbbbbbbbbbbbbbbbbb'

const detail = (over: Record<string, unknown> = {}) => ({
  _id: 'r1',
  status: 'pending',
  reason: 'New project requirement',
  member: { _id: 'u1', name: 'Shalini Fernando' },
  requestedBy: { _id: 'pm', name: 'Nadeeshani De Zoysa', roleLabel: 'Project Manager' },
  lines: [
    { projectId: P1, projectName: 'BaseNeo SaaS', previousPercent: 50, newPercent: 35, currentPercent: 50, active: true },
    { projectId: P2, projectName: 'MediFinder', previousPercent: 0, newPercent: 60, currentPercent: 0, active: true }
  ],
  totalBefore: 50,
  totalAfter: 95,
  createdAt: '2026-11-20T10:00:00.000Z',
  stale: false,
  liveTotalBefore: 50,
  liveTotalAfter: 95,
  exceedsThresholdNow: false,
  threshold: 100,
  ...over
})

const json = (status: number, body: unknown) =>
  Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) } as Response)

let fetchMock: jest.Mock
const props = { requestId: 'r1', open: true, onClose: jest.fn(), onDecided: jest.fn() }

function serve(data: ReturnType<typeof detail>, decision: { status: number; body: unknown } = { status: 200, body: { success: true, data: { status: 'approved' } } }) {
  fetchMock = jest.fn((url: string, init?: RequestInit) => {
    if (url.endsWith('/requests/r1') && !init?.method) return json(200, { success: true, data })
    if (init?.method === 'POST') return json(decision.status, decision.body)
    return json(404, {})
  })
  global.fetch = fetchMock as unknown as typeof fetch
}

const postBody = (suffix: string) => {
  const call = fetchMock.mock.calls.find(([url, init]) => String(url).endsWith(suffix) && init?.method === 'POST')
  return call ? JSON.parse(call[1].body) : undefined
}

beforeEach(() => jest.clearAllMocks())

describe('ApprovalModal', () => {
  it('shows the requester, reason and the change, then approves', async () => {
    serve(detail())
    render(<ApprovalModal {...props} />)

    expect(await screen.findByText('Review the changes for Shalini Fernando before updating their allocation')).toBeInTheDocument()
    expect(screen.getByText(/Nadeeshani De Zoysa/)).toBeInTheDocument()
    expect(screen.getByText('New project requirement')).toBeInTheDocument()
    expect(screen.getByText('Total allocation').nextSibling).toHaveTextContent('95%')
    expect(screen.getByText('This updates the central allocation sheet.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    await waitFor(() => expect(props.onDecided).toHaveBeenCalledWith('approved'))
    expect(postBody('/approve')).toEqual({ acknowledgeStale: false })
  })

  it('shows the person-to-project header from the design', async () => {
    serve(detail())
    render(<ApprovalModal {...props} />)

    const header = await screen.findByTestId('change-header')
    expect(header).toHaveTextContent('SF')
  })

  it('shows the member’s photo in the header when they have one', async () => {
    serve(detail({ member: { _id: 'u1', name: 'Shalini Fernando', avatar: '/api/uploads/avatars/u1.jpg' } }))
    render(<ApprovalModal {...props} />)

    const header = await screen.findByTestId('change-header')
    expect(header.querySelector('img')).toHaveAttribute('src', '/api/uploads/avatars/u1.jpg')
    expect(header).not.toHaveTextContent('SF')
  })

  it('describes the dialog while the request is still loading', () => {
    global.fetch = jest.fn(() => new Promise(() => {})) as unknown as typeof fetch
    render(<ApprovalModal {...props} />)

    expect(screen.getByRole('dialog')).toHaveAccessibleDescription('Loading the request…')
  })

  it('requires acknowledging stale values before Confirm is enabled', async () => {
    serve(
      detail({
        stale: true,
        lines: [{ projectId: P2, projectName: 'MediFinder', previousPercent: 0, newPercent: 60, currentPercent: 10, active: true }],
        liveTotalBefore: 60,
        liveTotalAfter: 110 - 10 - 40
      })
    )
    render(<ApprovalModal {...props} />)

    expect(await screen.findByText(/changed since this request was made/i)).toBeInTheDocument()
    const confirm = screen.getByRole('button', { name: 'Confirm' })
    expect(confirm).toBeDisabled()

    fireEvent.click(screen.getByLabelText('I’ve reviewed the current values'))
    expect(confirm).toBeEnabled()
    fireEvent.click(confirm)

    await waitFor(() => expect(props.onDecided).toHaveBeenCalledWith('approved'))
    expect(postBody('/approve')).toEqual({ acknowledgeStale: true })
  })

  it('disables Confirm when the live total exceeds the threshold', async () => {
    serve(detail({ liveTotalAfter: 120, exceedsThresholdNow: true }))
    render(<ApprovalModal {...props} />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Allocation exceeds available capacity by 20%.')
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Reject' })).toBeEnabled()
  })

  it('posts reject with the optional note', async () => {
    serve(detail(), { status: 200, body: { success: true, data: { status: 'rejected' } } })
    render(<ApprovalModal {...props} />)

    fireEvent.change(await screen.findByLabelText('Note to the requester (optional)'), { target: { value: 'Not this quarter' } })
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }))

    await waitFor(() => expect(props.onDecided).toHaveBeenCalledWith('rejected'))
    expect(postBody('/reject')).toEqual({ note: 'Not this quarter' })
  })

  it('shows a clear message when the request was already decided', async () => {
    serve(detail(), {
      status: 409,
      body: { error: { code: 'REQUEST_NOT_PENDING', message: 'This request has already been decided.' } }
    })
    render(<ApprovalModal {...props} />)

    fireEvent.click(await screen.findByRole('button', { name: 'Confirm' }))
    expect(await screen.findByText('This request has already been decided.')).toBeInTheDocument()
    expect(props.onDecided).not.toHaveBeenCalled()
  })

  it('reloads the request when the sheet changed after it opened, then asks for acknowledgement', async () => {
    let loads = 0
    fetchMock = jest.fn((url: string, init?: RequestInit) => {
      if (url.endsWith('/requests/r1') && !init?.method) {
        loads += 1
        const data =
          loads === 1
            ? detail()
            : detail({
                stale: true,
                lines: [{ projectId: P2, projectName: 'MediFinder', previousPercent: 0, newPercent: 60, currentPercent: 10, active: true }]
              })
        return json(200, { success: true, data })
      }
      return json(409, { error: { code: 'STALE_REQUEST_UNACKNOWLEDGED', message: 'The allocation changed after this request was made.' } })
    })
    global.fetch = fetchMock as unknown as typeof fetch
    render(<ApprovalModal {...props} />)

    fireEvent.click(await screen.findByRole('button', { name: 'Confirm' }))

    expect(await screen.findByLabelText('I’ve reviewed the current values')).toBeInTheDocument()
    expect(loads).toBe(2)
  })

  it('names an inactive project and only allows rejecting', async () => {
    serve(
      detail({
        lines: [
          { projectId: P1, projectName: 'BaseNeo SaaS', previousPercent: 50, newPercent: 35, currentPercent: 50, active: true },
          { projectId: P2, projectName: 'MediFinder', previousPercent: 0, newPercent: 60, currentPercent: 0, active: false }
        ]
      })
    )
    render(<ApprovalModal {...props} />)

    expect(await screen.findByText('MediFinder is no longer active, so this request can only be rejected.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Reject' })).toBeEnabled()
  })

  it('shows a decided request read-only', async () => {
    serve(detail({ status: 'approved' }))
    render(<ApprovalModal {...props} />)

    expect(await screen.findByText('This request was approved.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Confirm' })).not.toBeInTheDocument()
  })
})
