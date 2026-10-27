/**
 * @jest-environment jsdom
 */
import { useState } from 'react'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { ModalOverlay } from '../ModalOverlay'

describe('ModalOverlay', () => {
  it('closes on Escape and on backdrop click', () => {
    const onClose = jest.fn()
    render(
      <ModalOverlay open onClose={onClose} labelledBy="t">
        <h2 id="t">Title</h2>
        <button>First</button>
        <button>Last</button>
      </ModalOverlay>
    )

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByTestId('modal-overlay-backdrop'))
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('renders nothing when closed', () => {
    render(
      <ModalOverlay open={false} onClose={jest.fn()} labelledBy="t">
        <h2 id="t">Title</h2>
      </ModalOverlay>
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  /**
   * `ModalOverlay` deliberately duplicates (rather than shares) `Drawer.tsx`'s
   * focus-trap logic (see the component's own docblock), so `Drawer`'s test
   * suite (`src/components/standup/__tests__/primitives.test.tsx`) provides
   * zero coverage for this component. These four mirror that suite's
   * structure exactly, against `ModalOverlay` itself, closing the gap the
   * final-review found: a test titled "...and traps Tab inside" that never
   * actually simulated or asserted a Tab cycle (promoted deferred-minor).
   */
  function Harness() {
    const [open, setOpen] = useState(false)
    return (
      <>
        <button onClick={() => setOpen(true)}>Open modal</button>
        {open && (
          <ModalOverlay open onClose={() => setOpen(false)} labelledBy="modal-title">
            <h2 id="modal-title">A modal</h2>
            <button>First</button>
            <button>Last</button>
          </ModalOverlay>
        )}
      </>
    )
  }

  const openModal = () => {
    render(<Harness />)
    const trigger = screen.getByRole('button', { name: 'Open modal' })
    // Focused explicitly, matching `Drawer`'s own test harness: `fireEvent
    // .click` does not move focus the way a real pointer/keyboard activation
    // does, and without this the modal would capture `document.body` as the
    // element to restore focus to rather than the trigger.
    trigger.focus()
    fireEvent.click(trigger)
    return trigger
  }

  it('moves focus inside on open', () => {
    openModal()

    expect(screen.getByRole('dialog')).toContainElement(
      document.activeElement as HTMLElement
    )
  })

  it('cycles Tab forward through the dialog and wraps back to the first control', () => {
    openModal()

    const dialog = screen.getByRole('dialog')
    const first = within(dialog).getByRole('button', { name: 'First' })
    const last = within(dialog).getByRole('button', { name: 'Last' })

    expect(first).toHaveFocus()

    fireEvent.keyDown(dialog, { key: 'Tab' })
    expect(last).toHaveFocus()

    // Wraps back to the first control rather than escaping the dialog.
    fireEvent.keyDown(dialog, { key: 'Tab' })
    expect(first).toHaveFocus()
  })

  it('cycles Shift+Tab backward through the dialog and wraps to the last control', () => {
    openModal()

    const dialog = screen.getByRole('dialog')
    const first = within(dialog).getByRole('button', { name: 'First' })
    const last = within(dialog).getByRole('button', { name: 'Last' })

    expect(first).toHaveFocus()

    // Wraps to the last control when shift-tabbing back off the first one.
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true })
    expect(last).toHaveFocus()

    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true })
    expect(first).toHaveFocus()
  })

  it('returns focus to the trigger element on close', () => {
    const trigger = openModal()

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })
})
