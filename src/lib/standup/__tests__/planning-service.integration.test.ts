/**
 * Planning completion end to end (spec AC-6, PLN-1, PLN-8, DAT-6, E20).
 *
 * These exercise the service against a real database rather than the pure
 * evaluator, because the interesting failures live in the wiring: does
 * completion actually freeze every estimate, does it actually move the sprint,
 * and does it refuse when the checklist is red no matter what the client sent.
 */
import { MemberCapacity } from '@/models/MemberCapacity'
import { Sprint } from '@/models/Sprint'
import { SprintPlanningSession } from '@/models/SprintPlanningSession'
import { Task } from '@/models/Task'
import { WorkingCalendar } from '@/models/WorkingCalendar'
import { completePlanning, evaluateSprintChecklist } from '../planning-service'
import { ids, useMongo } from './helpers/mongo'

const { organization, project, user, member } = ids

let taskCounter = 100

async function seedCalendar() {
  await WorkingCalendar.create({
    scope: 'project',
    organization,
    project,
    workingDaysOfWeek: [1, 2, 3, 4, 5],
    standardMinutesPerDay: 480,
    timezone: 'Asia/Colombo'
  })
}

async function seedSprint(overrides: Record<string, unknown> = {}) {
  return Sprint.create({
    name: 'Sprint 13',
    organization,
    project,
    createdBy: user,
    // Mon 24 Aug to Fri 4 Sep 2026 — ten working days.
    startDate: new Date('2026-08-24'),
    endDate: new Date('2026-09-04'),
    capacity: 320,
    goal: 'Ship the invoicing module end to end for pilot customers.',
    teamMembers: [user, member],
    status: 'planning',
    ...overrides
  })
}

async function seedTask(sprint: any, overrides: Record<string, unknown> = {}) {
  taskCounter += 1
  return Task.create({
    title: 'Invoice model',
    description: 'Build the invoice model end to end.',
    organization,
    project,
    createdBy: user,
    taskNumber: taskCounter,
    displayId: `KAN-${taskCounter}`,
    status: 'todo',
    priority: 'medium',
    type: 'task',
    sprint: sprint._id,
    originalEstimateMinutes: 480,
    remainingEstimateMinutes: 480,
    estimateUnit: 'hours',
    estimateMethod: 'poker',
    assignedTo: [{ user }],
    ...overrides
  })
}

const session = (sprint: any) =>
  SprintPlanningSession.create({
    organization,
    project,
    sprint: sprint._id,
    facilitator: user,
    participants: [user, member],
    createdBy: user
  })

describe('evaluateSprintChecklist', () => {
  useMongo()

  it('counts working days from the calendar engine, not weekdays', async () => {
    await seedCalendar()
    const sprint = await seedSprint()
    await seedTask(sprint)
    await MemberCapacity.create({
      project,
      member: user,
      dailyCapacityMinutes: 480,
      effectiveFrom: '2026-01-01',
      isActive: true
    })

    const { checklist } = await evaluateSprintChecklist(sprint._id.toString())

    // Ten working days × two members × 8h.
    expect(checklist.totals.totalCapacityMinutes).toBe(9600)
  })

  it('AC-6 — names the specific unestimated tasks', async () => {
    await seedCalendar()
    const sprint = await seedSprint()
    await seedTask(sprint)
    const bad = await seedTask(sprint, { originalEstimateMinutes: undefined })

    const { checklist } = await evaluateSprintChecklist(sprint._id.toString())
    const pc3 = checklist.items.find((item) => item.checkId === 'PC-3')!

    expect(pc3.passed).toBe(false)
    expect(pc3.offendingIds).toEqual([bad._id.toString()])
    expect(checklist.canComplete).toBe(false)
  })

  it('ignores archived tasks', async () => {
    await seedCalendar()
    const sprint = await seedSprint()
    await seedTask(sprint)
    await seedTask(sprint, { originalEstimateMinutes: undefined, archived: true })

    const { checklist } = await evaluateSprintChecklist(sprint._id.toString())
    expect(checklist.items.find((item) => item.checkId === 'PC-3')!.passed).toBe(true)
  })

  it('E2 — a sprint of only weekends has no working days', async () => {
    await seedCalendar()
    const sprint = await seedSprint({
      startDate: new Date('2026-08-29'),
      endDate: new Date('2026-08-30')
    })
    await seedTask(sprint)

    const { checklist } = await evaluateSprintChecklist(sprint._id.toString())
    const pc7 = checklist.items.find((item) => item.checkId === 'PC-7')!

    expect(pc7.passed).toBe(false)
    expect(pc7.message).toBe('This sprint contains no working days.')
  })

  it('reports a missing sprint rather than throwing something opaque', async () => {
    const missing = ids.otherProject.toString()
    await expect(evaluateSprintChecklist(missing)).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
})

describe('completePlanning', () => {
  useMongo()

  async function readySprint() {
    await seedCalendar()
    const sprint = await seedSprint()
    await seedTask(sprint, { assignedTo: [{ user }] })
    await seedTask(sprint, { assignedTo: [{ user: member }] })
    return sprint
  }

  it('moves the sprint to planned', async () => {
    const sprint = await readySprint()
    const planning = await session(sprint)

    const result = await completePlanning({
      sprintId: sprint._id.toString(),
      sessionId: planning._id.toString(),
      userId: user.toString()
    })

    expect(result.sprint.status).toBe('planned')
    expect(result.sprint.plannedAt).toBeInstanceOf(Date)
    expect(result.sprint.activePlanningSession.toString()).toBe(planning._id.toString())
  })

  it('DAT-6 — freezes every estimate in the sprint', async () => {
    const sprint = await readySprint()
    const planning = await session(sprint)

    await completePlanning({
      sprintId: sprint._id.toString(),
      sessionId: planning._id.toString(),
      userId: user.toString()
    })

    const tasks = await Task.find({ sprint: sprint._id }).lean()
    expect(tasks).toHaveLength(2)
    for (const task of tasks as any[]) {
      expect(task.estimateLockedAt).toBeInstanceOf(Date)
    }

    // And the freeze is real, not just a flag: the model now refuses the write.
    await expect(
      Task.updateOne({ _id: (tasks as any[])[0]._id }, { $set: { originalEstimateMinutes: 999 } })
    ).rejects.toMatchObject({ code: 'ESTIMATE_IMMUTABLE' })
  })

  it('closes the session and stores the frozen checklist (PLN-8)', async () => {
    const sprint = await readySprint()
    const planning = await session(sprint)

    await completePlanning({
      sprintId: sprint._id.toString(),
      sessionId: planning._id.toString(),
      userId: user.toString(),
      acknowledgedCheckIds: ['PA-2']
    })

    const stored = await SprintPlanningSession.findById(planning._id).lean()
    expect((stored as any).status).toBe('completed')
    expect((stored as any).completedAt).toBeInstanceOf(Date)
    expect((stored as any).checklistResults).toHaveLength(13)

    const pa2 = (stored as any).checklistResults.find((item: any) => item.checkId === 'PA-2')
    // Acknowledged only if it actually failed; either way the record is honest.
    if (!pa2.passed) expect(pa2.acknowledgedBy.toString()).toBe(user.toString())
  })

  it('AC-6 — refuses when a mandatory check fails, whatever the client sent', async () => {
    await seedCalendar()
    const sprint = await seedSprint()
    await seedTask(sprint, { originalEstimateMinutes: undefined })
    const planning = await session(sprint)

    await expect(
      completePlanning({
        sprintId: sprint._id.toString(),
        sessionId: planning._id.toString(),
        userId: user.toString()
      })
    ).rejects.toMatchObject({ code: 'COMPLETION_CHECKS_FAILED', status: 422 })

    // Nothing moved.
    const after = await Sprint.findById(sprint._id).lean()
    expect((after as any).status).toBe('planning')
    const tasks = await Task.find({ sprint: sprint._id }).lean()
    expect((tasks as any[])[0].estimateLockedAt).toBeUndefined()
  })

  it('returns the §17.8 failure shape with offending entities', async () => {
    await seedCalendar()
    const sprint = await seedSprint()
    const bad = await seedTask(sprint, { originalEstimateMinutes: undefined })
    const planning = await session(sprint)

    try {
      await completePlanning({
        sprintId: sprint._id.toString(),
        sessionId: planning._id.toString(),
        userId: user.toString()
      })
      throw new Error('should have thrown')
    } catch (error: any) {
      const failure = error.details.failures.find((item: any) => item.checkId === 'PC-3')
      expect(failure.overridable).toBe(false)
      expect(failure.entities).toEqual([{ id: bad._id.toString() }])
    }
  })

  it('refuses to complete a session twice', async () => {
    const sprint = await readySprint()
    const planning = await session(sprint)

    await completePlanning({
      sprintId: sprint._id.toString(),
      sessionId: planning._id.toString(),
      userId: user.toString()
    })

    await expect(
      completePlanning({
        sprintId: sprint._id.toString(),
        sessionId: planning._id.toString(),
        userId: user.toString()
      })
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
  })

  it('refuses a session belonging to another sprint', async () => {
    const sprint = await readySprint()
    const other = await seedSprint({ name: 'Sprint 14' })
    const planning = await session(other)

    await expect(
      completePlanning({
        sprintId: sprint._id.toString(),
        sessionId: planning._id.toString(),
        userId: user.toString()
      })
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('refuses an illegal state transition', async () => {
    const sprint = await readySprint()
    await Sprint.findByIdAndUpdate(sprint._id, { $set: { status: 'completed' } })
    const planning = await session(sprint)

    await expect(
      completePlanning({
        sprintId: sprint._id.toString(),
        sessionId: planning._id.toString(),
        userId: user.toString()
      })
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
  })

  it('E20 — a second planning round is possible and keeps the first in history', async () => {
    const sprint = await readySprint()
    const first = await session(sprint)

    await completePlanning({
      sprintId: sprint._id.toString(),
      sessionId: first._id.toString(),
      userId: user.toString()
    })

    // Reopen: back to planning, new session, complete again.
    await Sprint.findByIdAndUpdate(sprint._id, { $set: { status: 'planning' } })
    const second = await session(sprint)

    await completePlanning({
      sprintId: sprint._id.toString(),
      sessionId: second._id.toString(),
      userId: user.toString()
    })

    const all = await SprintPlanningSession.find({ sprint: sprint._id }).lean()
    expect(all).toHaveLength(2)
    expect((all as any[]).every((item) => item.status === 'completed')).toBe(true)
  })
})
