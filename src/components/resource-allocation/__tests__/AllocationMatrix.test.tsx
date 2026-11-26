/**
 * @jest-environment jsdom
 */
import { fireEvent, render, screen, within } from '@testing-library/react'

import { AllocationMatrix } from '@/components/resource-allocation/AllocationMatrix'
import type { ActiveProject, SheetRow } from '@/components/resource-allocation/api'

const P1 = 'aaaaaaaaaaaaaaaaaaaaaaaa'
const P2 = 'bbbbbbbbbbbbbbbbbbbbbbbb'

const projects: ActiveProject[] = [
  { _id: P1, name: 'AVO', billable: true, managers: [{ _id: 'm1', name: 'Dilakshi Perera' }] },
  { _id: P2, name: 'BaseNeo SaaS', billable: false, managers: [{ _id: 'm2', name: 'Nadeeshani Silva' }] }
]

const row = (over: Partial<SheetRow> = {}): SheetRow => ({
  memberId: 'u1',
  name: 'Dulmi Kaushalya',
  email: 'dulmi@example.com',
  roleLabel: 'Team Member',
  cells: { [P1]: { percent: 60, onTeam: true } },
  total: 60,
  remaining: 40,
  status: 'partial',
  ...over
})

const base = {
  projects,
  threshold: 100,
  canEdit: true,
  canApprove: false,
  currentUserId: 'me',
  rowOffset: 0,
  onManage: jest.fn(),
  onOpenRequest: jest.fn()
}

describe('AllocationMatrix', () => {
  beforeEach(() => jest.clearAllMocks())

  it('renders one column per active project with Billable/Non-billable and PM names', () => {
    render(<AllocationMatrix {...base} rows={[row()]} />)

    const table = screen.getByRole('table')
    expect(within(table).getByText('AVO')).toBeInTheDocument()
    expect(within(table).getByText('BaseNeo SaaS')).toBeInTheDocument()
    expect(within(table).getByText('Billable')).toBeInTheDocument()
    expect(within(table).getByText('Non-billable')).toBeInTheDocument()
    expect(within(table).getByText('Dilakshi Perera')).toBeInTheDocument()
    expect(within(table).getByText('Nadeeshani Silva')).toBeInTheDocument()
  })

  it('shows the member, role, total, each cell and remaining', () => {
    render(<AllocationMatrix {...base} rows={[row()]} />)

    const tr = screen.getByText('Dulmi Kaushalya').closest('tr') as HTMLElement
    expect(within(tr).getByText('Team Member')).toBeInTheDocument()
    expect(within(tr).getByText('dulmi@example.com')).toBeInTheDocument()
    expect(within(tr).getAllByText('60%')).toHaveLength(2) // total + AVO cell
    expect(within(tr).getByText('—')).toBeInTheDocument() // BaseNeo empty
    expect(within(tr).getByText('40%')).toBeInTheDocument()
    expect(within(tr).getByText('Partially Allocated')).toBeInTheDocument()
  })

  it('numbers rows from the page offset', () => {
    render(<AllocationMatrix {...base} rowOffset={10} rows={[row()]} />)
    const tr = screen.getByText('Dulmi Kaushalya').closest('tr') as HTMLElement
    expect(within(tr).getByText('11')).toBeInTheDocument()
  })

  it('highlights over-threshold rows and labels them Overallocated', () => {
    render(<AllocationMatrix {...base} rows={[row({ total: 120, remaining: 0, status: 'over' })]} />)

    const tr = screen.getByText('Dulmi Kaushalya').closest('tr') as HTMLElement
    expect(tr).toHaveAttribute('data-status', 'over')
    expect(within(tr).getByText('Overallocated')).toBeInTheDocument()
  })

  it('shows the Allocation Pending chip when a request is pending', () => {
    render(
      <AllocationMatrix
        {...base}
        rows={[row({ pendingRequest: { id: 'r1', requestedBy: { _id: 'pm', name: 'Pam' } } })]}
      />
    )
    expect(screen.getByText('Allocation Pending')).toBeInTheDocument()
    expect(screen.queryByText('Partially Allocated')).not.toBeInTheDocument()
  })

  it('marks a cell whose member is not on the team', () => {
    render(<AllocationMatrix {...base} rows={[row({ cells: { [P1]: { percent: 60, onTeam: false } } })]} />)
    expect(screen.getByLabelText(/not on team/i)).toBeInTheDocument()
  })

  it('hides Manage Allocation when canEdit is false', () => {
    render(<AllocationMatrix {...base} canEdit={false} rows={[row()]} />)
    expect(screen.queryByRole('button', { name: /manage allocation/i })).not.toBeInTheDocument()
  })

  it('calls onManage with the member id', () => {
    render(<AllocationMatrix {...base} rows={[row()]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Manage allocation for Dulmi Kaushalya' }))
    expect(base.onManage).toHaveBeenCalledWith('u1')
  })

  it('shows an Approvals column only to approvers, with a pencil on pending rows and N/A elsewhere', () => {
    const rows = [
      row({ pendingRequest: { id: 'r1', requestedBy: { _id: 'pm', name: 'Pam' } } }),
      row({ memberId: 'u2', name: 'Kavindu Silva', email: 'k@example.com' })
    ]
    const { rerender } = render(<AllocationMatrix {...base} rows={rows} />)
    expect(screen.queryByText('Approvals')).not.toBeInTheDocument()

    rerender(<AllocationMatrix {...base} canApprove rows={rows} />)
    expect(screen.getByText('Approvals')).toBeInTheDocument()
    expect(screen.getByText('N/A')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Review request for Dulmi Kaushalya' }))
    expect(base.onOpenRequest).toHaveBeenCalledWith('r1')
  })

  it('lets a PM open their own pending request but not manage that member again', () => {
    render(
      <AllocationMatrix
        {...base}
        rows={[row({ pendingRequest: { id: 'r1', requestedBy: { _id: 'me', name: 'Me' } } })]}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: 'View request for Dulmi Kaushalya' }))
    expect(base.onOpenRequest).toHaveBeenCalledWith('r1')
    expect(screen.getByRole('button', { name: 'Manage allocation for Dulmi Kaushalya' })).toBeDisabled()
  })

  it('labels the header rows like the design: Project name, PM / BA, then Allocation % per project', () => {
    render(<AllocationMatrix {...base} rows={[row()]} />)

    const rows = screen.getAllByRole('row')
    expect(within(rows[0]).getByText('Project name')).toBeInTheDocument()
    expect(within(rows[1]).getByText('PM / BA')).toBeInTheDocument()
    expect(within(rows[2]).getAllByText('Allocation %')).toHaveLength(2)
    expect(within(rows[2]).getByText('Employee')).toBeInTheDocument()
  })

  it('pins each left column at the sum of the widths before it, so pinned cells never overlap', () => {
    render(<AllocationMatrix {...base} rows={[row()]} />)

    const pinned = Array.from(document.querySelectorAll<HTMLElement>('thead tr:last-child th[data-pin="left"]'))
    expect(pinned).toHaveLength(4)
    let offset = 0
    for (const cell of pinned) {
      expect(cell.style.left).toBe(`${offset}px`)
      offset += parseInt(cell.style.width, 10)
    }
  })

  it('keeps pinned cells opaque on an overallocated row', () => {
    render(<AllocationMatrix {...base} rows={[row({ total: 120, remaining: 0, status: 'over' })]} />)

    const tr = screen.getByText('Dulmi Kaushalya').closest('tr') as HTMLElement
    // `--card` is an HSL triplet, so it must be wrapped in hsl() to be a colour at all.
    expect(tr.className).toContain('hsl(var(--card))')
    expect(tr.className).not.toMatch(/,var\(--card\)\)/)
  })

  it('shows an empty state when there are no rows', () => {
    render(<AllocationMatrix {...base} rows={[]} />)
    expect(screen.getByText('No resources match these filters.')).toBeInTheDocument()
  })
})
