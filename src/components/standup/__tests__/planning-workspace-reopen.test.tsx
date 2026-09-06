/**
 * @jest-environment jsdom
 */
/**
 * A sprint that has already completed planning once must not let a PM slide
 * straight back into "Start planning" -> "Complete planning" with no
 * friction. Before this fix, the button read "Start planning" whether or not
 * a planning session had ever run, so a PM (or a stray double click) could
 * loop plan -> complete -> plan on an already-Planned sprint indefinitely,
 * before the sprint had even started.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'

import { PlanningWorkspace } from '../PlanningWorkspace'

jest.mock('@/lib/permissions/permission-context', () => ({
  usePermissions: () => ({
    hasPermission: () => true,
    loading: false,
    permissions: { global: [], project: {} }
  })
}))

jest.mock('@/lib/notify', () => ({
  useNotify: () => ({ error: jest.fn(), info: jest.fn() })
}))

function mockFetchFor({ history }: { history: any[] }) {
  return jest.fn((url: string) => {
    if (url.includes('/planning-session/checklist')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          data: {
            checklist: {
              items: [],
              blockers: [],
              canComplete: true,
              totals: {
                taskCount: 0,
                estimatedTaskCount: 0,
                totalEstimatedMinutes: 0,
                totalCapacityMinutes: 0,
                netCapacityMinutes: 0
              }
            },
            offendingTasks: [],
            offendingMembers: []
          }
        })
      })
    }
    if (url.endsWith('/planning-session')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ data: { session: null, history } })
      })
    }
    if (url.includes('/poker-sessions')) {
      return Promise.resolve({ ok: true, json: async () => ({ data: { sessions: [] } }) })
    }
    return Promise.resolve({ ok: true, json: async () => ({ data: {} }) })
  }) as unknown as typeof fetch
}

describe('PlanningWorkspace — reopening an already-planned sprint (E20)', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('offers a plain "Start planning" button when planning has never run', async () => {
    global.fetch = mockFetchFor({ history: [] })

    render(
      <PlanningWorkspace
        sprintId="s1"
        sprintName="Sprint 1"
        sprintStatus="planning"
        projectId="p1"
      />
    )

    expect(await screen.findByRole('button', { name: /start planning/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /reopen planning/i })).not.toBeInTheDocument()
  })

  it('gates reopening behind a confirmation once planning has already completed', async () => {
    const fetchMock = mockFetchFor({
      history: [{ _id: 'sess-1', completedAt: '2026-08-20T00:00:00.000Z' }]
    })
    global.fetch = fetchMock

    render(
      <PlanningWorkspace
        sprintId="s1"
        sprintName="Sprint 1"
        sprintStatus="planned"
        projectId="p1"
      />
    )

    const reopenButton = await screen.findByRole('button', { name: /reopen planning/i })
    expect(screen.queryByRole('button', { name: /^start planning$/i })).not.toBeInTheDocument()

    // Clicking the visible button must not immediately reopen a session.
    fireEvent.click(reopenButton)
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining('/planning-session'),
      expect.objectContaining({ method: 'POST' })
    )
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/reopen planning for this sprint/i)).toBeInTheDocument()

    // Confirming inside the dialog is what actually opens the session.
    const confirmButton = within(dialog).getByRole('button', { name: /reopen planning/i })
    fireEvent.click(confirmButton)

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/sprints/s1/planning-session',
        expect.objectContaining({ method: 'POST' })
      )
    )
  })
})
