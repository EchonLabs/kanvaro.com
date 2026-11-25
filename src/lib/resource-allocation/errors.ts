/**
 * Error catalogue for the resource allocation module.
 *
 * Every failure a route returns is one of these codes, thrown as a typed
 * exception and converted to the `{ error: { code, message, details? } }`
 * envelope by {@link toRaErrorResponse}. The UI switches on `code` — e.g. a
 * stale request shows the acknowledge checkbox — so codes are part of the API
 * contract and must not be invented ad hoc at a call site.
 *
 * Deliberately mirrors `src/lib/standup/errors.ts` without importing it: the
 * two modules are independent and must not share a code space.
 */

export const RA_ERROR_CODES = {
  /** Request body or query failed validation, or the change is not allowed in its current form. */
  VALIDATION_FAILED: 422,
  /** The addressed member, project or request does not exist in the caller's organisation. */
  NOT_FOUND: 404,
  /** Authenticated but not allowed, e.g. a PM increasing a project they do not manage. */
  FORBIDDEN: 403,
  /** The change would push the member's total above the organisation threshold. */
  OVER_THRESHOLD: 422,
  /** The sheet moved on since the request was submitted; the approver must acknowledge it. */
  STALE_REQUEST_UNACKNOWLEDGED: 409,
  /** The request was already approved, rejected or cancelled. */
  REQUEST_NOT_PENDING: 409,
  /** The member already has a pending request; only one may be pending at a time. */
  REQUEST_ALREADY_PENDING: 409
} as const

export type RaErrorCode = keyof typeof RA_ERROR_CODES

export class ResourceAllocationError extends Error {
  readonly code: RaErrorCode
  readonly status: number
  readonly details?: unknown

  constructor(code: RaErrorCode, message: string, details?: unknown) {
    super(message)
    this.name = 'ResourceAllocationError'
    this.code = code
    this.status = RA_ERROR_CODES[code]
    this.details = details
    Object.setPrototypeOf(this, ResourceAllocationError.prototype)
  }
}

export function isResourceAllocationError(error: unknown): error is ResourceAllocationError {
  return error instanceof ResourceAllocationError
}

export interface RaErrorBody {
  error: { code: string; message: string; details?: unknown }
}

/** Recognises a mongoose ValidationError by shape and flattens its field messages. */
function readValidationFailures(error: unknown): { path: string; message: string }[] | undefined {
  if (typeof error !== 'object' || error === null) return undefined
  if ((error as { name?: unknown }).name !== 'ValidationError') return undefined

  const bag = (error as { errors?: unknown }).errors
  if (typeof bag !== 'object' || bag === null) return undefined

  const failures = Object.entries(bag as Record<string, unknown>).flatMap(([path, entry]) => {
    const message = (entry as { message?: unknown })?.message
    return typeof message === 'string' && message.length > 0 ? [{ path, message }] : []
  })
  return failures.length > 0 ? failures : undefined
}

/**
 * Converts a thrown error into the envelope plus its HTTP status. Unknown
 * errors collapse to a generic 500 so internals never reach the client; the
 * caller logs the original.
 */
export function toRaErrorResponse(error: unknown): { status: number; body: RaErrorBody } {
  if (isResourceAllocationError(error)) {
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

  const failures = readValidationFailures(error)
  if (failures) {
    return {
      status: RA_ERROR_CODES.VALIDATION_FAILED,
      body: {
        error: {
          code: 'VALIDATION_FAILED',
          message: failures.map((failure) => failure.message).join(' '),
          details: { fields: failures }
        }
      }
    }
  }

  return { status: 500, body: { error: { code: 'INTERNAL_ERROR', message: 'Something went wrong.' } } }
}
