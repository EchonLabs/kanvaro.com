/**
 * `Standup.completionState` (Task 14), the checkpoint field the completion
 * saga (`src/lib/standup/saga.ts`, Task 15) reads and writes through
 * `SagaCheckpoint.load`/`save`/`finish`. Purely additive to the model —
 * this file only exercises the new field, not the rest of `Standup`'s
 * SCH-3 field set, which `standup-model.integration.test.ts` already covers.
 */
import { Standup } from '@/models/Standup'

import { ids, syncIndexes, useMongo } from './helpers/mongo'

const baseStandup = (overrides: Record<string, unknown> = {}) => ({
  project: ids.project,
  sprint: ids.sprint,
  organization: ids.organization,
  standupDate: '2026-08-10',
  scheduledStartAt: new Date('2026-08-10T03:30:00.000Z'),
  durationMinutes: 15,
  sprintDayNumber: 1,
  totalSprintDays: 9,
  shape: 'day_one',
  status: 'Scheduled',
  facilitator: ids.user,
  expectedAttendees: [ids.member, ids.otherMember],
  ...overrides
})

describe('Standup.completionState', () => {
  useMongo()

  beforeEach(async () => {
    await syncIndexes(Standup)
  })

  it('has no runId or updatedAt when never set', async () => {
    const created = await Standup.create(baseStandup())

    expect(created.completionState?.runId).toBeUndefined()
    expect(created.completionState?.updatedAt).toBeUndefined()
  })

  it('accepts and persists a runId, lastCompletedStep, and updatedAt', async () => {
    const created = await Standup.create(
      baseStandup({
        completionState: {
          runId: 'run-1',
          lastCompletedStep: 'lock_snapshot',
          updatedAt: new Date('2026-08-10T04:00:00.000Z')
        }
      })
    )

    expect(created.completionState?.runId).toBe('run-1')
    expect(created.completionState?.lastCompletedStep).toBe('lock_snapshot')
    expect(created.completionState?.updatedAt).toEqual(new Date('2026-08-10T04:00:00.000Z'))

    const reloaded = await Standup.findById(created._id)
    expect(reloaded?.completionState?.runId).toBe('run-1')
    expect(reloaded?.completionState?.lastCompletedStep).toBe('lock_snapshot')
  })

  it('allows lastCompletedStep to be null, matching SagaCheckpoint.load\'s shape', async () => {
    const created = await Standup.create(
      baseStandup({
        completionState: {
          runId: 'run-2',
          lastCompletedStep: null,
          updatedAt: new Date('2026-08-10T04:05:00.000Z')
        }
      })
    )

    expect(created.completionState?.lastCompletedStep).toBeNull()
  })

  it('can be updated in place as later steps complete', async () => {
    const created = await Standup.create(
      baseStandup({
        completionState: {
          runId: 'run-3',
          lastCompletedStep: 'lock_snapshot',
          updatedAt: new Date('2026-08-10T04:00:00.000Z')
        }
      })
    )

    created.completionState = {
      runId: 'run-3',
      lastCompletedStep: 'write_variance',
      updatedAt: new Date('2026-08-10T04:10:00.000Z')
    }
    await created.save()

    const reloaded = await Standup.findById(created._id)
    expect(reloaded?.completionState?.lastCompletedStep).toBe('write_variance')
  })
})
