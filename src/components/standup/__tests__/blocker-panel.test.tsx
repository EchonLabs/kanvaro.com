/**
 * @jest-environment jsdom
 */
/**
 * Panel 6 — blockers (§13, RUN-14..18, Phase 10 Task 10).
 */
import { fireEvent, render, screen } from '@testing-library/react'

import { BlockerPanel, type BlockerRow } from '@/components/standup/run/BlockerPanel'
import { minutes } from '@/lib/standup/minutes'
import { standupStrings } from '@/lib/standup/strings'

function row(overrides: Partial<BlockerRow> = {}): BlockerRow {
  return {
    blockerId: 'blk-1',
    taskKey: 'KAN-214',
    description: 'Waiting on API contract',
    blockerType: 'dependency',
    severity: 'medium',
    status: 'open',
    overdue: false,
    blockerLabel: 'BLK-1',
    ...overrides
  }
}

describe('BlockerPanel (Panel 6)', () => {
  it('renders the empty state when there are no blockers', () => {
    render(
      <BlockerPanel blockers={[]} today="2026-09-02" onRaise={() => {}} onResolve={() => {}} />
    )

    expect(screen.getByText(standupStrings.blocker.empty())).toBeInTheDocument()
    expect(screen.queryAllByTestId('blocker-row')).toHaveLength(0)
  })

  it('gives an overdue row the destructive class', () => {
    render(
      <BlockerPanel
        blockers={[row({ overdue: true, targetResolutionDate: '2026-08-01' })]}
        today="2026-09-02"
        onRaise={() => {}}
        onResolve={() => {}}
      />
    )

    const rows = screen.getAllByTestId('blocker-row')
    expect(rows).toHaveLength(1)
    expect(rows[0].className).toContain('text-destructive')
  })

  it('does not mark a non-overdue row as destructive', () => {
    render(
      <BlockerPanel blockers={[row()]} today="2026-09-02" onRaise={() => {}} onResolve={() => {}} />
    )

    const rows = screen.getAllByTestId('blocker-row')
    expect(rows[0].className).not.toContain('text-destructive')
  })

  it('renders the freed-capacity line when freedMinutes is set', () => {
    render(
      <BlockerPanel
        blockers={[row({ freedMinutes: minutes(120), blockerLabel: 'BLK-14' })]}
        today="2026-09-02"
        onRaise={() => {}}
        onResolve={() => {}}
      />
    )

    expect(screen.getByText('2.0h freed by blocker BLK-14')).toBeInTheDocument()
  })

  it('does not render a freed-capacity line when freedMinutes is absent', () => {
    render(
      <BlockerPanel blockers={[row()]} today="2026-09-02" onRaise={() => {}} onResolve={() => {}} />
    )

    expect(screen.queryByText(/freed by blocker/)).not.toBeInTheDocument()
  })

  it('calls onRaise when the raise button is clicked', () => {
    const onRaise = jest.fn()
    render(
      <BlockerPanel blockers={[]} today="2026-09-02" onRaise={onRaise} onResolve={() => {}} />
    )

    fireEvent.click(screen.getByText(standupStrings.blocker.raise()))
    expect(onRaise).toHaveBeenCalledTimes(1)
  })

  it('calls onResolve with the blockerId when resolve is clicked', () => {
    const onResolve = jest.fn()
    render(
      <BlockerPanel
        blockers={[row({ blockerId: 'blk-9' })]}
        today="2026-09-02"
        onRaise={() => {}}
        onResolve={onResolve}
      />
    )

    fireEvent.click(screen.getByText(standupStrings.blocker.resolve()))
    expect(onResolve).toHaveBeenCalledWith('blk-9')
  })

  it('does not show a resolve button for an already-resolved blocker', () => {
    render(
      <BlockerPanel
        blockers={[row({ status: 'resolved' })]}
        today="2026-09-02"
        onRaise={() => {}}
        onResolve={() => {}}
      />
    )

    expect(screen.queryByText(standupStrings.blocker.resolve())).not.toBeInTheDocument()
  })

  it('falls back to a general label when the blocker has no task key', () => {
    render(
      <BlockerPanel
        blockers={[row({ taskKey: undefined })]}
        today="2026-09-02"
        onRaise={() => {}}
        onResolve={() => {}}
      />
    )

    expect(screen.getByText(standupStrings.blocker.general())).toBeInTheDocument()
  })
})
