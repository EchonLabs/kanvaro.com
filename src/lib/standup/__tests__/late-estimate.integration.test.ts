/**
 * E14 / PLN-15 — a task added to a sprint after planning completed.
 *
 * "It is allowed, but it cannot be allocated until estimated. The allocation
 * panel offers inline estimation with a mandatory reason, recorded as manual."
 *
 * The estimate route owns the reason and the method; `assertTaskAllocatable`
 * owns the refusal. Both halves are exercised here against the real model so
 * the immediate freeze is proven rather than assumed.
 */
import { Sprint } from '@/models/Sprint'
import { Task } from '@/models/Task'
import { deriveEstimateMinutes } from '../estimates'
import { assertTaskAllocatable } from '../planning-gate'
import { hasStandups, type SprintState } from '../sprint-states'
import { ids, useMongo } from './helpers/mongo'

const { organization, project, user } = ids

let counter = 900

async function plannedSprint(status: SprintState = 'active') {
  return Sprint.create({
    name: 'Sprint 13',
    organization,
    project,
    createdBy: user,
    startDate: new Date('2026-08-24'),
    endDate: new Date('2026-09-04'),
    capacity: 320,
    status
  })
}

async function lateTask(sprint: any) {
  counter += 1
  return Task.create({
    title: 'Urgent hotfix',
    description: 'Added mid-sprint after planning completed.',
    organization,
    project,
    createdBy: user,
    taskNumber: counter,
    displayId: `KAN-${counter}`,
    status: 'todo',
    priority: 'high',
    type: 'bug',
    sprint: sprint._id
  })
}

describe('E14 — a task added after planning', () => {
  useMongo()

  it('may be added to a running sprint', async () => {
    const sprint = await plannedSprint()
    const task = await lateTask(sprint)

    expect(task.sprint?.toString()).toBe(sprint._id.toString())
    expect(task.originalEstimateMinutes).toBeUndefined()
  })

  it('cannot be allocated while unestimated', async () => {
    const sprint = await plannedSprint()
    const task = await lateTask(sprint)

    expect(() =>
      assertTaskAllocatable({
        id: task._id.toString(),
        key: task.displayId,
        originalEstimateMinutes: task.originalEstimateMinutes
      })
    ).toThrow(/no estimate/)
  })

  it('is recognised as a late addition by its sprint state', async () => {
    // The route uses this to decide whether a reason is mandatory.
    for (const status of ['planned', 'active'] as SprintState[]) {
      expect(hasStandups(status)).toBe(true)
    }
    for (const status of ['draft', 'planning'] as SprintState[]) {
      expect(hasStandups(status)).toBe(false)
    }
  })

  it('is frozen the moment it is estimated, because its sprint already left planning', async () => {
    const sprint = await plannedSprint()
    const task = await lateTask(sprint)

    const minutes = deriveEstimateMinutes({ value: 3, unit: 'hours' })
    task.originalEstimateMinutes = minutes
    task.remainingEstimateMinutes = minutes
    task.estimateUnit = 'hours'
    task.estimateValue = 3
    task.estimateMethod = 'manual'
    task.estimateLockedAt = new Date()
    await task.save()

    // DAT-6 applies immediately — there is no window in which it could be
    // silently re-estimated.
    await expect(
      Task.updateOne({ _id: task._id }, { $set: { originalEstimateMinutes: 999 } })
    ).rejects.toMatchObject({ code: 'ESTIMATE_IMMUTABLE' })
  })

  it('becomes allocatable once estimated', async () => {
    const sprint = await plannedSprint()
    const task = await lateTask(sprint)

    task.originalEstimateMinutes = 180
    task.estimateMethod = 'manual'
    await task.save()

    expect(() =>
      assertTaskAllocatable({
        id: task._id.toString(),
        key: task.displayId,
        originalEstimateMinutes: task.originalEstimateMinutes
      })
    ).not.toThrow()
  })

  it('PA-4 — a late estimate is manual, so it stays visible at the next planning', async () => {
    const sprint = await plannedSprint()
    const task = await lateTask(sprint)

    task.originalEstimateMinutes = 180
    task.estimateMethod = 'manual'
    await task.save()

    const reloaded: any = await Task.findById(task._id).lean()
    expect(reloaded.estimateMethod).toBe('manual')
  })

  it('a task added while the sprint is still planning is not a late addition', async () => {
    const sprint = await plannedSprint('planning')
    const task = await lateTask(sprint)

    // No reason required, and the estimate stays editable during planning.
    task.originalEstimateMinutes = 180
    await task.save()

    task.originalEstimateMinutes = 240
    await expect(task.save()).resolves.toBeTruthy()
  })
})
