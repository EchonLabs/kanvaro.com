/**
 * @jest-environment jsdom
 */
/**
 * The capacity board (Phase 7, Task 10) — the phase's visible half.
 *
 * Since Task 8 the per-member *card* is `shared/ExpandableMemberCard`, so what
 * `CapacityBoard.tsx` still owns — and what this suite covers — is the
 * run-specific content that card renders through its three render props:
 * `MemberRunAlerts` (always visible), `MemberAllocationRow` (one per assigned
 * task) and `MemberRunDetails` (the expanded tail). They are exercised
 * directly here; their composition into the card is covered by
 * `unassigned-pool.test.tsx`.
 *
 * This is where the three obligations Phase 6 handed forward are discharged,
 * and all three are the same kind of bug: a number that is correct on the
 * server and invisible or misleading on the screen.
 *
 *   OB-9  — `'ceremony'` adjustments render **individually**, by title. One
 *           aggregated "meetings −90m" row is a defect, not a simplification:
 *           DN-7 exists so a PM can see *which* meeting ate the morning.
 *   OB-10 — when `ceremoniesConsumeCapacity` is false, the breakdown says so.
 *           Otherwise a full eight-hour day on a day holding a two-hour review
 *           reads as a bug rather than a setting.
 *   OB-12 — a non-zero `strandedMinutes` renders as an **alert** with the
 *           reassign action, never as a variant of the calm `unavailable`
 *           slate chip. `allocationStatus` decides `unavailable` before it
 *           looks at what is allocated, so six parked hours and an empty day
 *           are otherwise indistinguishable. It goes through the card's
 *           always-visible slot, never the expanded one — an alert behind a
 *           disclosure triangle is an alert nobody reads.
 *
 * Each assertion pins the exact string from `strings.ts`, so a reworded notice
 * cannot silently stop matching what the plan promised.
 */
import { fireEvent, render, screen, within } from '@testing-library/react'

import {
  MemberAllocationRow,
  MemberRunAlerts,
  MemberRunDetails
} from '@/components/standup/run/CapacityBoard'
import type {
  BoardAllocationView,
  BoardMemberView
} from '@/components/standup/run/CapacityBoard'
import type { CapacityBreakdown } from '@/lib/standup/capacity'
import { minutes } from '@/lib/standup/minutes'
import { standupStrings } from '@/lib/standup/strings'

const m = minutes

function capacity(overrides: Partial<CapacityBreakdown> = {}): CapacityBreakdown {
  return {
    memberId: 'kasun',
    date: '2026-08-17',
    nominalMinutes: m(480),
    adjustments: [],
    adjustedMinutes: m(480),
    outstandingDebtMinutes: m(0),
    overrunPolicy: 'absorb',
    effectiveMinutes: m(480),
    allocatedMinutes: m(300),
    gapMinutes: m(180),
    status: 'under',
    isUnavailable: false,
    strandedMinutes: m(0),
    ...overrides
  }
}

const allocation: BoardAllocationView = {
  allocationId: 'a1',
  taskId: 't1',
  taskKey: 'KAN-214',
  title: 'Invoice model',
  plannedMinutes: m(300),
  remainingEstimateMinutes: m(420),
  source: 'carried_forward',
  isBlocked: false,
  excludedFromCapacity: false,
  pairedDeliberately: false
}

function member(overrides: Partial<BoardMemberView> = {}): BoardMemberView {
  return {
    memberId: 'kasun',
    name: 'Kasun',
    capacity: capacity(),
    allocations: [allocation],
    ...overrides
  }
}

const noop = () => {}

const renderDetails = (
  props: Partial<Parameters<typeof MemberRunDetails>[0]> = {}
) =>
  render(
    <MemberRunDetails
      member={member()}
      poolTasks={[]}
      ceremoniesConsumeCapacity
      onQuickAdd={noop}
      {...props}
    />
  )

const renderAlerts = (props: Partial<Parameters<typeof MemberRunAlerts>[0]> = {}) =>
  render(
    <MemberRunAlerts member={member()} onReassignStranded={noop} {...props} />
  )

const renderRow = (props: Partial<Parameters<typeof MemberAllocationRow>[0]> = {}) =>
  render(
    <MemberAllocationRow
      allocation={allocation}
      onChangeHours={noop}
      onRemove={noop}
      {...props}
    />
  )

describe('MemberRunDetails — OB-9, the itemised breakdown (DN-7)', () => {
  const withCeremonies = () =>
    member({
      capacity: capacity({
        adjustments: [
          { type: 'ceremony', label: 'Daily stand-up', minutes: m(15) },
          { type: 'ceremony', label: 'Sprint Review', minutes: m(60) },
          { type: 'ceremony', label: 'Design sync', minutes: m(30) }
        ],
        adjustedMinutes: m(375),
        effectiveMinutes: m(375),
        gapMinutes: m(75)
      })
    })

  it('names every meeting separately in the breakdown', () => {
    renderDetails({ member: withCeremonies() })

    fireEvent.click(screen.getByRole('button', { name: /breakdown for Kasun/i }))

    const breakdown = screen.getByRole('dialog')
    for (const title of ['Daily stand-up', 'Sprint Review', 'Design sync']) {
      expect(within(breakdown).getByText(title)).toBeInTheDocument()
    }
  })

  it('does not aggregate them into a single meetings row', () => {
    renderDetails({ member: withCeremonies() })

    fireEvent.click(screen.getByRole('button', { name: /breakdown for Kasun/i }))

    const breakdown = screen.getByRole('dialog')
    // Three ceremonies, three rows. An aggregate would show one.
    expect(within(breakdown).getAllByTestId('adjustment-ceremony')).toHaveLength(3)
    expect(within(breakdown).queryByText(/^Meetings/)).not.toBeInTheDocument()
  })

  it('shows each meeting’s own minutes, not the total', () => {
    renderDetails({ member: withCeremonies() })

    fireEvent.click(screen.getByRole('button', { name: /breakdown for Kasun/i }))

    const rows = within(screen.getByRole('dialog')).getAllByTestId('adjustment-ceremony')
    expect(rows[0]).toHaveTextContent('0.3')
    expect(rows[1]).toHaveTextContent('1.0')
    expect(rows[2]).toHaveTextContent('0.5')
  })
})

describe('MemberRunDetails — OB-10, DN-6’s notice', () => {
  it('says so when ceremonies are not deducted', () => {
    renderDetails({ ceremoniesConsumeCapacity: false })

    fireEvent.click(screen.getByRole('button', { name: /breakdown for Kasun/i }))

    expect(
      within(screen.getByRole('dialog')).getByText(
        standupStrings.capacity.ceremoniesNotDeducted()
      )
    ).toBeInTheDocument()
  })

  it('stays silent when they are deducted, so the notice means something', () => {
    renderDetails({ ceremoniesConsumeCapacity: true })

    fireEvent.click(screen.getByRole('button', { name: /breakdown for Kasun/i }))

    expect(
      screen.queryByText(standupStrings.capacity.ceremoniesNotDeducted())
    ).not.toBeInTheDocument()
  })
})

describe('MemberRunAlerts — OB-12, stranded hours are an alert, never a calm chip', () => {
  const stranded = () =>
    member({
      name: 'Nuwan',
      memberId: 'nuwan',
      allocations: [],
      capacity: capacity({
        memberId: 'nuwan',
        effectiveMinutes: m(0),
        adjustedMinutes: m(0),
        allocatedMinutes: m(0),
        gapMinutes: m(0),
        status: 'unavailable',
        isUnavailable: true,
        strandedMinutes: m(360)
      })
    })

  it('renders the exact strings.ts notice as an alert', () => {
    renderAlerts({ member: stranded() })

    expect(screen.getByRole('alert')).toHaveTextContent(
      standupStrings.capacity.strandedAllocations({ minutes: m(360) })
    )
  })

  it('offers the reassign action', () => {
    const onReassignStranded = jest.fn()
    renderAlerts({ member: stranded(), onReassignStranded })

    fireEvent.click(
      screen.getByRole('button', {
        name: standupStrings.capacity.strandedAllocationsAction()
      })
    )

    expect(onReassignStranded).toHaveBeenCalledWith('nuwan')
  })

  it('is distinguishable from an ordinary unavailable day', () => {
    // The whole point of OB-12: an absent member with nothing allocated shows
    // nothing here at all, and an absent member holding six hours is an alert.
    // If these two render the same, the failure is invisible.
    const { unmount } = renderAlerts({ member: stranded() })
    expect(screen.queryByRole('alert')).toBeInTheDocument()
    unmount()

    renderAlerts({
      member: member({
        name: 'Nuwan',
        memberId: 'nuwan',
        allocations: [],
        capacity: capacity({
          memberId: 'nuwan',
          effectiveMinutes: m(0),
          allocatedMinutes: m(0),
          gapMinutes: m(0),
          status: 'unavailable',
          isUnavailable: true,
          strandedMinutes: m(0)
        })
      })
    })

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('MemberAllocationRow — the row controls', () => {
  it('changes hours through the stepper', () => {
    const onChangeHours = jest.fn()
    renderRow({ onChangeHours })

    fireEvent.click(
      screen.getByRole('button', { name: standupStrings.allocation.stepperIncrease() })
    )

    expect(onChangeHours).toHaveBeenCalledWith('a1', 315)
  })

  it('removes a row', () => {
    const onRemove = jest.fn()
    renderRow({ onRemove })

    fireEvent.click(
      screen.getByRole('button', {
        name: standupStrings.allocation.removeRow({ task: 'KAN-214' })
      })
    )

    expect(onRemove).toHaveBeenCalledWith('a1')
  })

  it('marks a carried row with its source, so the PM sees what is new today', () => {
    renderRow()
    expect(screen.getByTestId('source-a1')).toHaveTextContent(/carried/i)
  })

  it('locks every control when the member’s row is read-only (RUN-26)', () => {
    renderRow({ readOnly: true })

    expect(screen.getByRole('spinbutton')).toBeDisabled()
    expect(
      screen.getByRole('button', {
        name: standupStrings.allocation.removeRow({ task: 'KAN-214' })
      })
    ).toBeDisabled()
  })
})

describe('MemberRunDetails — the keyboard path to allocation (NFR-A2)', () => {
  it('offers quick add on every card', () => {
    const onQuickAdd = jest.fn()
    renderDetails({
      poolTasks: [
        { taskId: 't9', key: 'KAN-301', title: 'Export CSV', remainingEstimateMinutes: m(180) }
      ],
      onQuickAdd
    })

    const input = screen.getByRole('combobox')
    fireEvent.focus(input)
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onQuickAdd).toHaveBeenCalledWith('kasun', expect.objectContaining({ taskId: 't9' }))
  })

  it('carries ALO-17’s fit indicator against this member’s own gap', () => {
    renderDetails({
      // 3.0h against Kasun's 3.0h gap.
      poolTasks: [
        { taskId: 't9', key: 'KAN-301', title: 'Export CSV', remainingEstimateMinutes: m(180) }
      ]
    })

    fireEvent.focus(screen.getByRole('combobox'))

    expect(
      within(screen.getByRole('option')).getByText(standupStrings.allocation.fitsExact())
    ).toBeInTheDocument()
  })

  it('withholds quick add from a read-only viewer (RUN-26)', () => {
    renderDetails({ readOnly: true })

    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  })
})

describe('MemberRunAlerts — the estimate-debt badge (§15.8.7)', () => {
  it('appears only when there is debt', () => {
    renderAlerts({ member: member({ capacity: capacity({ outstandingDebtMinutes: m(120) }) }) })

    expect(screen.getByTestId('debt-badge')).toHaveTextContent('2.0')
  })

  it('is absent at zero debt', () => {
    renderAlerts()
    expect(screen.queryByTestId('debt-badge')).not.toBeInTheDocument()
  })

  it('renders the exact capacity-reduced sentence when the reduce policy has lowered effective capacity (AC-16)', () => {
    renderAlerts({
      member: member({
        capacity: capacity({
          nominalMinutes: m(480),
          adjustedMinutes: m(480),
          effectiveMinutes: m(360),
          outstandingDebtMinutes: m(120),
          overrunPolicy: 'reduce',
          gapMinutes: m(360),
          allocatedMinutes: m(0),
          status: 'under'
        })
      })
    })

    expect(
      screen.getByText('Capacity 8.0h reduced to 6.0h by 2.0h of estimate debt.')
    ).toBeInTheDocument()
  })

  it('does not render the sentence under the absorb policy', () => {
    renderAlerts({
      member: member({
        capacity: capacity({
          nominalMinutes: m(480),
          adjustedMinutes: m(480),
          effectiveMinutes: m(360),
          outstandingDebtMinutes: m(120),
          overrunPolicy: 'absorb',
          gapMinutes: m(360),
          allocatedMinutes: m(0),
          status: 'under'
        })
      })
    })

    expect(
      screen.queryByText('Capacity 8.0h reduced to 6.0h by 2.0h of estimate debt.')
    ).not.toBeInTheDocument()
  })

  it('does not render the sentence when there is no debt', () => {
    renderAlerts({
      member: member({
        capacity: capacity({
          effectiveMinutes: m(480),
          outstandingDebtMinutes: m(0),
          overrunPolicy: 'reduce',
          gapMinutes: m(480),
          allocatedMinutes: m(0),
          status: 'zero'
        })
      })
    })

    expect(
      screen.queryByText('Capacity 8.0h reduced to 6.0h by 2.0h of estimate debt.')
    ).not.toBeInTheDocument()
  })

  it('does not render the sentence when adjusted equals effective', () => {
    renderAlerts({
      member: member({
        capacity: capacity({
          adjustedMinutes: m(480),
          effectiveMinutes: m(480),
          outstandingDebtMinutes: m(120),
          overrunPolicy: 'reduce',
          gapMinutes: m(480),
          allocatedMinutes: m(0),
          status: 'under'
        })
      })
    })

    expect(
      screen.queryByText('Capacity 8.0h reduced to 6.0h by 2.0h of estimate debt.')
    ).not.toBeInTheDocument()
  })
})
