/**
 * POST /api/standups/:id/backfill — real invocation.
 *
 * `backfill-service.integration.test.ts` covers `backfillStandup` itself. This
 * file covers the seam the service tests cannot see: whether the HTTP body the
 * client sends actually reaches the service.
 *
 * That seam was broken once already and `tsc` was clean straight through it.
 * SCH-14 describes backfill as taking a full run payload, but `BackfillBody`
 * accepted only `{ notes }`, and the client's own `backfill({ notes })`
 * destructured only `notes` — so the attendance the dialog collected was
 * dropped on the floor, and a missed stand-up could never satisfy CC-7. The
 * body is read through `readJson<BackfillBody>`, which is a cast and checks
 * nothing at runtime, so types cannot catch a repeat.
 *
 * The service is mocked on purpose: the question here is "did the route hand
 * over what the client posted", not "does the saga work" — the integration
 * test answers that against a real Mongo and the real saga.
 *
 * Mocked the way `attendance-route.test.ts` mocks this wrapper's dependencies;
 * `Standup` stays real against `useMongo()`, because `withStandupIdPermission`
 * loads the stand-up itself for the org-isolation check before the handler
 * ever runs.
 */
import { NextRequest } from 'next/server'

import { Standup } from '@/models/Standup'

import { ids, useMongo } from './helpers/mongo'

const { project, sprint, member, user } = ids

const hasPermission = jest.fn()
const requireProjectAccess = jest.fn()
const backfillStandup = jest.fn()
const mockOrgId = '5f00000000000000000000aa'
const mockUserId = '5f00000000000000000000bb'

const DAY = '2026-08-17'

jest.mock('@/lib/db-config', () => ({
  __esModule: true,
  default: jest.fn().mockResolvedValue(undefined)
}))

jest.mock('@/lib/auth-utils', () => ({
  authenticateUser: jest.fn().mockResolvedValue({
    user: { id: mockUserId, organization: mockOrgId }
  })
}))

jest.mock('@/lib/permissions/permission-service', () => ({
  PermissionService: {
    hasPermission: (...args: unknown[]) => hasPermission(...args),
    requireProjectAccess: (...args: unknown[]) => requireProjectAccess(...args)
  }
}))

jest.mock('@/lib/standup/backfill-service', () => ({
  backfillStandup: (...args: unknown[]) => backfillStandup(...args)
}))

// eslint-disable-next-line @typescript-eslint/no-var-requires
const backfillRoute = require('@/app/api/standups/[id]/backfill/route')

describe('POST /api/standups/:id/backfill — body contract (SCH-14)', () => {
  useMongo()

  let standupId: string

  beforeEach(async () => {
    hasPermission.mockReset().mockResolvedValue(true)
    requireProjectAccess.mockReset().mockResolvedValue(undefined)
    backfillStandup.mockReset().mockResolvedValue({
      standup: { wasBackfilled: true, backfilledAt: new Date('2026-08-18T10:00:00.000Z') },
      summaryId: 'summary-1'
    })

    const standup = await Standup.create({
      project,
      sprint,
      organization: mockOrgId,
      standupDate: DAY,
      scheduledStartAt: new Date(`${DAY}T03:30:00.000Z`),
      durationMinutes: 15,
      sprintDayNumber: 1,
      totalSprintDays: 5,
      shape: 'day_one',
      status: 'Missed',
      facilitator: user,
      expectedAttendees: [member],
      version: 0
    })
    standupId = standup._id.toString()
  })

  const post = (body: unknown) =>
    backfillRoute.POST(
      new NextRequest(`http://localhost/api/standups/${standupId}/backfill`, {
        method: 'POST',
        body: JSON.stringify(body)
      }),
      { params: { id: standupId } }
    )

  it('passes both notes and the attendance payload through to the service', async () => {
    const attendance = [
      { memberId: member.toString(), state: 'absent_planned' },
      { memberId: user.toString(), state: 'present' }
    ]

    const response = await post({ notes: 'Reconstructed from the sprint board.', attendance })

    expect(response.status).toBe(200)
    expect(backfillStandup).toHaveBeenCalledWith({
      standupId,
      backfilledBy: mockUserId,
      notes: 'Reconstructed from the sprint board.',
      attendance
    })
  })

  it('still accepts a notes-only body', async () => {
    const response = await post({ notes: 'Nothing to record.' })

    expect(response.status).toBe(200)
    expect(backfillStandup).toHaveBeenCalledWith(
      expect.objectContaining({ notes: 'Nothing to record.' })
    )
    // Nothing is invented when the caller sends no room.
    const [[passed]] = backfillStandup.mock.calls as [[{ attendance?: unknown[] }]]
    expect(passed.attendance ?? []).toEqual([])
  })

  /**
   * Ruling 21's half of the same seam. The acknowledgement is the only thing
   * that lets a missed day past CC-1, so a route that silently dropped it
   * would reproduce the Task 10 defect one field along: the dialog would
   * collect an attestation, the facilitator would see a 422 anyway, and both
   * `tsc` and the service's own tests would stay green.
   */
  it('passes the facilitator acknowledgement through to the service', async () => {
    const acknowledgedChecks = [
      { checkId: 'CC-1', justification: 'The day was missed outright, so nobody planned anything.' }
    ]

    const response = await post({
      attendance: [{ memberId: member.toString(), state: 'present' }],
      acknowledgedChecks
    })

    expect(response.status).toBe(200)
    expect(backfillStandup).toHaveBeenCalledWith(
      expect.objectContaining({ acknowledgedChecks })
    )
  })

  it('invents no acknowledgement when the caller sends none', async () => {
    const response = await post({ notes: 'Nothing to attest to.' })

    expect(response.status).toBe(200)
    const [[passed]] = backfillStandup.mock.calls as [[{ acknowledgedChecks?: unknown[] }]]
    expect(passed.acknowledgedChecks).toBeUndefined()
  })

  it('answers the service refusal rather than a 500 when the payload is rejected', async () => {
    const { StandupError } = await import('../errors')
    backfillStandup.mockRejectedValue(
      new StandupError('VALIDATION_FAILED', 'That person is not expected at this stand-up.')
    )

    const response = await post({
      attendance: [{ memberId: mockUserId, state: 'present' }]
    })

    expect(response.status).toBe(422)
    const body = await response.json()
    expect(body.error.code).toBe('VALIDATION_FAILED')
  })
})
