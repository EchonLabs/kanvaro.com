/**
 * Sprint state machine (spec §8.1).
 *
 *   Draft → Planning → Planned → Active → Completed
 *     └────────┴──────────┴─────────┴──────→ Cancelled
 *
 * Kanvaro shipped with four states (`planning | active | completed |
 * cancelled`). The spec needs six. The two new ones are **additive** and the
 * existing four keep their meaning, so no data migration is required:
 *
 *   draft    a sprint whose dates may still move. Optional — sprints created
 *            through the existing UI still start in `planning`.
 *   planned  planning completed, stand-ups generated, sprint not yet started.
 *            This is the state SCH-1 generation hangs off.
 *
 * Every existing row is in one of the original four and stays valid.
 */
import { StandupError } from './errors'

export const SPRINT_STATES = [
  'draft',
  'planning',
  'planned',
  'active',
  'completed',
  'cancelled'
] as const
export type SprintState = typeof SPRINT_STATES[number]

/**
 * States that pre-date the stand-up module.
 *
 * Kept explicit so the additive-migration claim above can be asserted in a
 * test rather than believed.
 */
export const LEGACY_SPRINT_STATES: SprintState[] = [
  'planning',
  'active',
  'completed',
  'cancelled'
]

/** Which transitions §8.1 allows. Anything absent is refused. */
const ALLOWED: Record<SprintState, SprintState[]> = {
  draft: ['planning', 'cancelled'],
  planning: ['planned', 'draft', 'cancelled'],
  // Back to `planning` covers E20: planning may be reopened after stand-ups run.
  planned: ['active', 'planning', 'cancelled'],
  active: ['completed', 'planning', 'cancelled'],
  completed: [],
  cancelled: []
}

/** Terminal states — nothing may leave them. */
export const TERMINAL_SPRINT_STATES: SprintState[] = ['completed', 'cancelled']

export function isSprintState(value: unknown): value is SprintState {
  return typeof value === 'string' && (SPRINT_STATES as readonly string[]).includes(value)
}

export function canTransition(from: SprintState, to: SprintState): boolean {
  return ALLOWED[from]?.includes(to) ?? false
}

/**
 * Throws unless the transition is legal.
 *
 * The message names both states, because "invalid transition" in a log without
 * them is close to useless when a sprint has silently gone the wrong way.
 */
export function assertTransition(from: SprintState, to: SprintState): void {
  if (from === to) return

  if (!canTransition(from, to)) {
    throw new StandupError(
      'VALIDATION_FAILED',
      TERMINAL_SPRINT_STATES.includes(from)
        ? `This sprint is ${from} and cannot change state.`
        : `A sprint cannot move from ${from} to ${to}.`,
      { from, to, allowed: ALLOWED[from] ?? [] }
    )
  }
}

/**
 * Whether stand-ups exist for a sprint in this state (§8.1 table).
 *
 * `planned` is the first state with stand-ups: they are generated the moment
 * planning completes, before the sprint starts.
 */
export function hasStandups(state: SprintState): boolean {
  return state === 'planned' || state === 'active' || state === 'completed'
}

/**
 * Whether a stand-up may actually *run* (§8.1, PLN-2).
 *
 * `planned` is deliberately excluded here and handled by the caller: the spec
 * says stand-ups run "only from the sprint start date", which is a date
 * comparison this pure function has no business making. {@link canRunStandupOn}
 * is the complete answer.
 */
export function canRunStandup(state: SprintState): boolean {
  return state === 'active'
}

/**
 * The full PLN-2 gate: state plus the start-date rule for `planned`.
 *
 * A sprint that is `planned` and has reached its start date may run its
 * stand-up even if a job has not yet flipped it to `active` — otherwise day one
 * would be blocked by scheduler latency.
 */
export function canRunStandupOn(
  state: SprintState,
  sprintStartDate: string,
  today: string
): boolean {
  if (state === 'active') return true
  if (state === 'planned') return today >= sprintStartDate
  return false
}

/**
 * States in which a sprint is still live — the replacement for the
 * `['planning', 'active']` filters scattered through the existing code.
 *
 * Those filters were written when those were the only two non-terminal states.
 * Left alone they would silently exclude `draft` and `planned` sprints from
 * sprint pickers and backlog moves.
 */
export const LIVE_SPRINT_STATES: SprintState[] = ['draft', 'planning', 'planned', 'active']

/**
 * `LIVE_SPRINT_STATES.includes()` for callers holding a plain `string`.
 *
 * Most UI code reads sprint status off an API payload where it is typed as
 * `string`, and a bare `.includes()` on a `SprintState[]` rejects that. A
 * helper beats a cast at each call site: a cast would also silence a genuinely
 * wrong value.
 */
export function isLiveSprint(status: string | null | undefined): boolean {
  return !!status && (LIVE_SPRINT_STATES as string[]).includes(status)
}

/** States a sprint can be started from (SPRINT_START). */
export const STARTABLE_SPRINT_STATES: SprintState[] = ['planning', 'planned']
