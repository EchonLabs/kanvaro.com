/**
 * How far apart the room actually is (PLN-12).
 *
 * The reveal and results screens used to each decide this for themselves, on
 * `max - min`, with different thresholds. That is wrong twice over: the same
 * round could be labelled differently on the two screens, and an arithmetic
 * difference ranks Fibonacci rounds backwards — 13 and 21 are neighbouring
 * cards but differ by 8, while 1 and 3 skip a card and differ by only 2.
 */
import { describeAgreement, deckScale, stepDistance } from '../poker'

describe('deckScale', () => {
  it('reads the numeric face of each card, in deal order', () => {
    expect(deckScale('fibonacci')).toEqual([1, 2, 3, 5, 8, 13, 21])
    expect(deckScale('powers_of_two')).toEqual([1, 2, 4, 8, 16, 32, 64])
  })

  it('stands in the points mapping for t-shirt sizes, which have no numeric face', () => {
    expect(deckScale('tshirt')).toEqual([1, 2, 3, 5, 8])
  })

  it('leaves out the cards that carry no number', () => {
    // '?' and 'coffee' are abstentions, not estimates.
    expect(deckScale('fibonacci')).not.toContain('?')
  })
})

describe('stepDistance', () => {
  it('counts cards between two estimates, not the gap in their values', () => {
    expect(stepDistance('fibonacci', 13, 21)).toBe(1)
    expect(stepDistance('fibonacci', 5, 8)).toBe(1)
    expect(stepDistance('fibonacci', 1, 3)).toBe(2)
    expect(stepDistance('fibonacci', 1, 21)).toBe(6)
  })

  it('is undefined for a value that is not on the deck', () => {
    expect(stepDistance('fibonacci', 6.5, 8)).toBeNull()
  })
})

describe('describeAgreement', () => {
  const agreementFor = (min: number | null, max: number | null, numericCount = 3) =>
    describeAgreement('fibonacci', { min, max, numericCount })

  it('calls an identical vote a consensus', () => {
    expect(agreementFor(8, 8)).toMatchObject({ key: 'consensus', label: 'Consensus', tone: 'success' })
  })

  it('refuses to call a single estimate a consensus', () => {
    // One person cannot agree with anybody, but `revealVotes` reports
    // `unanimous` for a lone numeric vote because min === max. The old label
    // read that as "Consensus reached".
    expect(agreementFor(8, 8, 1)).toMatchObject({ key: 'single', label: 'Single estimate' })
  })

  it('says so when nobody put a number on the task', () => {
    expect(agreementFor(null, null, 0)).toMatchObject({ key: 'none', label: 'No estimates' })
  })

  it('treats neighbouring cards as near agreement however far apart their values are', () => {
    // The regression: 13 and 21 differ by 8 and were labelled "Wide spread",
    // though they sit next to each other on the deck.
    expect(agreementFor(13, 21)).toMatchObject({ key: 'near', label: 'Near consensus', steps: 1 })
    expect(agreementFor(5, 8)).toMatchObject({ key: 'near', steps: 1 })
  })

  it('ranks a two-card gap above a one-card gap even when its values are closer', () => {
    // 1 -> 3 differs by 2; 13 -> 21 differs by 8. The smaller arithmetic gap
    // is the larger disagreement.
    const narrowValuesWiderGap = agreementFor(1, 3)
    const wideValuesNarrowerGap = agreementFor(13, 21)

    expect(narrowValuesWiderGap.steps).toBeGreaterThan(wideValuesNarrowerGap.steps!)
    expect(narrowValuesWiderGap.key).toBe('some')
    expect(wideValuesNarrowerGap.key).toBe('near')
  })

  it('calls three or more cards apart a wide spread', () => {
    expect(agreementFor(1, 8)).toMatchObject({ key: 'wide', label: 'Wide spread', tone: 'danger' })
    expect(agreementFor(1, 21)).toMatchObject({ key: 'wide', steps: 6 })
  })

  it('falls back to a plain spread when a value is off the deck', () => {
    expect(describeAgreement('fibonacci', { min: 6.5, max: 8, numericCount: 2 })).toMatchObject({
      key: 'some',
      steps: null
    })
  })

  it('reads the same round the same way on any deck it was dealt from', () => {
    // 8 and 16 are adjacent on powers-of-two but three cards apart on
    // Fibonacci — the deck decides, not the numbers.
    expect(describeAgreement('powers_of_two', { min: 8, max: 16, numericCount: 3 }).key).toBe('near')
    expect(describeAgreement('hours', { min: 8, max: 16, numericCount: 3 }).key).toBe('near')
  })
})
