/**
 * Attendance and RUN-7 detachment (Phase 7, Task 6) — the phase's highest risk.
 *
 * RUN-7 says marking a member absent must move their allocations into the
 * carry-forward register with the tag `owner_absent`. The register is Phase 9,
 * so plan §6.4 OB-13 splits the requirement: **Phase 7 detaches, Phase 9
 * sweeps.** Detaching means `excludedFromCapacity` plus
 * `detachedReason: 'owner_absent'` on every one of that member's rows, followed
 * by the reassign prompt.
 *
 * The failure this guards against is specific and quiet. `allocationStatus`
 * decides `unavailable` from `effectiveMinutes` *before* it looks at what is
 * allocated, so six hours parked on somebody who is not here render as the same
 * calm slate chip as an empty day. `strandedMinutes` (built in Phase 6, ahead
 * of its phase) is what makes the difference visible, and E22 below is the test
 * that proves the whole loop closes: allocate, absent, detach, prompt,
 * reassign, stranded back to zero.
 */
import { Allocation } from '@/models/Allocation'
import { ActivityLog } from '@/models/ActivityLog'
import { MemberCapacity } from '@/models/MemberCapacity'
import { ProjectStandupSettings } from '@/models/ProjectStandupSettings'
import { Sprint } from '@/models/Sprint'
import { Standup } from '@/models/Standup'
import { Task } from '@/models/Task'
import { WorkingCalendar } from '@/models/WorkingCalendar'

import { createAllocation, loadAllocationBoard } from '../allocation-service'
import { reassignDetached, setAttendance } from '../attendance-service'
import { minutes } from '../minutes'
import { ids, syncIndexes, useMongo } from './helpers/mongo'

const { organization, project, sprint, member, otherMember, user } = ids

const TIMEZONE = 'Asia/Colombo'
const DAY = '2026-08-17'
/** Eight hours less the stand-up's own fifteen minutes (DN-1/DN-3). */
const EFFECTIVE = 465

const actor = { userId: String(user) }

let standupId: string
let taskA: string
let taskB: string

async function seed() {
  await WorkingCalendar.create({
    scope: 'project',
    organization,
    project,
    workingDaysOfWeek: [1, 2, 3, 4, 5],
    standardMinutesPerDay: 480,
    timezone: TIMEZONE,
    subscribedHolidaySets: [],
    overrides: []
  })

  await ProjectStandupSettings.create({
    project,
    organization,
    enabled: true,
    standupLocalTime: '09:00',
    durationMinutes: 15,
    defaultFacilitator: user
  })

  for (const who of [member, otherMember]) {
    await MemberCapacity.create({
      project,
      member: who,
      dailyCapacityMinutes: 480,
      effectiveFrom: '2026-01-01',
      isActive: true
    })
  }

  await Sprint.create({
    _id: sprint,
    name: 'Sprint 21',
    organization,
    project,
    createdBy: user,
    status: 'active',
    startDate: new Date('2026-08-17T00:00:00.000Z'),
    endDate: new Date('2026-08-21T00:00:00.000Z'),
    capacity: 0,
    teamMembers: [member, otherMember]
  })

  const standup = await Standup.create({
    project,
    sprint,
    organization,
    standupDate: DAY,
    scheduledStartAt: new Date('2026-08-17T03:30:00.000Z'),
    durationMinutes: 15,
    sprintDayNumber: 2,
    totalSprintDays: 5,
    shape: 'mid_sprint',
    status: 'In_Progress',
    facilitator: user,
    expectedAttendees: [member, otherMember],
    version: 0
  })
  standupId = String(standup._id)

  taskA = await makeTask(277, 'Reconciliation', 240)
  taskB = await makeTask(278, 'Statement import', 240)
}

async function makeTask(taskNumber: number, title: string, remaining: number) {
  const task = await Task.create({
    title,
    organization,
    project,
    sprint,
    createdBy: user,
    taskNumber,
    displayId: `KAN-${taskNumber}`,
    status: 'in_progress',
    remainingEstimateMinutes: remaining,
    originalEstimateMinutes: remaining,
    assignedTo: [{ user: member }]
  })
  return String(task._id)
}

/** Six hours across two tasks — E22's setup. */
async function allocateSixHours() {
  const first = await createAllocation({
    standupId,
    memberId: String(member),
    taskId: taskA,
    plannedMinutes: minutes(180),
    expectedVersion: 0,
    actor
  })
  const second = await createAllocation({
    standupId,
    memberId: String(member),
    taskId: taskB,
    plannedMinutes: minutes(180),
    expectedVersion: first.standupVersion,
    actor
  })
  return second.standupVersion
}

describe('setAttendance', () => {
  useMongo()

  beforeEach(async () => {
    await syncIndexes(Allocation)
    await seed()
  })

  describe('E22 — allocate six hours, then mark the member absent', () => {
    it('detaches every allocation, raises the prompt, and clears stranded once answered', async () => {
      const version = await allocateSixHours()

      const absent = await setAttendance({
        standupId,
        memberId: String(member),
        state: 'absent_planned',
        expectedVersion: version,
        actor
      })

      // 1. Every row is detached — excluded from capacity and tagged, not deleted,
      //    because Phase 9 sweeps these into the register.
      const rows = await Allocation.find({ standup: standupId, member }).lean()
      expect(rows).toHaveLength(2)
      for (const row of rows) {
        expect(row.detachedReason).toBe('owner_absent')
        expect(row.excludedFromCapacity).toBe(true)
      }

      // 2. The prompt names both open tasks.
      expect(absent.reassignPrompt).not.toBeNull()
      expect(absent.reassignPrompt!.taskCount).toBe(2)
      expect(absent.reassignPrompt!.memberId).toBe(String(member))
      expect(absent.reassignPrompt!.tasks.map((t) => t.key).sort()).toEqual([
        'KAN-277',
        'KAN-278'
      ])

      // 3. Between the absence and the reassignment the hours are stranded, and
      //    the board must show that rather than a calm "unavailable" chip.
      expect(absent.capacity.effectiveMinutes).toBe(0)
      expect(absent.capacity.strandedMinutes).toBe(360)
      expect(absent.capacity.status).toBe('unavailable')

      // 4. Answering the prompt moves the work to somebody who is here.
      const reassigned = await reassignDetached({
        standupId,
        fromMemberId: String(member),
        toMemberId: String(otherMember),
        expectedVersion: absent.standupVersion,
        actor
      })

      expect(reassigned.moved).toBe(2)
      expect(reassigned.fromCapacity.strandedMinutes).toBe(0)
      expect(reassigned.toCapacity.allocatedMinutes).toBe(360)
    })
  })

  describe('the stranded window', () => {
    it('is zero before the absence and zero after the reassignment', async () => {
      const version = await allocateSixHours()

      const before = await loadAllocationBoard(standupId)
      expect(memberOf(before, String(member)).capacity.strandedMinutes).toBe(0)

      const absent = await setAttendance({
        standupId,
        memberId: String(member),
        state: 'absent_unplanned',
        reason: 'Called away',
        expectedVersion: version,
        actor
      })

      await reassignDetached({
        standupId,
        fromMemberId: String(member),
        toMemberId: String(otherMember),
        expectedVersion: absent.standupVersion,
        actor
      })

      const after = await loadAllocationBoard(standupId)
      expect(memberOf(after, String(member)).capacity.strandedMinutes).toBe(0)
    })
  })

  describe('reverting an absence entered by mistake', () => {
    it('re-attaches rows that were never reassigned', async () => {
      const version = await allocateSixHours()

      const absent = await setAttendance({
        standupId,
        memberId: String(member),
        state: 'absent_planned',
        expectedVersion: version,
        actor
      })

      const back = await setAttendance({
        standupId,
        memberId: String(member),
        state: 'present',
        expectedVersion: absent.standupVersion,
        actor
      })

      const rows = await Allocation.find({ standup: standupId, member }).lean()
      for (const row of rows) {
        expect(row.detachedReason).toBeUndefined()
        expect(row.excludedFromCapacity).toBe(false)
      }

      expect(back.reattached).toBe(2)
      expect(back.capacity.allocatedMinutes).toBe(360)
      expect(back.capacity.strandedMinutes).toBe(0)
      expect(back.capacity.effectiveMinutes).toBe(EFFECTIVE)
    })

    it('does not resurrect a row that was already reassigned to somebody else', async () => {
      const version = await allocateSixHours()

      const absent = await setAttendance({
        standupId,
        memberId: String(member),
        state: 'absent_planned',
        expectedVersion: version,
        actor
      })
      const reassigned = await reassignDetached({
        standupId,
        fromMemberId: String(member),
        toMemberId: String(otherMember),
        expectedVersion: absent.standupVersion,
        actor
      })

      const back = await setAttendance({
        standupId,
        memberId: String(member),
        state: 'present',
        expectedVersion: reassigned.standupVersion,
        actor
      })

      // The work is Amal's now. Re-attaching it would double-allocate both
      // people onto the same task and trip CC-10 at completion.
      expect(back.reattached).toBe(0)
      expect(back.capacity.allocatedMinutes).toBe(0)
      const board = await loadAllocationBoard(standupId)
      expect(memberOf(board, String(otherMember)).capacity.allocatedMinutes).toBe(360)
    })
  })

  describe('a detached row is invisible to capacity and visible in the pool', () => {
    it('returns its task to the pool so the reassign prompt is actionable', async () => {
      const version = await allocateSixHours()

      await setAttendance({
        standupId,
        memberId: String(member),
        state: 'absent_planned',
        expectedVersion: version,
        actor
      })

      const board = await loadAllocationBoard(standupId)

      expect(memberOf(board, String(member)).capacity.allocatedMinutes).toBe(0)
      expect(board.pool.assignedNotPlanned.map((t) => t.key).sort()).toEqual([
        'KAN-277',
        'KAN-278'
      ])
    })
  })

  describe('partial attendance (RUN-6)', () => {
    it('sets capacity to the entered minutes rather than zero', async () => {
      const result = await setAttendance({
        standupId,
        memberId: String(member),
        state: 'partial',
        partialMinutes: minutes(240),
        expectedVersion: 0,
        actor
      })

      // Four hours available, less the stand-up's own fifteen minutes.
      //
      // RUN-7 reads "or to the entered partial hours", which taken literally
      // would give 240. It predates Phase 6's ceremony deduction, and exempting
      // a partial-day member would mean their stand-up is free while everybody
      // else's costs them fifteen minutes — the same meeting priced two
      // different ways depending on attendance state. They are at the stand-up;
      // it comes out of the hours they have.
      expect(result.capacity.effectiveMinutes).toBe(225)
      expect(result.detached).toEqual([])
      expect(result.reassignPrompt).toBeNull()
    })

    it('requires the minutes', async () => {
      await expect(
        setAttendance({
          standupId,
          memberId: String(member),
          state: 'partial',
          expectedVersion: 0,
          actor
        })
      ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
    })

    it('refuses minutes at or above the member’s whole day', async () => {
      await expect(
        setAttendance({
          standupId,
          memberId: String(member),
          state: 'partial',
          partialMinutes: minutes(480),
          expectedVersion: 0,
          actor
        })
      ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
    })

    it('refuses zero minutes — that is an absence, and should be recorded as one', async () => {
      await expect(
        setAttendance({
          standupId,
          memberId: String(member),
          state: 'partial',
          partialMinutes: 0,
          expectedVersion: 0,
          actor
        } as any)
      ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
    })

    it('does not detach anything — a partial day still has hours in it', async () => {
      const version = await allocateSixHours()

      const result = await setAttendance({
        standupId,
        memberId: String(member),
        state: 'partial',
        partialMinutes: minutes(240),
        expectedVersion: version,
        actor
      })

      // Over-allocated, loudly, which is the correct answer: the PM must decide
      // what to cut. Silently detaching would make that decision for them.
      expect(result.capacity.allocatedMinutes).toBe(360)
      expect(result.capacity.status).toBe('over')
      expect(result.capacity.strandedMinutes).toBe(0)
    })
  })

  describe('recording', () => {
    it('stores the state, the reason and the partial minutes on the stand-up', async () => {
      await setAttendance({
        standupId,
        memberId: String(member),
        state: 'absent_unplanned',
        reason: 'Sick',
        expectedVersion: 0,
        actor
      })

      const standup = (await Standup.findById(standupId).lean()) as any
      const entry = standup.attendance.find((a: any) => String(a.user) === String(member))
      expect(entry.state).toBe('absent_unplanned')
      expect(entry.reason).toBe('Sick')
    })

    it('replaces rather than duplicates when attendance is set twice', async () => {
      const first = await setAttendance({
        standupId,
        memberId: String(member),
        state: 'absent_planned',
        expectedVersion: 0,
        actor
      })
      await setAttendance({
        standupId,
        memberId: String(member),
        state: 'present',
        expectedVersion: first.standupVersion,
        actor
      })

      const standup = (await Standup.findById(standupId).lean()) as any
      expect(standup.attendance).toHaveLength(1)
      expect(standup.attendance[0].state).toBe('present')
    })

    it('audits every transition, both directions', async () => {
      const first = await setAttendance({
        standupId,
        memberId: String(member),
        state: 'absent_planned',
        expectedVersion: 0,
        actor
      })
      await setAttendance({
        standupId,
        memberId: String(member),
        state: 'present',
        expectedVersion: first.standupVersion,
        actor
      })

      const entries = await ActivityLog.find({ action: 'standup_attendance_set' })
        .sort({ createdAt: 1 })
        .lean()
      expect(entries).toHaveLength(2)
      expect((entries[0] as any).details.after).toMatchObject({ state: 'absent_planned' })
      expect((entries[1] as any).details.after).toMatchObject({ state: 'present' })
    })

    it('bumps the version so a second PM must re-read (RUN-23)', async () => {
      const result = await setAttendance({
        standupId,
        memberId: String(member),
        state: 'present',
        expectedVersion: 0,
        actor
      })

      expect(result.standupVersion).toBe(1)
    })

    it('refuses a stale version', async () => {
      await setAttendance({
        standupId,
        memberId: String(member),
        state: 'present',
        expectedVersion: 0,
        actor
      })

      await expect(
        setAttendance({
          standupId,
          memberId: String(member),
          state: 'absent_planned',
          expectedVersion: 0,
          actor
        })
      ).rejects.toMatchObject({ code: 'STALE_STANDUP' })
    })

    it('refuses somebody who is not expected at this stand-up', async () => {
      await expect(
        setAttendance({
          standupId,
          memberId: String(ids.otherProject),
          state: 'present',
          expectedVersion: 0,
          actor
        })
      ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
    })
  })

  describe('the prompt', () => {
    it('is not raised for an absent member with nothing allocated', async () => {
      const result = await setAttendance({
        standupId,
        memberId: String(member),
        state: 'absent_planned',
        expectedVersion: 0,
        actor
      })

      expect(result.reassignPrompt).toBeNull()
      expect(result.detached).toEqual([])
    })
  })
})

describe('reassignDetached', () => {
  useMongo()

  beforeEach(async () => {
    await syncIndexes(Allocation)
    await seed()
  })

  it('refuses to reassign onto a member who is themselves unavailable', async () => {
    const version = await allocateSixHours()

    const absentFirst = await setAttendance({
      standupId,
      memberId: String(member),
      state: 'absent_planned',
      expectedVersion: version,
      actor
    })
    const absentSecond = await setAttendance({
      standupId,
      memberId: String(otherMember),
      state: 'absent_planned',
      expectedVersion: absentFirst.standupVersion,
      actor
    })

    await expect(
      reassignDetached({
        standupId,
        fromMemberId: String(member),
        toMemberId: String(otherMember),
        expectedVersion: absentSecond.standupVersion,
        actor
      })
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
  })

  it('moves nothing and reports zero when there is nothing detached', async () => {
    const result = await reassignDetached({
      standupId,
      fromMemberId: String(member),
      toMemberId: String(otherMember),
      expectedVersion: 0,
      actor
    })

    expect(result.moved).toBe(0)
  })

  it('marks the new rows as assigned in the stand-up, not as carried work', async () => {
    const version = await allocateSixHours()
    const absent = await setAttendance({
      standupId,
      memberId: String(member),
      state: 'absent_planned',
      expectedVersion: version,
      actor
    })

    await reassignDetached({
      standupId,
      fromMemberId: String(member),
      toMemberId: String(otherMember),
      expectedVersion: absent.standupVersion,
      actor
    })

    const rows = await Allocation.find({
      standup: standupId,
      member: otherMember
    }).lean()
    expect(rows).toHaveLength(2)
    for (const row of rows) {
      expect(row.source).toBe('assigned_in_standup')
      expect(row.detachedReason).toBeUndefined()
    }
  })

  it('leaves the detached originals in place for Phase 9 to sweep', async () => {
    const version = await allocateSixHours()
    const absent = await setAttendance({
      standupId,
      memberId: String(member),
      state: 'absent_planned',
      expectedVersion: version,
      actor
    })

    await reassignDetached({
      standupId,
      fromMemberId: String(member),
      toMemberId: String(otherMember),
      expectedVersion: absent.standupVersion,
      actor
    })

    const detached = await Allocation.find({
      standup: standupId,
      member,
      detachedReason: 'owner_absent'
    }).lean()

    // RUN-7's second half is Phase 9's: these rows become carry-forward items
    // tagged `owner_absent`. Deleting them here would destroy that evidence.
    expect(detached).toHaveLength(2)
  })
})

function memberOf(board: Awaited<ReturnType<typeof loadAllocationBoard>>, memberId: string) {
  const found = board.members.find((m) => m.memberId === memberId)
  if (!found) throw new Error(`No board entry for ${memberId}`)
  return found
}
