/**
 * @jest-environment jsdom
 */
/**
 * The record sections below the fold.
 *
 * Every one of them renders whether or not anything happened — an omitted
 * heading reads as "this was never built" rather than "nothing happened
 * today" — so each gets an empty-state test alongside its content one. The
 * rows they read are `Mixed` in the schema, so each also gets a test for the
 * degraded row: a historical document missing a field should render what it
 * has, not crash the page.
 */
import { render, screen, within } from '@testing-library/react'

import { BlockersRaisedCard, BlockersResolvedCard } from '@/components/standup/summary/BlockersCard'
import { CarryForwardCard } from '@/components/standup/summary/CarryForwardCard'
import { CommitmentsCard } from '@/components/standup/summary/CommitmentsCard'
import { CompletedYesterdayCard } from '@/components/standup/summary/CompletedYesterdayCard'
import { DebtMovementsCard } from '@/components/standup/summary/DebtMovementsCard'
import { OverridesCard } from '@/components/standup/summary/OverridesCard'
import { VarianceCard } from '@/components/standup/summary/VarianceCard'
import { standupStrings } from '@/lib/standup/strings'

const s = standupStrings.summary

describe('CompletedYesterdayCard', () => {
  it('shows the empty state when nothing was finished', () => {
    render(<CompletedYesterdayCard rows={[]} />)

    expect(screen.getByText(s.emptyCompletedYesterday())).toBeInTheDocument()
  })

  it('lists each finished task by key and title', () => {
    render(
      <CompletedYesterdayCard
        rows={[{ taskId: 't1', taskKey: 'KAN-1', title: 'Wire the health job' }]}
      />
    )

    const row = screen.getByTestId('completed-row')
    expect(row).toHaveTextContent('KAN-1')
    expect(row).toHaveTextContent('Wire the health job')
  })

  it('falls back to the task id when a row has no key or title', () => {
    render(<CompletedYesterdayCard rows={[{ taskId: 't1' }]} />)

    expect(screen.getByTestId('completed-row')).toHaveTextContent('t1')
  })
})

describe('VarianceCard', () => {
  it('shows the empty state when nothing was recorded', () => {
    render(<VarianceCard rows={[]} />)

    expect(screen.getByText(s.emptyVariance())).toBeInTheDocument()
  })

  it('renders the task, who held it, its outcome and the day variance', () => {
    render(
      <VarianceCard
        rows={[
          {
            taskKey: 'KAN-4',
            name: 'Kasun Perera',
            outcome: 'delivered_over',
            dayVarianceMinutes: 30
          }
        ]}
      />
    )

    const row = screen.getByTestId('variance-row')
    expect(row).toHaveTextContent('KAN-4')
    expect(row).toHaveTextContent('Kasun Perera')
    expect(row).toHaveTextContent('delivered_over')
    expect(row).toHaveTextContent('0.5h')
  })

  it('falls back to the allocation id when a row carries no task key', () => {
    render(<VarianceCard rows={[{ allocationId: 'alloc-9' }]} />)

    expect(screen.getByTestId('variance-row')).toHaveTextContent('alloc-9')
  })
})

describe('CommitmentsCard', () => {
  it('shows the empty state when nobody committed to anything', () => {
    render(<CommitmentsCard members={[]} />)

    expect(screen.getByText(s.emptyCommitments())).toBeInTheDocument()
  })

  it('groups allocations under each member, with their face', () => {
    render(
      <CommitmentsCard
        members={[
          {
            memberId: 'm1',
            name: 'QA Bashith',
            allocations: [
              { taskId: 't1', taskKey: 'KAN-7', plannedMinutes: 210 },
              { taskId: 't2', taskKey: 'KAN-8', plannedMinutes: 240 }
            ]
          }
        ]}
      />
    )

    const group = screen.getByTestId('commitment-group')
    expect(within(group).getByTestId('member-avatar')).toBeInTheDocument()
    expect(group).toHaveTextContent('QA Bashith')
    expect(within(group).getAllByTestId('commitment-row')).toHaveLength(2)
  })

  it('renders planned time as hours', () => {
    render(
      <CommitmentsCard
        members={[
          { memberId: 'm1', name: 'QA Bashith', allocations: [{ taskId: 't1', plannedMinutes: 210 }] }
        ]}
      />
    )

    expect(screen.getByTestId('commitment-row')).toHaveTextContent('3.5h')
  })

  it('sizes each bar against the largest allocation on the card, so the rows compare', () => {
    render(
      <CommitmentsCard
        members={[
          {
            memberId: 'm1',
            name: 'QA Bashith',
            allocations: [
              { taskId: 't1', plannedMinutes: 480 },
              { taskId: 't2', plannedMinutes: 120 }
            ]
          }
        ]}
      />
    )

    const bars = screen.getAllByTestId('commitment-bar')
    expect(bars[0]).toHaveStyle({ width: '100%' })
    expect(bars[1]).toHaveStyle({ width: '25%' })
  })

  it('draws no bar at all when every allocation is zero, rather than dividing by zero', () => {
    render(
      <CommitmentsCard
        members={[
          { memberId: 'm1', name: 'QA Bashith', allocations: [{ taskId: 't1', plannedMinutes: 0 }] }
        ]}
      />
    )

    expect(screen.getByTestId('commitment-bar')).toHaveStyle({ width: '0%' })
  })

  it('names a task by its id when it has no key', () => {
    render(
      <CommitmentsCard
        members={[
          { memberId: 'm1', name: 'QA Bashith', allocations: [{ taskId: 't-99', plannedMinutes: 60 }] }
        ]}
      />
    )

    expect(screen.getByTestId('commitment-row')).toHaveTextContent('t-99')
  })
})

describe('DebtMovementsCard', () => {
  it('shows the empty state when nothing moved', () => {
    render(<DebtMovementsCard rows={[]} />)

    expect(screen.getByText(s.emptyDebtMovements())).toBeInTheDocument()
  })

  it('tabulates debt and surplus per member, in hours', () => {
    render(
      <DebtMovementsCard
        rows={[{ name: 'Kasun Perera', outstandingDebtMinutes: 90, surplusMinutes: 30 }]}
      />
    )

    const row = screen.getByTestId('debt-row')
    expect(row).toHaveTextContent('Kasun Perera')
    expect(row).toHaveTextContent('1.5h')
    expect(row).toHaveTextContent('0.5h')
  })

  it('reads zero for a row missing its figures rather than rendering NaN', () => {
    render(<DebtMovementsCard rows={[{ name: 'Kasun Perera' }]} />)

    expect(screen.getByTestId('debt-row')).toHaveTextContent('0.0h')
    expect(screen.getByTestId('debt-row')).not.toHaveTextContent('NaN')
  })
})

describe('CarryForwardCard', () => {
  it('shows the empty state when nothing carried over', () => {
    render(<CarryForwardCard rows={[]} />)

    expect(screen.getByText(s.emptyCarryForward())).toBeInTheDocument()
  })

  it('labels each item with its age band and status', () => {
    render(
      <CarryForwardCard rows={[{ taskKey: 'KAN-3', ageBand: 'normal', status: 'resolved' }]} />
    )

    const row = screen.getByTestId('carry-forward-row')
    expect(row).toHaveTextContent('KAN-3')
    expect(row).toHaveTextContent('normal')
    expect(row).toHaveTextContent('resolved')
  })

  it('falls back through title, member and type when a row has no task key', () => {
    render(<CarryForwardCard rows={[{ type: 'unfinished_task' }]} />)

    expect(screen.getByTestId('carry-forward-row')).toHaveTextContent(
      standupStrings.carryForward.itemTypeLabel('unfinished_task')
    )
  })
})

describe('BlockersRaisedCard', () => {
  it('shows the empty state when none were raised', () => {
    render(<BlockersRaisedCard rows={[]} />)

    expect(screen.getByText(s.emptyBlockersRaised())).toBeInTheDocument()
  })

  it('renders the description with its type, severity and status', () => {
    render(
      <BlockersRaisedCard
        rows={[
          {
            description: 'Third-party API gateway instability',
            blockerType: 'resource',
            severity: 'critical',
            status: 'open'
          }
        ]}
      />
    )

    const row = screen.getByTestId('blocker-raised-row')
    expect(row).toHaveTextContent('Third-party API gateway instability')
    expect(row).toHaveTextContent('resource')
    expect(row).toHaveTextContent('critical')
    expect(row).toHaveTextContent('open')
  })

  it('still renders a row that carries no description', () => {
    render(<BlockersRaisedCard rows={[{ status: 'open' }]} />)

    expect(screen.getByTestId('blocker-raised-row')).toBeInTheDocument()
  })
})

describe('BlockersResolvedCard', () => {
  it('shows the empty state when none were resolved', () => {
    render(<BlockersResolvedCard rows={[]} />)

    expect(screen.getByText(s.emptyBlockersResolved())).toBeInTheDocument()
  })

  it('renders the resolution note and who resolved it', () => {
    render(
      <BlockersResolvedCard
        rows={[{ resolutionNote: 'Staging sandbox isolated.', name: 'Devops' }]}
      />
    )

    const row = screen.getByTestId('blocker-resolved-row')
    expect(row).toHaveTextContent('Staging sandbox isolated.')
    expect(row).toHaveTextContent('Devops')
  })

  it('renders a row with no note as resolved rather than blank', () => {
    render(<BlockersResolvedCard rows={[{}]} />)

    expect(screen.getByTestId('blocker-resolved-row')).toHaveTextContent(/resolved/i)
  })
})

describe('OverridesCard', () => {
  it('shows the empty state when none were issued', () => {
    render(<OverridesCard rows={[]} />)

    expect(screen.getByText(s.emptyOverrides())).toBeInTheDocument()
  })

  it('renders the override type, its reason code and the justification', () => {
    render(
      <OverridesCard
        rows={[
          {
            type: 'under_allocation',
            reasonCode: 'skills_mismatch',
            justification: 'Temporary workload adjustment.'
          }
        ]}
      />
    )

    const row = screen.getByTestId('override-row')
    expect(row).toHaveTextContent('under_allocation')
    expect(row).toHaveTextContent('skills_mismatch')
    expect(row).toHaveTextContent('Temporary workload adjustment.')
  })

  it('falls back to a bare override label when a row has no type', () => {
    render(<OverridesCard rows={[{ justification: 'Because.' }]} />)

    expect(screen.getByTestId('override-row')).toHaveTextContent('override')
  })
})
