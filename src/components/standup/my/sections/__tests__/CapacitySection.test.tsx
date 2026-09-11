/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import { CapacitySection } from '../CapacitySection'
import { minutes } from '@/lib/standup/minutes'
import type { CapacityBreakdown } from '@/lib/standup/capacity'

function capacity(overrides: Partial<CapacityBreakdown> = {}): CapacityBreakdown {
  return {
    memberId: 'u1',
    date: '2026-09-11',
    nominalMinutes: minutes(480),
    adjustments: [],
    adjustedMinutes: minutes(480),
    outstandingDebtMinutes: minutes(0),
    overrunPolicy: 'absorb',
    effectiveMinutes: minutes(480),
    allocatedMinutes: minutes(480),
    gapMinutes: minutes(0),
    status: 'full',
    isUnavailable: false,
    strandedMinutes: minutes(0),
    ...overrides
  }
}

describe('CapacitySection', () => {
  it('shows the full-day headline when status is full, with the real task count', () => {
    render(
      <CapacitySection capacity={capacity({ allocatedMinutes: minutes(480) })} allocationCount={3} />
    )
    expect(screen.getByText(/planned to 8\.0h today across 3 tasks/i)).toBeInTheDocument()
  })

  it('shows the gap headline when under', () => {
    render(
      <CapacitySection
        capacity={capacity({ status: 'under', allocatedMinutes: minutes(360), gapMinutes: minutes(120) })}
        allocationCount={2}
      />
    )
    expect(screen.getByText(/2\.0h unplanned/i)).toBeInTheDocument()
  })

  it('shows the over-capacity headline when over', () => {
    render(
      <CapacitySection
        capacity={capacity({ status: 'over', allocatedMinutes: minutes(570), gapMinutes: minutes(-90) })}
        allocationCount={4}
      />
    )
    expect(screen.getByText(/1\.5h beyond your capacity/i)).toBeInTheDocument()
  })

  it('shows the unavailable headline', () => {
    render(
      <CapacitySection
        capacity={capacity({ status: 'unavailable', isUnavailable: true })}
        allocationCount={0}
      />
    )
    expect(screen.getByText(/down as unavailable today/i)).toBeInTheDocument()
  })

  it('shows the zero headline when nothing is planned', () => {
    render(
      <CapacitySection
        capacity={capacity({ status: 'zero', allocatedMinutes: minutes(0) })}
        allocationCount={0}
      />
    )
    expect(screen.getByText(/nothing is planned for you today yet/i)).toBeInTheDocument()
  })

  it('shows the VAR-10 debt sentence when outstanding debt is present', () => {
    render(
      <CapacitySection
        capacity={capacity()}
        allocationCount={3}
        debt={{ outstandingDebtMinutes: minutes(120), surplusMinutes: minutes(0) }}
      />
    )
    expect(
      screen.getByText(/you are 2\.0 hours over estimate on this sprint's completed and in-flight work/i)
    ).toBeInTheDocument()
  })

  it('shows the surplus sentence, never negative debt', () => {
    render(
      <CapacitySection
        capacity={capacity()}
        allocationCount={3}
        debt={{ outstandingDebtMinutes: minutes(0), surplusMinutes: minutes(90) }}
      />
    )
    expect(screen.getByText(/1\.5 hours ahead of estimate/i)).toBeInTheDocument()
    expect(screen.queryByText(/-1\.5/)).not.toBeInTheDocument()
  })

  it('shows the stranded sentence when hours are stranded on an unavailable day', () => {
    render(
      <CapacitySection
        capacity={capacity({ status: 'unavailable', isUnavailable: true, strandedMinutes: minutes(180) })}
        allocationCount={2}
      />
    )
    expect(screen.getByText(/3\.0h is still assigned to you/i)).toBeInTheDocument()
  })

  it('shows the allocated-vs-effective percentage inside the ring gauge', () => {
    render(
      <CapacitySection
        capacity={capacity({ effectiveMinutes: minutes(480), allocatedMinutes: minutes(360) })}
        allocationCount={2}
      />
    )
    expect(screen.getByText('75%')).toBeInTheDocument()
  })
})
