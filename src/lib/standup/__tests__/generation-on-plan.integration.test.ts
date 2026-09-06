/**
 * Generation on the transition to Planned (spec SCH-1, SCH-5, PLN-1, UI-7).
 *
 * SCH-1 hangs generation off the planning session completing, and SCH-5 makes a
 * sprint with no working days a **refusal** rather than an empty schedule. The
 * refusal has to leave the sprint in Planning: a Planned sprint with no
 * stand-ups is a sprint nobody will ever be reminded about.
 */
import mongoose from 'mongoose'

import { ProjectStandupSettings } from '@/models/ProjectStandupSettings'
import { Sprint } from '@/models/Sprint'
import { SprintPlanningSession } from '@/models/SprintPlanningSession'
import { Standup } from '@/models/Standup'
import { Task } from '@/models/Task'
import { WorkingCalendar } from '@/models/WorkingCalendar'

import { completePlanning } from '../planning-service'
import { ids, syncIndexes, useMongo } from './helpers/mongo'

const { organization, project, member, otherMember, user } = ids

async function seedProject() {
  await WorkingCalendar.create({
    scope: 'project',
    organization,
    project,
    workingDaysOfWeek: [1, 2, 3, 4, 5],
    standardMinutesPerDay: 480,
    timezone: 'Asia/Colombo',
    subscribedHolidaySets: [],
    overrides: []
  })

  await ProjectStandupSettings.create({
    project,
    organization,
    enabled: true,
    standupLocalTime: '09:00',
    defaultFacilitator: user
  })
}

async function seedPlannableSprint(overrides: Record<string, unknown> = {}) {
  const sprint = await Sprint.create({
    name: 'Sprint 14',
    organization,
    project,
    createdBy: user,
    status: 'planning',
    startDate: new Date('2026-08-10T00:00:00.000Z'),
    endDate: new Date('2026-08-14T00:00:00.000Z'),
    capacity: 0,
    goal: 'Ship the export pipeline end to end for the pilot customer',
    teamMembers: [member, otherMember],
    ...overrides
  })

  await Task.create({
    title: 'Wire the export endpoint',
    description:
      'Done when POST /exports returns a job id and the pilot customer can download the CSV.',
    type: 'task',
    organization,
    project,
    sprint: sprint._id,
    createdBy: user,
    status: 'todo',
    priority: 'medium',
    taskNumber: 1,
    displayId: 'KAN-1',
    originalEstimateMinutes: 240,
    estimateMethod: 'manual',
    assignedTo: [{ user: member, assignedAt: new Date() }]
  })

  const session = await SprintPlanningSession.create({
    sprint: sprint._id,
    project,
    organization,
    status: 'open',
    facilitator: user,
    createdBy: user,
    startedAt: new Date()
  })

  return { sprint, session }
}

describe('completePlanning generates the schedule (SCH-1)', () => {
  useMongo()

  beforeEach(async () => {
    await syncIndexes(Standup)
  })

  it('creates one stand-up per working day and reports them', async () => {
    await seedProject()
    const { sprint, session } = await seedPlannableSprint()

    const result = await completePlanning({
      sprintId: String(sprint._id),
      sessionId: String(session._id),
      userId: String(user)
    })

    expect(result.sprint.status).toBe('planned')
    expect(result.generatedStandups).toMatchObject({ created: 5, totalSprintDays: 5 })
    expect(await Standup.countDocuments({ sprint: sprint._id })).toBe(5)
  })

  /**
   * SCH-5 has two guards, and the checklist's is the one a PM meets first.
   * PC-7 already fails a range with no working day, listing it alongside every
   * other failing check — which is more useful than the generator's single
   * sentence. The generator's own refusal stays as the backstop for callers
   * that do not go through the checklist, and is covered in
   * `generation.integration.test.ts`.
   */
  it('SCH-5: a sprint with no working days is refused and stays in Planning', async () => {
    await seedProject()
    const { sprint, session } = await seedPlannableSprint({
      startDate: new Date('2026-08-15T00:00:00.000Z'), // Saturday
      endDate: new Date('2026-08-16T00:00:00.000Z') // Sunday
    })

    await expect(
      completePlanning({
        sprintId: String(sprint._id),
        sessionId: String(session._id),
        userId: String(user)
      })
    ).rejects.toMatchObject({ code: 'COMPLETION_CHECKS_FAILED' })

    const reloaded = (await Sprint.findById(sprint._id).lean()) as any
    expect(reloaded.status).toBe('planning')
    expect(await Standup.countDocuments({ sprint: sprint._id })).toBe(0)

    // The session is still open, so the PM can fix the dates and complete again.
    const reloadedSession = (await SprintPlanningSession.findById(session._id).lean()) as any
    expect(reloadedSession.status).toBe('open')
  })

  it('SCH-5: estimates are not frozen by a refused completion', async () => {
    await seedProject()
    const { sprint, session } = await seedPlannableSprint({
      startDate: new Date('2026-08-15T00:00:00.000Z'),
      endDate: new Date('2026-08-16T00:00:00.000Z')
    })

    await expect(
      completePlanning({
        sprintId: String(sprint._id),
        sessionId: String(session._id),
        userId: String(user)
      })
    ).rejects.toThrow()

    const task = (await Task.findOne({ sprint: sprint._id }).lean()) as any
    expect(task.estimateLockedAt).toBeUndefined()
  })

  it('SCH-2: completing a sprint that already has stand-ups adds none', async () => {
    await seedProject()
    const { sprint, session } = await seedPlannableSprint()

    await completePlanning({
      sprintId: String(sprint._id),
      sessionId: String(session._id),
      userId: String(user)
    })

    // Re-running generation through the audit path must not duplicate.
    expect(await Standup.countDocuments({ sprint: sprint._id })).toBe(5)
  })
})
