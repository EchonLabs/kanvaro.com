/**
 * @jest-environment jsdom
 */
/**
 * Panel 7's Override action (Task 22, the fix for Phase 10's one Critical
 * finding: `OverrideModal` existed but nothing in the UI ever opened it).
 *
 * `CompletionPanel` does not decide *how* to build an override — that needs
 * board data it does not have — it only reports which failing, overridable
 * check the PM clicked.
 */
import { fireEvent, render, screen } from '@testing-library/react'

import { CompletionPanel } from '@/components/standup/run/CompletionPanel'
import type { CompletionCheckResult } from '@/lib/standup/completion-checks'
import { standupStrings } from '@/lib/standup/strings'

function check(overrides: Partial<CompletionCheckResult> = {}): CompletionCheckResult {
  return {
    checkId: 'CC-1',
    status: 'fail',
    hard: true,
    overridable: true,
    message: '1 member is not planned to full capacity.',
    entities: [{ memberId: 'kasun', name: 'Kasun', gapMinutes: 120, effectiveMinutes: 480, allocatedMinutes: 360 }],
    ...overrides
  }
}

describe('Panel 7 — the Override action (Task 22)', () => {
  it('renders an Override action on a failing, overridable check', () => {
    const onOverride = jest.fn()
    render(
      <CompletionPanel
        checks={[check()]}
        blocking={[check()]}
        onComplete={jest.fn()}
        onOverride={onOverride}
      />
    )

    const button = screen.getByRole('button', { name: standupStrings.run.override() })
    fireEvent.click(button)

    expect(onOverride).toHaveBeenCalledWith(expect.objectContaining({ checkId: 'CC-1' }))
  })

  it('does not render an Override action on a failing, non-overridable check', () => {
    render(
      <CompletionPanel
        checks={[check({ checkId: 'CC-7', overridable: false, message: 'Set attendance for 1 member.' })]}
        blocking={[]}
        onComplete={jest.fn()}
        onOverride={jest.fn()}
      />
    )

    expect(
      screen.queryByRole('button', { name: standupStrings.run.override() })
    ).not.toBeInTheDocument()
  })

  it('does not render an Override action on a passing check, even if overridable', () => {
    render(
      <CompletionPanel
        checks={[check({ status: 'pass', message: 'Everybody is planned to capacity.', entities: [] })]}
        blocking={[]}
        onComplete={jest.fn()}
        onOverride={jest.fn()}
      />
    )

    expect(
      screen.queryByRole('button', { name: standupStrings.run.override() })
    ).not.toBeInTheDocument()
  })

  it('renders no Override action at all when the prop is omitted', () => {
    render(<CompletionPanel checks={[check()]} blocking={[check()]} onComplete={jest.fn()} />)

    expect(
      screen.queryByRole('button', { name: standupStrings.run.override() })
    ).not.toBeInTheDocument()
  })
})
