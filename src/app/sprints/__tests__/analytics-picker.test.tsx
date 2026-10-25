/**
 * @jest-environment jsdom
 */
/**
 * The sidebar's way into Stand-up Analytics (`/sprints/analytics`): a plain
 * list of the sprints that have stand-ups, each linking to its own report.
 * The report is per sprint, so a global nav item needs somewhere to choose.
 */
import { fireEvent, render, screen, within } from '@testing-library/react'

import { standupStrings } from '@/lib/standup/strings'

import SprintAnalyticsPickerPage from '../analytics/page'

const s = standupStrings.analytics

const breadcrumbs = jest.fn()

jest.mock('@/components/layout/MainLayout', () => ({
  MainLayout: ({ children, breadcrumbItems }: { children: React.ReactNode; breadcrumbItems: unknown }) => {
    breadcrumbs(breadcrumbItems)
    return <div>{children}</div>
  }
}))

const sprint = (overrides: Record<string, unknown> = {}) => ({
  _id: 's1',
  name: 'Sprint 14',
  status: 'active',
  startDate: '2026-10-01T00:00:00.000Z',
  endDate: '2026-10-14T00:00:00.000Z',
  project: { _id: 'p1', name: 'Kanvaro Web' },
  ...overrides
})

function respond(status: number, body: unknown) {
  return Promise.resolve({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) })
}

describe('SprintAnalyticsPickerPage', () => {
  beforeEach(() => {
    breadcrumbs.mockClear()
    global.fetch = jest.fn() as unknown as typeof fetch
  })

  it('asks only for sprints that have stand-ups', async () => {
    ;(global.fetch as jest.Mock).mockReturnValue(respond(200, { success: true, data: [] }))

    render(<SprintAnalyticsPickerPage />)
    await screen.findByText(s.pickerEmpty())

    const url = String((global.fetch as jest.Mock).mock.calls[0][0])
    expect(url).toContain('/api/sprints?')
    expect(decodeURIComponent(url)).toContain('status=active,planned,completed')
  })

  it('links each sprint to its own analytics report, grouped by state', async () => {
    ;(global.fetch as jest.Mock).mockReturnValue(
      respond(200, {
        success: true,
        data: [
          sprint(),
          sprint({ _id: 's2', name: 'Sprint 13', status: 'completed', project: { _id: 'p1', name: 'Kanvaro Web' } }),
          sprint({ _id: 's3', name: 'Sprint 1', status: 'planned', project: { _id: 'p2', name: 'Atlas' } })
        ]
      })
    )

    render(<SprintAnalyticsPickerPage />)

    const active = await screen.findByRole('link', { name: /Sprint 14/ })
    expect(active).toHaveAttribute('href', '/sprints/s1/analytics')
    expect(screen.getByRole('link', { name: /Sprint 13/ })).toHaveAttribute('href', '/sprints/s2/analytics')
    expect(screen.getByRole('link', { name: /Sprint 1\b/ })).toHaveAttribute('href', '/sprints/s3/analytics')

    const groups = screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)
    expect(groups).toEqual([s.pickerGroup({ status: 'active' }), s.pickerGroup({ status: 'planned' }), s.pickerGroup({ status: 'completed' })])
    expect(within(active).getByText('Kanvaro Web')).toBeInTheDocument()
  })

  it('adds no padding of its own, since MainLayout already pads the content', async () => {
    ;(global.fetch as jest.Mock).mockReturnValue(respond(200, { success: true, data: [] }))

    render(<SprintAnalyticsPickerPage />)
    await screen.findByText(s.pickerEmpty())

    expect(screen.getByTestId('analytics-picker-page').className).not.toMatch(/(^|\s)(md:|sm:|lg:)?p[xytblr]?-\d/)
  })

  it('has the Sprints trail like the page it leads to', async () => {
    ;(global.fetch as jest.Mock).mockReturnValue(respond(200, { success: true, data: [] }))

    render(<SprintAnalyticsPickerPage />)
    await screen.findByText(s.pickerEmpty())

    expect(breadcrumbs).toHaveBeenLastCalledWith([
      { label: 'Sprints', href: '/sprints' },
      { label: s.breadcrumb() }
    ])
  })

  it('offers a retry when the list fails to load', async () => {
    ;(global.fetch as jest.Mock)
      .mockReturnValueOnce(respond(500, {}))
      .mockReturnValueOnce(respond(200, { success: true, data: [sprint()] }))

    render(<SprintAnalyticsPickerPage />)

    expect(await screen.findByText(s.pickerLoadFailed())).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: s.retry() }))

    expect(await screen.findByRole('link', { name: /Sprint 14/ })).toBeInTheDocument()
  })

  it('says so, with a way to the Sprints list, when the caller has no sprint with stand-ups', async () => {
    ;(global.fetch as jest.Mock).mockReturnValue(respond(200, { success: true, data: [] }))

    render(<SprintAnalyticsPickerPage />)

    expect(await screen.findByText(s.pickerEmpty())).toBeInTheDocument()
    expect(screen.getByRole('link', { name: s.pickerAllSprints() })).toHaveAttribute('href', '/sprints')
  })
})
