/**
 * start-service (RUN-2/3, AC-5).
 *
 * Exercises startStandup against a real database, per this repo's rule that
 * at least one test per service writes through the real path rather than a
 * pre-seeded row. The timing/concurrency rule is already unit tested against
 * `assertStartable` in `lifecycle.test.ts`, and the gate rule against
 * `assertPlanningGate` in `planning-gate.test.ts` — these tests confirm
 * `startStandup` actually wires both to a real `Standup` document (status
 * transition, `startedAt`, version bump) and that AC-5 genuinely blocks a
 * sprint that never finished planning.
 */
import { Types } from 'mongoose'

import { Standup } from '@/models/Standup'
import { Sprint } from '@/models/Sprint'
import { Task } from '@/models/Task'
import { ProjectStandupSettings } from '@/models/ProjectStandupSettings'

import { startStandup } from '../start-service'
import { ids, useMongo } from './helpers/mongo'
import { seedPokerCoverage } from './helpers/poker-coverage'

const { organization, project, user } = ids

useMongo()

let taskCounter = 100

/**
 * Seeds a sprint whose checklist is otherwise fully green (goal, one team
 * member, one estimated-and-described task) so the two tests below isolate
 * the *state* gate (`sprintStatus`) from the *checklist* gate — a `planning`
 * sprint is refused on state alone, not because its checklist also happens
 * to be red.
 */
async function seedSprintAndStandup(
  sprintStatus: 'planning' | 'active',
  standupStatus: 'Ready' | 'Scheduled',
  scheduledStartAt: Date = new Date(Date.now() - 60_000),
  roster: { expectedAttendees?: Types.ObjectId[]; attendance?: unknown[] } = {}
) {
  const sprint = await Sprint.create({
    organization,
    project,
    createdBy: user,
    name: 'Sprint 1',
    status: sprintStatus,
    startDate: new Date('2026-08-01'),
    endDate: new Date('2026-08-14'),
    capacity: 320,
    goal: 'Ship the invoicing module end to end for pilot customers.',
    teamMembers: [user]
  })

  taskCounter += 1
  const task = await Task.create({
    organization,
    project,
    sprint: sprint._id,
    createdBy: user,
    title: 'Seed task',
    description: 'Implement the seed task end to end.',
    taskNumber: taskCounter,
    displayId: `KAN-${taskCounter}`,
    status: 'todo',
    priority: 'medium',
    type: 'task',
    originalEstimateMinutes: 240,
    estimateMethod: 'poker',
    // PC-8 wants one owner from the sprint team; PC-9 wants the round that
    // produced the estimate, which it reads from the session queue rather than
    // from `estimateMethod`.
    assignedTo: [{ user }],
    archived: false
  })

  await seedPokerCoverage({
    organization,
    project,
    sprint: sprint._id,
    facilitator: user,
    taskIds: [task._id]
  })

  const standup = await Standup.create({
    project,
    sprint: sprint._id,
    organization,
    standupDate: '2026-08-03',
    scheduledStartAt,
    durationMinutes: 15,
    sprintDayNumber: 1,
    totalSprintDays: 8,
    shape: 'mid_sprint',
    status: standupStatus,
    facilitator: user,
    expectedAttendees: roster.expectedAttendees ?? [],
    attendance: roster.attendance ?? [],
    version: 0
  })

  return { sprint, standup }
}

describe('startStandup (AC-5)', () => {
  it('refuses to start against a sprint that never completed planning', async () => {
    const { standup } = await seedSprintAndStandup('planning', 'Ready')

    await expect(
      startStandup({
        standupId: standup._id.toString(),
        startedBy: user.toString(),
        expectedVersion: 0
      })
    ).rejects.toMatchObject({ code: 'PLANNING_GATE_NOT_PASSED' })

    const reloaded = await Standup.findById(standup._id)
    expect(reloaded!.status).toBe('Ready')
  })

  it('starts a Ready stand-up on a planned/active sprint', async () => {
    const { standup } = await seedSprintAndStandup('active', 'Ready')

    const result = await startStandup({
      standupId: standup._id.toString(),
      startedBy: user.toString(),
      expectedVersion: 0
    })

    expect(result.standup.status).toBe('In_Progress')
    expect(result.standup.startedAt).toBeInstanceOf(Date)
    expect(result.standup.version).toBe(1)
  })

  it('refuses a stale version with STALE_STANDUP', async () => {
    const { standup } = await seedSprintAndStandup('active', 'Ready')

    await expect(
      startStandup({
        standupId: standup._id.toString(),
        startedBy: user.toString(),
        expectedVersion: 99
      })
    ).rejects.toMatchObject({ code: 'STALE_STANDUP' })
  })

  // C1: readyLeadMinutes/timezone must come from the project's real settings,
  // not the hardcoded `0`/`UTC` placeholders that used to refuse every start
  // attempt made during the real lead window.
  describe('a project with a non-default readyLeadMinutes (C1)', () => {
    it('starts a Scheduled stand-up inside its real 30-minute lead window', async () => {
      // scheduledStartAt 20 minutes out, lead window 30 minutes: now is
      // already inside the window, so this must succeed even though the
      // hardcoded readyLeadMinutes: 0 would have refused it.
      const scheduledStartAt = new Date(Date.now() + 20 * 60_000)
      const { sprint, standup } = await seedSprintAndStandup('active', 'Scheduled', scheduledStartAt)

      await ProjectStandupSettings.create({
        project: sprint.project,
        organization,
        readyLeadMinutes: 30
      })

      const result = await startStandup({
        standupId: standup._id.toString(),
        startedBy: user.toString(),
        expectedVersion: 0
      })

      expect(result.standup.status).toBe('In_Progress')
    })

    it('still refuses a Scheduled stand-up before its real 30-minute lead window opens', async () => {
      // scheduledStartAt 40 minutes out, lead window 30 minutes: now is 10
      // minutes before the window opens.
      const scheduledStartAt = new Date(Date.now() + 40 * 60_000)
      const { sprint, standup } = await seedSprintAndStandup('active', 'Scheduled', scheduledStartAt)

      await ProjectStandupSettings.create({
        project: sprint.project,
        organization,
        readyLeadMinutes: 30
      })

      await expect(
        startStandup({
          standupId: standup._id.toString(),
          startedBy: user.toString(),
          expectedVersion: 0
        })
      ).rejects.toMatchObject({ code: 'STANDUP_NOT_STARTABLE' })

      const reloaded = await Standup.findById(standup._id)
      expect(reloaded!.status).toBe('Scheduled')
    })
  })

  describe('attendance on start (RUN-6 / CC-7)', () => {
    const memberA = new Types.ObjectId()
    const memberB = new Types.ObjectId()
    const memberC = new Types.ObjectId()

    // Pinning: existing start behaviour must survive the RUN-6 change.
    it('still flips Scheduled to In_Progress and bumps the version, persisted', async () => {
      const { standup } = await seedSprintAndStandup('active', 'Scheduled', undefined, {
        expectedAttendees: [memberA]
      })

      await startStandup({
        standupId: standup._id.toString(),
        startedBy: user.toString(),
        expectedVersion: 0
      })

      const reloaded = await Standup.findById(standup._id).lean()
      expect(reloaded!.status).toBe('In_Progress')
      expect(reloaded!.version).toBe(1)
    })

    it('never overwrites an existing attendance record, in any state', async () => {
      const { standup } = await seedSprintAndStandup('active', 'Ready', undefined, {
        expectedAttendees: [memberA, memberB],
        attendance: [{ user: memberA, state: 'absent_planned', reason: 'Leave' }]
      })

      await startStandup({
        standupId: standup._id.toString(),
        startedBy: user.toString(),
        expectedVersion: 0
      })

      const reloaded = await Standup.findById(standup._id).lean()
      const a = reloaded!.attendance.filter((e) => String(e.user) === String(memberA))
      expect(a).toHaveLength(1)
      expect(a[0].state).toBe('absent_planned')
      expect(a[0].reason).toBe('Leave')
    })
    // The defect.
    it('persists present for every expected attendee lacking a record', async () => {
      const { standup } = await seedSprintAndStandup('active', 'Ready', undefined, {
        expectedAttendees: [memberA, memberB, memberC]
      })

      await startStandup({
        standupId: standup._id.toString(),
        startedBy: user.toString(),
        expectedVersion: 0
      })

      const reloaded = await Standup.findById(standup._id).lean()
      expect(reloaded!.attendance).toHaveLength(3)
      expect(reloaded!.attendance.every((entry) => entry.state === 'present')).toBe(true)
    })

    it('adds present only for members lacking a record when some already have one', async () => {
      const { standup } = await seedSprintAndStandup('active', 'Ready', undefined, {
        expectedAttendees: [memberA, memberB],
        attendance: [{ user: memberA, state: 'absent_unplanned' }]
      })

      await startStandup({
        standupId: standup._id.toString(),
        startedBy: user.toString(),
        expectedVersion: 0
      })

      const reloaded = await Standup.findById(standup._id).lean()
      const byUser = new Map(reloaded!.attendance.map((e) => [String(e.user), e.state]))
      expect(reloaded!.attendance).toHaveLength(2)
      expect(byUser.get(String(memberA))).toBe('absent_unplanned')
      expect(byUser.get(String(memberB))).toBe('present')
    })
  })
})
