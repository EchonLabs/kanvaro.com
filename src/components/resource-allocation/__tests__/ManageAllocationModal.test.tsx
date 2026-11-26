/**
 * @jest-environment jsdom
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'

import { ManageAllocationModal } from '@/components/resource-allocation/ManageAllocationModal'

const P1 = 'aaaaaaaaaaaaaaaaaaaaaaaa'
const P2 = 'bbbbbbbbbbbbbbbbbbbbbbbb'
const P3 = 'cccccccccccccccccccccccc'

const member = {
  member: { _id: 'u1', name: 'Shalini Fernando', email: 's@example.com', roleLabel: 'Senior UI/UX Designer' },
  lines: [
    { projectId: P1, projectName: 'AVO', percent: 0, onTeam: false, managerIds: ['me'] },
    { projectId: P2, projectName: 'BaseNeo SaaS', percent: 50, onTeam: true, managerIds: ['other'] },
    { projectId: P3, projectName: 'MediFinder', percent: 0, onTeam: false, managerIds: ['other'] }
  ],
  total: 50,
  remaining: 50,
  status: 'partial',
  threshold: 100
}

const json = (status: number, body: unknown) =>
  Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) } as Response)

let fetchMock: jest.Mock

beforeEach(() => {
  jest.clearAllMocks()
  fetchMock = jest.fn((url: string, init?: RequestInit) => {
    if (url.endsWith('/members/u1')) return json(200, { success: true, data: member })
    if (url.endsWith('/changes') && init?.method === 'POST') {
      return json(201, { success: true, data: { mode: 'applied', totalAfter: 95, addedToProjects: [] } })
    }
    return json(404, { error: { code: 'NOT_FOUND', message: 'x' } })
  })
  global.fetch = fetchMock as unknown as typeof fetch
})

const props = { memberId: 'u1', open: true, currentUserId: 'me', onClose: jest.fn(), onDone: jest.fn() }

const newInput = (projectName: string) => screen.getByLabelText(`New allocation for ${projectName}`) as HTMLInputElement

async function renderModal(mode: 'apply' | 'request' = 'apply') {
  render(<ManageAllocationModal {...props} mode={mode} />)
  await screen.findByText('Shalini Fernando')
}

describe('ManageAllocationModal', () => {
  it('lists every active project with its current allocation', async () => {
    await renderModal()

    expect(newInput('AVO').value).toBe('0')
    expect(newInput('BaseNeo SaaS').value).toBe('50')
    expect(newInput('MediFinder').value).toBe('0')
    expect(screen.getByText('Total Allocation').nextSibling).toHaveTextContent('50%')
    expect(screen.getByText('Available Capacity').nextSibling).toHaveTextContent('50%')
  })

  it('shows a project tile with the first two letters of each project, like the design', async () => {
    await renderModal()

    for (const [name, tile] of [['AVO', 'AV'], ['BaseNeo SaaS', 'Ba'], ['MediFinder', 'Me']]) {
      const row = newInput(name).closest('tr') as HTMLElement
      expect(within(row).getByText(tile)).toHaveAttribute('aria-hidden', 'true')
    }
  })

  it('shows the person-to-project header on the review step', async () => {
    await renderModal()
    fireEvent.change(newInput('MediFinder'), { target: { value: '30' } })
    fireEvent.change(screen.getByLabelText('Reason for change'), { target: { value: 'Need design' } })
    fireEvent.click(screen.getByRole('button', { name: 'Review Changes' }))

    expect(screen.getByTestId('change-header')).toBeInTheDocument()
  })

  it('disables Review Changes until a value changes and a reason is entered', async () => {
    await renderModal()
    const review = screen.getByRole('button', { name: 'Review Changes' })
    expect(review).toBeDisabled()

    fireEvent.change(newInput('MediFinder'), { target: { value: '30' } })
    expect(review).toBeDisabled()

    fireEvent.change(screen.getByLabelText('Reason for change'), { target: { value: 'New project requirement' } })
    expect(review).toBeEnabled()
  })

  it('shows the difference per project', async () => {
    await renderModal()
    fireEvent.change(newInput('BaseNeo SaaS'), { target: { value: '35' } })
    fireEvent.change(newInput('MediFinder'), { target: { value: '60' } })

    expect(screen.getByText('-15%')).toBeInTheDocument()
    expect(screen.getByText('+60%')).toBeInTheDocument()
  })

  it('disables Review Changes and shows the exceeds message when over the threshold', async () => {
    await renderModal()
    fireEvent.change(newInput('MediFinder'), { target: { value: '70' } })
    fireEvent.change(screen.getByLabelText('Reason for change'), { target: { value: 'Need more' } })

    expect(screen.getByRole('alert')).toHaveTextContent('Allocation exceeds available capacity by 20%.')
    expect(screen.getByRole('button', { name: 'Review Changes' })).toBeDisabled()
    expect(screen.getByText('Available Capacity').nextSibling).toHaveTextContent('-20%')
    expect(screen.getByText('Overallocated')).toBeInTheDocument()
  })

  it('clamps values to 0–100 integers', async () => {
    await renderModal()
    fireEvent.change(newInput('AVO'), { target: { value: '150' } })
    expect(newInput('AVO').value).toBe('100')
    fireEvent.change(newInput('AVO'), { target: { value: '-5' } })
    expect(newInput('AVO').value).toBe('0')
    fireEvent.change(newInput('AVO'), { target: { value: '12.7' } })
    expect(newInput('AVO').value).toBe('12')
  })

  it('shows Confirm for apply mode and posts only changed lines', async () => {
    await renderModal('apply')
    fireEvent.change(newInput('BaseNeo SaaS'), { target: { value: '35' } })
    fireEvent.change(newInput('MediFinder'), { target: { value: '60' } })
    fireEvent.change(screen.getByLabelText('Reason for change'), { target: { value: 'Project workload change' } })
    fireEvent.click(screen.getByRole('button', { name: 'Review Changes' }))

    expect(screen.getByText('Total allocation').nextSibling).toHaveTextContent('95%')
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))

    await waitFor(() => expect(props.onDone).toHaveBeenCalledWith({ mode: 'applied' }))
    const [, init] = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/changes'))
    expect(JSON.parse(init.body)).toEqual({
      memberId: 'u1',
      lines: [
        { projectId: P2, newPercent: 35 },
        { projectId: P3, newPercent: 60 }
      ],
      reason: 'Project workload change'
    })
  })

  it('shows Share to Approvals for request mode', async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url.endsWith('/members/u1')) return json(200, { success: true, data: member })
      if (url.endsWith('/changes') && init?.method === 'POST') {
        return json(201, { success: true, data: { mode: 'requested', requestId: 'r1' } })
      }
      return json(404, {})
    })
    await renderModal('request')
    fireEvent.change(newInput('AVO'), { target: { value: '20' } })
    fireEvent.change(screen.getByLabelText('Reason for change'), { target: { value: 'Need help' } })
    fireEvent.click(screen.getByRole('button', { name: 'Review Changes' }))
    fireEvent.click(screen.getByRole('button', { name: 'Share to Approvals' }))

    await waitFor(() => expect(props.onDone).toHaveBeenCalledWith({ mode: 'requested' }))
  })

  it('in request mode, only allows increases on projects the PM manages', async () => {
    await renderModal('request')

    fireEvent.change(newInput('MediFinder'), { target: { value: '30' } })
    expect(newInput('MediFinder').value).toBe('0')
    fireEvent.change(newInput('BaseNeo SaaS'), { target: { value: '20' } })
    expect(newInput('BaseNeo SaaS').value).toBe('20')
    fireEvent.change(newInput('AVO'), { target: { value: '30' } })
    expect(newInput('AVO').value).toBe('30')
    expect(screen.getAllByText('You can only reduce this project').length).toBe(2)
  })

  it('redraws a held value instead of leaving what was typed (no "00")', async () => {
    await renderModal('request')

    fireEvent.change(newInput('MediFinder'), { target: { value: '00' } })
    expect(newInput('MediFinder').value).toBe('0')
  })

  it('shows the server message when the change is refused, and stays open', async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url.endsWith('/members/u1')) return json(200, { success: true, data: member })
      if (init?.method === 'POST') {
        return json(409, {
          error: { code: 'REQUEST_ALREADY_PENDING', message: 'This team member already has a pending allocation request.' }
        })
      }
      return json(404, {})
    })
    await renderModal('request')
    fireEvent.change(newInput('AVO'), { target: { value: '20' } })
    fireEvent.change(screen.getByLabelText('Reason for change'), { target: { value: 'Need help' } })
    fireEvent.click(screen.getByRole('button', { name: 'Review Changes' }))
    fireEvent.click(screen.getByRole('button', { name: 'Share to Approvals' }))

    expect(await screen.findByText('This team member already has a pending allocation request.')).toBeInTheDocument()
    expect(props.onDone).not.toHaveBeenCalled()
  })
})
