/**
 * The carry-forward register's pure rules (spec §13.3, CFW-2..4).
 */
import {
  ageBandFor,
  CARRY_FORWARD_NOTE_MIN_LENGTH,
  CHRONIC_AGE_THRESHOLD,
  isResolutionValidForType,
  requiresNoteToday,
  sortByAgeDescending,
  summarise,
  validateCarryForwardNote,
  withChronicTag,
  type AgeThresholds
} from '../carry-forward'

const thresholds: AgeThresholds = { noteThreshold: 3, escalationThreshold: 5 }

describe('ageBandFor', () => {
  it('CFW-3: 1 to 2 is normal', () => {
    expect(ageBandFor(1, thresholds)).toBe('normal')
    expect(ageBandFor(2, thresholds)).toBe('normal')
  })

  it('CFW-3: 3 or more requires a note', () => {
    expect(ageBandFor(3, thresholds)).toBe('note_required')
    expect(ageBandFor(4, thresholds)).toBe('note_required')
  })

  it('CFW-3: 5 or more is escalated', () => {
    expect(ageBandFor(5, thresholds)).toBe('escalated')
    expect(ageBandFor(7, thresholds)).toBe('escalated')
  })

  it('CFW-3: 8 or more is chronic', () => {
    expect(ageBandFor(CHRONIC_AGE_THRESHOLD, thresholds)).toBe('chronic')
    expect(ageBandFor(12, thresholds)).toBe('chronic')
  })

  it('honours a project`s configured thresholds, not just the defaults', () => {
    const tight: AgeThresholds = { noteThreshold: 1, escalationThreshold: 2 }
    expect(ageBandFor(1, tight)).toBe('note_required')
    expect(ageBandFor(2, tight)).toBe('escalated')
  })
})

describe('requiresNoteToday', () => {
  it('is false below the note threshold', () => {
    expect(requiresNoteToday(2, thresholds)).toBe(false)
  })

  it('CFW-3: is true at and above the note threshold, including once escalated or chronic', () => {
    expect(requiresNoteToday(3, thresholds)).toBe(true)
    expect(requiresNoteToday(5, thresholds)).toBe(true)
    expect(requiresNoteToday(CHRONIC_AGE_THRESHOLD, thresholds)).toBe(true)
  })
})

describe('validateCarryForwardNote', () => {
  it(`CFW-4: rejects fewer than ${CARRY_FORWARD_NOTE_MIN_LENGTH} characters`, () => {
    const result = validateCarryForwardNote({ text: 'short' })
    expect(result).toMatchObject({ valid: false, code: 'TOO_SHORT' })
  })

  it('CFW-4: accepts a note at the minimum length', () => {
    const result = validateCarryForwardNote({ text: 'x'.repeat(CARRY_FORWARD_NOTE_MIN_LENGTH) })
    expect(result).toEqual({ valid: true })
  })

  it('CFW-4: rejects a verbatim resubmission of the previous note', () => {
    const text = 'Waiting on the vendor.'
    const result = validateCarryForwardNote({ text, previousNoteText: text })
    expect(result).toMatchObject({ valid: false, code: 'NOTE_UNCHANGED' })
  })

  it('treats surrounding whitespace as the same note', () => {
    const result = validateCarryForwardNote({
      text: '  Waiting on the vendor.  ',
      previousNoteText: 'Waiting on the vendor.'
    })
    expect(result).toMatchObject({ valid: false, code: 'NOTE_UNCHANGED' })
  })

  it('accepts a note that genuinely changed', () => {
    const result = validateCarryForwardNote({
      text: 'Vendor replied, fix lands tomorrow.',
      previousNoteText: 'Waiting on the vendor.'
    })
    expect(result).toEqual({ valid: true })
  })

  it('has no previous note to compare against on the first round', () => {
    const result = validateCarryForwardNote({ text: 'Blocked on the design review.' })
    expect(result).toEqual({ valid: true })
  })
})

describe('isResolutionValidForType', () => {
  it('accepts a resolution §13.2 lists for the type', () => {
    expect(isResolutionValidForType('unfinished_task', 'done')).toBe(true)
    expect(isResolutionValidForType('owner_absent', 'reassigned')).toBe(true)
  })

  it('rejects a resolution the item type does not support', () => {
    expect(isResolutionValidForType('missed_standup_rollup', 'done')).toBe(false)
  })

  it('rejects an unknown type entirely', () => {
    expect(isResolutionValidForType('not_a_real_type', 'other')).toBe(false)
  })
})

describe('withChronicTag', () => {
  it('adds the tag once age reaches the chronic threshold', () => {
    expect(withChronicTag([], CHRONIC_AGE_THRESHOLD)).toEqual(['chronic'])
  })

  it('does not duplicate the tag on repeated calls', () => {
    expect(withChronicTag(['chronic'], CHRONIC_AGE_THRESHOLD + 1)).toEqual(['chronic'])
  })

  it('preserves other tags', () => {
    expect(withChronicTag(['owner_absent'], CHRONIC_AGE_THRESHOLD)).toEqual([
      'owner_absent',
      'chronic'
    ])
  })

  it('removes the tag if age somehow drops below the threshold (defensive, should not occur in practice)', () => {
    expect(withChronicTag(['chronic'], 2)).toEqual([])
  })
})

describe('sortByAgeDescending', () => {
  it('CFW-10: sorts oldest first', () => {
    const items = [
      { id: 'a', ageInStandups: 2 },
      { id: 'b', ageInStandups: 8 },
      { id: 'c', ageInStandups: 5 }
    ]
    expect(sortByAgeDescending(items).map((item) => item.id)).toEqual(['b', 'c', 'a'])
  })

  it('breaks ties deterministically by id', () => {
    const items = [
      { id: 'z', ageInStandups: 3 },
      { id: 'a', ageInStandups: 3 }
    ]
    expect(sortByAgeDescending(items).map((item) => item.id)).toEqual(['a', 'z'])
  })
})

describe('summarise', () => {
  it('CFW-11: counts open, needing a note today, escalated and resolved-today', () => {
    const summary = summarise(
      [
        { status: 'open', ageInStandups: 1 },
        { status: 'noted', ageInStandups: 3 },
        { status: 'escalated', ageInStandups: 5 },
        { status: 'resolved', ageInStandups: 2, resolvedOnDate: '2026-08-20' },
        { status: 'closed_descoped', ageInStandups: 2, resolvedOnDate: '2026-08-19' }
      ],
      thresholds,
      '2026-08-20'
    )

    expect(summary).toEqual({
      totalOpen: 3,
      needingNoteToday: 2,
      escalated: 1,
      resolvedYesterday: 1
    })
  })
})
