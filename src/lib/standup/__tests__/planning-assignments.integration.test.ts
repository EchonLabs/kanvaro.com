/**
 * Assigning sprint work during planning, against a real database (PC-8).
 *
 * The pure roster rule is covered in `assignment-roster.test.ts`. What only a
 * database can answer is the wiring: does the write actually land in the shape
 * `assignedTo` is stored in, does admitting a QA actually reach
 * `Sprint.teamMembers` before the checklist reads it, and does a frozen
 * estimate survive an assignment untouched — the model's estimate guard
 * refuses any update that touches estimate fields, and a bulk write that
 * tripped it would fail the whole bundle.
 */
import mongoose from 'mongoose'

import { Project } from '@/models/Project'
import { Sprint } from '@/models/Sprint'
import { Task } from '@/models/Task'

import { applyPlanningAssignments } from '../assignment-service'
import { evaluateSprintChecklist } from '../planning-service'
import { ids, useMongo } from './helpers/mongo'

const { organization, project: projectId, user, member } = ids
const qa = new mongoose.Types.ObjectId()

let taskCounter = 500

async function seedProject() {
  return Project.create({
    _id: projectId,
    name: 'Kanvaro',
    organization,
    createdBy: user,
    status: 'active',
    projectNumber: 1,
    startDate: new Date('2026-08-01'),
    teamMembers: [{ memberId: user, hourlyRate: 40 }, { memberId: member }, { memberId: qa }],
    projectRoles: [{ user: qa, role: 'project_qa_lead', assignedBy: user }]
  })
}

async function seedSprint(overrides: Record<string, unknown> = {}) {
  return Sprint.create({
    name: 'Sprint 13',
    organization,
    project: projectId,
    createdBy: user,
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
    project: projectId,
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
    ...overrides
  })
}

const apply = (sprint: any, assignments: any[], addToSprintTeam?: boolean) =>
  applyPlanningAssignments({
    sprintId: sprint._id.toString(),
    userId: user.toString(),
    organizationId: organization.toString(),
    assignments,
    ...(addToSprintTeam === undefined ? {} : { addToSprintTeam })
  })

describe('applyPlanningAssignments', () => {
  useMongo()

  it('assigns a bundle of tasks in one call', async () => {
    await seedProject()
    const sprint = await seedSprint()
    const a = await seedTask(sprint)
    const b = await seedTask(sprint)

    const result = await apply(sprint, [
      { taskId: a._id.toString(), assigneeId: user.toString() },
      { taskId: b._id.toString(), assigneeId: member.toString() }
    ])

    expect(result.tasks).toHaveLength(2)
    expect(result.newlyAssigned).toHaveLength(2)

    const stored = await Task.find({ sprint: sprint._id }).sort({ taskNumber: 1 }).lean()
    expect((stored[0] as any).assignedTo[0].user.toString()).toBe(user.toString())
    expect((stored[1] as any).assignedTo[0].user.toString()).toBe(member.toString())
  })

  it('denormalises the project hourly rate onto the assignment', async () => {
    // So historical cost survives a later change to the member's rate.
    await seedProject()
    const sprint = await seedSprint()
    const task = await seedTask(sprint)

    await apply(sprint, [{ taskId: task._id.toString(), assigneeId: user.toString() }])

    const stored: any = await Task.findById(task._id).lean()
    expect(stored.assignedTo[0].hourlyRate).toBe(40)
  })

  it('replaces the previous owner rather than adding a second', async () => {
    // PC-8 wants exactly one owner: shared ownership makes the poker round
    // ambiguous and double-counts the estimate against capacity.
    await seedProject()
    const sprint = await seedSprint()
    const task = await seedTask(sprint, { assignedTo: [{ user }] })

    await apply(sprint, [{ taskId: task._id.toString(), assigneeId: member.toString() }])

    const stored: any = await Task.findById(task._id).lean()
    expect(stored.assignedTo).toHaveLength(1)
    expect(stored.assignedTo[0].user.toString()).toBe(member.toString())
  })

  it('unassigns on a null assignee', async () => {
    await seedProject()
    const sprint = await seedSprint()
    const task = await seedTask(sprint, { assignedTo: [{ user }] })

    const result = await apply(sprint, [{ taskId: task._id.toString(), assigneeId: null }])

    const stored: any = await Task.findById(task._id).lean()
    expect(stored.assignedTo).toHaveLength(0)
    expect(result.newlyAssigned).toHaveLength(0)
  })

  it('reports nothing newly assigned when the owner has not changed', async () => {
    // What stops a PM nudging the board from mailing somebody the same
    // "you have been assigned" notification again.
    await seedProject()
    const sprint = await seedSprint()
    const task = await seedTask(sprint, { assignedTo: [{ user }] })

    const result = await apply(sprint, [
      { taskId: task._id.toString(), assigneeId: user.toString() }
    ])

    expect(result.newlyAssigned).toEqual([])
  })

  it('refuses an assignee who is not on the sprint team', async () => {
    await seedProject()
    const sprint = await seedSprint()
    const task = await seedTask(sprint)

    await expect(
      apply(sprint, [{ taskId: task._id.toString(), assigneeId: qa.toString() }])
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })

    const stored: any = await Task.findById(task._id).lean()
    expect(stored.assignedTo).toHaveLength(0)
  })

  it('admits a project QA onto the sprint team in the same request', async () => {
    await seedProject()
    const sprint = await seedSprint()
    const task = await seedTask(sprint)

    const result = await apply(
      sprint,
      [{ taskId: task._id.toString(), assigneeId: qa.toString() }],
      true
    )

    expect(result.addedToSprintTeam).toEqual([qa.toString()])

    const stored: any = await Sprint.findById(sprint._id).lean()
    expect(stored.teamMembers.map((id: any) => id.toString())).toContain(qa.toString())
  })

  it('makes the admitted QA visible to the checklist immediately', async () => {
    // The roster write has to land before the task write, or PC-8 would see
    // an assignee who is not on the team it just checked against — and the
    // QA's minutes would be missing from every capacity figure.
    await seedProject()
    const sprint = await seedSprint()
    const task = await seedTask(sprint)

    await apply(sprint, [{ taskId: task._id.toString(), assigneeId: qa.toString() }], true)

    const { checklist } = await evaluateSprintChecklist(sprint._id.toString())
    const pc8 = checklist.items.find((item) => item.checkId === 'PC-8')!
    expect(pc8.passed).toBe(true)
    expect(checklist.totals.perMember.map((entry) => entry.memberId)).toContain(qa.toString())
  })

  it('refuses a task that is not in this sprint', async () => {
    await seedProject()
    const sprint = await seedSprint()
    const other = await seedSprint({ name: 'Sprint 14' })
    const stray = await seedTask(other)

    await expect(
      apply(sprint, [{ taskId: stray._id.toString(), assigneeId: user.toString() }])
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('refuses once the sprint has left planning', async () => {
    // Assignment belongs to the planning step. Allowing it on an Active sprint
    // puts ownership back into the stand-up, which is the duplication this
    // whole flow exists to remove.
    await seedProject()
    const sprint = await seedSprint({ status: 'active' })
    const task = await seedTask(sprint)

    await expect(
      apply(sprint, [{ taskId: task._id.toString(), assigneeId: user.toString() }])
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
  })

  it('leaves a frozen estimate untouched (DAT-6)', async () => {
    await seedProject()
    const sprint = await seedSprint()
    const task = await seedTask(sprint, { estimateLockedAt: new Date('2026-08-20') })

    await apply(sprint, [{ taskId: task._id.toString(), assigneeId: user.toString() }])

    const stored: any = await Task.findById(task._id).lean()
    expect(stored.originalEstimateMinutes).toBe(480)
    expect(stored.estimateLockedAt).toBeInstanceOf(Date)
    expect(stored.assignedTo[0].user.toString()).toBe(user.toString())
  })

  it('refuses an empty bundle', async () => {
    await seedProject()
    const sprint = await seedSprint()

    await expect(apply(sprint, [])).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
  })
})
