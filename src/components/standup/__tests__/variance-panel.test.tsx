/**
 * @jest-environment jsdom
 */
/**
 * Panel 3 — variance and estimate debt (Phase 8, Task 16 — §15.8.5, §15.11,
 * VAR-8, VAR-11..15, E42).
 *
 * Three of these assertions are about numbers a PM must not be able to confuse
 * with each other, and one is about a sentence:
 *
 *   - all four numbers on every row (VAR-11), because the day's conversation
 *     and the estimate's conversation are different problems;
 *   - every colour paired with its word (VAR-12, NFR-A2);
 *   - a chronic spill pinned above the sort (VAR-14);
 *   - the §12.3 explanation rendered verbatim, because §15.8.5 calls that copy
 *     a requirement rather than decoration.
 */
import { fireEvent, render, screen, within } from '@testing-library/react'

import { DebtLedgerDrawer } from '@/components/standup/run/DebtLedgerDrawer'
import { ReviseEstimateModal } from '@/components/standup/run/ReviseEstimateModal'
import {
  VariancePanel,
  type VariancePanelMember,
  type VariancePanelRow
} from '@/components/standup/run/VariancePanel'
import { hoursToMinutes, minutes, type Minutes } from '@/lib/standup/minutes'
import { standupStrings } from '@/lib/standup/strings'

const h = (hours: number): Minutes => hoursToMinutes(hours)
const m = (value: number): Minutes => minutes(value)

const row = (overrides: Partial<VariancePanelRow> = {}): VariancePanelRow => ({
  allocationId: 'alloc-214',
  taskId: 'task-214',
  taskKey: 'KAN-214',
  title: 'Invoice model',
  memberId: 'kasun',
  memberName: 'Kasun Perera',
  outcome: 'open_over_consumed',
  plannedMinutes: h(6),
  loggedMinutesOnDay: h(8),
  dayVarianceMinutes: h(2),
  originalEstimateMinutes: h(6),
  totalLoggedMinutesOnTask: h(8),
  taskVarianceMinutes: h(2),
  requiresRevision: true,
  requiresReason: false,
  spillChainLength: 1,
  chronicSpill: false,
  explanation: standupStrings.variance.openOverConsumed({
    planned: h(6),
    logged: h(8),
    over: h(2),
    totalOnTask: h(8),
    estimate: h(6),
    taskOver: h(2)
  }),
  ...overrides
})

const member = (overrides: Partial<VariancePanelMember> = {}): VariancePanelMember => ({
  memberId: 'kasun',
  memberName: 'Kasun Perera',
  plannedMinutes: h(8),
  loggedMinutesOnDay: h(8),
  dayVarianceMinutes: m(0),
  outstandingDebtMinutes: h(2),
  surplusMinutes: m(0),
  needingRevision: 1,
  ...overrides
})

const handlers = () => ({
  onRevise: jest.fn(),
  onGiveReason: jest.fn(),
  onViewLedger: jest.fn()
})

describe('VariancePanel', () => {
  it('shows all four numbers on every row (VAR-11)', () => {
    render(<VariancePanel data={{ rows: [row()], members: [member()] }} {...handlers()} />)
    const rendered = within(screen.getByTestId('variance-row-KAN-214'))

    expect(rendered.getByTestId('planned')).toHaveTextContent('6.0h')
    expect(rendered.getByTestId('logged')).toHaveTextContent('8.0h')
    expect(rendered.getByTestId('day-variance-over')).toHaveTextContent('+2.0h')
    expect(rendered.getByTestId('task-variance')).toHaveTextContent('+2.0h')
    // The second line names both task-scope inputs, so the two conversations
    // cannot be confused.
    expect(rendered.getByTestId('original-estimate')).toHaveTextContent('6.0h')
    expect(rendered.getByTestId('total-logged')).toHaveTextContent('8.0h')
  })

  it('pairs every variance colour with a word, so colour is never the only signal (VAR-12)', () => {
    const rows = [
      row({ allocationId: 'a', taskKey: 'KAN-1', dayVarianceMinutes: h(2) }),
      row({ allocationId: 'b', taskKey: 'KAN-2', dayVarianceMinutes: h(-2) }),
      row({ allocationId: 'c', taskKey: 'KAN-3', dayVarianceMinutes: m(0) }),
      row({
        allocationId: 'd',
        taskKey: 'KAN-4',
        outcome: 'not_started',
        dayVarianceMinutes: h(-2)
      })
    ]
    render(<VariancePanel data={{ rows, members: [member()] }} {...handlers()} />)

    expect(screen.getByTestId('day-variance-over')).toHaveTextContent(
      standupStrings.variance.labelOver()
    )
    expect(screen.getByTestId('day-variance-under')).toHaveTextContent(
      standupStrings.variance.labelUnder()
    )
    expect(screen.getByTestId('day-variance-on-estimate')).toHaveTextContent(
      standupStrings.variance.labelOnEstimate()
    )
    expect(screen.getByTestId('day-variance-not-started')).toHaveTextContent(
      standupStrings.variance.labelNotStarted()
    )
  })

  it('renders the §12.3 explanation verbatim on the KAN-214 row', () => {
    render(<VariancePanel data={{ rows: [row()], members: [member()] }} {...handlers()} />)
    expect(screen.getByTestId('variance-explanation-KAN-214')).toHaveTextContent(
      'Planned 6.0h, logged 8.0h, over by 2.0h. Still in progress. Total on task 8.0h against a ' +
        '6.0h estimate, task is 2.0h over estimate. Revised remaining estimate required.'
    )
  })

  it('pins a chronic-spill row to the top whatever the sort (VAR-14)', () => {
    const rows = [
      row({ allocationId: 'a', taskKey: 'KAN-001', memberName: 'Amal Fernando' }),
      row({
        allocationId: 'b',
        taskKey: 'KAN-999',
        memberName: 'Zoya Khan',
        chronicSpill: true,
        spillChainLength: 5
      })
    ]
    render(<VariancePanel data={{ rows, members: [member()] }} {...handlers()} />)

    const firstRow = () => screen.getAllByTestId(/^variance-row-/)[0]
    expect(firstRow()).toHaveAttribute('data-testid', 'variance-row-KAN-999')

    fireEvent.change(screen.getByLabelText('Sort'), { target: { value: 'task_key' } })
    expect(firstRow()).toHaveAttribute('data-testid', 'variance-row-KAN-999')

    expect(
      within(screen.getByTestId('variance-row-KAN-999')).getByTestId('chronic-spill')
    ).toHaveTextContent(standupStrings.variance.chronicSpill({ chainLength: 5 }))
  })

  it('renders the roll-up strip with all five figures (VAR-13)', () => {
    render(<VariancePanel data={{ rows: [row()], members: [member()] }} {...handlers()} />)
    const strip = within(screen.getByTestId('variance-rollup-kasun'))

    expect(strip.getByTestId('planned-total')).toHaveTextContent('8.0h')
    expect(strip.getByTestId('logged-total')).toHaveTextContent('8.0h')
    expect(strip.getByTestId('net-day-variance')).toHaveTextContent('0.0h')
    expect(strip.getByTestId('outstanding-debt')).toHaveTextContent('2.0h')
    expect(strip.getByTestId('needing-revision')).toHaveTextContent('1')
  })

  it('shows a surplus as "ahead of estimate", never as negative debt (E42)', () => {
    render(
      <VariancePanel
        data={{
          rows: [row()],
          members: [member({ outstandingDebtMinutes: m(0), surplusMinutes: h(2) })]
        }}
        {...handlers()}
      />
    )
    const strip = screen.getByTestId('variance-rollup-kasun')
    expect(strip).toHaveTextContent(standupStrings.variance.surplus({ minutes: h(2) }))
    expect(strip).not.toHaveTextContent('-2.0h')
  })

  it('offers the revision control only while the row is unanswered', () => {
    const api = handlers()
    const { rerender } = render(
      <VariancePanel data={{ rows: [row()], members: [member()] }} {...api} />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Revise KAN-214' }))
    expect(api.onRevise).toHaveBeenCalledWith(expect.objectContaining({ taskId: 'task-214' }))

    rerender(
      <VariancePanel
        data={{ rows: [row({ revisedRemainingMinutes: h(3) })], members: [member()] }}
        {...api}
      />
    )
    expect(screen.queryByRole('button', { name: 'Revise KAN-214' })).not.toBeInTheDocument()
  })

  it('asks for a reason on a not-started row (AC-18)', () => {
    const api = handlers()
    render(
      <VariancePanel
        data={{
          rows: [
            row({
              outcome: 'not_started',
              requiresRevision: false,
              requiresReason: true,
              taskKey: 'KAN-231'
            })
          ],
          members: [member()]
        }}
        {...api}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Give a reason for KAN-231' }))
    expect(api.onGiveReason).toHaveBeenCalled()
  })

  it('opens the ledger drawer from the roll-up strip', () => {
    const api = handlers()
    render(<VariancePanel data={{ rows: [row()], members: [member()] }} {...api} />)
    fireEvent.click(screen.getByRole('button', { name: standupStrings.debt.ledgerTitle() }))
    expect(api.onViewLedger).toHaveBeenCalledWith('kasun')
  })
})

describe('ReviseEstimateModal (§15.11)', () => {
  const target = {
    allocationId: 'alloc-214',
    taskKey: 'KAN-214',
    title: 'Invoice model',
    memberName: 'Kasun',
    originalEstimateMinutes: h(6),
    totalLoggedMinutesOnTask: h(8),
    taskVarianceMinutes: h(2)
  }

  it('shows the projected new total once hours are entered', () => {
    render(<ReviseEstimateModal target={target} onSave={jest.fn()} onCancel={jest.fn()} />)

    fireEvent.change(screen.getByLabelText(/how many hours are left/i), {
      target: { value: '3' }
    })

    expect(screen.getByTestId('revise-projected')).toHaveTextContent(
      'Kasun’s new total on this task would be 11.0h.'
    )
  })

  it('says the original estimate will not change (VAR-16)', () => {
    render(<ReviseEstimateModal target={target} onSave={jest.fn()} onCancel={jest.fn()} />)
    expect(
      screen.getByText(standupStrings.variance.reviseOriginalUnchanged())
    ).toBeInTheDocument()
  })

  it('requires detail when the revision reason is other (VAR-15)', () => {
    render(<ReviseEstimateModal target={target} onSave={jest.fn()} onCancel={jest.fn()} />)

    fireEvent.change(screen.getByLabelText(/how many hours are left/i), {
      target: { value: '3' }
    })
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'other' } })
    fireEvent.change(screen.getByLabelText('Detail'), { target: { value: 'too short' } })

    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()

    fireEvent.change(screen.getByLabelText('Detail'), {
      target: { value: 'The upstream API changed shape overnight.' }
    })
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()
  })

  it('saves the revision in minutes, not hours', () => {
    const onSave = jest.fn()
    render(<ReviseEstimateModal target={target} onSave={onSave} onCancel={jest.fn()} />)

    fireEvent.change(screen.getByLabelText(/how many hours are left/i), {
      target: { value: '3.25' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(onSave).toHaveBeenCalledWith({
      allocationId: 'alloc-214',
      newRemainingMinutes: 195,
      reason: 'underestimated'
    })
  })

  it('cannot be saved before hours are entered', () => {
    render(<ReviseEstimateModal target={target} onSave={jest.fn()} onCancel={jest.fn()} />)
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })
})

describe('DebtLedgerDrawer (VAR-5, VAR-8)', () => {
  const position = {
    outstandingMinutes: h(2),
    surplusMinutes: m(0),
    accruedMinutes: h(2),
    creditedMinutes: m(0),
    settledMinutes: m(0),
    writtenOffMinutes: m(0),
    carriedInMinutes: m(0)
  }

  const entries = [
    { entryId: 'e1', entryType: 'accrual' as const, minutes: h(2), createdAt: new Date() }
  ]

  it('lists the entries behind the number, not just the number', () => {
    render(
      <DebtLedgerDrawer
        memberName="Kasun Perera"
        position={position}
        entries={entries}
        canWriteOff
        onWriteOff={jest.fn()}
        onClose={jest.fn()}
      />
    )
    expect(screen.getByTestId('ledger-entry-e1')).toHaveTextContent(
      standupStrings.debt.entryType.accrual()
    )
    expect(screen.getByTestId('debt-balance')).toHaveTextContent('2.0h outstanding')
  })

  it('shows a surplus as ahead of estimate (E42)', () => {
    render(
      <DebtLedgerDrawer
        memberName="Amal"
        position={{ ...position, outstandingMinutes: m(0), surplusMinutes: h(2) }}
        entries={[]}
        canWriteOff={false}
        onWriteOff={jest.fn()}
        onClose={jest.fn()}
      />
    )
    expect(screen.getByTestId('debt-balance')).toHaveTextContent(
      standupStrings.variance.surplus({ minutes: h(2) })
    )
    expect(screen.getByTestId('debt-balance')).not.toHaveTextContent('-')
  })

  it('disables the write-off submit until twenty characters are typed (VAR-8)', () => {
    render(
      <DebtLedgerDrawer
        memberName="Kasun Perera"
        position={position}
        entries={entries}
        canWriteOff
        onWriteOff={jest.fn()}
        onClose={jest.fn()}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: standupStrings.debt.writeOff() }))
    fireEvent.change(screen.getByLabelText(/hours to write off/i), { target: { value: '2' } })
    fireEvent.change(screen.getByLabelText(/why is this debt/i), {
      target: { value: 'estimate was off' }
    })
    expect(screen.getByRole('button', { name: standupStrings.debt.writeOffConfirm() })).toBeDisabled()

    fireEvent.change(screen.getByLabelText(/why is this debt/i), {
      target: { value: 'The estimate was wrong at planning, not a delivery problem.' }
    })
    expect(screen.getByRole('button', { name: standupStrings.debt.writeOffConfirm() })).toBeEnabled()
  })

  it('offers no write-off control to somebody without the permission', () => {
    render(
      <DebtLedgerDrawer
        memberName="Kasun Perera"
        position={position}
        entries={entries}
        canWriteOff={false}
        onWriteOff={jest.fn()}
        onClose={jest.fn()}
      />
    )
    expect(
      screen.queryByRole('button', { name: standupStrings.debt.writeOff() })
    ).not.toBeInTheDocument()
  })
})
