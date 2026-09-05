/**
 * Planning session and waiver persistence (spec PLN-4, PLN-5, PLN-17).
 */
import { Sprint } from '@/models/Sprint'
import { SprintPlanningSession } from '@/models/SprintPlanningSession'
import { anyId, ids, syncIndexes, useMongo } from './helpers/mongo'

const { organization, project, user, member } = ids

const sprintFields = (overrides: Record<string, unknown> = {}) => ({
  name: 'Sprint 13',
  organization,
  project,
  createdBy: user,
  startDate: new Date('2026-08-24'),
  endDate: new Date('2026-09-04'),
  capacity: 320,
  ...overrides
})

const sessionFields = (sprint: any, overrides: Record<string, unknown> = {}) => ({
  organization,
  project,
  sprint: sprint._id,
  facilitator: user,
  participants: [user, member],
  createdBy: user,
  ...overrides
})

describe('PLN-4 — at most one open session per sprint', () => {
  useMongo()

  it('refuses a second open session', async () => {
    await syncIndexes(SprintPlanningSession)
    const sprint = await Sprint.create(sprintFields())

    await SprintPlanningSession.create(sessionFields(sprint))

    // A genuine race: two PMs both pressing "Start planning". Only the database
    // can settle it, which is why this is an index and not a validator.
    await expect(SprintPlanningSession.create(sessionFields(sprint))).rejects.toThrow(
      /duplicate key/i
    )
  })

  it('allows a new session once the previous one completed', async () => {
    await syncIndexes(SprintPlanningSession)
    const sprint = await Sprint.create(sprintFields())

    const first = await SprintPlanningSession.create(sessionFields(sprint))
    first.status = 'completed'
    first.completedAt = new Date()
    await first.save()

    // E20 — replanning after stand-ups have run. History is kept.
    await expect(SprintPlanningSession.create(sessionFields(sprint))).resolves.toBeTruthy()
    expect(await SprintPlanningSession.countDocuments({ sprint: sprint._id })).toBe(2)
  })

  it('does not constrain open sessions across different sprints', async () => {
    await syncIndexes(SprintPlanningSession)
    const one = await Sprint.create(sprintFields())
    const two = await Sprint.create(sprintFields({ name: 'Sprint 14' }))

    await SprintPlanningSession.create(sessionFields(one))
    await expect(SprintPlanningSession.create(sessionFields(two))).resolves.toBeTruthy()
  })
})

describe('PLN-5 — session fields', () => {
  useMongo()

  it('starts open with the facilitator recorded', async () => {
    const sprint = await Sprint.create(sprintFields())
    const session = await SprintPlanningSession.create(sessionFields(sprint))

    expect(session.status).toBe('open')
    expect(session.facilitator.toString()).toBe(user.toString())
    expect(session.startedAt).toBeInstanceOf(Date)
    expect(session.checklistResults).toEqual([])
  })

  it('caps the sprint goal at 500 characters', async () => {
    const sprint = await Sprint.create(sprintFields())

    await expect(
      SprintPlanningSession.create(sessionFields(sprint, { sprintGoal: 'x'.repeat(501) }))
    ).rejects.toThrow()
  })

  it('does not require a goal up front — PC-1 enforces it at completion', async () => {
    const sprint = await Sprint.create(sprintFields())
    await expect(SprintPlanningSession.create(sessionFields(sprint))).resolves.toBeTruthy()
  })

  it('stores the capacity and scope snapshots taken at completion', async () => {
    const sprint = await Sprint.create(sprintFields())
    const session = await SprintPlanningSession.create(
      sessionFields(sprint, {
        capacitySnapshot: {
          workingDayCount: 10,
          totalCapacityMinutes: 19200,
          leaveMinutes: 960,
          netCapacityMinutes: 18240,
          perMember: [
            { member: user, dailyCapacityMinutes: 480, sprintCapacityMinutes: 4800 }
          ]
        },
        scopeSnapshot: {
          taskCount: 24,
          estimatedTaskCount: 20,
          totalEstimatedMinutes: 16080,
          countByType: { feature: 18, bug: 6 }
        }
      })
    )

    expect(session.capacitySnapshot?.netCapacityMinutes).toBe(18240)
    expect(session.scopeSnapshot?.countByType.bug).toBe(6)
    expect(session.capacitySnapshot?.perMember).toHaveLength(1)
  })

  it('PLN-8 — records which advisory items were acknowledged and by whom', async () => {
    const sprint = await Sprint.create(sprintFields())
    const session = await SprintPlanningSession.create(
      sessionFields(sprint, {
        checklistResults: [
          { checkId: 'PC-3', kind: 'mandatory', passed: true },
          {
            checkId: 'PA-1',
            kind: 'advisory',
            passed: false,
            message: 'Scope is 24 hours over capacity.',
            acknowledgedBy: user,
            acknowledgedAt: new Date()
          }
        ]
      })
    )

    const advisory = session.checklistResults.find(
      (result: { checkId: string }) => result.checkId === 'PA-1'
    )
    expect(advisory?.acknowledgedBy?.toString()).toBe(user.toString())
    expect(advisory?.passed).toBe(false)
  })

  it('carries the offending ids UI-5 needs to build its fix list', async () => {
    const sprint = await Sprint.create(sprintFields())
    const offending = [anyId(), anyId()]

    const session = await SprintPlanningSession.create(
      sessionFields(sprint, {
        checklistResults: [
          { checkId: 'PC-3', kind: 'mandatory', passed: false, offendingIds: offending }
        ]
      })
    )

    expect(session.checklistResults[0].offendingIds).toHaveLength(2)
  })
})

describe('PLN-17 — the planning waiver', () => {
  useMongo()

  const waiver = (overrides: Record<string, unknown> = {}) => ({
    waivedCheckIds: ['PC-4'],
    justification:
      'Client signed off the scope verbally and the written acceptance criteria follow on Monday.',
    issuedBy: user,
    issuedAt: new Date(),
    expiresAt: new Date('2026-09-04'),
    ...overrides
  })

  it('stores a valid waiver on the sprint', async () => {
    const sprint = await Sprint.create(sprintFields({ planningWaiver: waiver() }))

    expect(sprint.planningWaiver?.waivedCheckIds).toEqual(['PC-4'])
    expect(sprint.planningWaiver?.issuedBy.toString()).toBe(user.toString())
  })

  it('rejects a justification under 30 characters', async () => {
    // Deliberately longer than an override's 20: waiving a mandatory gate is a
    // bigger claim than accepting one under-allocated day.
    await expect(
      Sprint.create(sprintFields({ planningWaiver: waiver({ justification: 'Client said ok' }) }))
    ).rejects.toThrow()
  })

  it('rejects a waiver naming no checks', async () => {
    await expect(
      Sprint.create(sprintFields({ planningWaiver: waiver({ waivedCheckIds: [] }) }))
    ).rejects.toThrow(/at least one check/)
  })

  it('requires an expiry', async () => {
    await expect(
      Sprint.create(sprintFields({ planningWaiver: waiver({ expiresAt: undefined }) }))
    ).rejects.toThrow()
  })

  it('leaves sprints without a waiver untouched', async () => {
    const sprint = await Sprint.create(sprintFields())
    expect(sprint.planningWaiver).toBeFalsy()
  })
})

describe('the sprint status enum', () => {
  useMongo()

  it('accepts the two new states', async () => {
    await expect(Sprint.create(sprintFields({ status: 'draft' }))).resolves.toBeTruthy()
    await expect(Sprint.create(sprintFields({ status: 'planned' }))).resolves.toBeTruthy()
  })

  it('still accepts every state that existed before', async () => {
    for (const status of ['planning', 'active', 'completed', 'cancelled']) {
      await expect(Sprint.create(sprintFields({ status }))).resolves.toBeTruthy()
    }
  })

  it('still defaults to planning, so the existing create flow is unchanged', async () => {
    const sprint = await Sprint.create(sprintFields())
    expect(sprint.status).toBe('planning')
  })

  it('rejects an unknown status', async () => {
    await expect(Sprint.create(sprintFields({ status: 'in_planning' }))).rejects.toThrow()
  })
})
