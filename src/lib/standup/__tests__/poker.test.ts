/**
 * Planning poker rules (spec §8.4, PLN-10 to PLN-12, E16).
 */
import {
  CONSENSUS_RULES,
  DECK_TYPES,
  NON_NUMERIC_CARDS,
  TSHIRT_POINTS,
  assertValidVote,
  cardValue,
  deckCards,
  finalizeVote,
  isValidCard,
  revealVotes,
  voteProgress,
  type ConsensusRule,
  type PokerVoteInput
} from '../poker'

const votes = (...pairs: Array<[string, string | number]>): PokerVoteInput[] =>
  pairs.map(([voterId, card]) => ({ voterId, card }))

describe('decks — PLN-10', () => {
  it('offers all five deck types', () => {
    expect(DECK_TYPES).toEqual([
      'fibonacci',
      'modified_fibonacci',
      'tshirt',
      'hours',
      'powers_of_two'
    ])
  })

  it('deals the fibonacci deck the spec names', () => {
    expect(deckCards('fibonacci')).toEqual([1, 2, 3, 5, 8, 13, 21, '?', 'coffee'])
  })

  it('deals t-shirt sizes from XS to XL', () => {
    expect(deckCards('tshirt')).toEqual(['XS', 'S', 'M', 'L', 'XL', '?', 'coffee'])
  })

  it('appends the two non-numeric cards to every deck', () => {
    for (const deck of DECK_TYPES) {
      const cards = deckCards(deck)
      for (const card of NON_NUMERIC_CARDS) expect(cards).toContain(card)
    }
  })

  it('validates cards against their own deck', () => {
    expect(isValidCard('fibonacci', 13)).toBe(true)
    expect(isValidCard('fibonacci', 4)).toBe(false)
    expect(isValidCard('tshirt', 'M')).toBe(true)
    expect(isValidCard('tshirt', 3)).toBe(false)
  })

  it('rejects an off-deck vote by name', () => {
    expect(() => assertValidVote('fibonacci', 4)).toThrow(/not a card in the fibonacci deck/)
    expect(() => assertValidVote('fibonacci', 8)).not.toThrow()
  })
})

describe('cardValue', () => {
  it('reads numeric cards at face value', () => {
    expect(cardValue('fibonacci', 8)).toBe(8)
    expect(cardValue('hours', 0.5)).toBe(0.5)
  })

  it('maps t-shirt sizes to points', () => {
    expect(cardValue('tshirt', 'M')).toBe(TSHIRT_POINTS.M)
    expect(cardValue('tshirt', 'XL')).toBe(8)
  })

  it('returns null for the non-numeric cards, never zero', () => {
    // Zero would drag every median and average down and silently understate
    // the estimate — an abstention is not a vote for "no effort".
    expect(cardValue('fibonacci', '?')).toBeNull()
    expect(cardValue('fibonacci', 'coffee')).toBeNull()
  })
})

describe('revealVotes — PLN-11 / PLN-12', () => {
  it('computes spread as max minus min', () => {
    const result = revealVotes('fibonacci', 'facilitator_decides', votes(
      ['kasun', 5], ['priya', 8], ['nuwan', 5], ['dilani', 13], ['amal', 5], ['ravi', 8]
    ))

    expect(result.min).toBe(5)
    expect(result.max).toBe(13)
    expect(result.spread).toBe(8)
  })

  it('marks both ends of a disagreement as outliers', () => {
    const result = revealVotes('fibonacci', 'facilitator_decides', votes(
      ['kasun', 5], ['priya', 8], ['dilani', 13]
    ))

    const outliers = result.votes.filter((vote) => vote.isOutlier).map((vote) => vote.voterId)
    expect(outliers.sort()).toEqual(['dilani', 'kasun'])
  })

  it('marks nobody an outlier when the team agrees', () => {
    const result = revealVotes('fibonacci', 'facilitator_decides', votes(
      ['kasun', 5], ['priya', 5]
    ))

    expect(result.unanimous).toBe(true)
    expect(result.votes.every((vote) => !vote.isOutlier)).toBe(true)
    expect(result.spread).toBe(0)
  })

  it('excludes abstentions from every calculation', () => {
    const result = revealVotes('fibonacci', 'median', votes(
      ['kasun', 5], ['priya', 5], ['nuwan', '?'], ['amal', 'coffee']
    ))

    expect(result.numericCount).toBe(2)
    expect(result.abstainCount).toBe(2)
    expect(result.median).toBe(5)
    expect(result.unanimous).toBe(true)
  })

  it('handles a round where everyone abstained', () => {
    const result = revealVotes('fibonacci', 'median', votes(['kasun', '?'], ['priya', 'coffee']))

    expect(result.min).toBeNull()
    expect(result.spread).toBeNull()
    expect(result.median).toBeNull()
    expect(result.unanimous).toBe(false)
    expect(result.suggestedValue).toBeNull()
  })

  it('takes the middle value for an odd number of votes', () => {
    const result = revealVotes('fibonacci', 'median', votes(
      ['a', 2], ['b', 5], ['c', 13]
    ))
    expect(result.median).toBe(5)
  })

  it('averages the middle pair for an even number', () => {
    const result = revealVotes('fibonacci', 'median', votes(
      ['a', 2], ['b', 3], ['c', 5], ['d', 8]
    ))
    expect(result.median).toBe(4)
  })

  it('is not fooled by vote order', () => {
    const ascending = revealVotes('fibonacci', 'median', votes(['a', 1], ['b', 8], ['c', 21]))
    const descending = revealVotes('fibonacci', 'median', votes(['c', 21], ['b', 8], ['a', 1]))

    expect(ascending.median).toBe(descending.median)
    expect(ascending.spread).toBe(descending.spread)
  })
})

describe('consensus rules — PLN-10', () => {
  const cast = () => votes(['a', 3], ['b', 5], ['c', 13])

  const suggestion = (rule: ConsensusRule) =>
    revealVotes('fibonacci', rule, cast()).suggestedValue

  it('implements all four rules', () => {
    expect(CONSENSUS_RULES).toEqual([
      'facilitator_decides',
      'unanimous',
      'median',
      'highest'
    ])
  })

  it('median proposes the middle', () => {
    expect(suggestion('median')).toBe(5)
  })

  it('highest proposes the largest', () => {
    expect(suggestion('highest')).toBe(13)
  })

  it('unanimous proposes nothing until the team agrees', () => {
    expect(suggestion('unanimous')).toBeNull()

    const agreed = revealVotes('fibonacci', 'unanimous', votes(['a', 5], ['b', 5]))
    expect(agreed.suggestedValue).toBe(5)
  })

  it('facilitator_decides offers the median as a starting point', () => {
    // The least distorted by one person voting 21 to make a point.
    expect(suggestion('facilitator_decides')).toBe(5)
  })
})

describe('finalizeVote', () => {
  const cast = () => votes(['a', 5], ['b', 8], ['c', 5])

  it('records the value the facilitator set', () => {
    const result = finalizeVote({
      deckType: 'fibonacci',
      rule: 'facilitator_decides',
      votes: cast(),
      finalValue: 8,
      roundCount: 2
    })

    expect(result.finalValue).toBe(8)
    expect(result.roundCount).toBe(2)
    expect(result.voteSpread).toBe(3)
  })

  it('E16 — allows a final value with no consensus', () => {
    const result = finalizeVote({
      deckType: 'fibonacci',
      rule: 'facilitator_decides',
      votes: cast(),
      finalValue: 8,
      roundCount: 1
    })

    // Recorded, not enforced. PA-4 surfaces it at planning completion.
    expect(result.consensusReached).toBe(false)
  })

  it('records consensus when the team agreed', () => {
    const result = finalizeVote({
      deckType: 'fibonacci',
      rule: 'facilitator_decides',
      votes: votes(['a', 5], ['b', 5]),
      finalValue: 5,
      roundCount: 2
    })

    expect(result.consensusReached).toBe(true)
  })

  it('under the unanimous rule, agreeing on a different number is not consensus', () => {
    const result = finalizeVote({
      deckType: 'fibonacci',
      rule: 'unanimous',
      votes: votes(['a', 5], ['b', 5]),
      finalValue: 8,
      roundCount: 1
    })

    expect(result.consensusReached).toBe(false)
  })

  it('persists every vote, per PLN-12', () => {
    const result = finalizeVote({
      deckType: 'fibonacci',
      rule: 'median',
      votes: votes(['a', 5], ['b', '?']),
      finalValue: 5,
      roundCount: 1
    })

    expect(result.votes).toEqual([
      { voterId: 'a', card: 5, value: 5 },
      { voterId: 'b', card: '?', value: null }
    ])
  })

  it('rejects a zero or negative final value', () => {
    const base = { deckType: 'fibonacci' as const, rule: 'median' as const, votes: cast(), roundCount: 1 }
    expect(() => finalizeVote({ ...base, finalValue: 0 })).toThrow(/greater than zero/)
    expect(() => finalizeVote({ ...base, finalValue: -3 })).toThrow(/greater than zero/)
  })
})

describe('voteProgress — hidden until reveal', () => {
  it('reports counts, never the cards', () => {
    const progress = voteProgress(votes(['a', 5], ['b', 8]), ['a', 'b', 'c'])

    expect(progress).toEqual({ voted: 2, expected: 3, votedIds: ['a', 'b'] })
    // Returning cards and letting the client hide them would put every vote in
    // the browser's network tab.
    expect(JSON.stringify(progress)).not.toContain('5')
  })

  it('counts a revote once per voter', () => {
    const progress = voteProgress(votes(['a', 5], ['a', 8]), ['a', 'b'])
    expect(progress.voted).toBe(1)
  })
})
