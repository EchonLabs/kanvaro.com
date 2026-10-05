/**
 * backfill-service (SCH-14, E49, §17.6).
 *
 * `wasBackfilled`/`backfilledAt` and `backfillWindowWorkingDays` were real
 * schema fields with no writer and no enforcement anywhere before this task
 * — see `backfill-service.ts`'s own docblock. These tests exercise the real
 * path end to end: a genuine `Missed` standup, the real completion saga
 * (allocations actually get frozen, a summary actually gets persisted — the
 * same facts `completion-saga.integration.test.ts` asserts), and the real
 * `ProjectStandupSettings.backfillWindowWorkingDays` value.
 *
 * A day-one stand-up with its one expected attendee marked `absent_planned`
 * and nothing allocated is the fixture, mirroring `complete-route.test.ts`'s
 * own reasoning: an absent member's capacity is `unavailable` (CC-1/CC-6
 * never flag it) and an empty allocation list trivially satisfies the
 * allocation-shaped checks, so the fixture isolates the backfill-specific
 * behaviour (window enforcement, `wasBackfilled` stamping) from the
 * completion-checks suite, which is already covered elsewhere.
 */
import mongoose from 'mongoose'

import { Allocation } from '@/models/Allocation'
import { ProjectStandupSettings } from '@/models/ProjectStandupSettings'
import { Sprint } from '@/models/Sprint'
import { Standup } from '@/models/Standup'
import { StandupSummary } from '@/models/StandupSummary'

import { notificationService } from '@/lib/notification-service'

import { backfillStandup } from '../backfill-service'
import { ids, syncIndexes, useMongo } from './helpers/mongo'

const { organization, project, member, user } = ids

let sprintId: mongoose.Types.ObjectId

async function seedSprint(startDate: string, endDate: string) {
  const sprint = await Sprint.create({
    name: 'Backfill sprint',
    organization,
    project,
    createdBy: user,
    status: 'active',
    startDate: new Date(`${startDate}T00:00:00.000Z`),
    endDate: new Date(`${endDate}T00:00:00.000Z`),
    capacity: 0,
    teamMembers: [member]
  })
  sprintId = sprint._id as mongoose.Types.ObjectId
}

/** A day-one, cleanly-passable Missed stand-up — see the module docblock. */
async function seedMissedStandup(standupDate: string, overrides: Record<string, unknown> = {}) {
  return Standup.create({
    project,
    sprint: sprintId,
    organization,
    standupDate,
    scheduledStartAt: new Date(`${standupDate}T03:30:00.000Z`),
    durationMinutes: 15,
    sprintDayNumber: 1,
    totalSprintDays: 5,
    shape: 'day_one',
    status: 'Missed',
    facilitator: user,
    expectedAttendees: [member],
    attendance: [{ user: member, state: 'absent_planned' }],
    version: 0,
    ...overrides
  })
}

let createNotification: jest.SpyInstance

beforeEach(() => {
  createNotification = jest
    .spyOn(notificationService, 'createNotification')
    .mockResolvedValue({ _id: 'notification' } as any)
})

afterEach(() => {
  createNotification.mockRestore()
})

describe('backfillStandup (SCH-14/E49)', () => {
  useMongo()

  beforeEach(async () => {
    await syncIndexes(StandupSummary)
  })

  it('backfills a Missed standup within the window and sets wasBackfilled/backfilledAt (E49/SCH-14)', async () => {
    // Missed on Tuesday 2026-09-01; "now" is Wednesday 2026-09-02 — exactly
    // one elapsed working day, comfortably inside a 2-working-day window.
    await seedSprint('2026-08-25', '2026-09-10')
    await ProjectStandupSettings.create({
      project,
      organization,
      backfillWindowWorkingDays: 2
    })
    const standup = await seedMissedStandup('2026-09-01')

    const result = await backfillStandup({
      standupId: String(standup._id),
      backfilledBy: String(user),
      now: new Date('2026-09-02T10:00:00.000Z')
    })

    expect(result.standup.status).toBe('Completed')
    expect(result.standup.wasBackfilled).toBe(true)
    expect(result.standup.backfilledAt).toBeInstanceOf(Date)
    expect(typeof result.summaryId).toBe('string')
    expect(result.summaryId.length).toBeGreaterThan(0)

    // The saga genuinely ran, not just the two backfill-specific fields: a
    // real summary is persisted, and the checkpoint clears.
    expect(await StandupSummary.countDocuments({ standup: standup._id })).toBe(1)

    const reloaded = await Standup.findById(standup._id).lean()
    expect(reloaded!.status).toBe('Completed')
    expect(reloaded!.wasBackfilled).toBe(true)
    expect(reloaded!.backfilledAt).toBeInstanceOf(Date)
    // `.lean()` reads the stored document as-is; a non-lean access of
    // `completionState` would show the schema's default nested subdocument
    // even though the saga's `finish()` step `$unset` it (see
    // `completion-saga.integration.test.ts`'s own RUN-23 comment).
    expect(reloaded!.completionState).toBeUndefined()
  })

  it('actually freezes allocations on a backfilled standup, same as a live completion', async () => {
    await seedSprint('2026-08-25', '2026-09-10')
    const standup = await seedMissedStandup('2026-09-01')

    const { Task } = await import('@/models/Task')
    const task = await Task.create({
      title: 'Backfill task',
      organization,
      project,
      sprint: sprintId,
      createdBy: user,
      taskNumber: 9101,
      displayId: 'KAN-9101',
      status: 'in_progress',
      remainingEstimateMinutes: 60,
      originalEstimateMinutes: 60,
      assignedTo: [{ user: member }]
    })
    await Allocation.create({
      standup: standup._id,
      sprint: sprintId,
      project,
      organization,
      member,
      task: task._id,
      plannedMinutes: 60,
      source: 'assigned_in_standup',
      excludedFromCapacity: false,
      createdBy: user
    })

    await backfillStandup({
      standupId: String(standup._id),
      backfilledBy: String(user),
      now: new Date('2026-09-02T10:00:00.000Z')
    })

    const allocations = await Allocation.find({ standup: standup._id }).lean()
    expect(allocations.every((row) => row.frozenAt)).toBe(true)
  })

  it('refuses a backfill outside the configured window and changes nothing (E49/SCH-14)', async () => {
    // Missed on Monday 2026-08-24; "now" is Monday 2026-09-07 — ten elapsed
    // working days, well outside a 2-working-day window.
    await seedSprint('2026-08-17', '2026-09-11')
    await ProjectStandupSettings.create({
      project,
      organization,
      backfillWindowWorkingDays: 2
    })
    const standup = await seedMissedStandup('2026-08-24')

    await expect(
      backfillStandup({
        standupId: String(standup._id),
        backfilledBy: String(user),
        now: new Date('2026-09-07T10:00:00.000Z')
      })
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })

    const reloaded = await Standup.findById(standup._id).lean()
    expect(reloaded!.status).toBe('Missed')
    expect(reloaded!.wasBackfilled).toBe(false)
    expect(reloaded!.backfilledAt).toBeUndefined()
    expect(await StandupSummary.countDocuments({ standup: standup._id })).toBe(0)
  })

  it('refuses to backfill a standup that is not Missed', async () => {
    await seedSprint('2026-08-25', '2026-09-10')
    const standup = await seedMissedStandup('2026-09-01', { status: 'In_Progress' })

    await expect(
      backfillStandup({
        standupId: String(standup._id),
        backfilledBy: String(user),
        now: new Date('2026-09-02T10:00:00.000Z')
      })
    ).rejects.toMatchObject({ code: 'STANDUP_NOT_STARTABLE' })

    const reloaded = await Standup.findById(standup._id).lean()
    expect(reloaded!.status).toBe('In_Progress')
    expect(reloaded!.wasBackfilled).toBe(false)
  })

  /**
   * A Missed stand-up with NO attendance — the state every genuinely missed
   * day is in, and the one the fixture above deliberately avoids. Neither
   * `setAttendance` (MUTABLE_STATUSES excludes `Missed`) nor `reopen`
   * (admits only `Completed`) can record attendance on it, so backfill is
   * the only entry point that can satisfy CC-7 here.
   */
  async function seedUnrecordedMissedStandup(standupDate: string) {
    return seedMissedStandup(standupDate, { attendance: [] })
  }

  it('backfills a missed standup whose attendance was never recorded', async () => {
    await seedSprint('2026-08-25', '2026-09-10')
    await ProjectStandupSettings.create({
      project,
      organization,
      backfillWindowWorkingDays: 2
    })
    const standup = await seedUnrecordedMissedStandup('2026-09-01')

    const result = await backfillStandup({
      standupId: String(standup._id),
      backfilledBy: String(user),
      attendance: [{ memberId: String(member), state: 'absent_planned' }],
      now: new Date('2026-09-02T10:00:00.000Z')
    })

    expect(result.standup.status).toBe('Completed')
    expect(result.standup.wasBackfilled).toBe(true)

    const reloaded = await Standup.findById(standup._id).lean()
    expect(reloaded!.attendance).toEqual([
      expect.objectContaining({ user: member, state: 'absent_planned' })
    ])

    // The saga really ran against the just-written room.
    expect(await StandupSummary.countDocuments({ standup: standup._id })).toBe(1)
  })

  it('detaches a backfilled absentee\u2019s allocations, same as the live path (RUN-7)', async () => {
    // Two of the dialog's three options are absent states, so this is the
    // common path. `setAttendance` runs `detachAllocations` for any absent
    // state; a backfilled absence that skipped it left the member's work
    // attached and counting toward a capacity the record says they did not
    // have, and the saga's freeze step then froze that.
    await seedSprint('2026-08-25', '2026-09-10')
    const standup = await seedUnrecordedMissedStandup('2026-09-01')

    const { Task } = await import('@/models/Task')
    const task = await Task.create({
      title: 'Absentee task',
      organization,
      project,
      sprint: sprintId,
      createdBy: user,
      taskNumber: 9102,
      displayId: 'KAN-9102',
      status: 'in_progress',
      remainingEstimateMinutes: 60,
      originalEstimateMinutes: 60,
      assignedTo: [{ user: member }]
    })
    const allocation = await Allocation.create({
      standup: standup._id,
      sprint: sprintId,
      project,
      organization,
      member,
      task: task._id,
      plannedMinutes: 60,
      source: 'assigned_in_standup',
      excludedFromCapacity: false,
      createdBy: user
    })

    await backfillStandup({
      standupId: String(standup._id),
      backfilledBy: String(user),
      attendance: [{ memberId: String(member), state: 'absent_planned' }],
      now: new Date('2026-09-02T10:00:00.000Z')
    })

    const reloaded = await Allocation.findById(allocation._id).lean()
    expect(reloaded!.detachedReason).toBe('owner_absent')
    expect(reloaded!.excludedFromCapacity).toBe(true)
    // The saga still ran, and froze the corrected state rather than the wrong one.
    expect(reloaded!.frozenAt).toBeTruthy()
  })

  it('detaches on a retry, when an earlier attempt wrote the absence and died', async () => {
    // The state a half-finished backfill leaves behind: the absence row is
    // recorded, but its allocations were never detached. The merge correctly
    // refuses to rewrite that row, so a detach keyed on "rows this call wrote"
    // would do nothing and the saga would freeze the undetached state —
    // permanently, since nothing else revisits it. Keying off the *stored*
    // state makes the step idempotent; `detachAllocations` filters on
    // `detachedReason: { $exists: false }`, so a re-run is a no-op.
    await seedSprint('2026-08-25', '2026-09-10')
    const standup = await seedMissedStandup('2026-09-01')

    const { Task } = await import('@/models/Task')
    const task = await Task.create({
      title: 'Stranded by a half-finished backfill',
      organization,
      project,
      sprint: sprintId,
      createdBy: user,
      taskNumber: 9103,
      displayId: 'KAN-9103',
      status: 'in_progress',
      remainingEstimateMinutes: 60,
      originalEstimateMinutes: 60,
      assignedTo: [{ user: member }]
    })
    const allocation = await Allocation.create({
      standup: standup._id,
      sprint: sprintId,
      project,
      organization,
      member,
      task: task._id,
      plannedMinutes: 60,
      source: 'assigned_in_standup',
      excludedFromCapacity: false,
      createdBy: user
    })

    await backfillStandup({
      standupId: String(standup._id),
      backfilledBy: String(user),
      attendance: [{ memberId: String(member), state: 'absent_planned' }],
      now: new Date('2026-09-02T10:00:00.000Z')
    })

    const reloaded = await Allocation.findById(allocation._id).lean()
    expect(reloaded!.detachedReason).toBe('owner_absent')
    expect(reloaded!.excludedFromCapacity).toBe(true)

    // The row itself is still the one the earlier attempt wrote — the retry
    // detached its work without rewriting the claim.
    const storedStandup = await Standup.findById(standup._id).lean()
    expect(storedStandup!.attendance).toEqual([
      expect.objectContaining({ user: member, state: 'absent_planned' })
    ])

    // And the audit says so: not reported as newly written, but the detach it
    // performed is on the record.
    const { ActivityLog } = await import('@/models/ActivityLog')
    const entry = (await ActivityLog.findOne({
      action: 'standup_backfilled',
      entityId: String(standup._id)
    }).lean()) as any
    expect(entry.details.after.attendance).toEqual([])
    expect(entry.details.after.detachedForAlreadyRecorded).toEqual([
      expect.objectContaining({
        memberId: String(member),
        state: 'absent_planned',
        detachedAllocationIds: [String(allocation._id)]
      })
    ])
  })

  it('records the attendance it wrote in the backfill audit entry (SEC-3)', async () => {
    await seedSprint('2026-08-25', '2026-09-10')
    const standup = await seedUnrecordedMissedStandup('2026-09-01')

    await backfillStandup({
      standupId: String(standup._id),
      backfilledBy: String(user),
      attendance: [{ memberId: String(member), state: 'absent_planned' }],
      now: new Date('2026-09-02T10:00:00.000Z')
    })

    const { ActivityLog } = await import('@/models/ActivityLog')
    const entry = (await ActivityLog.findOne({
      action: 'standup_backfilled',
      entityId: String(standup._id)
    }).lean()) as any

    expect(entry).toBeTruthy()
    expect(entry.details.after.attendance).toEqual([
      expect.objectContaining({ memberId: String(member), state: 'absent_planned' })
    ])
  })

  it('refuses an attendance payload naming somebody who was not expected', async () => {
    await seedSprint('2026-08-25', '2026-09-10')
    const standup = await seedUnrecordedMissedStandup('2026-09-01')

    await expect(
      backfillStandup({
        standupId: String(standup._id),
        backfilledBy: String(user),
        attendance: [{ memberId: String(new mongoose.Types.ObjectId()), state: 'present' }],
        now: new Date('2026-09-02T10:00:00.000Z')
      })
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })

    const reloaded = await Standup.findById(standup._id).lean()
    expect(reloaded!.status).toBe('Missed')
    expect(reloaded!.attendance).toEqual([])
  })

  it('leaves an already-recorded attendance row untouched rather than rewriting it', async () => {
    // The fixture already records `member` as absent_planned; a payload that
    // claims otherwise must not overwrite it (start-service's merge rule).
    await seedSprint('2026-08-25', '2026-09-10')
    const standup = await seedMissedStandup('2026-09-01')

    await backfillStandup({
      standupId: String(standup._id),
      backfilledBy: String(user),
      attendance: [{ memberId: String(member), state: 'present' }],
      now: new Date('2026-09-02T10:00:00.000Z')
    })

    const reloaded = await Standup.findById(standup._id).lean()
    expect(reloaded!.attendance).toEqual([
      expect.objectContaining({ user: member, state: 'absent_planned' })
    ])
  })

  // Pins: the existing backfill path must keep working once the service
  // starts accepting an attendance payload.

  it('still stamps wasBackfilled and backfilledAt for an already-passable standup', async () => {
    await seedSprint('2026-08-25', '2026-09-10')
    await ProjectStandupSettings.create({
      project,
      organization,
      backfillWindowWorkingDays: 2
    })
    const standup = await seedMissedStandup('2026-09-01')

    const result = await backfillStandup({
      standupId: String(standup._id),
      backfilledBy: String(user),
      now: new Date('2026-09-02T10:00:00.000Z')
    })

    expect(result.standup.status).toBe('Completed')
    expect(result.standup.wasBackfilled).toBe(true)
    expect(result.standup.backfilledAt).toBeInstanceOf(Date)
  })

  // Review Focus 5: an attendance payload must not buy a way past the window.
  it('still refuses a backfill outside the configured window, payload or not', async () => {
    await seedSprint('2026-08-17', '2026-09-11')
    await ProjectStandupSettings.create({
      project,
      organization,
      backfillWindowWorkingDays: 2
    })
    const standup = await seedMissedStandup('2026-08-24')

    await expect(
      backfillStandup({
        standupId: String(standup._id),
        backfilledBy: String(user),
        attendance: [{ memberId: String(member), state: 'present' }],
        now: new Date('2026-09-07T10:00:00.000Z')
      })
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })

    const reloaded = await Standup.findById(standup._id).lean()
    expect(reloaded!.status).toBe('Missed')
    expect(reloaded!.wasBackfilled).toBe(false)
    expect(reloaded!.backfilledAt).toBeUndefined()
    expect(await StandupSummary.countDocuments({ standup: standup._id })).toBe(0)
  })

  /**
   * Ruling 21's pin, and the one that matters most.
   *
   * A missed day had nothing allocated, so CC-1 — hard, overridable — fails
   * for every member the facilitator records as `present`. Backfill must not
   * quietly wave that through: this is the exact gate Task 8 closed (a
   * stand-up completing with nobody allocated and every check green), and
   * the override path added for Ruling 21 must stay opt-in. Omitting the
   * acknowledgement must still refuse, naming CC-1.
   *
   * Note the other fixtures all record their one member `absent_planned`,
   * whose capacity reads `unavailable` and which CC-1 therefore exempts —
   * which is why this failure was invisible to every existing test and only
   * surfaced in the browser.
   */
  it('still fails on CC-1 when a present member is unplanned and nothing is acknowledged', async () => {
    await seedSprint('2026-08-25', '2026-09-10')
    await ProjectStandupSettings.create({
      project,
      organization,
      backfillWindowWorkingDays: 2
    })
    const standup = await seedUnrecordedMissedStandup('2026-09-01')

    const error = await backfillStandup({
      standupId: String(standup._id),
      backfilledBy: String(user),
      attendance: [{ memberId: String(member), state: 'present' }],
      now: new Date('2026-09-02T10:00:00.000Z')
    }).catch((caught) => caught)

    expect(error).toMatchObject({ code: 'COMPLETION_CHECKS_FAILED' })
    expect(error.details.failingChecks).toEqual([
      expect.objectContaining({
        checkId: 'CC-1',
        hard: true,
        overridable: true,
        entities: [expect.objectContaining({ memberId: String(member) })]
      })
    ])

    // Nothing completed, and no override invented on the facilitator's behalf.
    const reloaded = await Standup.findById(standup._id).lean()
    expect(reloaded!.status).toBe('Missed')
    expect(reloaded!.wasBackfilled).toBe(false)
    const { StandupOverride } = await import('@/models/StandupOverride')
    expect(await StandupOverride.countDocuments({ standup: standup._id })).toBe(0)
  })

  /**
   * Ruling 21, the defect itself. CC-1 can never pass on a missed day — you
   * cannot plan work retroactively — so the live path's own answer is reused:
   * the facilitator acknowledges the failing overridable check with a
   * justification, the service issues a real `under_allocation` override, and
   * the saga's existing `filterOverriddenFailures` lifts the block. The
   * overridden check stays a recorded fact rather than a silent exemption.
   */
  const ACKNOWLEDGEMENT = 'Nobody planned the day because the stand-up was missed entirely.'

  it('completes a missed day whose CC-1 failure the facilitator acknowledged', async () => {
    await seedSprint('2026-08-25', '2026-09-10')
    await ProjectStandupSettings.create({
      project,
      organization,
      backfillWindowWorkingDays: 2
    })
    const standup = await seedUnrecordedMissedStandup('2026-09-01')

    const result = await backfillStandup({
      standupId: String(standup._id),
      backfilledBy: String(user),
      attendance: [{ memberId: String(member), state: 'present' }],
      acknowledgedChecks: [{ checkId: 'CC-1', justification: ACKNOWLEDGEMENT }],
      now: new Date('2026-09-02T10:00:00.000Z')
    })

    expect(result.standup.status).toBe('Completed')
    expect(result.standup.wasBackfilled).toBe(true)
    expect(await StandupSummary.countDocuments({ standup: standup._id })).toBe(1)

    const { StandupOverride } = await import('@/models/StandupOverride')
    const overrides = await StandupOverride.find({ standup: standup._id }).lean()
    expect(overrides).toEqual([
      expect.objectContaining({
        type: 'under_allocation',
        justification: ACKNOWLEDGEMENT,
        issuedBy: user
      })
    ])
    // The override names the members CC-1 actually flagged, not everybody.
    expect(overrides[0].affectedMemberIds.map(String)).toEqual([String(member)])
    expect(overrides[0].gapMinutes).toBeGreaterThan(0)
  })

  it('refuses an acknowledgement whose justification is too thin (OVR-5)', async () => {
    await seedSprint('2026-08-25', '2026-09-10')
    const standup = await seedUnrecordedMissedStandup('2026-09-01')

    await expect(
      backfillStandup({
        standupId: String(standup._id),
        backfilledBy: String(user),
        attendance: [{ memberId: String(member), state: 'present' }],
        acknowledgedChecks: [{ checkId: 'CC-1', justification: 'n/a' }],
        now: new Date('2026-09-02T10:00:00.000Z')
      })
    ).rejects.toMatchObject({ code: 'INVALID_JUSTIFICATION' })

    const reloaded = await Standup.findById(standup._id).lean()
    expect(reloaded!.status).toBe('Missed')
    const { StandupOverride } = await import('@/models/StandupOverride')
    expect(await StandupOverride.countDocuments({ standup: standup._id })).toBe(0)
  })

  it('refuses to acknowledge a check that can never be overridden (OVR-2)', async () => {
    // CC-7 is hard and NOT overridable. Accepting an acknowledgement for it
    // would be the silent exemption this whole design exists to avoid, so the
    // service refuses the payload outright rather than ignoring the field.
    await seedSprint('2026-08-25', '2026-09-10')
    const standup = await seedUnrecordedMissedStandup('2026-09-01')

    await expect(
      backfillStandup({
        standupId: String(standup._id),
        backfilledBy: String(user),
        attendance: [{ memberId: String(member), state: 'present' }],
        acknowledgedChecks: [{ checkId: 'CC-7', justification: ACKNOWLEDGEMENT }],
        now: new Date('2026-09-02T10:00:00.000Z')
      })
    ).rejects.toMatchObject({ code: 'OVERRIDE_NOT_PERMITTED' })

    const reloaded = await Standup.findById(standup._id).lean()
    expect(reloaded!.status).toBe('Missed')
  })

  it('issues no override when the acknowledged check is not actually failing', async () => {
    // The already-passable fixture: CC-1 exempts its `absent_planned` member,
    // so there is nothing to override and nothing should be recorded, even
    // though the payload offers an acknowledgement.
    await seedSprint('2026-08-25', '2026-09-10')
    const standup = await seedMissedStandup('2026-09-01')

    const result = await backfillStandup({
      standupId: String(standup._id),
      backfilledBy: String(user),
      acknowledgedChecks: [{ checkId: 'CC-1', justification: ACKNOWLEDGEMENT }],
      now: new Date('2026-09-02T10:00:00.000Z')
    })

    expect(result.standup.status).toBe('Completed')
    const { StandupOverride } = await import('@/models/StandupOverride')
    expect(await StandupOverride.countDocuments({ standup: standup._id })).toBe(0)
  })

  /**
   * Review round 1, Important 3. On `COMPLETION_CHECKS_FAILED` the dialog stays
   * open without reloading, so a second press re-sends the same
   * acknowledgements. Nothing stopped that writing a second identical
   * `under_allocation` override — and `detectChronicUnderAllocation` counts
   * three per member per sprint with no per-stand-up dedupe, so three presses
   * on one missed day could have raised an N7 chronic-under-allocation flag
   * against a real person. The acknowledgement loop now filters its failures
   * through `filterOverriddenFailures` against the overrides the stand-up
   * already carries, the same way the saga's own gate does.
   */
  it('writes exactly one override when the same acknowledgement is retried', async () => {
    await seedSprint('2026-08-25', '2026-09-10')
    const standup = await seedUnrecordedMissedStandup('2026-09-01')
    const { StandupOverride } = await import('@/models/StandupOverride')

    const attempt = () =>
      backfillStandup({
        standupId: String(standup._id),
        backfilledBy: String(user),
        attendance: [{ memberId: String(member), state: 'present' }],
        acknowledgedChecks: [{ checkId: 'CC-1', justification: ACKNOWLEDGEMENT }],
        now: new Date('2026-09-02T10:00:00.000Z')
      })

    await attempt()
    expect(await StandupOverride.countDocuments({ standup: standup._id })).toBe(1)

    // The stand-up is Completed now, so the retry is refused for that reason —
    // the point is that it issues no second override on the way to refusing.
    await expect(attempt()).rejects.toMatchObject({ code: 'STANDUP_NOT_STARTABLE' })
    expect(await StandupOverride.countDocuments({ standup: standup._id })).toBe(1)
  })

  it('issues no second override when a retry re-sends an acknowledgement already covered', async () => {
    // The same idempotency, reached from the state a half-finished attempt
    // actually leaves: the override is already on record but the stand-up is
    // still Missed, which is exactly what the dialog's open-and-press-again
    // path produces when a later check fails the saga.
    await seedSprint('2026-08-25', '2026-09-10')
    const standup = await seedUnrecordedMissedStandup('2026-09-01')
    const { StandupOverride } = await import('@/models/StandupOverride')
    const { issueOverride } = await import('../override-service')

    const first = await issueOverride({
      standupId: String(standup._id),
      sprintId: String(sprintId),
      projectId: String(project),
      organizationId: String(organization),
      type: 'under_allocation',
      affectedMemberIds: [String(member)],
      reasonCode: 'other',
      justification: ACKNOWLEDGEMENT,
      issuedBy: String(user),
      adminRecipientIds: []
    })

    const result = await backfillStandup({
      standupId: String(standup._id),
      backfilledBy: String(user),
      attendance: [{ memberId: String(member), state: 'present' }],
      acknowledgedChecks: [{ checkId: 'CC-1', justification: ACKNOWLEDGEMENT }],
      now: new Date('2026-09-02T10:00:00.000Z')
    })

    expect(result.standup.status).toBe('Completed')
    const overrides = await StandupOverride.find({ standup: standup._id }).lean()
    expect(overrides).toHaveLength(1)
    expect(String(overrides[0]._id)).toBe(String(first._id))
  })

  /**
   * Review round 1, Important 1/2 and the bundled Minor. CC-6 needs OVR-6's
   * member tick and CC-3 needs OVR-7's one-task deferral, neither of which a
   * backfill can supply, so both are refused — and refused *before* anything is
   * written, because a refusal after `applyBackfillAttendance` left a `Missed`
   * stand-up with attendance persisted and allocations detached for a call that
   * then 422d.
   */
  it.each([['CC-6'], ['CC-3'], ['CC-7']])(
    'refuses an acknowledgement of %s before writing any attendance',
    async (checkId) => {
      await seedSprint('2026-08-25', '2026-09-10')
      const standup = await seedUnrecordedMissedStandup('2026-09-01')

      await expect(
        backfillStandup({
          standupId: String(standup._id),
          backfilledBy: String(user),
          attendance: [{ memberId: String(member), state: 'absent_planned' }],
          acknowledgedChecks: [{ checkId, justification: ACKNOWLEDGEMENT }],
          now: new Date('2026-09-02T10:00:00.000Z')
        })
      ).rejects.toMatchObject({ code: 'OVERRIDE_NOT_PERMITTED' })

      const reloaded = await Standup.findById(standup._id).lean()
      expect(reloaded!.status).toBe('Missed')
      // The whole point of the hoist: no half-applied backfill left behind.
      expect(reloaded!.attendance).toEqual([])
      const { StandupOverride } = await import('@/models/StandupOverride')
      expect(await StandupOverride.countDocuments({ standup: standup._id })).toBe(0)
      const { CarryForwardItem } = await import('@/models/CarryForwardItem')
      expect(await CarryForwardItem.countDocuments({ standup: standup._id })).toBe(0)
    }
  )

  it('404s on a nonexistent standup', async () => {
    await expect(
      backfillStandup({
        standupId: new mongoose.Types.ObjectId().toString(),
        backfilledBy: String(user)
      })
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
})
