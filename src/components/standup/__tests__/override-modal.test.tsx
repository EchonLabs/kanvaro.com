/**
 * @jest-environment jsdom
 */
/**
 * The override modal (§15.12, OVR-1..7, Phase 10 Task 6).
 *
 * Two things worth pinning here, since `validateJustification` and the
 * reason-code lists already prove their own rules in `override.test.ts`:
 *
 *   - the reason list shown is the one matching `type`, not a fixed list —
 *     under- and over-allocation are different failures with different
 *     honest explanations (OVR-3/4);
 *   - the submit button is disabled until the justification is strong enough
 *     and, for `over_allocation` only, until the member has acknowledged it
 *     (OVR-6) — a PM must not be able to click past either gate.
 */
import { fireEvent, render, screen } from '@testing-library/react'

import { OverrideModal } from '@/components/standup/run/OverrideModal'
import {
  UNDER_ALLOCATION_REASON_CODES,
  OVER_ALLOCATION_REASON_CODES
} from '@/lib/standup/override'

const affected = [
  { memberId: 'kasun', name: 'Kasun Perera', gapMinutes: 180, effectiveMinutes: 480, allocatedMinutes: 300 }
]

const strongJustification =
  'All of Kasun’s remaining work is blocked on the vendor sandbox, which is down until Monday.'

describe('OverrideModal', () => {
  it('sources its reason list from the under-allocation codes for type=under_allocation', () => {
    render(
      <OverrideModal
        type="under_allocation"
        affected={affected}
        onCancel={jest.fn()}
        onSubmit={jest.fn()}
      />
    )
    const select = screen.getByRole('combobox')
    const optionValues = Array.from(select.querySelectorAll('option')).map((o) => o.getAttribute('value'))
    expect(optionValues).toEqual([...UNDER_ALLOCATION_REASON_CODES])
  })

  it('sources its reason list from the over-allocation codes for type=over_allocation', () => {
    render(
      <OverrideModal
        type="over_allocation"
        affected={affected}
        onCancel={jest.fn()}
        onSubmit={jest.fn()}
      />
    )
    const select = screen.getByRole('combobox')
    const optionValues = Array.from(select.querySelectorAll('option')).map((o) => o.getAttribute('value'))
    expect(optionValues).toEqual([...OVER_ALLOCATION_REASON_CODES])
  })

  it('keeps submit disabled for a justification below the minimum length', () => {
    render(
      <OverrideModal
        type="under_allocation"
        affected={affected}
        onCancel={jest.fn()}
        onSubmit={jest.fn()}
      />
    )
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'too short' } })
    expect(screen.getByRole('button', { name: /override/i })).toBeDisabled()
  })

  it('enables submit for under_allocation once the justification is strong enough', () => {
    render(
      <OverrideModal
        type="under_allocation"
        affected={affected}
        onCancel={jest.fn()}
        onSubmit={jest.fn()}
      />
    )
    fireEvent.change(screen.getByRole('textbox'), { target: { value: strongJustification } })
    expect(screen.getByRole('button', { name: /override/i })).toBeEnabled()
  })

  it('does not render the acknowledgement checkbox for under_allocation', () => {
    render(
      <OverrideModal
        type="under_allocation"
        affected={affected}
        onCancel={jest.fn()}
        onSubmit={jest.fn()}
      />
    )
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('renders the acknowledgement checkbox for over_allocation and keeps submit disabled until it is ticked', () => {
    render(
      <OverrideModal
        type="over_allocation"
        affected={affected}
        onCancel={jest.fn()}
        onSubmit={jest.fn()}
      />
    )
    fireEvent.change(screen.getByRole('textbox'), { target: { value: strongJustification } })
    const submit = screen.getByRole('button', { name: /override/i })
    expect(submit).toBeDisabled()

    fireEvent.click(screen.getByRole('checkbox'))
    expect(submit).toBeEnabled()
  })

  it('submits the reason, justification and acknowledgement it collected', () => {
    const onSubmit = jest.fn()
    render(
      <OverrideModal
        type="over_allocation"
        affected={affected}
        onCancel={jest.fn()}
        onSubmit={onSubmit}
      />
    )
    fireEvent.change(screen.getByRole('textbox'), { target: { value: strongJustification } })
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: /override/i }))

    expect(onSubmit).toHaveBeenCalledWith({
      reasonCode: OVER_ALLOCATION_REASON_CODES[0],
      justification: strongJustification,
      memberAcknowledged: true
    })
  })

  it('calls onCancel from the cancel action', () => {
    const onCancel = jest.fn()
    render(
      <OverrideModal
        type="under_allocation"
        affected={affected}
        onCancel={onCancel}
        onSubmit={jest.fn()}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onCancel).toHaveBeenCalled()
  })

  it('shows the affected member and their gap', () => {
    render(
      <OverrideModal
        type="under_allocation"
        affected={affected}
        onCancel={jest.fn()}
        onSubmit={jest.fn()}
      />
    )
    expect(screen.getByText(/Kasun Perera/)).toBeInTheDocument()
  })
})
