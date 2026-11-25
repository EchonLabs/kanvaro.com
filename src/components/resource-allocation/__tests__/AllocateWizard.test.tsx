/**
 * @jest-environment jsdom
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { AllocateWizard } from '@/components/resource-allocation/AllocateWizard'

const P1 = 'aaaaaaaaaaaaaaaaaaaaaaaa'
const P2 = 'bbbbbbbbbbbbbbbbbbbbbbbb'

const sheet = {
  projects: [
    { _id: P1, name: 'AVO', billable: true, managers: [{ _id: 'me', name: 'Dion Perera' }] },
    { _id: P2, name: 'HelixOne', billable: true, managers: [{ _id: 'other', name: 'Ashen Perera' }] }
  ],
  rows: [
    {
      memberId: 'u1',
      name: 'Aruni Perera',
      email: 'a@example.com',
      roleLabel: 'Senior UI/UX Designer',
      cells: { [P2]: { percent: 50, onTeam: true } },
      total: 50,
      remaining: 50,
      status: 'partial'
    }
  ],
  kpis: {},
  byRole: [],
  roles: [],
  threshold: 100,
  pagination: { page: 1, limit: 50, total: 1, totalPages: 1 }
}

const member = {
  member: { _id: 'u1', name: 'Aruni Perera', email: 'a@example.com', roleLabel: 'Senior UI/UX Designer' },
  lines: [
    { projectId: P1, projectName: 'AVO', percent: 0, onTeam: false },
    { projectId: P2, projectName: 'HelixOne', percent: 50, onTeam: true }
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
    if (url.includes('/members/u1')) return json(200, { success: true, data: member })
    if (url.endsWith('/changes') && init?.method === 'POST') {
      return json(201, { success: true, data: { mode: 'applied', totalAfter: 80, addedToProjects: [] } })
    }
    if (url.startsWith('/api/resource-allocations')) return json(200, { success: true, data: sheet })
    return json(404, {})
  })
  global.fetch = fetchMock as unknown as typeof fetch
})

const onDone = jest.fn()
const continueButton = () => screen.getByRole('button', { name: 'Continue' })

async function toStep3(mode: 'apply' | 'request' = 'apply') {
  render(<AllocateWizard mode={mode} currentUserId="me" onDone={onDone} />)
  fireEvent.click(await screen.findByRole('button', { name: /Aruni Perera/ }))
  fireEvent.click(continueButton())
  fireEvent.click(await screen.findByRole('button', { name: /^AVO/ }))
  fireEvent.click(continueButton())
  await screen.findByText('Set allocation for this project')
}

describe('AllocateWizard', () => {
  it('blocks Continue until a selection is made on each step', async () => {
    render(<AllocateWizard mode="apply" currentUserId="me" onDone={onDone} />)
    await screen.findByRole('button', { name: /Aruni Perera/ })
    expect(continueButton()).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: /Aruni Perera/ }))
    expect(continueButton()).toBeEnabled()
    fireEvent.click(continueButton())

    await screen.findByRole('button', { name: /^AVO/ })
    expect(continueButton()).toBeDisabled()
  })

  it('shows each employee\'s current total and what is available', async () => {
    render(<AllocateWizard mode="apply" currentUserId="me" onDone={onDone} />)
    const option = await screen.findByRole('button', { name: /Aruni Perera/ })
    expect(option).toHaveTextContent('50%')
    expect(option).toHaveTextContent('50% available')
  })

  it('disables projects the PM does not manage in request mode', async () => {
    render(<AllocateWizard mode="request" currentUserId="me" onDone={onDone} />)
    fireEvent.click(await screen.findByRole('button', { name: /Aruni Perera/ }))
    fireEvent.click(continueButton())

    expect(await screen.findByRole('button', { name: /^AVO/ })).toBeEnabled()
    expect(screen.getByRole('button', { name: /^HelixOne/ })).toBeDisabled()
    expect(screen.getByText('You can only add allocation to projects you manage.')).toBeInTheDocument()
  })

  it('caps the allocation at what keeps the person within the threshold', async () => {
    await toStep3()
    const input = screen.getByLabelText('Allocation for AVO') as HTMLInputElement

    fireEvent.click(screen.getByRole('button', { name: 'Max (50%)' }))
    expect(input.value).toBe('50')

    fireEvent.click(screen.getByRole('button', { name: 'Increase allocation' }))
    expect(input.value).toBe('50')

    fireEvent.change(input, { target: { value: '80' } })
    expect(input.value).toBe('50')
  })

  it('walks employee → project → allocation → review and posts one line', async () => {
    await toStep3()
    expect(screen.getByText('Current Allocation').nextSibling).toHaveTextContent('50%')
    expect(screen.getByText('Available').nextSibling).toHaveTextContent('50%')

    fireEvent.change(screen.getByLabelText('Allocation for AVO'), { target: { value: '30' } })
    fireEvent.click(continueButton())

    expect(await screen.findByText('Resulting capacity: 80% total')).toBeInTheDocument()
    expect(screen.getByText('20% remaining')).toBeInTheDocument()
    const save = screen.getByRole('button', { name: 'Save' })
    expect(save).toBeDisabled()

    fireEvent.change(screen.getByLabelText('Reason for allocation'), { target: { value: 'Design support' } })
    fireEvent.click(save)

    await waitFor(() => expect(onDone).toHaveBeenCalledWith({ mode: 'applied' }))
    const [, init] = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/changes'))
    expect(JSON.parse(init.body)).toEqual({
      memberId: 'u1',
      lines: [{ projectId: P1, newPercent: 30 }],
      reason: 'Design support'
    })
  })

  it('labels the final action Share to Approvals in request mode', async () => {
    await toStep3('request')
    fireEvent.change(screen.getByLabelText('Allocation for AVO'), { target: { value: '20' } })
    fireEvent.click(continueButton())
    expect(await screen.findByRole('button', { name: 'Share to Approvals' })).toBeInTheDocument()
  })
})
