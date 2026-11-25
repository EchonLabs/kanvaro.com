/**
 * @jest-environment jsdom
 */
import { fireEvent, render, screen } from '@testing-library/react'

const mockSearch = { value: '' }
const mockReplace = jest.fn()

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn() }),
  usePathname: () => '/resource-allocation',
  useSearchParams: () => new URLSearchParams(mockSearch.value)
}))
jest.mock('@/components/layout/MainLayout', () => ({
  MainLayout: ({ children }: { children: React.ReactNode }) => <>{children}</>
}))
jest.mock('@/components/ui/PageContent', () => ({
  PageContent: ({ children }: { children: React.ReactNode }) => <>{children}</>
}))
jest.mock('@/contexts/AuthContext', () => ({ useAuthContext: () => ({ user: { id: 'hr' } }) }))
jest.mock('@/lib/notify', () => ({ useNotify: () => ({ success: jest.fn(), error: jest.fn() }) }))

const mockAccess = {
  loading: false,
  canView: true,
  canManage: true,
  canRequest: false,
  canApprove: true,
  canViewHistory: true,
  canEdit: true
}
jest.mock('@/components/resource-allocation/useResourceAllocationAccess', () => ({
  useResourceAllocationAccess: () => mockAccess
}))

import ResourceAllocationPage from '@/app/resource-allocation/page'

const P1 = 'aaaaaaaaaaaaaaaaaaaaaaaa'

const sheet = {
  projects: [{ _id: P1, name: 'AVO', billable: true, managers: [] }],
  rows: [
    {
      memberId: 'u1',
      name: 'Shalini Fernando',
      email: 's@example.com',
      roleLabel: 'Team Member',
      cells: { [P1]: { percent: 50, onTeam: true } },
      total: 50,
      remaining: 50,
      status: 'partial',
      pendingRequest: { id: 'r1', requestedBy: { _id: 'pm', name: 'Pam' } }
    }
  ],
  kpis: { totalResources: 1, fullyAllocated: 0, partiallyAllocated: 1, unallocated: 0, overallocated: 0, availableCapacity: 50 },
  byRole: [],
  roles: ['Team Member'],
  threshold: 100,
  pagination: { page: 1, limit: 10, total: 1, totalPages: 1 }
}

const detail = {
  _id: 'r1',
  status: 'pending',
  reason: 'Need design help',
  member: { _id: 'u1', name: 'Shalini Fernando' },
  requestedBy: { _id: 'pm', name: 'Pam Manager', roleLabel: 'Project Manager' },
  lines: [{ projectId: P1, projectName: 'AVO', previousPercent: 50, newPercent: 80, currentPercent: 50 }],
  totalBefore: 50,
  totalAfter: 80,
  createdAt: '2026-11-20T10:00:00.000Z',
  stale: false,
  liveTotalBefore: 50,
  liveTotalAfter: 80,
  exceedsThresholdNow: false,
  threshold: 100
}

const json = (body: unknown) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) } as Response)

beforeEach(() => {
  mockSearch.value = ''
  global.fetch = jest.fn((url: string) => {
    if (url.includes('/requests/r1')) return json({ success: true, data: detail })
    if (url.includes('/history')) return json({ success: true, data: { items: [], total: 3 } })
    return json({ success: true, data: sheet })
  }) as unknown as typeof fetch
})

describe('Resource Allocation page', () => {
  it('opens the approval modal from the pencil in the Approvals column', async () => {
    render(<ResourceAllocationPage />)

    fireEvent.click(await screen.findByRole('button', { name: 'Review request for Shalini Fernando' }))

    expect(await screen.findByText('Need design help')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument()
  })

  it('opens the request named in the URL (from a notification link)', async () => {
    mockSearch.value = 'request=r1'
    render(<ResourceAllocationPage />)

    expect(await screen.findByText('Need design help')).toBeInTheDocument()
  })

  it('shows the history tab when selected', async () => {
    mockSearch.value = 'tab=history'
    render(<ResourceAllocationPage />)

    expect(await screen.findByText('A complete audit trail of resource allocation changes')).toBeInTheDocument()
  })
})
