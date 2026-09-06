/**
 * The points-to-hours migration (spec PLN-14, E17).
 *
 * The requirement is mostly about what must *not* happen: no silent recompute,
 * no touching Completed sprints, no rewriting a frozen estimate. Most of these
 * tests therefore assert that a number stayed the same.
 */
import { Sprint } from '@/models/Sprint'
import { Task } from '@/models/Task'
import { applyPointsToHoursChange, previewPointsToHoursChange } from '../points-migration'
import { ids, useMongo } from './helpers/mongo'

const { organization, project, user } = ids

let counter = 500

async function sprint(status: string, name = `Sprint ${status}`) {
  return Sprint.create({
    name,
    organization,
    project,
    createdBy: user,
    startDate: new Date('2026-08-24'),
    endDate: new Date('2026-09-04'),
    capacity: 320,
    status
  })
}

async function task(overrides: Record<string, unknown> = {}) {
  counter += 1
  return Task.create({
    title: 'Invoice model',
    description: 'Build the invoice model end to end.',
    organization,
    project,
    createdBy: user,
    taskNumber: counter,
    displayId: `KAN-${counter}`,
    status: 'todo',
    priority: 'medium',
    type: 'task',
    // 3 points at a factor of 4 = 12h = 720 minutes.
    estimateUnit: 'story_points',
    estimateValue: 3,
    originalEstimateMinutes: 720,
    remainingEstimateMinutes: 720,
    estimateMethod: 'poker',
    ...overrides
  })
}

describe('previewPointsToHoursChange', () => {
  useMongo()

  it('lists what would change without changing anything', async () => {
    const subject = await task()

    const preview = await previewPointsToHoursChange(project.toString(), 4, 6)

    expect(preview.affected).toHaveLength(1)
    expect(preview.affected[0]).toMatchObject({
      id: subject._id.toString(),
      estimateValue: 3,
      currentMinutes: 720,
      proposedMinutes: 1080,
      deltaMinutes: 360
    })

    // Nothing was written.
    const reloaded: any = await Task.findById(subject._id).lean()
    expect(reloaded.originalEstimateMinutes).toBe(720)
  })

  it('E17 — never touches a task in a completed sprint', async () => {
    const done = await sprint('completed', 'Sprint 12')
    const subject = await task({ sprint: done._id })

    const preview = await previewPointsToHoursChange(project.toString(), 4, 6)

    expect(preview.affected).toHaveLength(0)
    expect(preview.excluded).toEqual([
      expect.objectContaining({
        id: subject._id.toString(),
        reason: 'completed_sprint',
        sprintName: 'Sprint 12'
      })
    ])
  })

  it('DAT-6 — never touches a frozen estimate', async () => {
    const active = await sprint('active')
    const subject = await task({ sprint: active._id, estimateLockedAt: new Date() })

    const preview = await previewPointsToHoursChange(project.toString(), 4, 6)

    expect(preview.affected).toHaveLength(0)
    expect(preview.excluded[0]).toMatchObject({
      id: subject._id.toString(),
      reason: 'estimate_frozen'
    })
  })

  it('ignores tasks estimated in hours', async () => {
    await task({ estimateUnit: 'hours', estimateValue: 6, originalEstimateMinutes: 360 })

    const preview = await previewPointsToHoursChange(project.toString(), 4, 6)
    expect(preview.affected).toHaveLength(0)
    expect(preview.excluded).toHaveLength(0)
  })

  it('ignores archived tasks', async () => {
    await task({ archived: true })
    const preview = await previewPointsToHoursChange(project.toString(), 4, 6)
    expect(preview.affected).toHaveLength(0)
  })

  it('reports a no-op when the factor is unchanged', async () => {
    await task()
    const preview = await previewPointsToHoursChange(project.toString(), 4, 4)

    expect(preview.noop).toBe(true)
    expect(preview.affected).toHaveLength(0)
  })

  it('totals the change so the dialog can lead with it', async () => {
    await task()
    await task({ estimateValue: 5, originalEstimateMinutes: 1200 })

    const preview = await previewPointsToHoursChange(project.toString(), 4, 6)

    // 3pt: 720 → 1080 (+360). 5pt: 1200 → 1800 (+600).
    expect(preview.totalDeltaMinutes).toBe(960)
  })

  it('handles a factor that reduces estimates', async () => {
    await task()
    const preview = await previewPointsToHoursChange(project.toString(), 4, 2)

    expect(preview.affected[0].proposedMinutes).toBe(360)
    expect(preview.affected[0].deltaMinutes).toBe(-360)
  })

  it('rejects a nonsensical factor', async () => {
    await expect(previewPointsToHoursChange(project.toString(), 4, 0)).rejects.toMatchObject({
      code: 'VALIDATION_FAILED'
    })
  })
})

describe('applyPointsToHoursChange', () => {
  useMongo()

  it('reconverts only the confirmed tasks', async () => {
    const one = await task()
    const two = await task({ estimateValue: 5, originalEstimateMinutes: 1200 })

    const result = await applyPointsToHoursChange({
      projectId: project.toString(),
      currentFactor: 4,
      proposedFactor: 6,
      confirmedTaskIds: [one._id.toString()]
    })

    expect(result.updated).toBe(1)

    const reloadedOne: any = await Task.findById(one._id).lean()
    const reloadedTwo: any = await Task.findById(two._id).lean()

    expect(reloadedOne.originalEstimateMinutes).toBe(1080)
    // Not confirmed, so untouched — this is the whole point of the confirm step.
    expect(reloadedTwo.originalEstimateMinutes).toBe(1200)
  })

  it('refuses to apply with nothing confirmed', async () => {
    await task()

    await expect(
      applyPointsToHoursChange({
        projectId: project.toString(),
        currentFactor: 4,
        proposedFactor: 6,
        confirmedTaskIds: []
      })
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
  })

  it('moves the remaining estimate along with the original', async () => {
    const subject = await task()

    await applyPointsToHoursChange({
      projectId: project.toString(),
      currentFactor: 4,
      proposedFactor: 6,
      confirmedTaskIds: [subject._id.toString()]
    })

    const reloaded: any = await Task.findById(subject._id).lean()
    expect(reloaded.remainingEstimateMinutes).toBe(1080)
  })

  it('leaves a revised remaining estimate alone — the PM outranks the factor', async () => {
    const subject = await task({
      remainingEstimateMinutes: 180,
      estimateRevisions: [
        {
          previousRemainingMinutes: 720,
          newRemainingMinutes: 180,
          reason: 'underestimated',
          revisedBy: user,
          revisedAt: new Date()
        }
      ]
    })

    await applyPointsToHoursChange({
      projectId: project.toString(),
      currentFactor: 4,
      proposedFactor: 6,
      confirmedTaskIds: [subject._id.toString()]
    })

    const reloaded: any = await Task.findById(subject._id).lean()
    expect(reloaded.originalEstimateMinutes).toBe(1080)
    expect(reloaded.remainingEstimateMinutes).toBe(180)
  })

  it('skips a task that became ineligible after the dialog opened', async () => {
    // The classic race: the PM opens the dialog, planning completes elsewhere,
    // then they confirm. The frozen task must be skipped, not forced.
    const subject = await task()
    const stale = subject._id.toString()

    await Task.updateOne({ _id: subject._id }, { $set: { estimateLockedAt: new Date() } })

    const result = await applyPointsToHoursChange({
      projectId: project.toString(),
      currentFactor: 4,
      proposedFactor: 6,
      confirmedTaskIds: [stale]
    })

    expect(result.updated).toBe(0)
    expect(result.skipped).toBe(1)

    const reloaded: any = await Task.findById(subject._id).lean()
    expect(reloaded.originalEstimateMinutes).toBe(720)
  })

  it('keeps the legacy estimatedHours mirror in step', async () => {
    const subject = await task()

    await applyPointsToHoursChange({
      projectId: project.toString(),
      currentFactor: 4,
      proposedFactor: 6,
      confirmedTaskIds: [subject._id.toString()]
    })

    const reloaded: any = await Task.findById(subject._id).lean()
    expect(reloaded.estimatedHours).toBe(18)
  })
})
