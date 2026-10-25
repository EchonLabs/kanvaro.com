/**
 * @jest-environment jsdom
 */
/**
 * The Sprint Management module's analytics page (`/sprints/[id]/analytics`,
 * §15.15): its three load outcomes, the breadcrumb trail beside planning's,
 * and that every widget renders — the widgets' own behaviour is
 * `analytics-cards.test.tsx`'s job.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { buildAnalyticsPayload } from '@/lib/standup/analytics-payload'
import { emptyInputs, populatedInputs } from '@/lib/standup/__tests__/helpers/analytics-fixtures'
import { standupStrings } from '@/lib/standup/strings'

import SprintAnalyticsPage from '../analytics/page'

const s = standupStrings.analytics

const breadcrumbs = jest.fn()

jest.mock('next/navigation', () => ({
  useParams: () => ({ id: 'sprint-1' })
}))

jest.mock('@/components/layout/MainLayout', () => ({
  MainLayout: ({ children, breadcrumbItems }: { children: React.ReactNode; breadcrumbItems: unknown }) => {
    breadcrumbs(breadcrumbItems)
    return <div>{children}</div>
  }
}))

function respond(status: number, body: unknown) {
  return Promise.resolve({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) })
}

describe('SprintAnalyticsPage', () => {
  beforeEach(() => {
    breadcrumbs.mockClear()
    global.fetch = jest.fn() as unknown as typeof fetch
  })

  it('loads the sprint\'s analytics and renders every widget', async () => {
    ;(global.fetch as jest.Mock).mockReturnValue(
      respond(200, { success: true, data: buildAnalyticsPayload(populatedInputs(), 'full') })
    )

    render(<SprintAnalyticsPage />)

    expect(screen.getByTestId('analytics-loading')).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: s.title() })).toBeInTheDocument()
    expect(global.fetch).toHaveBeenCalledWith('/api/sprints/sprint-1/analytics')

    for (const section of [
      s.sectionAllocationHealth(),
      s.sectionDebtTrend(),
      s.sectionAccuracy(),
      s.sectionAgeing(),
      s.sectionOverrides(),
      s.sectionChronic(),
      s.sectionDiscipline(),
      s.sectionSpillChains()
    ]) {
      expect(screen.getByRole('heading', { name: section })).toBeInTheDocument()
    }
    expect(screen.getAllByTestId('analytics-stat-tile')).toHaveLength(4)
  })

  it('puts the page under its sprint and project in the breadcrumb, like planning', async () => {
    ;(global.fetch as jest.Mock).mockReturnValue(
      respond(200, { success: true, data: buildAnalyticsPayload(emptyInputs(), 'aggregate') })
    )

    render(<SprintAnalyticsPage />)
    await screen.findByRole('heading', { name: s.title() })

    expect(breadcrumbs).toHaveBeenLastCalledWith([
      { label: 'Projects', href: '/projects' },
      { label: 'View Project', href: '/projects/project-1' },
      { label: 'View Sprint', href: '/sprints/sprint-1' },
      { label: s.breadcrumb() }
    ])
    // Before the project is known, the flat Sprints trail.
    expect(breadcrumbs.mock.calls[0][0]).toEqual([
      { label: 'Sprints', href: '/sprints' },
      { label: 'View Sprint', href: '/sprints/sprint-1' },
      { label: s.breadcrumb() }
    ])
  })

  it('says plainly when the caller may not see the analytics', async () => {
    ;(global.fetch as jest.Mock).mockReturnValue(respond(403, { error: { code: 'FORBIDDEN' } }))

    render(<SprintAnalyticsPage />)

    expect(await screen.findByText(s.forbidden())).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: s.retry() })).not.toBeInTheDocument()
  })

  it('says when the sprint is gone', async () => {
    ;(global.fetch as jest.Mock).mockReturnValue(respond(404, { error: { code: 'NOT_FOUND' } }))

    render(<SprintAnalyticsPage />)

    expect(await screen.findByText(s.notFound())).toBeInTheDocument()
  })

  it('offers a retry after a failed load, and the retry loads the report', async () => {
    ;(global.fetch as jest.Mock)
      .mockReturnValueOnce(respond(500, {}))
      .mockReturnValueOnce(respond(200, { success: true, data: buildAnalyticsPayload(emptyInputs(), 'aggregate') }))

    render(<SprintAnalyticsPage />)

    expect(await screen.findByText(s.loadFailed())).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: s.retry() }))

    expect(await screen.findByRole('heading', { name: s.title() })).toBeInTheDocument()
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2))
  })
})
