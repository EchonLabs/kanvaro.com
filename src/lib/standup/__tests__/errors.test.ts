/**
 * The error catalogue (spec §17.2).
 *
 * These codes are part of the API contract — clients switch on them to decide
 * between a jump link, a retry and a blocking dialog — so the table is pinned
 * here rather than trusted. A defect already shipped once in this file:
 * `NOT_A_WORKING_DAY` was used as a catch-all, so a malformed CSV date answered
 * "that date is not a working day", which is simply untrue.
 */
import {
  STANDUP_ERROR_CODES,
  StandupError,
  completionInterrupted,
  estimateImmutable,
  immutableCompletedStandup,
  isStandupError,
  notAWorkingDay,
  planningGateNotPassed,
  staleStandup,
  taskNotEstimated,
  toErrorResponse
} from '../errors'

/**
 * The §17.2 table, retyped from the spec rather than derived from the source,
 * so a change to the implementation has to be a deliberate change here too.
 */
const SPEC_CODES: Record<string, number> = {
  PLANNING_GATE_NOT_PASSED: 409,
  STANDUP_NOT_STARTABLE: 409,
  STANDUP_ALREADY_COMPLETED: 409,
  STALE_STANDUP: 409,
  COMPLETION_CHECKS_FAILED: 422,
  TASK_NOT_ESTIMATED: 422,
  IMMUTABLE_COMPLETED_STANDUP: 409,
  OVERRIDE_NOT_PERMITTED: 403,
  INVALID_JUSTIFICATION: 422,
  NOTE_UNCHANGED: 422,
  CAPACITY_EXCEEDED: 422,
  REOPEN_WINDOW_EXPIRED: 403,
  NOT_A_WORKING_DAY: 422,
  ESTIMATE_IMMUTABLE: 422
}

/** Deliberate additions beyond §17.2, documented in `errors.ts`. */
const ADDITIONS: Record<string, number> = {
  COMPLETION_INTERRUPTED: 409,
  VALIDATION_FAILED: 422,
  NOT_FOUND: 404
}

describe('§17.2 catalogue', () => {
  it.each(Object.entries(SPEC_CODES))('%s maps to HTTP %i', (code, status) => {
    expect(STANDUP_ERROR_CODES[code as keyof typeof STANDUP_ERROR_CODES]).toBe(status)
  })

  it('implements every code the spec lists', () => {
    for (const code of Object.keys(SPEC_CODES)) {
      expect(STANDUP_ERROR_CODES).toHaveProperty(code)
    }
  })

  it('adds exactly the three generic codes and no others', () => {
    const extra = Object.keys(STANDUP_ERROR_CODES).filter((code) => !(code in SPEC_CODES))
    expect(extra.sort()).toEqual(Object.keys(ADDITIONS).sort())
  })

  it.each(Object.entries(ADDITIONS))('%s maps to HTTP %i', (code, status) => {
    expect(STANDUP_ERROR_CODES[code as keyof typeof STANDUP_ERROR_CODES]).toBe(status)
  })

  it('keeps NOT_FOUND distinct from the 422 family', () => {
    // The original defect: a missing record answering a 422 domain code.
    expect(STANDUP_ERROR_CODES.NOT_FOUND).toBe(404)
    expect(STANDUP_ERROR_CODES.NOT_FOUND).not.toBe(STANDUP_ERROR_CODES.NOT_A_WORKING_DAY)
  })
})

describe('StandupError', () => {
  it('derives its status from the catalogue', () => {
    expect(new StandupError('STALE_STANDUP', 'x').status).toBe(409)
    expect(new StandupError('NOT_FOUND', 'x').status).toBe(404)
    expect(new StandupError('OVERRIDE_NOT_PERMITTED', 'x').status).toBe(403)
  })

  it('survives instanceof after the ES5 downlevel', () => {
    const error = new StandupError('NOT_FOUND', 'Gone')
    expect(error).toBeInstanceOf(StandupError)
    expect(error).toBeInstanceOf(Error)
    expect(isStandupError(error)).toBe(true)
  })

  it('is not confused with an ordinary Error', () => {
    expect(isStandupError(new Error('boom'))).toBe(false)
    expect(isStandupError('boom')).toBe(false)
    expect(isStandupError(null)).toBe(false)
  })

  it('carries a structured details payload', () => {
    const error = new StandupError('COMPLETION_CHECKS_FAILED', '3 checks failed', {
      failures: [{ checkId: 'CC-1' }]
    })
    expect(error.details).toEqual({ failures: [{ checkId: 'CC-1' }] })
  })
})

describe('toErrorResponse', () => {
  it('produces the §17.1 envelope', () => {
    const { status, body } = toErrorResponse(
      new StandupError('TASK_NOT_ESTIMATED', 'No estimate.', { taskId: 'abc' })
    )

    expect(status).toBe(422)
    expect(body).toEqual({
      error: { code: 'TASK_NOT_ESTIMATED', message: 'No estimate.', details: { taskId: 'abc' } }
    })
  })

  it('omits details entirely when there are none', () => {
    const { body } = toErrorResponse(new StandupError('NOT_FOUND', 'Gone'))
    expect(body.error).not.toHaveProperty('details')
  })

  it('collapses an unknown error to a generic 500 without leaking its message', () => {
    const { status, body } = toErrorResponse(new Error('Mongo connection string is postgres://…'))

    expect(status).toBe(500)
    expect(body.error.code).toBe('INTERNAL_ERROR')
    expect(JSON.stringify(body)).not.toContain('postgres')
  })

  it('handles a non-Error throw', () => {
    expect(toErrorResponse('something odd').status).toBe(500)
  })
})

describe('constructors', () => {
  it('planningGateNotPassed carries the failing checks', () => {
    const error = planningGateNotPassed([{ checkId: 'PC-3' }])
    expect(error.code).toBe('PLANNING_GATE_NOT_PASSED')
    expect(error.status).toBe(409)
    expect(error.details).toEqual({ failingChecks: [{ checkId: 'PC-3' }] })
  })

  it('staleStandup returns the current server state, per RUN-23', () => {
    const error = staleStandup(13, { status: 'In_Progress' })
    expect(error.details).toEqual({ currentVersion: 13, currentState: { status: 'In_Progress' } })
  })

  it('taskNotEstimated names the task when a key is known', () => {
    expect(taskNotEstimated('id', 'KAN-500').message).toContain('KAN-500')
    expect(taskNotEstimated('id').message).toContain('This task')
  })

  it('immutableCompletedStandup lists the dates involved, per SCH-7', () => {
    const error = immutableCompletedStandup(['2026-08-11', '2026-08-12'])
    expect(error.message).toContain('2026-08-11')
    expect(error.message).toContain('2026-08-12')
    expect(error.details).toEqual({ dates: ['2026-08-11', '2026-08-12'] })
  })

  it('notAWorkingDay is about a date, not about validation', () => {
    const error = notAWorkingDay('2026-08-29', 'weekend')
    expect(error.code).toBe('NOT_A_WORKING_DAY')
    expect(error.message).toContain('2026-08-29')
    expect(error.details).toEqual({ date: '2026-08-29', reason: 'weekend' })
  })

  it('estimateImmutable points the user at the revision path (DAT-6)', () => {
    const error = estimateImmutable('task-id')
    expect(error.code).toBe('ESTIMATE_IMMUTABLE')
    expect(error.message).toContain('Revise the remaining estimate')
  })

  it('completionInterrupted carries the last completed step', () => {
    const error = completionInterrupted('create_summary')
    expect(error.code).toBe('COMPLETION_INTERRUPTED')
    expect(error.status).toBe(409)
    expect(error.message).toContain('did not finish')
    expect(error.details).toEqual({ lastCompletedStep: 'create_summary' })
  })
})

/**
 * Mongoose validation reaching the client.
 *
 * `VALIDATION_FAILED` was added to the catalogue for "ordinary input
 * validation" but nothing ever mapped to it, so a model-layer rejection fell
 * through to the unknown-error branch and answered
 * `500 INTERNAL_ERROR / "Something went wrong."`. That is wrong twice over: it
 * reports the caller's bad input as a server fault, and it discards the only
 * text that says what to fix.
 *
 * Built here as literals rather than by importing mongoose, matching how
 * `toErrorResponse` recognises them — by shape, not by constructor.
 */
const mongooseValidationError = (
  paths: Record<string, string>
): Error & { errors: Record<string, { message: string; path: string; kind?: string }> } => {
  const error = new Error('Validation failed') as Error & {
    errors: Record<string, { message: string; path: string; kind?: string }>
  }
  error.name = 'ValidationError'
  error.errors = Object.fromEntries(
    Object.entries(paths).map(([path, message]) => [
      path,
      { message, path, kind: 'user defined' }
    ])
  )
  return error
}

describe('toErrorResponse — model validation', () => {
  it('answers 422 VALIDATION_FAILED rather than a generic 500', () => {
    const { status, body } = toErrorResponse(
      mongooseValidationError({
        carryForwardEscalationThreshold: 'Escalation threshold must exceed the note threshold'
      })
    )

    expect(status).toBe(422)
    expect(body.error.code).toBe('VALIDATION_FAILED')
  })

  it('surfaces the validator message, which is the only text saying what to fix', () => {
    const { body } = toErrorResponse(
      mongooseValidationError({
        carryForwardEscalationThreshold: 'Escalation threshold must exceed the note threshold'
      })
    )

    expect(body.error.message).toMatch(/Escalation threshold must exceed the note threshold/)
  })

  it('names every failing field in details, so the form can mark the right rows', () => {
    const { body } = toErrorResponse(
      mongooseValidationError({
        carryForwardEscalationThreshold: 'Escalation threshold must exceed the note threshold',
        pointsToHours: 'Points to hours must be positive'
      })
    )

    expect((body.error as { details?: unknown }).details).toEqual({
      fields: [
        {
          path: 'carryForwardEscalationThreshold',
          message: 'Escalation threshold must exceed the note threshold'
        },
        { path: 'pointsToHours', message: 'Points to hours must be positive' }
      ]
    })
  })

  it('leaves a StandupError untouched — the catalogue still wins', () => {
    const { status, body } = toErrorResponse(
      new StandupError('NOTE_UNCHANGED', 'That note is unchanged.')
    )

    expect(status).toBe(422)
    expect(body.error.code).toBe('NOTE_UNCHANGED')
  })

  it('still collapses an error merely *named* ValidationError with no field bag', () => {
    const impostor = new Error('something internal')
    impostor.name = 'ValidationError'

    const { status, body } = toErrorResponse(impostor)

    expect(status).toBe(500)
    expect(body.error.message).toBe('Something went wrong.')
  })
})
