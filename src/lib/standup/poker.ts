/**
 * Planning poker (spec §8.4 — PLN-9 to PLN-14).
 *
 * Pure rules only: decks, consensus, spread. Persistence and the realtime
 * broadcast live in the service and route layers, so the interesting logic —
 * "what does the deck offer", "was consensus reached", "which votes are
 * outliers" — can be tested without a database or a socket.
 */
import { StandupError } from './errors'
import { ESTIMATE_UNITS, type EstimateUnit } from './estimates'

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

const NUMERIC_DECKS: Record<Exclude<DeckType, 'tshirt'>, Array<number | string>> = {
  // Classic Fibonacci (PLN-10), plus the two non-numeric cards the spec's own
  // wireframe shows (§15.6): '?' for unsure, 'coffee' for "let's take a
  // break". `cardValue` already falls through to `Number(card)` for these,
  // which is `NaN` and so reads as `null` — the "no numeric weight" case the
  // reveal/variance logic already treats as an abstention.
  fibonacci: [1, 2, 3, 5, 8, 13, 21, '?', 'coffee'],
  modified_fibonacci: [0.5, 1, 2, 3, 5, 8, 12, 14, 16, 40, 100],
  // Denser at the low end, where most task estimates land: 3 and 6 are common
  // answers a team voting in time reaches for, and leaving them off forced a
  // 6h task onto 4 or 8. Carries '?' and 'coffee' like Fibonacci — a team
  // estimating in hours can be unsure or need a break just the same.
  hours: [0.5, 1, 2, 3, 4, 6, 8, 12, 16, 24, 40, '?', 'coffee'],
  powers_of_two: [1, 2, 4, 8, 16, 32, 64]
}

/** The cards a deck offers, in order. */
export function deckCards(deckType: DeckType): Array<string | number> {
  return deckType === 'tshirt' ? Object.keys(TSHIRT_POINTS) : [...NUMERIC_DECKS[deckType]]
}

/**
 * The deck and unit a new poker session runs with (PLN-10/13).
 *
 * The unit decides whether a card is multiplied by `pointsToHours` when the
 * estimate is finalised, so it must agree with the deck: the `hours` deck
 * used to run under the `story_points` default, which turned a 4h card into
 * a 16h estimate. Hence the rules —
 *
 * - unit: the request's, else the `hours` deck's own, else the project's;
 * - deck: the request's, else the one that matches the unit;
 * - the `hours` deck with a `story_points` unit is refused outright.
 */
export function resolveEstimationSetup(input: {
  deckType?: DeckType
  estimationUnit?: EstimateUnit
  projectUnit?: EstimateUnit
}): { deckType: DeckType; estimationUnit: EstimateUnit } {
  const estimationUnit =
    input.estimationUnit ??
    (input.deckType === 'hours' ? 'hours' : input.projectUnit ?? 'story_points')
  if (!ESTIMATE_UNITS.includes(estimationUnit)) {
    throw new StandupError('VALIDATION_FAILED', `"${estimationUnit}" is not an estimation unit.`, {
      allowed: ESTIMATE_UNITS
    })
  }

  const deckType = input.deckType ?? (estimationUnit === 'hours' ? 'hours' : 'fibonacci')
  if (!DECK_TYPES.includes(deckType)) {
    throw new StandupError('VALIDATION_FAILED', `"${deckType}" is not a deck.`, {
      allowed: DECK_TYPES
    })
  }

  if (deckType === 'hours' && estimationUnit !== 'hours') {
    throw new StandupError(
      'VALIDATION_FAILED',
      'The hours deck estimates in hours. Choose a points deck to estimate in story points.',
      { deckType, estimationUnit }
    )
  }

  return { deckType, estimationUnit }
}

/**
 * What a non-numeric card says (spec §15.6: "? means unsure, coffee means
 * break"). Both abstain from the numbers, but they ask the room for different
 * things — `?` for the task to be explained, coffee for a pause — so the screens
 * name them rather than lumping both under "abstained".
 */
export function abstentionOf(card: string | number): 'unsure' | 'break' | null {
  if (card === '?') return 'unsure'
  if (card === 'coffee') return 'break'
  return null
}

/** Trims a number for display: 4, 0.5, 1.25 — never 4.0. */
export function formatNumber(value: number): string {
  return String(Math.round(value * 100) / 100)
}

/**
 * An estimate in the unit it was voted in: "6 hours", "1 hour", "5 points".
 *
 * Hours are shown as-is. This is the line that used to read "≈ 6 hours"
 * under an hours deck: the approximation sign implied a conversion that
 * never happened.
 */
export function formatEstimate(value: number, unit: EstimateUnit): string {
  const noun = unit === 'hours' ? 'hour' : 'point'
  return `${formatNumber(value)} ${value === 1 ? noun : `${noun}s`}`
}

/**
 * The hours a points estimate converts to, as shown beside it ("≈ 16 hours").
 * `null` under hours, where there is no conversion to show.
 */
export function convertedHours(
  value: number,
  unit: EstimateUnit,
  pointsToHours: number
): string | null {
  if (unit === 'hours') return null
  return `≈ ${formatEstimate(value * pointsToHours, 'hours')}`
}

/** Whether a card belongs to a deck. */
export function isValidCard(deckType: DeckType, card: string | number): boolean {
  return deckCards(deckType).some((candidate) => String(candidate) === String(card))
}

/** The numeric weight of a card, or `null` when it is not on the deck. */
export function cardValue(deckType: DeckType, card: string | number): number | null {
  const asString = String(card)

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
  /** True when this vote sits more than one deck position from the median. */
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

  // An outlier is a vote more than one deck position from the median: the same
  // "cards apart" measure the reveal panel already speaks in. The previous rule
  // (value === min || value === max) marked every voter in any round with only
  // two distinct values, so 5/8/8 flagged all three.
  //
  // With an even number of votes the median falls between two cards, so it is
  // measured from the midpoint of the two middle cards' positions instead.
  const hasDisagreement = !unanimous && values.length > 1
  const deck = deckCards(deckType)
  const positionOf = (value: number) =>
    deck.findIndex((card) => cardValue(deckType, card) === value)
  const middle = (offset: number) => positionOf(values[Math.floor((values.length - 1) / 2) + offset])
  const medianPosition = values.length
    ? values.length % 2 === 1
      ? middle(0)
      : (middle(0) + middle(1)) / 2
    : -1
  const centred = hasDisagreement && medianPosition >= 0

  const revealed: RevealedVote[] = withValues.map((vote) => ({
    ...vote,
    isOutlier:
      centred &&
      vote.value !== null &&
      positionOf(vote.value) >= 0 &&
      Math.abs(positionOf(vote.value) - medianPosition) > 1
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
 * The deck's numeric values, in card order.
 *
 * T-shirt sizes have no numeric face, so their points mapping stands in — it
 * is already the order XS..XL is dealt in.
 */
export function deckScale(deckType: DeckType): number[] {
  return deckType === 'tshirt'
    ? Object.values(TSHIRT_POINTS)
    : (deckCards(deckType).filter((card) => typeof card === 'number') as number[])
}

/**
 * How far apart two estimates are **in cards dealt**, not in arithmetic.
 *
 * This is the distinction the spread label used to miss. On Fibonacci, 13 and
 * 21 differ by 8 but sit next to each other on the deck — nobody disagreed,
 * they picked neighbouring cards. 1 and 3 differ by only 2 yet skip a card, so
 * that is the wider disagreement of the two. Ranking by `max - min` gets both
 * backwards, and gets worse the further up the deck the round lands.
 *
 * Returns `null` when a value is not on the deck (a facilitator's off-deck
 * override), since step distance is meaningless there.
 */
export function stepDistance(deckType: DeckType, low: number, high: number): number | null {
  const scale = deckScale(deckType)
  const lowIndex = scale.indexOf(low)
  const highIndex = scale.indexOf(high)
  if (lowIndex === -1 || highIndex === -1) return null
  return Math.abs(highIndex - lowIndex)
}

export type AgreementKey = 'none' | 'single' | 'consensus' | 'near' | 'some' | 'wide'
export type AgreementTone = 'neutral' | 'success' | 'warning' | 'danger'

export interface Agreement {
  key: AgreementKey
  /** Short enough for a badge in a table cell. */
  label: string
  tone: AgreementTone
  /** Cards between the lowest and highest estimate, or `null` when unknown. */
  steps: number | null
}

/**
 * What the room's votes actually say, as one label both poker screens use.
 *
 * Previously each screen decided this for itself, on `max - min`, with
 * different thresholds — so the same round could read "Wide spread" during the
 * reveal and "Some spread" in the results. Worse, a single vote counted as
 * unanimous and was announced as a consensus, which is not something one
 * person can reach.
 */
export function describeAgreement(
  deckType: DeckType,
  input: { min: number | null; max: number | null; numericCount: number }
): Agreement {
  const { min, max, numericCount } = input

  if (numericCount === 0 || min === null || max === null) {
    return { key: 'none', label: 'No estimates', tone: 'neutral', steps: null }
  }

  // One person cannot agree with anybody. Saying so is the honest reading,
  // and it keeps "Consensus" meaning something.
  if (numericCount === 1) {
    return { key: 'single', label: 'Single estimate', tone: 'neutral', steps: 0 }
  }

  if (min === max) {
    return { key: 'consensus', label: 'Consensus', tone: 'success', steps: 0 }
  }

  const steps = stepDistance(deckType, min, max)

  // Off-deck values: fall back to saying only that they differ.
  if (steps === null) return { key: 'some', label: 'Some spread', tone: 'warning', steps: null }

  if (steps === 1) return { key: 'near', label: 'Near consensus', tone: 'success', steps }
  if (steps === 2) return { key: 'some', label: 'Some spread', tone: 'warning', steps }
  return { key: 'wide', label: 'Wide spread', tone: 'danger', steps }
}

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
 * The facilitator is included by default, even against an explicit list,
 * because a session whose own facilitator cannot vote is usually not what was
 * meant. `excludeFacilitator` overrides that: a facilitator who deliberately
 * takes themselves off the voter picker is only ever facilitating this round
 * (see PokerModal's viewer mode), not casting a vote.
 */
export function resolveParticipants(
  requested: string[] | undefined,
  teamMembers: any[] | undefined,
  facilitatorId: string,
  options?: { excludeFacilitator?: boolean }
): string[] {
  const base = requested?.length ? requested : teamMembers ?? []
  const ids = base.map((entry: any) => entry?.toString()).filter(Boolean)
  const fid = facilitatorId.toString()

  if (options?.excludeFacilitator) {
    return Array.from(new Set(ids.filter((id) => id !== fid)))
  }

  ids.push(fid)
  return Array.from(new Set(ids))
}

/**
 * Which task every client should have on screen.
 *
 * The facilitator advances the queue, but only their own finalize response
 * carries `nextTaskId`. Voters learn about the move by re-reading the session,
 * and this is the rule they apply to what comes back: the server's
 * `currentTask` wins over whatever the client was showing. Without it a voter
 * sits on a task the facilitator has already estimated, and every card they
 * click is refused.
 *
 * Returns `null` when there is nothing left to vote on, which is the modal's
 * signal to close.
 */
export function resolveVisibleTask(input: {
  serverCurrentTask?: string | null
  queue: { taskId: string; status: string }[]
  showing?: string | null
}): string | null {
  const { serverCurrentTask, queue } = input

  const named = serverCurrentTask
    ? queue.find((entry) => entry.taskId === serverCurrentTask)
    : undefined
  if (named) return named.taskId

  // A `currentTask` the client cannot see — or none at all — falls back to the
  // same choice the server makes when it advances: the first task still open.
  return queue.find((entry) => entry.status !== 'estimated')?.taskId ?? null
}
