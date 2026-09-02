/**
 * The stand-up module's error catalogue (spec §17.2).
 *
 * Every failure a route can return is one of these codes, thrown as a typed
 * exception and converted to the §17.1 envelope by {@link toErrorResponse}.
 * Codes are part of the API contract — the UI switches on them to decide
 * whether to show a jump link, a retry, or a blocking dialog — so they must
 * never be renamed or invented ad hoc at a call site.
 */

export const STANDUP_ERROR_CODES = {
  /** Sprint planning is not complete. */
  PLANNING_GATE_NOT_PASSED: 409,
  /** Too early, wrong status, or another stand-up is already in progress. */
  STANDUP_NOT_STARTABLE: 409,
  /** Duplicate completion — the second request changes nothing. */
  STANDUP_ALREADY_COMPLETED: 409,
  /** A previous completion attempt did not finish; a resume action is required. */
  COMPLETION_INTERRUPTED: 409,
  /** Optimistic-concurrency mismatch; details carry the current server state. */
  STALE_STANDUP: 409,
  /** Details list every failing completion check. */
  COMPLETION_CHECKS_FAILED: 422,
  /** Allocation refused because the task has no estimate. */
  TASK_NOT_ESTIMATED: 422,
  /** A schedule change would damage a completed stand-up. */
  IMMUTABLE_COMPLETED_STANDUP: 409,
  /** Attempt to override a check that is a hard block (O6–O10). */
  OVERRIDE_NOT_PERMITTED: 403,
  /** Justification too short, or in the configurable low-value list. */
  INVALID_JUSTIFICATION: 422,
  /** Carry-forward note is identical to the previous one. */
  NOTE_UNCHANGED: 422,
  /** Only when a project blocks over-allocation outright. */
  CAPACITY_EXCEEDED: 422,
  REOPEN_WINDOW_EXPIRED: 403,
  NOT_A_WORKING_DAY: 422,
  /** Attempt to change an original estimate after planning. */
  ESTIMATE_IMMUTABLE: 422,

  // --- Additions beyond the §17.2 catalogue -------------------------------
  // The spec's catalogue covers the module's *domain* failures and has no
  // entry for ordinary input validation or a missing record. Reusing a domain
  // code for those produces a misleading contract — a malformed CSV date
  // answering NOT_A_WORKING_DAY tells the client something untrue — so two
  // generic codes are added rather than overloading a specific one.
  /** Request body or query parameters failed validation. */
  VALIDATION_FAILED: 422,
  /** The addressed record does not exist. */
  NOT_FOUND: 404
} as const

export type StandupErrorCode = keyof typeof STANDUP_ERROR_CODES

/**
 * A failure that maps onto a catalogue code.
 *
 * `details` is the structured payload the UI needs to act — the offending task
 * ids, the failing checks, the current stand-up version. Keep it machine
 * readable; `message` is the human sentence.
 */
export class StandupError extends Error {
  readonly code: StandupErrorCode
  readonly status: number
  readonly details?: unknown

  constructor(code: StandupErrorCode, message: string, details?: unknown) {
    super(message)
    this.name = 'StandupError'
    this.code = code
    this.status = STANDUP_ERROR_CODES[code]
    this.details = details

    // Keeps `instanceof` working when compiled down to ES5.
    Object.setPrototypeOf(this, StandupError.prototype)
  }
}

export function isStandupError(error: unknown): error is StandupError {
  return error instanceof StandupError
}

/** Shape of the error envelope defined in §17.1. */
export interface StandupErrorBody {
  error: {
    code: StandupErrorCode
    message: string
    details?: unknown
  }
}

/** One field's rejection, as the client receives it. */
interface FieldFailure {
  path: string
  message: string
}

/**
 * Recognises a Mongoose `ValidationError` **by shape rather than by
 * constructor**, and flattens it to the failing fields.
 *
 * Deliberately not `instanceof mongoose.Error.ValidationError`: this module has
 * no dependencies and must keep it that way. It is imported by route handlers
 * that Next compiles for the Edge runtime as well as Node, and pulling mongoose
 * into that graph is the same trap `next.config.js` already had to cut the
 * scheduler out of. Shape is sufficient here — a `name` of `ValidationError`
 * plus a populated `errors` bag of `{ message }` entries is not something an
 * unrelated error produces by accident.
 */
function readValidationFailures(error: unknown): FieldFailure[] | undefined {
  if (typeof error !== 'object' || error === null) return undefined
  if ((error as { name?: unknown }).name !== 'ValidationError') return undefined

  const bag = (error as { errors?: unknown }).errors
  if (typeof bag !== 'object' || bag === null) return undefined

  const failures = Object.entries(bag as Record<string, unknown>).flatMap(([path, entry]) => {
    const message = (entry as { message?: unknown })?.message
    return typeof message === 'string' && message.length > 0 ? [{ path, message }] : []
  })

  // An error merely *named* ValidationError with nothing usable inside is not
  // one — it falls through to the generic 500 rather than answering 422 with an
  // empty explanation.
  return failures.length > 0 ? failures : undefined
}

/**
 * Converts a thrown error into the §17.1 envelope plus its HTTP status.
 *
 * Three branches, in order of specificity: a catalogued `StandupError`, a
 * model-layer validation rejection, then everything else.
 *
 * Unknown errors deliberately collapse to a generic 500 body rather than
 * leaking an internal message to the client; the caller is expected to log the
 * original.
 */
export function toErrorResponse(
  error: unknown
): {
  status: number
  body: StandupErrorBody | { error: { code: string; message: string; details?: unknown } }
} {
  if (isStandupError(error)) {
    return {
      status: error.status,
      body: {
        error: {
          code: error.code,
          message: error.message,
          ...(error.details === undefined ? {} : { details: error.details })
        }
      }
    }
  }

  // A model-layer rejection is the caller's bad input, not a server fault, and
  // the validator message is the only text that says what to fix. Answering
  // `500 / "Something went wrong."` reports it as the wrong kind of failure and
  // throws that text away, leaving the user to guess which field is at fault.
  //
  // Safe to surface: these messages are authored in the schemas for exactly
  // this purpose. Only `message` and `path` cross the boundary — never the
  // rejected value, which for a cast failure would echo back input this module
  // has not inspected.
  const failures = readValidationFailures(error)
  if (failures) {
    return {
      status: STANDUP_ERROR_CODES.VALIDATION_FAILED,
      body: {
        error: {
          code: 'VALIDATION_FAILED',
          message: failures.map((failure) => failure.message).join(' '),
          details: { fields: failures }
        }
      }
    }
  }

  return {
    status: 500,
    body: { error: { code: 'INTERNAL_ERROR', message: 'Something went wrong.' } }
  }
}

// --- Constructors for the cases with a fixed shape -------------------------
// These exist so the message and details payload are written once, rather than
// being retyped (and drifting) at each of the 56 endpoints.

export const planningGateNotPassed = (failingChecks: unknown[]) =>
  new StandupError(
    'PLANNING_GATE_NOT_PASSED',
    'This sprint has not completed planning, so its stand-ups cannot run.',
    { failingChecks }
  )

export const staleStandup = (currentVersion: number, currentState?: unknown) =>
  new StandupError(
    'STALE_STANDUP',
    'This stand-up changed while you were editing. Your change was not saved.',
    { currentVersion, currentState }
  )

export const taskNotEstimated = (taskId: string, taskKey?: string) =>
  new StandupError(
    'TASK_NOT_ESTIMATED',
    `${taskKey ?? 'This task'} has no estimate. Estimate it before allocating.`,
    { taskId, taskKey }
  )

export const immutableCompletedStandup = (dates: string[]) =>
  new StandupError(
    'IMMUTABLE_COMPLETED_STANDUP',
    `This change would alter completed stand-ups (${dates.join(', ')}), which cannot be modified.`,
    { dates }
  )

export const notAWorkingDay = (date: string, reason: string) =>
  new StandupError('NOT_A_WORKING_DAY', `${date} is not a working day for this project.`, {
    date,
    reason
  })

export const estimateImmutable = (taskId: string) =>
  new StandupError(
    'ESTIMATE_IMMUTABLE',
    'The original estimate cannot be changed after planning. Revise the remaining estimate instead.',
    { taskId }
  )

export const invalidJustification = () =>
  new StandupError(
    'INVALID_JUSTIFICATION',
    'That justification is too short or not specific enough.'
  )

export const overrideNotPermitted = (type: string) =>
  new StandupError('OVERRIDE_NOT_PERMITTED', `${type} cannot be overridden.`, { type })

/** RUN-22: a second completion attempt on a stand-up that already completed. */
export const alreadyCompleted = () =>
  new StandupError(
    'STANDUP_ALREADY_COMPLETED',
    'This stand-up has already been completed.'
  )

/**
 * RUN-19: the server re-ran the completion checks and at least one hard check
 * still fails. `failingChecks` is deliberately untyped here (`unknown[]`
 * rather than `CompletionCheckResult[]`) — this module has no dependencies by
 * design (see {@link readValidationFailures}'s comment) so routes running on
 * the Edge runtime can import it safely; the caller passes whatever shape
 * `blockingFailures()` returned.
 */
export const completionChecksFailed = (failingChecks: unknown[]) =>
  new StandupError(
    'COMPLETION_CHECKS_FAILED',
    'This stand-up cannot be completed until its failing checks are resolved.',
    { failingChecks }
  )

/**
 * R2's blocking banner (plan risk register): a prior completion attempt
 * crashed or was interrupted partway through the saga and left
 * `completionState` pointing at the last step that finished. The UI reads
 * this to show a "completion was interrupted — resume" banner rather than
 * silently retrying or, worse, letting the stand-up look editable while a
 * saga run is still logically in flight.
 */
export const completionInterrupted = (lastCompletedStep: string | null) =>
  new StandupError(
    'COMPLETION_INTERRUPTED',
    'A previous attempt to complete this stand-up did not finish. Resume it to continue.',
    { lastCompletedStep }
  )
