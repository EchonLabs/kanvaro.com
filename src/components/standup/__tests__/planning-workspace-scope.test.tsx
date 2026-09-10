/**
 * @jest-environment jsdom
 */
import { render, screen, waitFor } from '@testing-library/react'

import { PlanningWorkspace, resolveDrop } from '../PlanningWorkspace'

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

    // Exact name, not a substring match: the draggable row wrapping this
    // button is itself an accessible "button" role (dnd-kit's keyboard drag
    // affordance) whose computed name includes the row's full text, so a
    // loose /remove/i match is ambiguous between the row and the real button.
    const removeButton = await screen.findByRole('button', { name: 'Remove' })
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

describe('resolveDrop — pure drag-resolution logic', () => {
  const backlogTasks = [{ _id: 'b1', displayId: '1.1', title: 'Backlog task' }]
  const scopeTasks = [{ _id: 's1', displayId: '1.2', title: 'Scoped task' }]

  it('dropping a backlog task onto the scope pane resolves to add', () => {
    expect(resolveDrop('sprint-scope', 'b1', backlogTasks, scopeTasks)).toBe('add')
  })

  it('dropping a scoped task onto the backlog pane resolves to remove', () => {
    expect(resolveDrop('backlog-pool', 's1', backlogTasks, scopeTasks)).toBe('remove')
  })

  it('dropping a task back onto the pane it already belongs to is a no-op', () => {
    expect(resolveDrop('backlog-pool', 'b1', backlogTasks, scopeTasks)).toBe(null)
    expect(resolveDrop('sprint-scope', 's1', backlogTasks, scopeTasks)).toBe(null)
  })

  it('an unrecognized drop target is a no-op', () => {
    expect(resolveDrop('some-other-id', 'b1', backlogTasks, scopeTasks)).toBe(null)
  })
})

describe('PlanningWorkspace — capacity gauge', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('renders a percentage-labeled capacity gauge instead of a plain estimated-scope number only', async () => {
    global.fetch = mockFetch()

    render(
      <PlanningWorkspace
        sprintId="s1"
        sprintName="Sprint 1"
        sprintStatus="planning"
        projectId="p1"
      />
    )

    // Fixture: totalEstimatedMinutes 360 / netCapacityMinutes 480 = 75%.
    expect(await screen.findByText('75%')).toBeInTheDocument()
  })

  it('shows the true, uncapped percentage (not a clamped "100%") when scope exceeds net capacity', async () => {
    // GradientProgress itself clamps its bar fill + trailing label to
    // [0, 100] — correct, and shared with other real callers elsewhere in
    // the app. This asserts PlanningWorkspace's own over-capacity text next
    // to the hours value carries the true, uncapped number instead.
    global.fetch = jest.fn((url: string) => {
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
                  // 12h estimated against 8h net capacity == 150%.
                  totalEstimatedMinutes: 720,
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
      return Promise.resolve({ ok: true, json: async () => ({ data: [] }) })
    }) as unknown as typeof fetch

    render(
      <PlanningWorkspace
        sprintId="s1"
        sprintName="Sprint 1"
        sprintStatus="planning"
        projectId="p1"
      />
    )

    expect(await screen.findByText('150%')).toBeInTheDocument()
    // GradientProgress's own trailing label is clamped and would also render
    // "100%" — assert it's present too, so this test fails loudly if the
    // true-percentage text is ever accidentally removed rather than added.
    expect(screen.getByText('100%')).toBeInTheDocument()
  })
})
