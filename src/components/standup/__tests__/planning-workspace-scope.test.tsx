/**
 * @jest-environment jsdom
 */
import { render, screen, waitFor } from '@testing-library/react'

import { PlanningWorkspace, resolveDrop } from '../PlanningWorkspace'
import { TooltipProvider } from '@/components/ui/tooltip'

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

jest.mock('@/contexts/AuthContext', () => ({
  useAuthContext: () => ({ user: { id: 'u1' } })
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
            offendingMembers: [],
            // Deliberately not 360/480 (75%) — that ratio collides with the
            // "Estimated scope" gauge's own percentage in this same fixture,
            // and two independent 75% labels on the page would make any test
            // asserting on either one ambiguous.
            members: [
              { id: 'mem-1', name: 'Anessa', assignedMinutes: 400, capacityMinutes: 480 }
            ]
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
      <TooltipProvider>
        <PlanningWorkspace
          sprintId="s1"
          sprintName="Sprint 1"
          sprintStatus="planning"
          projectId="p1"
        />
      </TooltipProvider>
    )

    // Twice, deliberately: once in the sprint-scope pane (where it is added
    // and removed) and once in the assignment board's Unassigned lane (where
    // it is given an owner). Two views of the same task, not a duplicate.
    expect(await screen.findAllByText('Already in sprint')).toHaveLength(2)
  })

  it('shows the backlog pool alongside scope without needing a toggle click', async () => {
    global.fetch = mockFetch()

    render(
      <TooltipProvider>
        <PlanningWorkspace
          sprintId="s1"
          sprintName="Sprint 1"
          sprintStatus="planning"
          projectId="p1"
        />
      </TooltipProvider>
    )

    expect(await screen.findByText('Not yet scoped')).toBeInTheDocument()
  })

  it('removing a scoped task calls moveTask(taskId, false)', async () => {
    const fetchMock = mockFetch()
    global.fetch = fetchMock

    render(
      <TooltipProvider>
        <PlanningWorkspace
          sprintId="s1"
          sprintName="Sprint 1"
          sprintStatus="planning"
          projectId="p1"
        />
      </TooltipProvider>
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

describe('PlanningWorkspace — starting planning poker', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('opens a poker session without forcing a unit — the fibonacci deck is abstract story points, converted via the project\'s pointsToHours factor', async () => {
    const fetchMock = jest.fn((url: string, init?: RequestInit) => {
      if (url.includes('/planning-session/checklist')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            data: {
              checklist: {
                // PC-8 passing is what opens the Estimate step: a round cannot
                // start until every task has an owner.
                items: [{ checkId: 'PC-8', kind: 'mandatory', passed: true }],
                blockers: [],
                canComplete: false,
                totals: {
                  taskCount: 1, estimatedTaskCount: 0, totalEstimatedMinutes: 0,
                  totalCapacityMinutes: 480, netCapacityMinutes: 480
                }
              },
              offendingTasks: [{ id: 'unestimated-1', displayId: '1.1', title: 'Needs a card', originalEstimateMinutes: 0 }],
              offendingMembers: [],
              members: []
            }
          })
        })
      }
      if (url.endsWith('/planning-session')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ data: { session: { _id: 'sess-1', sprintGoal: 'Ship it' }, history: [] } })
        })
      }
      if (url.includes('sprint=s1')) {
        // The round is built from sprint scope now, not from the checklist's
        // offending tasks: a task estimated by hand still has to go through
        // poker to clear PC-9, and it would never appear in that list.
        return Promise.resolve({
          ok: true,
          json: async () => ({
            data: [{ _id: 'unestimated-1', displayId: '1.1', title: 'Needs a card' }]
          })
        })
      }
      if (url.includes('/poker-sessions')) {
        if (init?.method === 'POST') {
          return Promise.resolve({
            ok: true,
            status: 201,
            json: async () => ({
              data: {
                session: { _id: 'poker-1', queue: [{ task: 'unestimated-1', status: 'voting' }], currentTask: 'unestimated-1' },
                cards: [1, 2, 3, 5, 8, 13, 21, '?', 'coffee']
              }
            })
          })
        }
        return Promise.resolve({ ok: true, json: async () => ({ data: { sessions: [] } }) })
      }
      return Promise.resolve({ ok: true, json: async () => ({ data: {} }) })
    }) as unknown as typeof fetch
    global.fetch = fetchMock

    render(
      <TooltipProvider>
        <PlanningWorkspace
          sprintId="s1"
          sprintName="Sprint 1"
          sprintStatus="planning"
          projectId="p1"
        />
      </TooltipProvider>
    )

    ;(await screen.findByRole('button', { name: /planning poker/i })).click()
    ;(await screen.findByRole('button', { name: /start round/i })).click()

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/sprints/s1/poker-sessions',
        expect.objectContaining({
          method: 'POST',
          body: expect.not.stringContaining('estimationUnit')
        })
      )
    )
  })
})

describe('PlanningWorkspace — team workload board', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('shows every sprint member\'s load, not just checklist offenders', async () => {
    global.fetch = mockFetch()

    render(
      <TooltipProvider>
        <PlanningWorkspace
          sprintId="s1"
          sprintName="Sprint 1"
          sprintStatus="planning"
          projectId="p1"
        />
      </TooltipProvider>
    )

    // Named twice: once on the workload board, once as her assignment lane.
    expect(await screen.findAllByText('Anessa')).not.toHaveLength(0)
    // Fixture: 400 assigned / 480 capacity ≈ 83%, i.e. "Full" (>= 70%).
    expect(screen.getByText('Full')).toBeInTheDocument()
    expect(screen.getByText('6.7 / 8.0 h')).toBeInTheDocument()
  })

  it('labels an idle member with no assigned minutes', async () => {
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
                  taskCount: 0,
                  estimatedTaskCount: 0,
                  totalEstimatedMinutes: 0,
                  totalCapacityMinutes: 480,
                  netCapacityMinutes: 480
                }
              },
              offendingTasks: [],
              offendingMembers: [],
              members: [{ id: 'mem-2', name: 'Idle Ivan', assignedMinutes: 0, capacityMinutes: 480 }]
            }
          })
        })
      }
      if (url.endsWith('/planning-session')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ data: { session: { _id: 'sess-1', sprintGoal: 'Ship it' }, history: [] } })
        })
      }
      if (url.includes('/poker-sessions')) {
        return Promise.resolve({ ok: true, json: async () => ({ data: { sessions: [] } }) })
      }
      return Promise.resolve({ ok: true, json: async () => ({ data: [] }) })
    }) as unknown as typeof fetch

    render(
      <TooltipProvider>
        <PlanningWorkspace
          sprintId="s1"
          sprintName="Sprint 1"
          sprintStatus="planning"
          projectId="p1"
        />
      </TooltipProvider>
    )

    expect(await screen.findByText('Idle Ivan')).toBeInTheDocument()
    expect(screen.getByText('Idle')).toBeInTheDocument()
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
      <TooltipProvider>
        <PlanningWorkspace
          sprintId="s1"
          sprintName="Sprint 1"
          sprintStatus="planning"
          projectId="p1"
        />
      </TooltipProvider>
    )

    // Fixture: totalEstimatedMinutes 360 / netCapacityMinutes 480 = 75%.
    expect(await screen.findByText('75%')).toBeInTheDocument()
  })

  it('shows the true, uncapped percentage (not a clamped "100%") when scope exceeds net capacity', async () => {
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
      <TooltipProvider>
        <PlanningWorkspace
          sprintId="s1"
          sprintName="Sprint 1"
          sprintStatus="planning"
          projectId="p1"
        />
      </TooltipProvider>
    )

    expect(await screen.findByText('150%')).toBeInTheDocument()
    expect(screen.queryByText('100%')).not.toBeInTheDocument()
  })
})
