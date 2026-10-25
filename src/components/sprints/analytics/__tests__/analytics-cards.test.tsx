/**
 * @jest-environment jsdom
 */
/**
 * The Stand-up Analytics widgets (§15.15), rendered from payloads the real
 * builder produced, so a widget cannot pass against a shape the API never
 * sends.
 *
 * What is pinned: every widget renders its own empty state (an omitted
 * heading reads as "not built"), the team view names nobody and says so
 * (NFR-13), colour is never the only carrier of meaning (NFR-A1), and every
 * chart has its rows one click away (UI-13).
 */
import { fireEvent, render, screen, within } from '@testing-library/react'

import { AccuracyCard } from '@/components/sprints/analytics/AccuracyCard'
import { AgeingCard } from '@/components/sprints/analytics/AgeingCard'
import { AllocationHealthCard } from '@/components/sprints/analytics/AllocationHealthCard'
import { AnalyticsHero } from '@/components/sprints/analytics/AnalyticsHero'
import { AnalyticsStatGrid } from '@/components/sprints/analytics/AnalyticsStatGrid'
import { ChronicUnderAllocationCard } from '@/components/sprints/analytics/ChronicUnderAllocationCard'
import { DebtTrendCard } from '@/components/sprints/analytics/DebtTrendCard'
import { DisciplineCard } from '@/components/sprints/analytics/DisciplineCard'
import { OverrideLogCard } from '@/components/sprints/analytics/OverrideLogCard'
import { SpillChainsCard } from '@/components/sprints/analytics/SpillChainsCard'
import { buildAnalyticsPayload } from '@/lib/standup/analytics-payload'
import { standupStrings } from '@/lib/standup/strings'

import {
  JUSTIFICATION,
  emptyInputs,
  populatedInputs
} from '@/lib/standup/__tests__/helpers/analytics-fixtures'

const s = standupStrings.analytics
const link = { projectId: 'project-1', sprintId: 'sprint-1' }

const full = () => buildAnalyticsPayload(populatedInputs(), 'full')
const aggregate = () => buildAnalyticsPayload(populatedInputs(), 'aggregate')

const CARDS = [
  ['AllocationHealthCard', AllocationHealthCard, s.emptyAllocationHealth()],
  ['DebtTrendCard', DebtTrendCard, s.emptyDebtTrend()],
  ['AccuracyCard', AccuracyCard, s.emptyAccuracy()],
  ['AgeingCard', AgeingCard, s.emptyAgeing()],
  ['OverrideLogCard', OverrideLogCard, s.emptyOverrides()],
  ['ChronicUnderAllocationCard', ChronicUnderAllocationCard, s.emptyChronic()],
  ['DisciplineCard', DisciplineCard, s.emptyDiscipline()],
  ['SpillChainsCard', SpillChainsCard, s.emptySpillChains()]
] as const

describe('every widget on an empty sprint', () => {
  it.each(CARDS)('%s shows its heading and its empty state', (_name, Card, emptyText) => {
    for (const view of ['full', 'aggregate'] as const) {
      const { unmount } = render(<Card payload={buildAnalyticsPayload(emptyInputs(), view)} link={link} />)

      expect(screen.getByText(emptyText)).toBeInTheDocument()
      unmount()
    }
  })
})

describe('the team view (NFR-13)', () => {
  it.each(CARDS)('%s names no member and shows no justification', (_name, Card) => {
    const { container } = render(<Card payload={aggregate()} link={link} />)

    // Open every disclosure, so hidden rows are checked too.
    for (const button of screen.queryAllByRole('button', { name: s.showRows() })) fireEvent.click(button)

    expect(container.textContent).not.toMatch(/Amara|Kenji/)
    expect(container.textContent).not.toContain(JUSTIFICATION)
  })

  it('says on the accuracy widget what is withheld', () => {
    render(<AccuracyCard payload={aggregate()} link={link} />)

    expect(screen.getByText(s.teamViewNote())).toBeInTheDocument()
    expect(screen.getByText(s.team())).toBeInTheDocument()
    expect(screen.getByText('50%')).toBeInTheDocument()
  })

  it('counts overrides by type and reason instead of listing them', () => {
    render(<OverrideLogCard payload={aggregate()} link={link} />)

    const table = screen.getAllByTestId('analytics-rows-table')[0]
    expect(within(table).getByText(s.overrideType({ type: 'under_allocation' }))).toBeInTheDocument()
    expect(within(table).getByText('3')).toBeInTheDocument()
    expect(screen.getByText(s.teamViewNote())).toBeInTheDocument()
  })

  it('gives the chronic under-allocation count without names', () => {
    render(<ChronicUnderAllocationCard payload={aggregate()} link={link} />)

    expect(screen.getByText(s.chronicMemberCount({ count: 1 }))).toBeInTheDocument()
  })
})

describe('the full view', () => {
  it('lists each member\'s accuracy', () => {
    render(<AccuracyCard payload={full()} link={link} />)

    expect(screen.getByText('Kenji Sato')).toBeInTheDocument()
    expect(screen.queryByText(s.teamViewNote())).not.toBeInTheDocument()
  })

  it('lists every override with its justification and a link to its stand-up', () => {
    render(<OverrideLogCard payload={full()} link={link} />)

    expect(screen.getAllByText(JUSTIFICATION)).toHaveLength(3)
    const dayLinks = screen.getAllByRole('link')
    expect(dayLinks[0]).toHaveAttribute('href', '/projects/project-1/sprints/sprint-1/standups/s1/summary')
  })

  it('keeps the date of each override on one line', () => {
    render(<OverrideLogCard payload={full()} link={link} />)

    const dateCell = screen.getAllByRole('link')[0].closest('td')
    expect(dateCell?.className).toContain('whitespace-nowrap')
  })

  it('gives the member column room for a name on one line, wrapping only a very long one', () => {
    render(<OverrideLogCard payload={full()} link={link} />)

    const nameSpan = screen.getAllByText('Amara Okafor')[0]
    expect(nameSpan.className).toContain('min-w-[10rem]')
    expect(nameSpan.className).not.toContain('whitespace-nowrap')
  })

  it('names the chronically under-allocated member', () => {
    render(<ChronicUnderAllocationCard payload={full()} link={link} />)

    expect(screen.getByText('Amara Okafor')).toBeInTheDocument()
  })

  it('names the owner of a spill chain', () => {
    render(<SpillChainsCard payload={full()} link={link} />)

    expect(screen.getByText('Amara Okafor')).toBeInTheDocument()
    expect(screen.getByText(/KAN-212/)).toBeInTheDocument()
  })
})

describe('charts are readable without colour (NFR-A1) and drill to rows (UI-13)', () => {
  it('names each allocation-health bar with its hours', () => {
    render(<AllocationHealthCard payload={aggregate()} link={link} />)

    expect(
      screen.getByRole('img', {
        name: s.dayHealthLabel({ day: 1, full: '11.0h', under: '1.0h', over: '1.0h' })
      })
    ).toBeInTheDocument()
    expect(screen.getByText(s.legendOver())).toBeInTheDocument()
  })

  it('labels the chronic ageing band in text', () => {
    render(<AgeingCard payload={aggregate()} link={link} />)

    expect(screen.getByText(s.chronicBand({ count: 1 }))).toBeInTheDocument()
    expect(
      screen.getByRole('img', { name: s.ageBucketLabel({ label: '8+', count: 1, chronic: true }) })
    ).toBeInTheDocument()
  })

  it('opens and closes the rows behind a chart', () => {
    render(<DebtTrendCard payload={aggregate()} link={link} />)

    const toggle = screen.getByRole('button', { name: s.showRows() })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByTestId('analytics-rows-table')).not.toBeInTheDocument()

    fireEvent.click(toggle)

    expect(screen.getByRole('button', { name: s.hideRows() })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByTestId('analytics-rows-table')).toBeInTheDocument()
  })

  it('links each discipline row to its stand-up, the summary only when it completed', () => {
    render(<DisciplineCard payload={aggregate()} link={link} />)
    fireEvent.click(screen.getByRole('button', { name: s.showRows() }))

    const hrefs = screen.getAllByRole('link').map((anchor) => anchor.getAttribute('href'))
    expect(hrefs).toEqual([
      '/projects/project-1/sprints/sprint-1/standups/s1/summary',
      '/projects/project-1/sprints/sprint-1/standups/s2',
      '/projects/project-1/sprints/sprint-1/standups/s3'
    ])
  })
})

describe('the hero and the headline tiles', () => {
  it('says which view the reader has and links back to the sprint', () => {
    render(<AnalyticsHero payload={aggregate()} />)

    expect(screen.getByTestId('analytics-view-pill')).toHaveTextContent(s.teamView())
    expect(screen.getByRole('link', { name: s.backToSprint() })).toHaveAttribute('href', '/sprints/sprint-1')
  })

  it('shows dashes, not zeros, on an empty sprint', () => {
    render(<AnalyticsStatGrid headline={buildAnalyticsPayload(emptyInputs(), 'aggregate').headline} />)

    const values = screen.getAllByTestId('stat-card-value').map((node) => node.textContent)
    expect(values).toEqual(['—', '—', '—', '—'])
  })
})
