/**
 * Planning poker (spec §8.4 — PLN-9 to PLN-14).
 *
 * Pure rules only: decks, consensus, spread. Persistence and the realtime
 * broadcast live in the service and route layers, so the interesting logic —
 * "what does the deck offer", "was consensus reached", "which votes are
 * outliers" — can be tested without a database or a socket.
 *
 * The two non-numeric cards matter and are not estimates:
 *   ?       "I do not know enough to vote"
 *   coffee  "I need a break"
 * Neither counts towards consensus, spread or the suggested value. Treating `?`
 * as zero would quietly drag every average down.
 */
import { StandupError } from './errors'

export const DECK_TYPES = [
  'fibonacci',
  'modified_fibonacci',
  'tshirt',
  'hours',
  'powers_of_two'
] as const
export type DeckType = typeof DECK_TYPES[number]

export const CONSENSUS_RULES = [
  'facilitator_decides',
  'unanimous',
  'median',
  'highest'
] as const
export type ConsensusRule = typeof CONSENSUS_RULES[number]

/** Cards that carry no estimate. Always appended to every deck. */
export const NON_NUMERIC_CARDS = ['?', 'coffee'] as const
export type NonNumericCard = typeof NON_NUMERIC_CARDS[number]

/**
 * T-shirt sizes map to points so the allocation engine has a number to work
 * with. The mapping is fixed rather than configurable: a project that wants its
 * own numbers should be estimating in points or hours, not letters.
 */
export const TSHIRT_POINTS: Record<string, number> = {
  XS: 1,
  S: 2,
  M: 3,
  L: 5,
  XL: 8
}

const NUMERIC_DECKS: Record<Exclude<DeckType, 'tshirt'>, number[]> = {
  fibonacci: [1, 2, 3, 5, 8, 13, 21],
  modified_fibonacci: [0.5, 1, 2, 3, 5, 8, 13, 20, 40, 100],
  hours: [0.5, 1, 2, 4, 8, 16, 24, 40],
  powers_of_two: [1, 2, 4, 8, 16, 32, 64]
}

/** The cards a deck offers, in order, including the two non-numeric ones. */
export function deckCards(deckType: DeckType): Array<string | number> {
  const values: Array<string | number> =
    deckType === 'tshirt' ? Object.keys(TSHIRT_POINTS) : [...NUMERIC_DECKS[deckType]]

  return [...values, ...NON_NUMERIC_CARDS]
}

/** Whether a card belongs to a deck. */
export function isValidCard(deckType: DeckType, card: string | number): boolean {
  return deckCards(deckType).some((candidate) => String(candidate) === String(card))
}

/**
 * The numeric weight of a card, or `null` when it carries no estimate.
 *
 * `null` rather than `0` on purpose — see the module note.
 */
export function cardValue(deckType: DeckType, card: string | number): number | null {
  const asString = String(card)
  if ((NON_NUMERIC_CARDS as readonly string[]).includes(asString)) return null

  if (deckType === 'tshirt') return TSHIRT_POINTS[asString] ?? null

  const numeric = Number(card)
  return Number.isFinite(numeric) ? numeric : null
}

export interface PokerVoteInput {
  voterId: string
  card: string | number
}

export interface RevealedVote extends PokerVoteInput {
  /** `null` for `?` and `coffee`. */
  value: number | null
  /** True when this vote sits at either end of a spread wider than one step. */
  isOutlier: boolean
}

export interface RevealResult {
  votes: RevealedVote[]
  /** Votes that carried a number. */
  numericCount: number
  /** Abstentions — `?` and `coffee`. */
  abstainCount: number
  min: number | null
  max: number | null
  /** PLN-12: max minus min, over numeric votes only. */
  spread: number | null
  median: number | null
  /** True when every numeric vote agreed (PLN-12 `consensusReached`). */
  unanimous: boolean
  /** What the configured rule proposes. The facilitator may always override. */
  suggestedValue: number | null
}

/**
 * Computes everything the reveal panel shows (PLN-11, PLN-12).
 *
 * Never mutates and never decides: it proposes `suggestedValue`, and the
 * facilitator sets the final number. That separation is what makes
 * `facilitator_decides` the default rather than a special case.
 */
export function revealVotes(
  deckType: DeckType,
  rule: ConsensusRule,
  votes: PokerVoteInput[]
): RevealResult {
  const withValues = votes.map((vote) => ({
    ...vote,
    value: cardValue(deckType, vote.card)
  }))

  const numeric = withValues.filter((vote) => vote.value !== null) as Array<
    PokerVoteInput & { value: number }
  >
  const values = numeric.map((vote) => vote.value).sort((a, b) => a - b)

  const min = values.length ? values[0] : null
  const max = values.length ? values[values.length - 1] : null
  const spread = min !== null && max !== null ? round2(max - min) : null
  const unanimous = values.length > 0 && min === max

  const median = values.length
    ? values.length % 2 === 1
      ? values[(values.length - 1) / 2]
      : round2((values[values.length / 2 - 1] + values[values.length / 2]) / 2)
    : null

  // Only mark outliers when there is a genuine disagreement to discuss.
  const hasDisagreement = !unanimous && values.length > 1
  const revealed: RevealedVote[] = withValues.map((vote) => ({
    ...vote,
    isOutlier:
      hasDisagreement && vote.value !== null && (vote.value === min || vote.value === max)
  }))

  return {
    votes: revealed,
    numericCount: numeric.length,
    abstainCount: withValues.length - numeric.length,
    min,
    max,
    spread,
    median,
    unanimous,
    suggestedValue: suggestValue(rule, { values, median, max, unanimous })
  }
}

function suggestValue(
  rule: ConsensusRule,
  context: { values: number[]; median: number | null; max: number | null; unanimous: boolean }
): number | null {
  const { values, median, max, unanimous } = context
  if (values.length === 0) return null

  switch (rule) {
    case 'unanimous':
      // Proposes nothing until the team actually agrees — that is the rule's point.
      return unanimous ? values[0] : null
    case 'median':
      return median
    case 'highest':
      return max
    case 'facilitator_decides':
    default:
      // A starting point, not a decision. The median is the least distorted by
      // one person voting 21 to make a point.
      return median
  }
}

export interface FinalizeInput {
  deckType: DeckType
  rule: ConsensusRule
  votes: PokerVoteInput[]
  /** What the facilitator actually set. */
  finalValue: number
  /** Rounds played, including this one (PLN-12 `roundCount`). */
  roundCount: number
}

export interface FinalizeResult {
  finalValue: number
  consensusReached: boolean
  voteSpread: number | null
  roundCount: number
  votes: Array<{ voterId: string; card: string | number; value: number | null }>
}

/**
 * Closes voting on a task (PLN-11, PLN-12).
 *
 * `consensusReached` is recorded, never enforced: E16 requires the facilitator
 * to be able to set a value with no consensus, which then surfaces as advisory
 * PA-4 at planning completion. Blocking here would just move the argument.
 */
export function finalizeVote(input: FinalizeInput): FinalizeResult {
  const { deckType, rule, votes, finalValue, roundCount } = input

  if (!Number.isFinite(finalValue) || finalValue <= 0) {
    throw new StandupError(
      'VALIDATION_FAILED',
      'A final estimate must be greater than zero.',
      { finalValue }
    )
  }

  const reveal = revealVotes(deckType, rule, votes)

  // Under `unanimous`, agreement means the whole team landed on the value that
  // was actually set — not merely that they agreed with each other.
  const consensusReached =
    rule === 'unanimous'
      ? reveal.unanimous && reveal.min === finalValue
      : reveal.unanimous

  return {
    finalValue,
    consensusReached,
    voteSpread: reveal.spread,
    roundCount,
    votes: reveal.votes.map((vote) => ({
      voterId: vote.voterId,
      card: vote.card,
      value: vote.value
    }))
  }
}

/** Validates a vote before it is stored. */
export function assertValidVote(deckType: DeckType, card: string | number): void {
  if (!isValidCard(deckType, card)) {
    throw new StandupError(
      'VALIDATION_FAILED',
      `"${card}" is not a card in the ${deckType} deck.`,
      { card, deckType, allowed: deckCards(deckType) }
    )
  }
}

/**
 * What voters see before the reveal (PLN-11).
 *
 * Counts only. Returning the cards and letting the client hide them would put
 * every vote in the browser's network tab, which is not hiding them at all.
 */
export function voteProgress(
  votes: PokerVoteInput[],
  expectedVoterIds: string[]
): { voted: number; expected: number; votedIds: string[] } {
  const votedIds = Array.from(new Set(votes.map((vote) => vote.voterId)))
  return {
    voted: votedIds.length,
    expected: expectedVoterIds.length,
    votedIds
  }
}

const round2 = (value: number) => Math.round(value * 100) / 100

/**
 * Who may cast a vote (PLN-10 `participantIds`, PLN-11).
 *
 * The sprint team is the default, but two people fall outside it and still
 * belong in the round:
 *
 *   - the facilitator, who is often a PM not on the sprint team and was
 *     otherwise locked out of their own session;
 *   - anyone the facilitator names explicitly — QA and specialists who estimate
 *     the work without being assigned it.
 *
 * The facilitator is always included, even against an explicit list, because a
 * session whose own facilitator cannot vote is never what was meant.
 */
export function resolveParticipants(
  requested: string[] | undefined,
  teamMembers: any[] | undefined,
  facilitatorId: string
): string[] {
  const base = requested?.length ? requested : teamMembers ?? []
  const ids = base.map((entry: any) => entry?.toString()).filter(Boolean)
  ids.push(facilitatorId.toString())

  return Array.from(new Set(ids))
}
