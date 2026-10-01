/**
 * @jest-environment jsdom
 */
/**
 * Who a poker round admits (PLN-10).
 *
 * The picker draws a checkbox per *project* member, but the round's default
 * is the *sprint* team plus the facilitator. Those are different sets, and
 * the dialog used to tick every box regardless — so it claimed everyone was
 * voting while an untouched round admitted only the sprint team, and
 * un-ticking one person materialised the selection to every project member,
 * promoting people who were never on the sprint into the round.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'

import { PlanningWorkspace } from '../PlanningWorkspace'
import { TooltipProvider } from '@/components/ui/tooltip'

jest.mock('@/lib/permissions/permission-context', () => ({
  usePermissions: () => ({
    hasPermission: () => true,
    loading: false,
    permissions: { global: [], project: {} }
  })
}))

jest.mock('@/lib/notify', () => ({
  useNotify: () => ({ error: jest.fn(), info: jest.fn(), success: jest.fn(), warning: jest.fn() })
}))

// The facilitator, who is a project member but NOT on the sprint team.
jest.mock('@/contexts/AuthContext', () => ({
  useAuthContext: () => ({ user: { id: 'pm' } })
}))

/** Two on the sprint team; four on the project. */
const SPRINT_TEAM = [
  { id: 'dev-1', name: 'Mune HR', assignedMinutes: 200, capacityMinutes: 480 },
  { id: 'qa-1', name: 'QA Bashith', assignedMinutes: 100, capacityMinutes: 480 }
]

const PROJECT_MEMBERS = [
  { memberId: 'dev-1', firstName: 'Mune', lastName: 'HR', role: 'developer' },
  { memberId: 'qa-1', firstName: 'QA', lastName: 'Bashith', role: 'qa' },
  { memberId: 'pm', firstName: 'Dilini', lastName: 'Fernando', role: 'manager' },
  { memberId: 'other', firstName: 'Nobody', lastName: 'Relevant', role: 'developer' }
]

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
                estimatedTaskCount: 0,
                totalEstimatedMinutes: 0,
                totalCapacityMinutes: 960,
                netCapacityMinutes: 960
              }
            },
            offendingTasks: [],
            offendingMembers: [],
            members: SPRINT_TEAM
          }
        })
      })
    }
    if (url.includes('/member-capacity')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ data: { members: PROJECT_MEMBERS } })
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
          data: [{ _id: 'scoped-1', displayId: '1.10', title: 'Add SSO' }]
        })
      })
    }
    return Promise.resolve({ ok: true, json: async () => ({ data: [] }) })
  }) as unknown as typeof fetch
}

async function openVoterPicker() {
  render(
    <TooltipProvider>
      <PlanningWorkspace sprintId="s1" sprintName="Sprint 1" sprintStatus="planning" projectId="p1" />
    </TooltipProvider>
  )

  fireEvent.click(await screen.findByRole('button', { name: /Planning poker/i }))
  // Scoped to the dialog: the same people are named on the workload board
  // behind it, so an unscoped query matches twice.
  return await screen.findByRole('dialog', { name: /Who is estimating/i })
}

/** The checkbox row for one person in the picker. */
function voterRow(dialog: HTMLElement, name: string) {
  return within(dialog).getByText(name).closest('label') as HTMLElement
}

const isTicked = (dialog: HTMLElement, name: string) =>
  (within(voterRow(dialog, name)).getByRole('checkbox') as HTMLInputElement).checked

describe('PlanningWorkspace — the voter picker', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('ticks the sprint team and the facilitator, not every project member', async () => {
    global.fetch = mockFetch()
    const dialog = await openVoterPicker()

    await waitFor(() => expect(within(dialog).getByText('Mune HR')).toBeInTheDocument())

    expect(isTicked(dialog, 'Mune HR')).toBe(true)
    expect(isTicked(dialog, 'QA Bashith')).toBe(true)
    // The facilitator is added by `resolveParticipants` whether or not they
    // are on the sprint team, so the picker has to show that.
    expect(isTicked(dialog, 'Dilini Fernando')).toBe(true)
    // On the project, not on the sprint — and so not in the round.
    expect(isTicked(dialog, 'Nobody Relevant')).toBe(false)
  })

  it('marks the people who are not on the sprint team', async () => {
    global.fetch = mockFetch()
    const dialog = await openVoterPicker()

    await waitFor(() => expect(within(dialog).getByText('Nobody Relevant')).toBeInTheDocument())

    expect(within(voterRow(dialog, 'Nobody Relevant')).getByText('Not on sprint')).toBeInTheDocument()
    expect(within(voterRow(dialog, 'Dilini Fernando')).getByText('Facilitator')).toBeInTheDocument()
  })

  it('un-ticking one person does not promote everyone else on the project', async () => {
    // The regression: the selection materialised from "every project member",
    // so removing one person added every non-sprint member in their place.
    global.fetch = mockFetch()
    const dialog = await openVoterPicker()

    await waitFor(() => expect(within(dialog).getByText('QA Bashith')).toBeInTheDocument())

    fireEvent.click(within(voterRow(dialog, 'QA Bashith')).getByRole('checkbox'))

    expect(isTicked(dialog, 'QA Bashith')).toBe(false)
    expect(isTicked(dialog, 'Mune HR')).toBe(true)
    expect(isTicked(dialog, 'Nobody Relevant')).toBe(false)
  })

  it('starts the round with exactly the people the picker showed ticked', async () => {
    const fetchMock = mockFetch()
    global.fetch = fetchMock
    const dialog = await openVoterPicker()

    await waitFor(() => expect(within(dialog).getByText('Mune HR')).toBeInTheDocument())
    fireEvent.click(within(dialog).getByRole('button', { name: 'Start round' }))

    await waitFor(() => {
      const post = (fetchMock as jest.Mock).mock.calls.find(
        ([url, init]) => String(url).includes('/poker-sessions') && init?.method === 'POST'
      )
      expect(post).toBeDefined()
      const body = JSON.parse(post![1].body)
      // Sent explicitly rather than left to the server's own default, so what
      // was on screen is what the round admits.
      expect(body.participantIds.sort()).toEqual(['dev-1', 'pm', 'qa-1'])
      expect(body.participantIds).not.toContain('other')
    })
  })

  it('tells the server when the facilitator takes themselves out of the round', async () => {
    const fetchMock = mockFetch()
    global.fetch = fetchMock
    const dialog = await openVoterPicker()

    await waitFor(() => expect(within(dialog).getByText('Dilini Fernando')).toBeInTheDocument())
    fireEvent.click(within(voterRow(dialog, 'Dilini Fernando')).getByRole('checkbox'))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Start round' }))

    await waitFor(() => {
      const post = (fetchMock as jest.Mock).mock.calls.find(
        ([url, init]) => String(url).includes('/poker-sessions') && init?.method === 'POST'
      )
      const body = JSON.parse(post![1].body)
      // Without this the server re-adds them, since a facilitator locked out
      // of their own session is usually not what was meant.
      expect(body.excludeFacilitator).toBe(true)
      expect(body.participantIds).not.toContain('pm')
    })
  })
})
