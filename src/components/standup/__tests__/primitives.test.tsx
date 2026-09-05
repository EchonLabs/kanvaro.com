/**
 * @jest-environment jsdom
 */
/**
 * The four allocation primitives (Phase 7, Task 9 — NFR-A1 … NFR-A4).
 *
 * These ship together, and before the board that uses them, because the plan
 * requires every drag-and-drop action to have a keyboard equivalent and says
 * accessibility is "built in, never retrofitted onto drag-and-drop". The
 * `QuickAddCombobox` is not a convenience for power users: HTML drag-and-drop
 * has no keyboard path at all, so that combobox *is* how a keyboard user
 * allocates work. Building the drop zone first and the combobox later would
 * mean shipping a board that some of the team cannot use.
 *
 * NFR-A1 is the other rule under test throughout: colour is never the only
 * carrier of meaning, so every state that has a colour also has a word.
 *
 * Driven with `fireEvent` rather than `user-event`, matching
 * `StandupSettingsPanel.test.tsx` — the repo has no `user-event` dependency and
 * this phase is not the place to add one.
 */
import { fireEvent, render, screen, within } from '@testing-library/react'
import { useState } from 'react'

import { CapacityMeter } from '@/components/standup/primitives/CapacityMeter'
import { Drawer } from '@/components/standup/primitives/Drawer'
import { HourStepper } from '@/components/standup/primitives/HourStepper'
import { QuickAddCombobox } from '@/components/standup/primitives/QuickAddCombobox'
import { minutes } from '@/lib/standup/minutes'
import { standupStrings } from '@/lib/standup/strings'

const m = minutes

/** Types into a controlled field the way a person does: change, then blur. */
function typeAndCommit(field: HTMLElement, value: string) {
  fireEvent.change(field, { target: { value } })
  fireEvent.blur(field)
}

describe('CapacityMeter (NFR-A1)', () => {
  const base = {
    name: 'Kasun',
    effectiveMinutes: m(480),
    allocatedMinutes: m(300),
    carriedMinutes: m(180),
    gapMinutes: m(180)
  }

  it('renders the status word, not only the colour', () => {
    render(<CapacityMeter {...base} status="under" />)

    expect(
      screen.getByText(standupStrings.allocationStatus.under({ minutes: m(180) }))
    ).toBeInTheDocument()
  })

  it('carries a word for every one of the five statuses', () => {
    const cases = [
      ['full', standupStrings.allocationStatus.full()],
      ['under', standupStrings.allocationStatus.under({ minutes: m(180) })],
      ['over', standupStrings.allocationStatus.over({ minutes: m(180) })],
      ['zero', standupStrings.allocationStatus.zero()],
      ['unavailable', standupStrings.allocationStatus.unavailable()]
    ] as const

    for (const [status, label] of cases) {
      const { unmount } = render(<CapacityMeter {...base} status={status} />)
      expect(screen.getByText(label)).toBeInTheDocument()
      unmount()
    }
  })

  it('exposes the numbers to assistive technology, not just the bar', () => {
    render(<CapacityMeter {...base} status="under" />)

    const meter = screen.getByRole('progressbar')
    expect(meter).toHaveAttribute('aria-valuenow', '300')
    expect(meter).toHaveAttribute('aria-valuemax', '480')
    expect(meter).toHaveAccessibleName(
      standupStrings.allocation.meterLabel({
        name: 'Kasun',
        allocated: m(300),
        capacity: m(480)
      })
    )
  })

  it('segments carried work from new work (§15.8.7)', () => {
    render(<CapacityMeter {...base} status="under" />)

    // 180 carried and 120 new against a 480 day.
    expect(screen.getByTestId('meter-carried')).toHaveStyle({ width: '37.5%' })
    expect(screen.getByTestId('meter-new')).toHaveStyle({ width: '25%' })
  })

  it('renders over-allocation beyond the bar rather than clipping it', () => {
    render(
      <CapacityMeter
        {...base}
        allocatedMinutes={m(600)}
        carriedMinutes={m(180)}
        gapMinutes={m(-120)}
        status="over"
      />
    )

    // Clipping would make 9h and 20h look identical, which is precisely the
    // case a PM needs to see.
    expect(screen.getByTestId('meter-over')).toBeInTheDocument()
  })

  it('renders an unavailable day without dividing by zero', () => {
    render(
      <CapacityMeter
        name="Nuwan"
        effectiveMinutes={m(0)}
        allocatedMinutes={m(0)}
        carriedMinutes={m(0)}
        gapMinutes={m(0)}
        status="unavailable"
      />
    )

    expect(screen.getByText(standupStrings.allocationStatus.unavailable())).toBeInTheDocument()
    expect(screen.getByTestId('meter-carried')).toHaveStyle({ width: '0%' })
  })
})

describe('HourStepper (ALO-6)', () => {
  const increase = () =>
    screen.getByRole('button', { name: standupStrings.allocation.stepperIncrease() })
  const decrease = () =>
    screen.getByRole('button', { name: standupStrings.allocation.stepperDecrease() })

  it('steps up and down by fifteen minutes', () => {
    const onChange = jest.fn()
    render(<HourStepper taskLabel="KAN-214" valueMinutes={m(180)} onChange={onChange} />)

    fireEvent.click(increase())
    expect(onChange).toHaveBeenLastCalledWith(195)

    fireEvent.click(decrease())
    expect(onChange).toHaveBeenLastCalledWith(165)
  })

  it('accepts typed hours and emits minutes (DAT-2)', () => {
    const onChange = jest.fn()
    render(<HourStepper taskLabel="KAN-214" valueMinutes={m(180)} onChange={onChange} />)

    typeAndCommit(screen.getByRole('spinbutton'), '2.5')

    expect(onChange).toHaveBeenLastCalledWith(150)
  })

  it('snaps a typed value to the nearest quarter hour', () => {
    const onChange = jest.fn()
    render(<HourStepper taskLabel="KAN-214" valueMinutes={m(180)} onChange={onChange} />)

    typeAndCommit(screen.getByRole('spinbutton'), '2.6')

    // 156 minutes is not a legal allocation. Rounding here rather than refusing
    // keeps the PM moving, and the server enforces the same grain.
    expect(onChange).toHaveBeenLastCalledWith(150)
  })

  it('never emits zero — CC-5 refuses empty allocations', () => {
    const onChange = jest.fn()
    render(<HourStepper taskLabel="KAN-214" valueMinutes={m(15)} onChange={onChange} />)

    expect(decrease()).toBeDisabled()
    fireEvent.click(decrease())
    expect(onChange).not.toHaveBeenCalled()
  })

  it('ignores a typed value below the step rather than emitting it', () => {
    const onChange = jest.fn()
    render(<HourStepper taskLabel="KAN-214" valueMinutes={m(180)} onChange={onChange} />)

    typeAndCommit(screen.getByRole('spinbutton'), '0')

    expect(onChange).not.toHaveBeenCalled()
  })

  it('restores the committed value after an ignored entry, so the field never lies', () => {
    render(<HourStepper taskLabel="KAN-214" valueMinutes={m(180)} onChange={jest.fn()} />)

    const input = screen.getByRole('spinbutton')
    typeAndCommit(input, 'banana')

    expect(input).toHaveValue(3)
  })

  it('names itself after the task it plans', () => {
    render(<HourStepper taskLabel="KAN-214" valueMinutes={m(180)} onChange={jest.fn()} />)

    expect(screen.getByRole('spinbutton')).toHaveAccessibleName(
      standupStrings.allocation.stepperLabel({ task: 'KAN-214' })
    )
  })

  it('shows the ALO-7 split when the allocation covers only part of the task', () => {
    render(
      <HourStepper
        taskLabel="KAN-214"
        valueMinutes={m(180)}
        remainingEstimateMinutes={m(420)}
        onChange={jest.fn()}
      />
    )

    expect(
      screen.getByText(
        standupStrings.allocation.stepperSplit({
          planned: m(180),
          remaining: m(420),
          carries: m(240)
        })
      )
    ).toBeInTheDocument()
  })

  it('shows no split when the allocation covers the whole remainder', () => {
    render(
      <HourStepper
        taskLabel="KAN-214"
        valueMinutes={m(420)}
        remainingEstimateMinutes={m(420)}
        onChange={jest.fn()}
      />
    )

    expect(screen.queryByText(/will carry to tomorrow/)).not.toBeInTheDocument()
  })

  it('steps with the arrow keys, so the mouse is never required', () => {
    const onChange = jest.fn()
    render(<HourStepper taskLabel="KAN-214" valueMinutes={m(180)} onChange={onChange} />)

    const input = screen.getByRole('spinbutton')
    fireEvent.keyDown(input, { key: 'ArrowUp' })
    expect(onChange).toHaveBeenLastCalledWith(195)

    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(onChange).toHaveBeenLastCalledWith(165)
  })

  it('is disabled as a whole when the row is locked (RUN-26)', () => {
    render(
      <HourStepper taskLabel="KAN-214" valueMinutes={m(180)} onChange={jest.fn()} disabled />
    )

    expect(screen.getByRole('spinbutton')).toBeDisabled()
    expect(increase()).toBeDisabled()
    expect(decrease()).toBeDisabled()
  })
})

describe('Drawer (NFR-A3)', () => {
  function Harness() {
    const [open, setOpen] = useState(false)
    return (
      <>
        <button onClick={() => setOpen(true)}>Open Kasun</button>
        <Drawer open={open} onClose={() => setOpen(false)} title="Kasun's day">
          <button>Inside</button>
        </Drawer>
      </>
    )
  }

  const openDrawer = () => {
    render(<Harness />)
    const trigger = screen.getByRole('button', { name: 'Open Kasun' })
    // Focused explicitly because `fireEvent.click` does not move focus, while a
    // real browser focuses a button on activation by pointer or by key. Without
    // this the drawer would capture `document.body` as the element to restore,
    // which is a limitation of the test driver rather than of the component.
    trigger.focus()
    fireEvent.click(trigger)
    return trigger
  }

  it('is not in the document until it is opened', () => {
    render(<Harness />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('names itself, so a screen reader announces whose day it is', () => {
    openDrawer()
    expect(screen.getByRole('dialog')).toHaveAccessibleName("Kasun's day")
  })

  it('moves focus inside on open', () => {
    openDrawer()

    expect(screen.getByRole('dialog')).toContainElement(
      document.activeElement as HTMLElement
    )
  })

  it('returns focus to the trigger on close, so the board does not lose the PM’s place', () => {
    const trigger = openDrawer()

    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: standupStrings.allocation.drawerClose()
      })
    )

    expect(trigger).toHaveFocus()
  })

  it('closes on Escape', () => {
    openDrawer()

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('keeps Tab inside the drawer rather than letting focus fall onto the board behind it', () => {
    openDrawer()

    const dialog = screen.getByRole('dialog')
    const close = within(dialog).getByRole('button', {
      name: standupStrings.allocation.drawerClose()
    })
    const inside = within(dialog).getByRole('button', { name: 'Inside' })

    inside.focus()
    fireEvent.keyDown(dialog, { key: 'Tab' })
    expect(close).toHaveFocus()

    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true })
    expect(inside).toHaveFocus()
  })
})

describe('QuickAddCombobox (NFR-A2 — the keyboard path to allocation)', () => {
  const tasks = [
    { taskId: 't1', key: 'KAN-301', title: 'Export CSV', remainingEstimateMinutes: m(300) },
    { taskId: 't2', key: 'KAN-302', title: 'Audit log', remainingEstimateMinutes: m(480) },
    { taskId: 't3', key: 'KAN-310', title: 'Health check', remainingEstimateMinutes: m(60) }
  ]

  const renderCombobox = (onSelect = jest.fn()) => {
    render(
      <QuickAddCombobox
        memberName="Kasun"
        tasks={tasks}
        gapMinutes={m(300)}
        onSelect={onSelect}
      />
    )
    return { onSelect, input: screen.getByRole('combobox') }
  }

  it('is a labelled combobox, not an unnamed input', () => {
    const { input } = renderCombobox()

    expect(input).toHaveAccessibleName(
      standupStrings.allocation.quickAddLabel({ name: 'Kasun' })
    )
  })

  it('allocates a task by keyboard alone — no pointer events at all', () => {
    const { onSelect, input } = renderCombobox()

    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'health' } })
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: 't3', key: 'KAN-310' })
    )
  })

  it('filters on key and on title', () => {
    const { input } = renderCombobox()

    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'KAN-302' } })

    const options = screen.getAllByRole('option')
    expect(options).toHaveLength(1)
    expect(options[0]).toHaveTextContent('Audit log')
  })

  it('says so when nothing matches, rather than showing an empty list', () => {
    const { input } = renderCombobox()

    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'nothing like this' } })

    expect(screen.getByText(standupStrings.allocation.quickAddEmpty())).toBeInTheDocument()
    expect(screen.queryAllByRole('option')).toHaveLength(0)
  })

  it('shows the ALO-17 fit against the member’s gap', () => {
    const { input } = renderCombobox()

    fireEvent.focus(input)

    // A 5h task against a 5h gap closes the day exactly.
    expect(
      within(screen.getByRole('option', { name: /Export CSV/ })).getByText(
        standupStrings.allocation.fitsExact()
      )
    ).toBeInTheDocument()

    // An 8h task against the same gap overflows by 3h.
    expect(
      within(screen.getByRole('option', { name: /Audit log/ })).getByText(
        standupStrings.allocation.fitsOver({ minutes: m(180) })
      )
    ).toBeInTheDocument()
  })

  it('marks the active option so a screen reader follows the arrow keys', () => {
    const { input } = renderCombobox()

    fireEvent.focus(input)
    fireEvent.keyDown(input, { key: 'ArrowDown' })

    const active = screen.getByRole('option', { name: /Export CSV/ })
    expect(active).toHaveAttribute('aria-selected', 'true')
    expect(input).toHaveAttribute('aria-activedescendant', active.id)
  })

  it('clears itself after a selection, ready for the next task', () => {
    const { input } = renderCombobox()

    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'health' } })
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(input).toHaveValue('')
  })

  it('closes on Escape without selecting anything', () => {
    const { onSelect, input } = renderCombobox()

    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'health' } })
    fireEvent.keyDown(input, { key: 'Escape' })

    expect(screen.queryAllByRole('option')).toHaveLength(0)
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('selects nothing on Enter when no option is active', () => {
    const { onSelect, input } = renderCombobox()

    fireEvent.focus(input)
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onSelect).not.toHaveBeenCalled()
  })
})
