/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import { MyPositionSection } from '../MyPositionSection'
import type { CarryForwardPanelView, CarryForwardItemView } from '@/lib/standup/carry-forward-service'

function panel(overrides: Partial<CarryForwardPanelView> = {}): CarryForwardPanelView {
  return {
    standupId: 's1',
    items: [],
    summary: { totalOpen: 0, needingNoteToday: 0, escalated: 0, resolvedYesterday: 0 },
    noteThreshold: 3,
    escalationThreshold: 5,
    ...overrides
  }
}

function item(overrides: Partial<CarryForwardItemView> = {}): CarryForwardItemView {
  return {
    itemId: 'c1',
    type: 'unfinished_task',
    status: 'open',
    taskId: 't1',
    taskKey: 'KAN-1',
    memberId: 'u1',
    memberName: 'Amal',
    originDate: '2026-09-08',
    ageInStandups: 1,
    ageBand: 'normal',
    requiresNoteToday: false,
    notedToday: false,
    tags: [],
    notes: [],
    validResolutions: [],
    ...overrides
  }
}

describe('MyPositionSection', () => {
  it('lists carry-forward items owned by this member, oldest first', () => {
    render(
      <MyPositionSection
        memberId="u1"
        carryForward={panel({
          items: [
            item({ itemId: 'c1', taskKey: 'KAN-1', ageInStandups: 1 }),
            item({ itemId: 'c2', taskKey: 'KAN-2', ageInStandups: 5, ageBand: 'chronic', requiresNoteToday: true })
          ]
        })}
      />
    )
    const items = screen.getAllByText(/KAN-\d/)
    expect(items[0]).toHaveTextContent('KAN-2')
    expect(items[1]).toHaveTextContent('KAN-1')
  })

  it('excludes items owned by other members', () => {
    render(
      <MyPositionSection
        memberId="u1"
        carryForward={panel({
          items: [item({ itemId: 'c3', taskKey: 'KAN-3', memberId: 'u2', memberName: 'Someone Else' })]
        })}
      />
    )
    expect(screen.queryByText('KAN-3')).not.toBeInTheDocument()
  })

  it('states plainly when the PM owes a note today', () => {
    render(
      <MyPositionSection
        memberId="u1"
        carryForward={panel({
          items: [
            item({
              itemId: 'c4',
              taskKey: 'KAN-4',
              status: 'escalated',
              ageInStandups: 5,
              ageBand: 'escalated',
              requiresNoteToday: true
            })
          ]
        })}
      />
    )
    expect(screen.getByText(/your pm owes a note on this today/i)).toBeInTheDocument()
  })

  it('says nothing is carried when there are none', () => {
    render(<MyPositionSection memberId="u1" carryForward={panel()} />)
    expect(screen.getByText(/nothing blocked\. nothing carried/i)).toBeInTheDocument()
  })

  it('renders its own failure state without throwing when carryForward is undefined', () => {
    render(<MyPositionSection memberId="u1" carryForward={undefined} />)
    expect(screen.getByText(/could not load this section/i)).toBeInTheDocument()
  })
})
