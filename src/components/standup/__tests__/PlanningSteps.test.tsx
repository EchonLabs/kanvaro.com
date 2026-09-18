/**
 * @jest-environment jsdom
 */
/**
 * Task 4: `GateButton` used to stack an always-visible reason `<span>` under
 * each button, whose height varied by reason length and pushed the buttons
 * in `PlanningWorkspace`'s header row to inconsistent vertical positions.
 * The reason is now surfaced via `InfoTooltip` (a hover/focus tooltip plus a
 * permanent sr-only span for `aria-describedby`), so the row's DOM shape no
 * longer depends on message length.
 */
import { fireEvent, render, screen } from '@testing-library/react'

import { GateButton } from '../planning/PlanningSteps'
import { TooltipProvider } from '@/components/ui/tooltip'

function renderGateButton(overrides: Partial<React.ComponentProps<typeof GateButton>> = {}) {
  const onClick = jest.fn()
  const onBlockedClick = jest.fn()

  render(
    <TooltipProvider>
      <GateButton
        id="planning-poker"
        label="Join planning poker"
        reason="Nothing left to estimate."
        enabled={false}
        onClick={onClick}
        onBlockedClick={onBlockedClick}
        {...overrides}
      />
    </TooltipProvider>
  )

  return { onClick, onBlockedClick }
}

describe('GateButton (Task 4)', () => {
  it('does not render the reason as an always-visible text block', () => {
    renderGateButton()

    const reasonNode = screen.getByText('Nothing left to estimate.')
    expect(reasonNode.tagName).toBe('SPAN')
    expect(reasonNode).toHaveClass('sr-only')
    expect(reasonNode).not.toHaveClass('text-[11px]')
  })

  it("wires the button's aria-describedby to the InfoTooltip's sr-only span", () => {
    renderGateButton()

    const button = screen.getByRole('button', { name: 'Join planning poker' })
    expect(button).toHaveAttribute('aria-describedby', 'planning-poker-reason')

    const srSpan = document.getElementById('planning-poker-reason')
    expect(srSpan).not.toBeNull()
    expect(srSpan).toHaveTextContent('Nothing left to estimate.')
    expect(srSpan).toHaveClass('sr-only')
  })

  it("keeps the button row's structure independent of reason length: button + tooltip trigger + sr-only span", () => {
    renderGateButton({ reason: 'A' })
    const row = screen.getByRole('button', { name: 'Join planning poker' }).parentElement as HTMLElement
    expect(row.children).toHaveLength(3)
  })

  it('calls onBlockedClick with the reason when the gate is disabled', () => {
    const { onClick, onBlockedClick } = renderGateButton({ enabled: false })

    fireEvent.click(screen.getByRole('button', { name: 'Join planning poker' }))

    expect(onBlockedClick).toHaveBeenCalledWith('Nothing left to estimate.')
    expect(onClick).not.toHaveBeenCalled()
  })

  it('calls onClick and not onBlockedClick when the gate is enabled', () => {
    const { onClick, onBlockedClick } = renderGateButton({ enabled: true })

    fireEvent.click(screen.getByRole('button', { name: 'Join planning poker' }))

    expect(onClick).toHaveBeenCalled()
    expect(onBlockedClick).not.toHaveBeenCalled()
  })

  it('does nothing when busy, regardless of enabled state', () => {
    const { onClick, onBlockedClick } = renderGateButton({ enabled: true, busy: true })

    fireEvent.click(screen.getByRole('button', { name: 'Join planning poker' }))

    expect(onClick).not.toHaveBeenCalled()
    expect(onBlockedClick).not.toHaveBeenCalled()
  })
})
