/**
 * @jest-environment jsdom
 */
/**
 * The org-admin oversight dashboard.
 *
 * Three things are worth pinning here. The project filter scopes
 * *everything* — a filter that re-rendered the board but left an org-wide
 * sentence above it would be actively misleading. Every mark has its value
 * written beside it in words, which is what lets this screen satisfy UI-13
 * without a separate table view. And each sprint row states the one thing
 * wrong with it, so triage does not depend on decoding a colour (NFR-A1).
 */
import { render, screen, within } from '@testing-library/react'

import { StandupOversightScreen, deriveOversightView } from '../oversight/StandupOversightScreen'

const cadence = (states: string[], from = 17) =>
  states.map((state, index) => ({ date: `2026-08-${from + index}`, state }))

const sprint = (overrides: Record<string, any> = {}) => ({
  sprintId: 's1',
  sprintName: 'Sprint 2',
  projectId: 'p1',
  projectName: 'Kanvaro',
  estimateDebtMinutes: 180,
  carryForward: {
    openCount: 4,
    oldestAgeInStandups: 9,
    chronicCount: 1,
    ageBands: { normal: 2, noteRequired: 1, escalated: 0, chronic: 1 }
  },
  overridesCount: 3,
  overrideReasonCounts: [
    { type: 'under_allocation', reasonCode: 'blocked_capacity', count: 2 },
    { type: 'under_allocation', reasonCode: 'no_work_available', count: 1 }
  ],
  openBlockersCount: 2,
  discipline: { completedDays: 5, missedDays: 2, remainingDays: 3, totalWorkingDays: 10 },
  cadence: cadence(['ran', 'ran', 'ran', 'ran', 'ran', 'missed', 'missed', 'ahead', 'ahead', 'ahead']),
  capacityBalance: {
    remainingEstimateMinutes: 6000,
    remainingCapacityMinutes: 4800,
    overageMinutes: 1200,
    exceedsCapacity: true
  },
  consecutiveMissedDays: 3,
  flags: ['over_capacity', 'chronic_carry_forward'],
  ...overrides
})

const secondSprint = () =>
  sprint({
    sprintId: 's2',
    sprintName: 'Sprint 7',
    projectId: 'p2',
    projectName: 'Atlas',
    estimateDebtMinutes: 0,
    carryForward: {
      openCount: 0,
      oldestAgeInStandups: 0,
      chronicCount: 0,
      ageBands: { normal: 0, noteRequired: 0, escalated: 0, chronic: 0 }
    },
    overridesCount: 0,
    overrideReasonCounts: [],
    openBlockersCount: 0,
    discipline: { completedDays: 4, missedDays: 0, remainingDays: 6, totalWorkingDays: 10 },
    cadence: cadence(['ran', 'ran', 'ran', 'ran', 'ahead', 'ahead', 'ahead', 'ahead', 'ahead', 'ahead']),
    capacityBalance: {
      remainingEstimateMinutes: 2400,
      remainingCapacityMinutes: 4800,
      overageMinutes: 0,
      exceedsCapacity: false
    },
    consecutiveMissedDays: 0,
    flags: []
  })

function mockPayload(overrides: Record<string, any> = {}) {
  return { sprints: [sprint(), secondSprint()], waivers: [], ...overrides }
}

function mockFetch(payload: Record<string, any>) {
  global.fetch = jest.fn(() =>
    Promise.resolve({ ok: true, json: async () => ({ data: payload }) })
  ) as unknown as typeof fetch
}

describe('StandupOversightScreen', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('leads with the number of sprints that need attention', async () => {
    mockFetch(mockPayload())
    render(<StandupOversightScreen />)

    // One of the two fixtures carries flags, the other is clean. Scoped to the
    // headline figure: "1" also appears as a chronic count further down.
    expect(await screen.findByTestId('oversight-hero-figure')).toHaveTextContent('1')
    expect(screen.getByText(/of 2 active sprints need you today/i)).toBeInTheDocument()
  })

  it('names the sprint to open first rather than leaving the admin to rank them', async () => {
    mockFetch(mockPayload())
    render(<StandupOversightScreen />)

    expect(
      await screen.findByText(/start with sprint 2 in kanvaro: 20\.0h more work than capacity left/i)
    ).toBeInTheDocument()
  })

  /**
   * NFR-A1 / UI-13: the ribbon and the beam are both decorative on their own.
   * Whatever they draw has to be readable as text on the same row.
   */
  it('writes every charted figure beside its mark, and drills through (UI-13)', async () => {
    mockFetch(mockPayload())
    render(<StandupOversightScreen />)

    const board = await screen.findByRole('region', { name: /active sprints/i })
    const flagged = within(board).getByText('Sprint 2').closest('li')!

    expect(within(flagged).getByText('5/10')).toBeInTheDocument()
    expect(within(flagged).getByText(/20\.0h over remaining capacity/i)).toBeInTheDocument()
    expect(within(flagged).getByText('3.0h')).toBeInTheDocument()
    // The sprint's own name is the way in — one unique link per row rather than
    // the same blue phrase repeated down the board.
    expect(within(flagged).getByRole('link', { name: 'Sprint 2' })).toHaveAttribute(
      'href',
      '/projects/p1/standups'
    )
  })

  it('describes a sprint cadence ribbon for anyone not reading the colours', async () => {
    mockFetch(mockPayload())
    render(<StandupOversightScreen />)

    expect(
      await screen.findByRole('img', { name: /sprint 2: 5 of 10 stand-ups ran, 2 missed/i })
    ).toBeInTheDocument()
  })

  it('calls out the chronic band by name, not by colour alone', async () => {
    mockFetch(mockPayload())
    render(<StandupOversightScreen />)

    expect(
      await screen.findByText(/1 item needs a documented decision at eight stand-ups or older/i)
    ).toBeInTheDocument()
  })

  it('renders both org-shaped distributions', async () => {
    mockFetch(mockPayload())
    render(<StandupOversightScreen />)

    expect(await screen.findByText('Carry-forward ageing')).toBeInTheDocument()
    expect(screen.getByText('Why capacity was overridden')).toBeInTheDocument()
    expect(screen.getByText('Blocked capacity')).toBeInTheDocument()
  })

  /**
   * The filter contract, against the pure derivation rather than the portalled
   * Radix combobox — the behaviour worth protecting is that one slice feeds
   * every figure, not that a listbox opens.
   */
  describe('deriveOversightView — the project filter scopes everything', () => {
    const payload = mockPayload() as any

    it('derives the whole view from every sprint when unfiltered', () => {
      const view = deriveOversightView(payload, '__all__')

      expect(view.sprints).toHaveLength(2)
      expect(view.summary.activeSprints).toBe(2)
      expect(view.summary.needingAttention).toBe(1)
      expect(view.summary.debtMinutes).toBe(180)
      expect(view.worst?.sprintName).toBe('Sprint 2')
      expect(view.ageBands.find((band) => band.key === 'chronic')?.count).toBe(1)
      expect(view.reasons[0]).toEqual({
        reasonCode: 'blocked_capacity',
        label: 'Blocked capacity',
        count: 2
      })
    })

    it('narrows the headline, the age bands and the override ranking together', () => {
      const view = deriveOversightView(payload, 'p2')

      // Atlas is the clean sprint: every derived figure must follow it down,
      // not just the sprint list.
      expect(view.sprints.map((row) => row.sprintName)).toEqual(['Sprint 7'])
      expect(view.summary.activeSprints).toBe(1)
      expect(view.summary.needingAttention).toBe(0)
      expect(view.summary.debtMinutes).toBe(0)
      expect(view.worst).toBeNull()
      expect(view.ageBands.every((band) => band.count === 0)).toBe(true)
      expect(view.reasons).toEqual([])
    })

    it('scopes waivers to the selected project too', () => {
      const withWaiver = mockPayload({
        waivers: [
          {
            sprintId: 's1',
            projectId: 'p1',
            projectName: 'Kanvaro',
            sprintName: 'Sprint 2',
            waivedCheckIds: ['PC-4'],
            justification: 'x',
            expiresAt: '2026-09-20T00:00:00.000Z',
            expired: false
          }
        ]
      }) as any

      expect(deriveOversightView(withWaiver, '__all__').waivers).toHaveLength(1)
      expect(deriveOversightView(withWaiver, 'p2').waivers).toHaveLength(0)
    })

    /** The rail is org cadence, so the same calendar day from two sprints is one column. */
    it('folds every sprint onto one day column in the cadence rail', () => {
      const view = deriveOversightView(payload, '__all__')
      const firstDay = view.orgCadence[0]

      expect(view.orgCadence).toHaveLength(10)
      expect(firstDay).toEqual({ date: '2026-08-17', ran: 2, missed: 0, ahead: 0 })
      expect(view.orgCadence.find((day) => day.date === '2026-08-22')).toEqual({
        date: '2026-08-22',
        ran: 0,
        missed: 1,
        ahead: 1
      })
    })
  })

  it('shows an empty state rather than an empty board when nothing is active', async () => {
    mockFetch(mockPayload({ sprints: [] }))
    render(<StandupOversightScreen />)

    expect(await screen.findByText(/no sprint is active right now/i)).toBeInTheDocument()
    expect(screen.queryByText('Carry-forward ageing')).not.toBeInTheDocument()
  })

  it('surfaces a planning waiver, which only an org admin can act on', async () => {
    mockFetch(
      mockPayload({
        waivers: [
          {
            sprintId: 's1',
            sprintName: 'Sprint 2',
            projectId: 'p1',
            projectName: 'Kanvaro',
            waivedCheckIds: ['PC-4'],
            justification: 'Pilot deadline agreed with the delivery lead.',
            expiresAt: '2026-09-20T00:00:00.000Z',
            expired: false
          }
        ]
      })
    )
    render(<StandupOversightScreen />)

    expect(await screen.findByText(/planning waivers in force/i)).toBeInTheDocument()
    expect(screen.getByText('PC-4')).toBeInTheDocument()
    expect(screen.getByText(/until 2026-09-20/i)).toBeInTheDocument()
  })
})
