/**
 * @jest-environment jsdom
 */
/**
 * The three pieces above the fold: the hero banner, the stat grid, and the
 * attendance card.
 */
import { fireEvent, render, screen, within } from '@testing-library/react'

import { AttendanceCard } from '@/components/standup/summary/AttendanceCard'
import { SummaryHero } from '@/components/standup/summary/SummaryHero'
import { SummaryStatGrid } from '@/components/standup/summary/SummaryStatGrid'
import { summaryStats } from '@/components/standup/summary/stats'
import type {
  AttendanceRow,
  HeaderFacts,
  MemberCommitment,
  SummaryPayload
} from '@/components/standup/summary/types'
import { standupStrings } from '@/lib/standup/strings'

const facts: HeaderFacts = {
  standupDate: '2026-09-11',
  dayNumber: 2,
  totalDays: 10,
  facilitatorName: 'PM Ruth',
  durationMinutes: 15
}

function payload(overrides: Partial<SummaryPayload> = {}): SummaryPayload {
  return {
    headerFacts: facts,
    attendance: [],
    completedYesterday: [],
    varianceTable: [],
    debtMovements: [],
    memberCommitments: [],
    blockersRaised: [],
    blockersResolved: [],
    carryForwardState: [],
    overridesIssued: [],
    ...overrides
  }
}

const noop = () => {}

describe('SummaryHero', () => {
  const renderHero = (props: Partial<React.ComponentProps<typeof SummaryHero>> = {}) =>
    render(
      <SummaryHero
        headerFacts={facts}
        standupHref="/projects/p/sprints/s/standups/u"
        onCopy={noop}
        onPrint={noop}
        {...props}
      />
    )

  it('writes the stand-up date out long, with its weekday', () => {
    renderHero()

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('11 September, Friday')
  })

  it('renders nothing but the day badge when the stored date cannot be parsed', () => {
    renderHero({ headerFacts: { ...facts, standupDate: 'not-a-date' } })

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      standupStrings.summary.title()
    )
  })

  it('shows which day of the sprint this was', () => {
    renderHero()

    expect(screen.getByText(standupStrings.summary.dayOf({ day: 2, total: 10 }))).toBeInTheDocument()
  })

  it('names the facilitator and how long it took', () => {
    renderHero()

    expect(screen.getByText('PM Ruth')).toBeInTheDocument()
    expect(screen.getByText(standupStrings.summary.duration({ minutes: 15 }))).toBeInTheDocument()
  })

  it('copies the summary when asked', () => {
    const onCopy = jest.fn()
    renderHero({ onCopy })

    fireEvent.click(screen.getByRole('button', { name: standupStrings.summary.copyAsText() }))

    expect(onCopy).toHaveBeenCalledTimes(1)
  })

  it('prints the summary when asked', () => {
    const onPrint = jest.fn()
    renderHero({ onPrint })

    fireEvent.click(screen.getByRole('button', { name: standupStrings.summary.printOrSave() }))

    expect(onPrint).toHaveBeenCalledTimes(1)
  })

  it('links back to the stand-up it summarises', () => {
    renderHero()

    expect(screen.getByRole('link', { name: /view stand-up/i })).toHaveAttribute(
      'href',
      '/projects/p/sprints/s/standups/u'
    )
  })
})

describe('SummaryStatGrid', () => {
  it('renders one tile per figure, each linking to the section it counts', () => {
    const summary = payload({
      completedYesterday: [{ taskId: 'a' }],
      varianceTable: [{ outcome: 'delivered_over' }],
      debtMovements: [{ outstandingDebtMinutes: 90 }],
      blockersRaised: [{ status: 'open' }],
      carryForwardState: [{ taskKey: 'KAN-3' }, { taskKey: 'KAN-4' }],
      overridesIssued: [{ type: 'under_allocation' }]
    })

    render(<SummaryStatGrid stats={summaryStats(summary)} />)

    const tiles = screen.getAllByTestId('summary-stat-tile')
    expect(tiles).toHaveLength(6)
    expect(tiles.every((tile) => tile.getAttribute('href')?.startsWith('#'))).toBe(true)
  })

  it('shows each figure against its label', () => {
    const summary = payload({
      carryForwardState: [{ taskKey: 'KAN-3' }, { taskKey: 'KAN-4' }],
      debtMovements: [{ outstandingDebtMinutes: 90 }]
    })

    render(<SummaryStatGrid stats={summaryStats(summary)} />)

    const carryForward = screen
      .getAllByTestId('summary-stat-tile')
      .find((tile) => tile.textContent?.includes(standupStrings.summary.sectionCarryForward()))
    expect(carryForward).toBeDefined()
    expect(within(carryForward!).getByTestId('stat-card-value')).toHaveTextContent('2')
  })

  it('renders estimate debt as hours, not raw minutes', () => {
    render(<SummaryStatGrid stats={summaryStats(payload({ debtMovements: [{ outstandingDebtMinutes: 90 }] }))} />)

    const debt = screen
      .getAllByTestId('summary-stat-tile')
      .find((tile) => tile.textContent?.includes(standupStrings.summary.sectionDebtMovements()))
    expect(within(debt!).getByTestId('stat-card-value')).toHaveTextContent('1.5h')
  })
})

describe('AttendanceCard', () => {
  const member = (overrides: Partial<AttendanceRow> = {}): AttendanceRow => ({
    memberId: '1',
    name: 'PM Ruth',
    status: 'present',
    ...overrides
  })

  const renderCard = (
    attendance: AttendanceRow[],
    commitments: MemberCommitment[] = []
  ) =>
    render(
      <AttendanceCard
        attendance={attendance}
        commitments={commitments}
        stats={summaryStats(payload({ attendance }))}
      />
    )

  const commitment = (memberId: string, plannedMinutes: number): MemberCommitment => ({
    memberId,
    name: 'Anyone',
    allocations: [{ taskId: 't1', plannedMinutes }]
  })

  it('shows the empty state when nobody was recorded', () => {
    renderCard([])

    expect(screen.getByText(standupStrings.summary.emptyAttendance())).toBeInTheDocument()
  })

  it('reads out the attended ratio', () => {
    renderCard([member(), member({ memberId: '2', name: 'QA Bashith' })])

    expect(screen.getByTestId('attendance-ratio')).toHaveTextContent('2/2')
  })

  it('calls out full attendance', () => {
    renderCard([member()])

    expect(screen.getByTestId('attendance-verdict')).toHaveTextContent(/full attendance/i)
  })

  it('names how many were missing when attendance was short', () => {
    renderCard([member(), member({ memberId: '2', name: 'QA Bashith', status: 'absent_unplanned' })])

    expect(screen.getByTestId('attendance-verdict')).toHaveTextContent('1 absent')
  })

  it('gives every member a pill carrying their face, name and status', () => {
    renderCard([member(), member({ memberId: '2', name: 'QA Bashith', status: 'absent_planned' })])

    const pills = screen.getAllByTestId('attendance-member')
    expect(pills).toHaveLength(2)
    expect(within(pills[0]!).getByTestId('member-avatar')).toBeInTheDocument()
    expect(pills[0]).toHaveTextContent('PM Ruth')
    expect(pills[0]).toHaveTextContent(standupStrings.run.statePresent())
    expect(pills[1]).toHaveTextContent(standupStrings.run.stateAbsentPlanned())
  })

  it('shows an unrecognised status as stored rather than dropping it', () => {
    renderCard([member({ status: 'excused' })])

    expect(screen.getByTestId('attendance-member')).toHaveTextContent('excused')
  })

  it('raises a reassignment alert when an absent member still holds commitments', () => {
    renderCard([member({ status: 'absent_unplanned' })], [commitment('1', 150)])

    expect(screen.getByTestId('attendance-alert')).toHaveTextContent(/reassignment required/i)
    expect(screen.getByTestId('attendance-alert')).toHaveTextContent('2.5h')
  })

  it('stays quiet when an absence left no work behind', () => {
    renderCard([member({ status: 'absent_planned' })], [commitment('1', 0)])

    expect(screen.queryByTestId('attendance-alert')).not.toBeInTheDocument()
    expect(screen.getByTestId('attendance-member')).toHaveTextContent('Nothing to reassign')
  })

  it('names what a present member committed to', () => {
    renderCard([member()], [commitment('1', 180)])

    expect(screen.queryByTestId('attendance-alert')).not.toBeInTheDocument()
    expect(screen.getByTestId('attendance-member')).toHaveTextContent('Committed 3.0h today')
  })
})
