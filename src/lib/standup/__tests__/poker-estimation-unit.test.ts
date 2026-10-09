/**
 * Which unit a poker card is in (PLN-10/13).
 *
 * Regression cover for a real inflation bug: every session ran in story points
 * because the planning screen never sends a unit, so a team voting "4" meaning
 * four hours had it multiplied by `pointsToHours` (default 4) into sixteen. The
 * `hours` deck was no exception — it also ran under the story-points default.
 */
import { deriveEstimateMinutes } from '../estimates'
import { StandupError } from '../errors'
import {
  abstentionOf,
  assertValidVote,
  convertedHours,
  deckCards,
  finalizeVote,
  formatEstimate,
  resolveEstimationSetup,
  revealVotes
} from '../poker'

describe('the hours deck', () => {
  it('offers the everyday hour values, including 3 and 6', () => {
    expect(deckCards('hours')).toEqual([0.5, 1, 2, 3, 4, 6, 8, 12, 16, 24, 40, '?', 'coffee'])
  })

  it('accepts ? and coffee as votes', () => {
    expect(() => assertValidVote('hours', '?')).not.toThrow()
    expect(() => assertValidVote('hours', 'coffee')).not.toThrow()
  })

  it('refuses a value that is not a card', () => {
    expect(() => assertValidVote('hours', 5)).toThrow(StandupError)
  })

  it('leaves ? and coffee out of the numbers', () => {
    const reveal = revealVotes('hours', 'facilitator_decides', [
      { voterId: 'a', card: 4 },
      { voterId: 'b', card: 8 },
      { voterId: 'c', card: '?' },
      { voterId: 'd', card: 'coffee' }
    ])

    expect(reveal.numericCount).toBe(2)
    expect(reveal.abstainCount).toBe(2)
    expect(reveal.min).toBe(4)
    expect(reveal.max).toBe(8)
    expect(reveal.median).toBe(6)
    expect(reveal.suggestedValue).toBe(6)
    expect(reveal.votes.filter((vote) => vote.isOutlier)).toHaveLength(0)
  })

  it('suggests nothing when every vote abstains', () => {
    const reveal = revealVotes('hours', 'median', [
      { voterId: 'a', card: '?' },
      { voterId: 'b', card: 'coffee' }
    ])

    expect(reveal.suggestedValue).toBeNull()
    expect(reveal.median).toBeNull()
  })

  it('lets the facilitator still set a value when everyone abstained', () => {
    const result = finalizeVote({
      deckType: 'hours',
      rule: 'facilitator_decides',
      votes: [{ voterId: 'a', card: 'coffee' }],
      finalValue: 6,
      roundCount: 1
    })

    expect(result.finalValue).toBe(6)
    expect(result.consensusReached).toBe(false)
  })

  it('counts two matching hour votes and an abstention as consensus', () => {
    const result = finalizeVote({
      deckType: 'hours',
      rule: 'facilitator_decides',
      votes: [
        { voterId: 'a', card: 6 },
        { voterId: 'b', card: 6 },
        { voterId: 'c', card: '?' }
      ],
      finalValue: 6,
      roundCount: 1
    })

    expect(result.consensusReached).toBe(true)
  })
})

describe('abstentionOf', () => {
  it('reads ? as unsure and coffee as a break', () => {
    expect(abstentionOf('?')).toBe('unsure')
    expect(abstentionOf('coffee')).toBe('break')
  })

  it('reads every other card as a real estimate', () => {
    expect(abstentionOf(4)).toBeNull()
    expect(abstentionOf('XS')).toBeNull()
  })
})

describe('formatEstimate / convertedHours', () => {
  it('states hours as voted', () => {
    expect(formatEstimate(4, 'hours')).toBe('4 hours')
    expect(formatEstimate(6, 'hours')).toBe('6 hours')
    expect(formatEstimate(1, 'hours')).toBe('1 hour')
    expect(formatEstimate(0.5, 'hours')).toBe('0.5 hours')
  })

  it('states points as points', () => {
    expect(formatEstimate(5, 'story_points')).toBe('5 points')
    expect(formatEstimate(1, 'story_points')).toBe('1 point')
  })

  it('offers no conversion under hours, whatever the factor', () => {
    expect(convertedHours(4, 'hours', 4)).toBeNull()
    expect(convertedHours(6, 'hours', 8)).toBeNull()
  })

  it('converts points through the factor', () => {
    expect(convertedHours(4, 'story_points', 4)).toBe('≈ 16 hours')
    expect(convertedHours(3, 'story_points', 2.5)).toBe('≈ 7.5 hours')
  })
})

describe('resolveEstimationSetup', () => {
  it('falls back to story points on the Fibonacci deck when nothing is configured', () => {
    expect(resolveEstimationSetup({})).toEqual({
      deckType: 'fibonacci',
      estimationUnit: 'story_points'
    })
  })

  it("uses the project's story-points unit with the Fibonacci deck", () => {
    expect(resolveEstimationSetup({ projectUnit: 'story_points' })).toEqual({
      deckType: 'fibonacci',
      estimationUnit: 'story_points'
    })
  })

  it("uses the project's hours unit and deals the hours deck", () => {
    expect(resolveEstimationSetup({ projectUnit: 'hours' })).toEqual({
      deckType: 'hours',
      estimationUnit: 'hours'
    })
  })

  it('lets an explicit request unit override the project', () => {
    expect(
      resolveEstimationSetup({ estimationUnit: 'story_points', projectUnit: 'hours' })
    ).toEqual({ deckType: 'fibonacci', estimationUnit: 'story_points' })

    expect(
      resolveEstimationSetup({ estimationUnit: 'hours', projectUnit: 'story_points' })
    ).toEqual({ deckType: 'hours', estimationUnit: 'hours' })
  })

  it('treats the hours deck as hours even on a story-points project', () => {
    expect(
      resolveEstimationSetup({ deckType: 'hours', projectUnit: 'story_points' })
    ).toEqual({ deckType: 'hours', estimationUnit: 'hours' })
  })

  it('keeps an explicitly requested points deck on an hours project', () => {
    expect(
      resolveEstimationSetup({ deckType: 'powers_of_two', projectUnit: 'hours' })
    ).toEqual({ deckType: 'powers_of_two', estimationUnit: 'hours' })
  })

  it('refuses the hours deck with a story-points unit', () => {
    expect(() =>
      resolveEstimationSetup({ deckType: 'hours', estimationUnit: 'story_points' })
    ).toThrow(StandupError)
  })

  it('refuses an unknown unit', () => {
    expect(() =>
      resolveEstimationSetup({ estimationUnit: 'days' as any })
    ).toThrow(/not an estimation unit/)
  })

  it('refuses an unknown deck', () => {
    expect(() => resolveEstimationSetup({ deckType: 'tarot' as any })).toThrow(/not a deck/)
  })

  it('ignores an unknown project unit rather than trusting stored junk', () => {
    expect(() => resolveEstimationSetup({ projectUnit: 'days' as any })).toThrow(
      /not an estimation unit/
    )
  })
})

describe('a 4 card, end to end through the resolved unit', () => {
  const finalise = (projectUnit: 'story_points' | 'hours') => {
    const { estimationUnit } = resolveEstimationSetup({ projectUnit })
    return deriveEstimateMinutes({ value: 4, unit: estimationUnit, pointsToHours: 4 })
  }

  it('is four hours on an hours project', () => {
    expect(finalise('hours')).toBe(4 * 60)
  })

  it('is sixteen hours on a story-points project at 4h per point', () => {
    expect(finalise('story_points')).toBe(16 * 60)
  })

  it('ignores the conversion factor entirely in hours', () => {
    expect(deriveEstimateMinutes({ value: 4, unit: 'hours', pointsToHours: 8 })).toBe(240)
  })
})
