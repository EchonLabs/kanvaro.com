import { ResourceAllocationError, toRaErrorResponse } from '../errors'

describe('toRaErrorResponse', () => {
  it('carries the code, status, message and details of a module error', () => {
    const error = new ResourceAllocationError('OVER_THRESHOLD', 'Too much', {
      totalAfter: 120,
      threshold: 100,
      exceedsBy: 20
    })

    expect(toRaErrorResponse(error)).toEqual({
      status: 422,
      body: {
        error: {
          code: 'OVER_THRESHOLD',
          message: 'Too much',
          details: { totalAfter: 120, threshold: 100, exceedsBy: 20 }
        }
      }
    })
  })

  it.each([
    ['VALIDATION_FAILED', 422],
    ['NOT_FOUND', 404],
    ['FORBIDDEN', 403],
    ['OVER_THRESHOLD', 422],
    ['STALE_REQUEST_UNACKNOWLEDGED', 409],
    ['REQUEST_NOT_PENDING', 409],
    ['REQUEST_ALREADY_PENDING', 409]
  ] as const)('maps %s to %i', (code, status) => {
    expect(toRaErrorResponse(new ResourceAllocationError(code, 'x')).status).toBe(status)
  })

  it('omits details when there are none', () => {
    expect(toRaErrorResponse(new ResourceAllocationError('NOT_FOUND', 'Gone')).body).toEqual({
      error: { code: 'NOT_FOUND', message: 'Gone' }
    })
  })

  it('turns a mongoose validation error into a 422 naming the fields', () => {
    const validation = {
      name: 'ValidationError',
      errors: { reason: { message: 'A reason is required' } }
    }
    const { status, body } = toRaErrorResponse(validation)
    expect(status).toBe(422)
    expect(body.error.code).toBe('VALIDATION_FAILED')
    expect(body.error.message).toBe('A reason is required')
  })

  it('hides unknown errors behind a generic 500', () => {
    expect(toRaErrorResponse(new Error('db password is hunter2'))).toEqual({
      status: 500,
      body: { error: { code: 'INTERNAL_ERROR', message: 'Something went wrong.' } }
    })
  })
})
