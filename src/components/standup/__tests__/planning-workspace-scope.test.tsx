/**
 * @jest-environment jsdom
 */
import { render, screen, waitFor } from '@testing-library/react'

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

function mockFetch() {
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
                taskCount: 1,
                estimatedTaskCount: 1,
                totalEstimatedMinutes: 360,
                totalCapacityMinutes: 480,
                netCapacityMinutes: 480
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
        json: async () => ({
          data: { session: { _id: 'sess-1', sprintGoal: 'Ship it' }, history: [] }
        })
      })
    }
    if (url.includes('/poker-sessions')) {
      return Promise.resolve({ ok: true, json: async () => ({ data: { sessions: [] } }) })
    }
    if (url.includes('sprint=s1')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          data: [{ _id: 'scoped-1', displayId: '1.10', title: 'Already in sprint', originalEstimateMinutes: 360 }]
        })
      })
    }
    if (url.includes('noSprint=true')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          data: [{ _id: 'backlog-1', displayId: '1.11', title: 'Not yet scoped', originalEstimateMinutes: 120 }]
        })
      })
    }
    return Promise.resolve({ ok: true, json: async () => ({ data: {} }) })
  }) as unknown as typeof fetch
}

describe('PlanningWorkspace — persistent scope/backlog panes', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('shows what is already in the sprint without any toggle', async () => {
    global.fetch = mockFetch()

    render(
      <PlanningWorkspace
        sprintId="s1"
        sprintName="Sprint 1"
        sprintStatus="planning"
        projectId="p1"
      />
    )

    expect(await screen.findByText('Already in sprint')).toBeInTheDocument()
  })

  it('shows the backlog pool alongside scope without needing a toggle click', async () => {
    global.fetch = mockFetch()

    render(
      <PlanningWorkspace
        sprintId="s1"
        sprintName="Sprint 1"
        sprintStatus="planning"
        projectId="p1"
      />
    )

    expect(await screen.findByText('Not yet scoped')).toBeInTheDocument()
  })

  it('removing a scoped task calls moveTask(taskId, false)', async () => {
    const fetchMock = mockFetch()
    global.fetch = fetchMock

    render(
      <PlanningWorkspace
        sprintId="s1"
        sprintName="Sprint 1"
        sprintStatus="planning"
        projectId="p1"
      />
    )

    const removeButton = await screen.findByRole('button', { name: /remove/i })
    removeButton.click()

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/tasks/scoped-1',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ sprint: null })
        })
      )
    )
  })
})
