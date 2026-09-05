/**
 * reopen-service (Phase 10 — spec RUN-4, RUN-5).
 *
 * Exercises reopenStandup against a real database, per this repo's rule that
 * at least one test per service writes through the real path rather than a
 * pre-seeded row. The reason/window/org-admin rule itself is already unit
 * tested against `assertReopenable` in `lifecycle.test.ts` — these tests
 * confirm `reopenStandup` actually wires that rule to a real `Standup`
 * document (status transition, version bump, downstream list, audit entry).
 */
import mongoose from 'mongoose'

import { Standup } from '@/models/Standup'
import { ActivityLog } from '@/models/ActivityLog'

import { reopenStandup } from '../reopen-service'
import { anyId, ids, useMongo } from './helpers/mongo'

useMongo()

const REASON = 'Logged hours were wrong for two members yesterday'

const seedStandup = async (overrides: Record<string, unknown> = {}) =>
  Standup.create({
    project: ids.project,
    sprint: ids.sprint,
    organization: ids.organization,
    standupDate: '2026-08-10',
    scheduledStartAt: new Date('2026-08-10T03:30:00.000Z'),
    durationMinutes: 15,
    sprintDayNumber: 3,
    totalSprintDays: 5,
    shape: 'mid_sprint',
    status: 'Completed',
    facilitator: ids.user,
    expectedAttendees: [ids.member],
    // Two hours ago — comfortably inside a 24h reopen window, computed
    // relative to the real clock since assertReopenable compares against
    // Date.now() rather than a fixture-controlled "now".
    completedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
    version: 0,
    ...overrides
  })

const reopenInput = (overrides: Partial<Record<string, unknown>> & { standupId: string }) => ({
  reopenedBy: String(ids.user),
  isOrgAdmin: false,
  reason: REASON,
  organizationId: String(ids.organization),
  projectId: String(ids.project),
  reopenWindowHours: 24,
  expectedVersion: 0,
  ...overrides
})

describe('reopenStandup', () => {
  it('reopens a Completed stand-up inside the window, bumping its version', async () => {
    const standup = await seedStandup()

    const result = await reopenStandup(
      reopenInput({ standupId: String(standup._id) })
    )

    expect(result.standup.status).toBe('Reopened')
    expect(result.standup.version).toBe(1)

    const reloaded = await Standup.findById(standup._id).lean()
    expect(reloaded?.status).toBe('Reopened')
    expect(reloaded?.version).toBe(1)
  })

  it('records an audit entry for the reopen', async () => {
    const standup = await seedStandup()

    await reopenStandup(reopenInput({ standupId: String(standup._id) }))

    const entry = await ActivityLog.findOne({ entityId: String(standup._id), action: 'standup_reopened' }).lean()
    expect(entry).not.toBeNull()
    expect((entry as any)?.details?.after?.reason).toBe(REASON)
  })

  it('refuses outside the window for a non-admin with REOPEN_WINDOW_EXPIRED', async () => {
    // completedAt is 25 hours before "now" relative to a 24h window — force
    // this by seeding completedAt far enough in the past.
    const staleCompletedAt = new Date(Date.now() - 25 * 60 * 60 * 1000)
    const standup = await seedStandup({ completedAt: staleCompletedAt })

    await expect(
      reopenStandup(reopenInput({ standupId: String(standup._id) }))
    ).rejects.toMatchObject({ code: 'REOPEN_WINDOW_EXPIRED' })

    const reloaded = await Standup.findById(standup._id).lean()
    expect(reloaded?.status).toBe('Completed')
  })

  it('allows an org admin to reopen outside the window', async () => {
    const staleCompletedAt = new Date(Date.now() - 25 * 60 * 60 * 1000)
    const standup = await seedStandup({ completedAt: staleCompletedAt })

    const result = await reopenStandup(
      reopenInput({ standupId: String(standup._id), isOrgAdmin: true })
    )

    expect(result.standup.status).toBe('Reopened')
  })

  it('refuses a reason shorter than 20 characters with INVALID_JUSTIFICATION', async () => {
    const standup = await seedStandup()

    await expect(
      reopenStandup(reopenInput({ standupId: String(standup._id), reason: 'typo' }))
    ).rejects.toMatchObject({ code: 'INVALID_JUSTIFICATION' })
  })

  it('refuses a stand-up that is not Completed', async () => {
    const standup = await seedStandup({ status: 'In_Progress', completedAt: undefined })

    await expect(
      reopenStandup(reopenInput({ standupId: String(standup._id) }))
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
  })

  it('refuses a stale version with STALE_STANDUP', async () => {
    const standup = await seedStandup()

    await expect(
      reopenStandup(
        reopenInput({ standupId: String(standup._id), expectedVersion: 99 })
      )
    ).rejects.toMatchObject({ code: 'STALE_STANDUP' })
  })

  it('404s a missing stand-up', async () => {
    await expect(
      reopenStandup(reopenInput({ standupId: String(anyId()) }))
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  describe('affectedDownstreamStandupIds', () => {
    it('lists later Completed stand-ups in the sprint, sorted by date, excluding the reopened one and non-Completed successors', async () => {
      const standup = await seedStandup({ standupDate: '2026-08-10' })

      const laterCompletedB = await seedStandup({
        standupDate: '2026-08-12',
        sprintDayNumber: 5,
        status: 'Completed'
      })
      const laterCompletedA = await seedStandup({
        standupDate: '2026-08-11',
        sprintDayNumber: 4,
        status: 'Completed'
      })
      // Not Completed — must be excluded.
      await seedStandup({
        standupDate: '2026-08-13',
        sprintDayNumber: 6,
        status: 'In_Progress',
        completedAt: undefined
      })
      // Earlier than the reopened stand-up — must be excluded even though Completed.
      await seedStandup({
        standupDate: '2026-08-09',
        sprintDayNumber: 2,
        status: 'Completed'
      })
      // A different sprint entirely — must be excluded.
      await seedStandup({
        standupDate: '2026-08-14',
        sprintDayNumber: 1,
        status: 'Completed',
        sprint: new mongoose.Types.ObjectId()
      })

      const result = await reopenStandup(reopenInput({ standupId: String(standup._id) }))

      expect(result.affectedDownstreamStandupIds).toEqual([
        String(laterCompletedA._id),
        String(laterCompletedB._id)
      ])
    })
  })
})
