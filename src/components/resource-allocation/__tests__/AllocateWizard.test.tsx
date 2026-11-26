/**
 * @jest-environment jsdom
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'

import { AllocateWizard } from '@/components/resource-allocation/AllocateWizard'

const P1 = 'aaaaaaaaaaaaaaaaaaaaaaaa'
const P2 = 'bbbbbbbbbbbbbbbbbbbbbbbb'

const rowFor = (memberId: string, name: string, total: number, cells: Record<string, { percent: number; onTeam: boolean }> = {}) => ({
  memberId,
  name,
  email: `${memberId}@example.com`,
  roleLabel: 'Senior UI/UX Designer',
  cells,
  total,
  remaining: Math.max(0, 100 - total),
  status: total >= 100 ? 'full' : total > 0 ? 'partial' : 'unallocated'
})

const sheet = {
  projects: [
    { _id: P1, name: 'AVO', billable: true, managers: [{ _id: 'me', name: 'Dion Perera' }] },
    { _id: P2, name: 'HelixOne', billable: true, managers: [{ _id: 'other', name: 'Ashen Perera' }] }
  ],
  rows: [rowFor('u1', 'Aruni Perera', 50, { [P2]: { percent: 50, onTeam: true } }), rowFor('u2', 'Dion Silva', 40, { [P2]: { percent: 40, onTeam: true } })],
  kpis: {},
  byRole: [],
  roles: [],
  threshold: 100,
  pagination: { page: 1, limit: 10, total: 2, totalPages: 1 },
  orphanedRequests: []
}

const memberFor = (id: string, name: string, onP2: number) => ({
  member: { _id: id, name, email: `${id}@example.com`, roleLabel: 'Senior UI/UX Designer' },
  lines: [
    { projectId: P1, projectName: 'AVO', percent: 0, onTeam: false, managerIds: ['me'] },
    { projectId: P2, projectName: 'HelixOne', percent: onP2, onTeam: true, managerIds: ['other'] }
  ],
  total: onP2,
  remaining: 100 - onP2,
  status: 'partial',
  threshold: 100
})

const json = (status: number, body: unknown) =>
  Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) } as Response)

let fetchMock: jest.Mock
let changeResponses: Record<string, { status: number; body: unknown }>

beforeEach(() => {
  jest.clearAllMocks()
  changeResponses = {}
  fetchMock = jest.fn((url: string, init?: RequestInit) => {
    if (url.includes('/members/u1')) return json(200, { success: true, data: memberFor('u1', 'Aruni Perera', 50) })
    if (url.includes('/members/u2')) return json(200, { success: true, data: memberFor('u2', 'Dion Silva', 40) })
    if (url.endsWith('/changes') && init?.method === 'POST') {
      const body = JSON.parse(String(init.body))
      const custom = changeResponses[body.memberId]
      if (custom) return json(custom.status, custom.body)
      return json(201, { success: true, data: { mode: 'applied', totalAfter: 80, addedToProjects: [] } })
    }
    if (url.startsWith('/api/resource-allocations')) return json(200, { success: true, data: sheet })
    return json(404, {})
  })
  global.fetch = fetchMock as unknown as typeof fetch
})

const onDone = jest.fn()
const button = (name: string | RegExp) => screen.getByRole('button', { name })
const employee = (name: string) => screen.getByRole('checkbox', { name: new RegExp(name) })

async function toStep3(mode: 'apply' | 'request' = 'apply', people = ['Aruni Perera']) {
  render(<AllocateWizard mode={mode} currentUserId="me" onDone={onDone} />)
  await screen.findByRole('checkbox', { name: /Aruni Perera/ })
  for (const person of people) fireEvent.click(employee(person))
  fireEvent.click(button('Continue'))
  fireEvent.click(await screen.findByRole('radio', { name: /^AVO/ }))
  fireEvent.click(button('Continue'))
  await screen.findAllByText('Set allocation for this project')
}

describe('AllocateWizard', () => {
  it('lets you select several employees, shows how many, and clears the selection', async () => {
    render(<AllocateWizard mode="apply" currentUserId="me" onDone={onDone} />)
    await screen.findByRole('checkbox', { name: /Aruni Perera/ })
    expect(screen.getByText('Showing 1 - 2 of 2')).toBeInTheDocument()

    fireEvent.click(employee('Aruni Perera'))
    fireEvent.click(employee('Dion Silva'))
    expect(screen.getByText('2 employees selected')).toBeInTheDocument()
    expect(employee('Aruni Perera')).toBeChecked()

    fireEvent.click(button('Clear selection'))
    expect(employee('Aruni Perera')).not.toBeChecked()
    expect(screen.queryByText(/employees? selected/)).not.toBeInTheDocument()
  })

  it('shows each employee\'s current total and what is available', async () => {
    render(<AllocateWizard mode="apply" currentUserId="me" onDone={onDone} />)
    const row = (await screen.findByRole('checkbox', { name: /Aruni Perera/ })).closest('label') as HTMLElement
    expect(row).toHaveTextContent('50%')
    expect(row).toHaveTextContent('50% available')
  })

  it('blocks Continue until a selection is made on each step', async () => {
    render(<AllocateWizard mode="apply" currentUserId="me" onDone={onDone} />)
    await screen.findByRole('checkbox', { name: /Aruni Perera/ })
    expect(button('Continue')).toBeDisabled()

    fireEvent.click(employee('Aruni Perera'))
    fireEvent.click(button('Continue'))

    await screen.findByRole('radio', { name: /^AVO/ })
    expect(button('Continue')).toBeDisabled()
  })

  it('shows projects as cards and disables the ones a PM does not manage', async () => {
    render(<AllocateWizard mode="request" currentUserId="me" onDone={onDone} />)
    fireEvent.click(await screen.findByRole('checkbox', { name: /Aruni Perera/ }))
    fireEvent.click(button('Continue'))

    expect(await screen.findByRole('radio', { name: /^AVO/ })).toBeEnabled()
    expect(screen.getByRole('radio', { name: /^HelixOne/ })).toBeDisabled()
    expect(screen.getByText('You can only add allocation to projects you manage.')).toBeInTheDocument()
  })

  it('caps each employee at what keeps them within the threshold', async () => {
    await toStep3('apply', ['Aruni Perera', 'Dion Silva'])

    const aruni = screen.getByLabelText('Allocation for Aruni Perera on AVO') as HTMLInputElement
    const dion = screen.getByLabelText('Allocation for Dion Silva on AVO') as HTMLInputElement
    fireEvent.click(button('Max (50%)'))
    fireEvent.click(button('Max (60%)'))
    expect(aruni.value).toBe('50')
    expect(dion.value).toBe('60')

    fireEvent.change(aruni, { target: { value: '80' } })
    expect(aruni.value).toBe('50')
  })

  it('reviews every employee and posts one change each with the shared reason', async () => {
    await toStep3('apply', ['Aruni Perera', 'Dion Silva'])
    fireEvent.change(screen.getByLabelText('Allocation for Aruni Perera on AVO'), { target: { value: '30' } })
    fireEvent.change(screen.getByLabelText('Allocation for Dion Silva on AVO'), { target: { value: '25' } })
    fireEvent.click(button('Continue'))

    const aruni = (await screen.findByText('Resulting capacity: 80% total')).closest('[data-review-row]') as HTMLElement
    expect(within(aruni).getByText('20% remaining')).toBeInTheDocument()
    expect(screen.getByText('Resulting capacity: 65% total')).toBeInTheDocument()

    expect(button('Save')).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Reason for allocation'), { target: { value: 'Design support' } })
    fireEvent.click(button('Save'))

    await waitFor(() => expect(onDone).toHaveBeenCalledWith({ mode: 'applied' }))
    const bodies = fetchMock.mock.calls
      .filter(([url]) => String(url).endsWith('/changes'))
      .map(([, init]) => JSON.parse(init.body))
    expect(bodies).toEqual([
      { memberId: 'u1', lines: [{ projectId: P1, newPercent: 30 }], reason: 'Design support' },
      { memberId: 'u2', lines: [{ projectId: P1, newPercent: 25 }], reason: 'Design support' }
    ])
  })

  it('reviews only the people whose allocation changes, and says how many are left as they are', async () => {
    await toStep3('apply', ['Aruni Perera', 'Dion Silva'])
    fireEvent.change(screen.getByLabelText('Allocation for Aruni Perera on AVO'), { target: { value: '30' } })
    fireEvent.click(button('Continue'))

    expect(await screen.findByText('Resulting capacity: 80% total')).toBeInTheDocument()
    expect(document.querySelectorAll('[data-review-row]')).toHaveLength(1)
    expect(screen.getByText('1 person keeps their current allocation and won’t be changed.')).toBeInTheDocument()
  })

  it('says which employees failed and keeps them for another try', async () => {
    changeResponses.u2 = {
      status: 409,
      body: { error: { code: 'REQUEST_ALREADY_PENDING', message: 'This team member already has a pending allocation request.' } }
    }
    await toStep3('request', ['Aruni Perera', 'Dion Silva'])
    fireEvent.change(screen.getByLabelText('Allocation for Aruni Perera on AVO'), { target: { value: '30' } })
    fireEvent.change(screen.getByLabelText('Allocation for Dion Silva on AVO'), { target: { value: '25' } })
    fireEvent.click(button('Continue'))
    fireEvent.change(await screen.findByLabelText('Reason for allocation'), { target: { value: 'Need help' } })
    fireEvent.click(button('Share to Approvals'))

    expect(await screen.findByText(/Dion Silva: This team member already has a pending allocation request\./)).toBeInTheDocument()
    expect(onDone).not.toHaveBeenCalled()
    expect(screen.queryByText('Resulting capacity: 80% total')).not.toBeInTheDocument()
    expect(screen.getByText('Resulting capacity: 65% total')).toBeInTheDocument()
  })

  it('starts from the live value again when you go back and pick another project', async () => {
    await toStep3('apply', ['Aruni Perera'])
    fireEvent.change(screen.getByLabelText('Allocation for Aruni Perera on AVO'), { target: { value: '30' } })

    fireEvent.click(button('Back'))
    fireEvent.click(await screen.findByRole('radio', { name: /^HelixOne/ }))
    fireEvent.click(button('Continue'))

    expect(((await screen.findByLabelText('Allocation for Aruni Perera on HelixOne')) as HTMLInputElement).value).toBe('50')
  })

  it('puts the step actions at the top next to the steps, like the design', async () => {
    render(<AllocateWizard mode="apply" currentUserId="me" onDone={onDone} />)
    await screen.findByRole('checkbox', { name: /Aruni Perera/ })

    const toolbar = screen.getByRole('navigation', { name: 'Steps' }).parentElement as HTMLElement
    expect(within(toolbar).getByRole('button', { name: 'Continue' })).toBeInTheDocument()
  })
})
