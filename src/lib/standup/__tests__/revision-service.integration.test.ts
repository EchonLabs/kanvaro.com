/**
 * Revising a remaining estimate, and answering for time that did not happen
 * (Phase 8, Task 8 — VAR-15, VAR-16, AC-17, AC-18).
 *
 * AC-17 is the load-bearing case and it is asserted against the database, not
 * the return value: **the original estimate is still 6.0h afterwards**. Every
 * number the sprint report cites depends on that, and the only way to prove it
 * is to write through the service and read the task back.
 *
 * The other half is DAT-7's rule that a remaining estimate can only move
 * through a recorded revision. That refusal lives on the model, and it is
 * asserted here too, because a future refactor that "simplified" this service
 * into a bare `$set` would otherwise pass every other test in the file.
 */
import { Allocation } from '@/models/Allocation'
import { Standup } from '@/models/Standup'
import { Task } from '@/models/Task'

import {
  MIN_NOT_STARTED_REASON_LENGTH,
  recordNotStartedReason,
  reviseRemainingEstimate
} from '../revision-service'

import { useMongo } from './helpers/mongo'
import { seedWorkedExample } from './helpers/worked-example-seed'

const VALID_REASON = 'Kasun stayed on the invoice model all day.'

describe('reviseRemainingEstimate', () => {
  useMongo()

  it('never changes the original estimate (AC-17, INV-4)', async () => {
    const { day4, kan214, pmId, allocations } = await seedWorkedExample()

    await reviseRemainingEstimate({
      standupId: day4,
      allocationId: allocations['KAN-214'],
      newRemainingMinutes: 180,
      reason: 'underestimated',
      expectedVersion: 1,
      actor: { userId: pmId }
    })

    const task = (await Task.findById(kan214).lean()) as any
    expect(task.originalEstimateMinutes).toBe(360)
    expect(task.remainingEstimateMinutes).toBe(180)
    expect(task.estimateRevisions).toHaveLength(1)
    expect(task.estimateRevisions[0]).toMatchObject({
      previousRemainingMinutes: 360,
      newRemainingMinutes: 180,
      reason: 'underestimated'
    })
    expect(String(task.estimateRevisions[0].revisedBy)).toBe(pmId)
    expect(String(task.estimateRevisions[0].standup)).toBe(day4)
  })

  it('reports the projected new total the modal must display (§15.11)', async () => {
    const { day4, pmId, allocations } = await seedWorkedExample()
    // The 8.0h Kasun logged on day 3 comes from the time entries themselves —
    // deliberately not from `Task.totalLoggedMinutes`, which the fixture never
    // sets and which can lag in production.

    const result = await reviseRemainingEstimate({
      standupId: day4,
      allocationId: allocations['KAN-214'],
      newRemainingMinutes: 180,
      reason: 'underestimated',
      expectedVersion: 1,
      actor: { userId: pmId }
    })

    expect(result.projectedTotalMinutes).toBe(660)
    expect(result.task.originalEstimateMinutes).toBe(360)
  })

  it('records the answer on the allocation, where Panel 3 and CC-3 read it', async () => {
    const { day4, pmId, allocations } = await seedWorkedExample()
    await reviseRemainingEstimate({
      standupId: day4,
      allocationId: allocations['KAN-214'],
      newRemainingMinutes: 180,
      reason: 'scope_grew',
      expectedVersion: 1,
      actor: { userId: pmId }
    })

    const allocation = (await Allocation.findById(allocations['KAN-214']).lean()) as any
    expect(allocation.revisedRemainingMinutes).toBe(180)
    expect(allocation.revisionReason).toBe('scope_grew')
  })

  it('bumps the stand-up version so a concurrent editor is refused', async () => {
    const { day4, pmId, allocations } = await seedWorkedExample()
    const result = await reviseRemainingEstimate({
      standupId: day4,
      allocationId: allocations['KAN-214'],
      newRemainingMinutes: 180,
      reason: 'underestimated',
      expectedVersion: 1,
      actor: { userId: pmId }
    })
    expect(result.standupVersion).toBe(2)
    expect(((await Standup.findById(day4).lean()) as any).version).toBe(2)
  })

  it('writes an audit entry naming the before and after', async () => {
    const { day4, pmId, allocations } = await seedWorkedExample()
    await reviseRemainingEstimate({
      standupId: day4,
      allocationId: allocations['KAN-214'],
      newRemainingMinutes: 180,
      reason: 'underestimated',
      expectedVersion: 1,
      actor: { userId: pmId }
    })
    const { ActivityLog } = await import('@/models/ActivityLog')
    const entry = (await ActivityLog.findOne({ action: 'estimate_revised' }).lean()) as any
    // recordAudit nests the snapshots under `details`.
    expect(entry.details.before).toMatchObject({ remainingEstimateMinutes: 360 })
    expect(entry.details.after).toMatchObject({ remainingEstimateMinutes: 180 })
  })

  it('accepts a revision to zero on a task that is genuinely finished', async () => {
    const { day4, pmId, allocations } = await seedWorkedExample()
    await expect(
      reviseRemainingEstimate({
        standupId: day4,
        allocationId: allocations['KAN-214'],
        newRemainingMinutes: 0,
        reason: 'underestimated',
        expectedVersion: 1,
        actor: { userId: pmId }
      })
    ).resolves.toBeTruthy()
  })

  describe('refusals', () => {
    it('refuses "other" without ten characters of detail (VAR-15)', async () => {
      const { day4, pmId, allocations } = await seedWorkedExample()
      await expect(
        reviseRemainingEstimate({
          standupId: day4,
          allocationId: allocations['KAN-214'],
          newRemainingMinutes: 180,
          reason: 'other',
          detail: 'too short',
          expectedVersion: 1,
          actor: { userId: pmId }
        })
      ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
    })

    it('accepts "other" once the detail is long enough', async () => {
      const { day4, pmId, allocations } = await seedWorkedExample()
      await expect(
        reviseRemainingEstimate({
          standupId: day4,
          allocationId: allocations['KAN-214'],
          newRemainingMinutes: 180,
          reason: 'other',
          detail: 'The upstream API changed shape overnight.',
          expectedVersion: 1,
          actor: { userId: pmId }
        })
      ).resolves.toBeTruthy()
    })

    it('refuses an unknown reason code', async () => {
      const { day4, pmId, allocations } = await seedWorkedExample()
      await expect(
        reviseRemainingEstimate({
          standupId: day4,
          allocationId: allocations['KAN-214'],
          newRemainingMinutes: 180,
          reason: 'because' as any,
          expectedVersion: 1,
          actor: { userId: pmId }
        })
      ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
    })

    it('refuses a value that is not a multiple of fifteen minutes', async () => {
      const { day4, pmId, allocations } = await seedWorkedExample()
      await expect(
        reviseRemainingEstimate({
          standupId: day4,
          allocationId: allocations['KAN-214'],
          newRemainingMinutes: 200,
          reason: 'underestimated',
          expectedVersion: 1,
          actor: { userId: pmId }
        })
      ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
    })

    it('refuses more than 999 hours', async () => {
      const { day4, pmId, allocations } = await seedWorkedExample()
      await expect(
        reviseRemainingEstimate({
          standupId: day4,
          allocationId: allocations['KAN-214'],
          newRemainingMinutes: 1000 * 60,
          reason: 'underestimated',
          expectedVersion: 1,
          actor: { userId: pmId }
        })
      ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
    })

    it('refuses a stale version and reports the current one (RUN-23)', async () => {
      const { day4, pmId, allocations } = await seedWorkedExample()
      await expect(
        reviseRemainingEstimate({
          standupId: day4,
          allocationId: allocations['KAN-214'],
          newRemainingMinutes: 180,
          reason: 'underestimated',
          expectedVersion: 9,
          actor: { userId: pmId }
        })
      ).rejects.toMatchObject({ code: 'STALE_STANDUP', details: { currentVersion: 1 } })
    })

    it('refuses to touch a completed stand-up', async () => {
      const { day4, pmId, allocations } = await seedWorkedExample()
      await Standup.updateOne({ _id: day4 }, { $set: { status: 'Completed' } })
      await expect(
        reviseRemainingEstimate({
          standupId: day4,
          allocationId: allocations['KAN-214'],
          newRemainingMinutes: 180,
          reason: 'underestimated',
          expectedVersion: 1,
          actor: { userId: pmId }
        })
      ).rejects.toMatchObject({ code: 'IMMUTABLE_COMPLETED_STANDUP' })
    })

    it('refuses an allocation from an unrelated stand-up', async () => {
      const { day4, day5, pmId, allocations, sprintId, projectId, organizationId, kasunId, kan231 } =
        await seedWorkedExample()
      const stray = await Allocation.create({
        standup: day5,
        sprint: sprintId,
        project: projectId,
        organization: organizationId,
        member: kasunId,
        task: kan231,
        plannedMinutes: 60,
        source: 'assigned_in_standup',
        createdBy: pmId
      })
      void allocations

      await expect(
        reviseRemainingEstimate({
          standupId: day4,
          allocationId: String(stray._id),
          newRemainingMinutes: 180,
          reason: 'underestimated',
          expectedVersion: 1,
          actor: { userId: pmId }
        })
      ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
    })
  })

  it('is the only path that can move a remaining estimate (DAT-7)', async () => {
    const { kan214 } = await seedWorkedExample()
    // A bare set with no revision entry is refused at the model layer, which is
    // what stops a future caller from bypassing this service entirely.
    await expect(
      Task.updateOne({ _id: kan214 }, { $set: { remainingEstimateMinutes: 60 } })
    ).rejects.toThrow(/revision/i)
  })
})

describe('recordNotStartedReason (AC-18)', () => {
  useMongo()

  it('records the reason on the allocation', async () => {
    const { day4, pmId, allocations } = await seedWorkedExample()
    await recordNotStartedReason({
      standupId: day4,
      allocationId: allocations['KAN-231'],
      reason: VALID_REASON,
      expectedVersion: 1,
      actor: { userId: pmId }
    })

    const allocation = (await Allocation.findById(allocations['KAN-231']).lean()) as any
    expect(allocation.notStartedReason).toBe(VALID_REASON)
  })

  it('requires ten characters', async () => {
    const { day4, pmId, allocations } = await seedWorkedExample()
    await expect(
      recordNotStartedReason({
        standupId: day4,
        allocationId: allocations['KAN-231'],
        reason: 'busy',
        expectedVersion: 1,
        actor: { userId: pmId }
      })
    ).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      details: { minLength: MIN_NOT_STARTED_REASON_LENGTH }
    })
  })

  it('refuses whitespace padded up to the floor', async () => {
    const { day4, pmId, allocations } = await seedWorkedExample()
    await expect(
      recordNotStartedReason({
        standupId: day4,
        allocationId: allocations['KAN-231'],
        reason: '  busy    ',
        expectedVersion: 1,
        actor: { userId: pmId }
      })
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
  })

  it('refuses a stale version', async () => {
    const { day4, pmId, allocations } = await seedWorkedExample()
    await expect(
      recordNotStartedReason({
        standupId: day4,
        allocationId: allocations['KAN-231'],
        reason: VALID_REASON,
        expectedVersion: 4,
        actor: { userId: pmId }
      })
    ).rejects.toMatchObject({ code: 'STALE_STANDUP' })
  })
})
