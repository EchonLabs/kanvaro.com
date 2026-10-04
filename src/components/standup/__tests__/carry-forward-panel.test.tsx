/**
 * @jest-environment jsdom
 */

/**
 * Panel 4's layout contract.
 *
 * The two-column redesign shortened each row by putting identity and urgency
 * beside the record rather than above it, and collapsed the note editor on
 * rows that do not owe a note today. Both of those are only safe if CFW-5
 * still holds, so that is what most of this file pins:
 *
 *   **The note thread is never collapsed** (CFW-5) — "so the PM can see
 *   whether the same excuse has appeared five days running". The editor may
 *   hide behind a button; the thread may not. Asserted on an urgent row AND a
 *   calm one, because the calm row is the one the redesign changed.
 */
import { fireEvent, render, screen } from '@testing-library/react'

import {
  CarryForwardPanel,
  type CarryForwardItemRow,
  type CarryForwardPanelData
} from '@/components/standup/run/CarryForwardPanel'

function item(overrides: Partial<CarryForwardItemRow> = {}): CarryForwardItemRow {
  return {
    itemId: 'cf1',
    type: 'task',
    status: 'open',
    taskKey: 'KAN-12',
    taskTitle: 'Login form',
    memberName: 'Ana Pereira',
    originDate: '2026-10-01',
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

function renderPanel(items: CarryForwardItemRow[], disabled = false) {
  const api = { addNote: jest.fn().mockResolvedValue(undefined), resolve: jest.fn().mockResolvedValue(undefined) }
  const data: CarryForwardPanelData = {
    items,
    summary: { totalOpen: items.length, needingNoteToday: 0, escalated: 0, resolvedYesterday: 0 }
  }
  render(<CarryForwardPanel data={data} api={api} disabled={disabled} />)
  return api
}

const NOTES = [
  { standupDate: '2026-10-01', authorName: 'Ana', text: 'Waiting on the upstream API.', createdAt: '' },
  { standupDate: '2026-10-02', authorName: 'Ana', text: 'Still blocked on the same call.', createdAt: '' }
]

describe('CarryForwardPanel — the note editor', () => {
  it('opens the editor on a row that owes a note today', () => {
    renderPanel([item({ ageBand: 'note_required', requiresNoteToday: true, notedToday: false })])

    expect(screen.getByTestId('note-input')).toBeInTheDocument()
    // No reveal button, because there is nothing left to reveal.
    expect(screen.queryByTestId('reveal-note')).not.toBeInTheDocument()
  })

  it('collapses the editor behind a button on a row that does not', () => {
    renderPanel([item({ ageBand: 'normal', requiresNoteToday: false })])

    expect(screen.queryByTestId('note-input')).not.toBeInTheDocument()
    expect(screen.getByTestId('reveal-note')).toBeInTheDocument()
  })

  it('still lets a calm row be noted — the capability is collapsed, not removed', () => {
    renderPanel([item({ ageBand: 'normal', requiresNoteToday: false })])

    fireEvent.click(screen.getByTestId('reveal-note'))

    expect(screen.getByTestId('note-input')).toBeInTheDocument()
  })

  it('treats a row that already noted today as calm', () => {
    renderPanel([item({ ageBand: 'note_required', requiresNoteToday: true, notedToday: true })])

    expect(screen.queryByTestId('note-input')).not.toBeInTheDocument()
    expect(screen.getByTestId('reveal-note')).toBeInTheDocument()
  })

  it('offers no editor at all once the item is resolved', () => {
    renderPanel([item({ status: 'resolved' })])

    expect(screen.queryByTestId('note-input')).not.toBeInTheDocument()
    expect(screen.queryByTestId('reveal-note')).not.toBeInTheDocument()
  })
})

describe('CarryForwardPanel — CFW-5, the thread is never collapsed', () => {
  it('shows the whole thread on a row that owes a note', () => {
    renderPanel([
      item({ ageBand: 'escalated', requiresNoteToday: true, notes: NOTES })
    ])

    const thread = screen.getByTestId('note-history')
    expect(thread).toHaveTextContent('Waiting on the upstream API.')
    expect(thread).toHaveTextContent('Still blocked on the same call.')
  })

  it('shows the whole thread on a CALM row too, where the editor is collapsed', () => {
    // This is the case the redesign changed: collapsing the editor must not
    // take the thread with it, or the repeated-excuse signal disappears.
    renderPanel([item({ ageBand: 'normal', requiresNoteToday: false, notes: NOTES })])

    expect(screen.queryByTestId('note-input')).not.toBeInTheDocument()

    const thread = screen.getByTestId('note-history')
    expect(thread).toHaveTextContent('Waiting on the upstream API.')
    expect(thread).toHaveTextContent('Still blocked on the same call.')
  })

  it('shows the thread on a resolved row, which has no editor at all', () => {
    renderPanel([item({ status: 'resolved', notes: NOTES })])

    expect(screen.getByTestId('note-history')).toHaveTextContent('Waiting on the upstream API.')
  })
})

describe('CarryForwardPanel — urgency is marked without relying on colour', () => {
  it('rules an escalated row in the danger token', () => {
    renderPanel([item({ ageBand: 'escalated', ageInStandups: 5 })])

    const row = screen.getByTestId('carry-forward-item-cf1')
    expect(row.className).toContain('border-[var(--plan-danger)]')
  })

  it('rules a note_required row in the warning token', () => {
    renderPanel([item({ ageBand: 'note_required', ageInStandups: 3 })])

    const row = screen.getByTestId('carry-forward-item-cf1')
    expect(row.className).toContain('border-[var(--plan-warning)]')
    expect(row.className).not.toContain('border-[var(--plan-danger)]')
  })

  it('leaves a normal row unruled', () => {
    renderPanel([item({ ageBand: 'normal' })])

    const row = screen.getByTestId('carry-forward-item-cf1')
    expect(row.className).not.toContain('border-[var(--plan-danger)]')
    expect(row.className).not.toContain('border-[var(--plan-warning)]')
  })

  it('names the band in text as well, so the rule is reinforcement not the signal', () => {
    renderPanel([item({ ageBand: 'chronic', ageInStandups: 9 })])

    // The age badge spells the band out; a reader who cannot see the rule or
    // the tint still learns the item is chronic.
    expect(screen.getByTestId('age-badge')).toHaveTextContent('Chronic')
  })
})

describe('CarryForwardPanel — resolutions', () => {
  it('promotes Done to the primary action and leaves the rest secondary', () => {
    renderPanel([item({ validResolutions: ['reassigned', 'done', 'descoped'] })])

    // Keyed off the value, not the array position — the server owns that order,
    // and here `done` is deliberately not first.
    const done = screen.getByRole('button', { name: 'Done' })
    const reassigned = screen.getByRole('button', { name: 'Reassigned' })

    expect(done.className).toContain('--apple-card-gradient')
    expect(reassigned.className).not.toContain('--apple-card-gradient')
  })

  it('resolves through the api with the chosen type', () => {
    const api = renderPanel([item({ validResolutions: ['done'] })])

    fireEvent.click(screen.getByRole('button', { name: 'Done' }))

    expect(api.resolve).toHaveBeenCalledWith({ itemId: 'cf1', resolutionType: 'done' })
  })
})
