/**
 * @jest-environment jsdom
 */
/**
 * The capacity board (Phase 7, Task 10) — the phase's visible half.
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
 *           are otherwise indistinguishable.
 *
 * Each assertion pins the exact string from `strings.ts`, so a reworded notice
 * cannot silently stop matching what the plan promised.
 */
import { fireEvent, render, screen, within } from '@testing-library/react'

import { CapacityBoard } from '@/components/standup/run/CapacityBoard'
import type { BoardMemberView } from '@/components/standup/run/CapacityBoard'
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

function member(overrides: Partial<BoardMemberView> = {}): BoardMemberView {
  return {
    memberId: 'kasun',
    name: 'Kasun',
    capacity: capacity(),
    allocations: [
      {
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
    ],
    ...overrides
  }
}

const noop = () => {}

const renderBoard = (props: Partial<Parameters<typeof CapacityBoard>[0]> = {}) =>
  render(
    <CapacityBoard
      members={[member()]}
      poolTasks={[]}
      ceremoniesConsumeCapacity
      onChangeHours={noop}
      onRemove={noop}
      onQuickAdd={noop}
      onReassignStranded={noop}
      {...props}
    />
  )

describe('CapacityBoard', () => {
  it('shows one card per member with their meter and rows', () => {
    renderBoard()

    expect(screen.getByText('Kasun')).toBeInTheDocument()
    expect(screen.getByText(/KAN-214/)).toBeInTheDocument()
    expect(
      screen.getByText(standupStrings.allocationStatus.under({ minutes: m(180) }))
    ).toBeInTheDocument()
  })

  it('renders an empty member as "nothing planned", not as a broken card', () => {
    renderBoard({
      members: [
        member({
          allocations: [],
          capacity: capacity({ allocatedMinutes: m(0), gapMinutes: m(480), status: 'zero' })
        })
      ]
    })

    expect(screen.getByText(standupStrings.allocationStatus.zero())).toBeInTheDocument()
  })

  describe('OB-9 — ceremony adjustments render itemised (DN-7)', () => {
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
      renderBoard({ members: [withCeremonies()] })

      fireEvent.click(screen.getByRole('button', { name: /breakdown for Kasun/i }))

      const breakdown = screen.getByRole('dialog')
      for (const title of ['Daily stand-up', 'Sprint Review', 'Design sync']) {
        expect(within(breakdown).getByText(title)).toBeInTheDocument()
      }
    })

    it('does not aggregate them into a single meetings row', () => {
      renderBoard({ members: [withCeremonies()] })

      fireEvent.click(screen.getByRole('button', { name: /breakdown for Kasun/i }))

      const breakdown = screen.getByRole('dialog')
      // Three ceremonies, three rows. An aggregate would show one.
      expect(within(breakdown).getAllByTestId('adjustment-ceremony')).toHaveLength(3)
      expect(within(breakdown).queryByText(/^Meetings/)).not.toBeInTheDocument()
    })

    it('shows each meeting’s own minutes, not the total', () => {
      renderBoard({ members: [withCeremonies()] })

      fireEvent.click(screen.getByRole('button', { name: /breakdown for Kasun/i }))

      const rows = within(screen.getByRole('dialog')).getAllByTestId('adjustment-ceremony')
      expect(rows[0]).toHaveTextContent('0.3')
      expect(rows[1]).toHaveTextContent('1.0')
      expect(rows[2]).toHaveTextContent('0.5')
    })
  })

  describe('OB-10 — DN-6’s notice', () => {
    it('says so when ceremonies are not deducted', () => {
      renderBoard({ ceremoniesConsumeCapacity: false })

      fireEvent.click(screen.getByRole('button', { name: /breakdown for Kasun/i }))

      expect(
        within(screen.getByRole('dialog')).getByText(
          standupStrings.capacity.ceremoniesNotDeducted()
        )
      ).toBeInTheDocument()
    })

    it('stays silent when they are deducted, so the notice means something', () => {
      renderBoard({ ceremoniesConsumeCapacity: true })

      fireEvent.click(screen.getByRole('button', { name: /breakdown for Kasun/i }))

      expect(
        screen.queryByText(standupStrings.capacity.ceremoniesNotDeducted())
      ).not.toBeInTheDocument()
    })
  })

  describe('OB-12 — stranded hours are an alert, never a calm chip', () => {
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
      renderBoard({ members: [stranded()] })

      const alert = screen.getByRole('alert')
      expect(alert).toHaveTextContent(
        standupStrings.capacity.strandedAllocations({ minutes: m(360) })
      )
    })

    it('offers the reassign action', () => {
      const onReassignStranded = jest.fn()
      renderBoard({ members: [stranded()], onReassignStranded })

      fireEvent.click(
        screen.getByRole('button', {
          name: standupStrings.capacity.strandedAllocationsAction()
        })
      )

      expect(onReassignStranded).toHaveBeenCalledWith('nuwan')
    })

    it('is distinguishable from an ordinary unavailable day', () => {
      // The whole point of OB-12: an absent member with nothing allocated is a
      // calm slate chip, and an absent member holding six hours is an alert.
      // If these two render the same, the failure is invisible.
      const { unmount } = renderBoard({ members: [stranded()] })
      expect(screen.queryByRole('alert')).toBeInTheDocument()
      unmount()

      renderBoard({
        members: [
          member({
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
        ]
      })

      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
      expect(
        screen.getByText(standupStrings.allocationStatus.unavailable())
      ).toBeInTheDocument()
    })
  })

  describe('row controls', () => {
    it('changes hours through the stepper', () => {
      const onChangeHours = jest.fn()
      renderBoard({ onChangeHours })

      fireEvent.click(
        screen.getByRole('button', { name: standupStrings.allocation.stepperIncrease() })
      )

      expect(onChangeHours).toHaveBeenCalledWith('a1', 315)
    })

    it('removes a row', () => {
      const onRemove = jest.fn()
      renderBoard({ onRemove })

      fireEvent.click(
        screen.getByRole('button', {
          name: standupStrings.allocation.removeRow({ task: 'KAN-214' })
        })
      )

      expect(onRemove).toHaveBeenCalledWith('a1')
    })

    it('marks a carried row with its source, so the PM sees what is new today', () => {
      renderBoard()
      expect(screen.getByTestId('source-a1')).toHaveTextContent(/carried/i)
    })

    it('offers the keyboard path to allocation on every card (NFR-A2)', () => {
      const onQuickAdd = jest.fn()
      renderBoard({
        poolTasks: [
          { taskId: 't9', key: 'KAN-301', title: 'Export CSV', remainingEstimateMinutes: m(180) }
        ],
        onQuickAdd
      })

      const input = screen.getByRole('combobox')
      fireEvent.focus(input)
      fireEvent.keyDown(input, { key: 'ArrowDown' })
      fireEvent.keyDown(input, { key: 'Enter' })

      expect(onQuickAdd).toHaveBeenCalledWith(
        'kasun',
        expect.objectContaining({ taskId: 't9' })
      )
    })

    it('locks every control when the member’s row is read-only (RUN-26)', () => {
      renderBoard({ readOnly: true })

      expect(screen.getByRole('spinbutton')).toBeDisabled()
      expect(
        screen.getByRole('button', {
          name: standupStrings.allocation.removeRow({ task: 'KAN-214' })
        })
      ).toBeDisabled()
    })
  })

  describe('scale (the plan’s 25-member threshold)', () => {
    const many = (count: number) =>
      Array.from({ length: count }, (_, index) =>
        member({ memberId: `m${index}`, name: `Member ${index}`, allocations: [] })
      )

    it('renders every member directly below the threshold, with no scroll container', () => {
      renderBoard({ members: many(10) })

      expect(screen.getAllByTestId('member-card')).toHaveLength(10)
      expect(screen.queryByTestId('board-scroll')).not.toBeInTheDocument()
    })

    it('switches to the virtualised mode past it, rather than mounting fifty cards', () => {
      renderBoard({ members: many(50) })

      // What is asserted here is the *mode*, not the pixel behaviour: jsdom
      // reports a zero-height scroll element, so the virtualiser mounts nothing
      // at all and a card count would be measuring the test environment rather
      // than the component. The scroll container's presence is the honest
      // signal that the virtualised branch was taken, and the card count
      // confirms it is not falling back to mounting all fifty.
      expect(screen.getByTestId('board-scroll')).toBeInTheDocument()
      expect(screen.queryAllByTestId('member-card').length).toBeLessThan(50)
    })

    it('still reports the full count, so nobody looks absent because they scrolled off', () => {
      renderBoard({ members: many(50) })
      expect(screen.getByTestId('member-count')).toHaveTextContent('50')
    })
  })

  describe('the estimate-debt badge (§15.8.7)', () => {
    it('appears only when there is debt', () => {
      renderBoard({
        members: [
          member({ capacity: capacity({ outstandingDebtMinutes: m(120) }) })
        ]
      })

      expect(screen.getByTestId('debt-badge')).toHaveTextContent('2.0')
    })

    it('is absent at zero debt', () => {
      renderBoard()
      expect(screen.queryByTestId('debt-badge')).not.toBeInTheDocument()
    })
  })
})
