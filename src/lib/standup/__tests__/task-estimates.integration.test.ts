/**
 * DAT-6 and DAT-7, enforced at the model layer.
 *
 * DAT-6 is unusually specific about *where* the rule lives: "Any attempt to
 * write it must be rejected at the model layer, not only at the API layer." So
 * every test here talks to the `Task` model directly. **No route is involved.**
 * A guard that only exists in a route handler is bypassed by a script, a
 * migration, or the next endpoint someone adds, and E18 would still pass.
 *
 * Both write paths are covered, because they are separate code:
 *   - `document.save()`      → `pre('save')`
 *   - `findOneAndUpdate` etc → `pre('findOneAndUpdate' | 'updateOne' | ...)`
 */
import mongoose from 'mongoose'

import { Task } from '@/models/Task'
import { ids, useMongo } from './helpers/mongo'

const { organization, project, user } = ids

let taskNumber = 1

async function createTask(fields: Record<string, unknown> = {}) {
  taskNumber += 1
  return Task.create({
    title: 'Invoice model',
    description: 'Build the invoice model',
    organization,
    project,
    createdBy: user,
    taskNumber,
    displayId: `KAN-${taskNumber}`,
    status: 'todo',
    priority: 'medium',
    type: 'task',
    originalEstimateMinutes: 360,
    remainingEstimateMinutes: 360,
    estimateUnit: 'hours',
    estimateValue: 6,
    estimateMethod: 'poker',
    ...fields
  })
}

/** A task whose sprint has left Planning. */
const lockedTask = () => createTask({ estimateLockedAt: new Date() })

describe('DAT-6 — the original estimate is immutable once locked', () => {
  useMongo()

  it('allows changing it while planning is still open', async () => {
    const task = await createTask()

    task.originalEstimateMinutes = 480
    await expect(task.save()).resolves.toBeTruthy()

    const reloaded = await Task.findById(task._id).lean()
    expect((reloaded as any).originalEstimateMinutes).toBe(480)
  })

  it('rejects a document save once locked', async () => {
    const task = await lockedTask()

    task.originalEstimateMinutes = 480

    await expect(task.save()).rejects.toMatchObject({ code: 'ESTIMATE_IMMUTABLE' })
  })

  it('rejects findOneAndUpdate once locked', async () => {
    const task = await lockedTask()

    await expect(
      Task.findOneAndUpdate({ _id: task._id }, { originalEstimateMinutes: 480 })
    ).rejects.toMatchObject({ code: 'ESTIMATE_IMMUTABLE' })
  })

  it('rejects updateOne with $set once locked', async () => {
    const task = await lockedTask()

    await expect(
      Task.updateOne({ _id: task._id }, { $set: { originalEstimateMinutes: 480 } })
    ).rejects.toMatchObject({ code: 'ESTIMATE_IMMUTABLE' })
  })

  it('rejects updateMany, so a bulk script cannot slip past', async () => {
    await lockedTask()

    await expect(
      Task.updateMany({ project }, { $set: { originalEstimateMinutes: 480 } })
    ).rejects.toMatchObject({ code: 'ESTIMATE_IMMUTABLE' })
  })

  it('leaves the stored value untouched after a rejected write', async () => {
    const task = await lockedTask()

    await Task.findOneAndUpdate({ _id: task._id }, { originalEstimateMinutes: 480 }).catch(
      () => undefined
    )

    const reloaded = await Task.findById(task._id).lean()
    expect((reloaded as any).originalEstimateMinutes).toBe(360)
  })

  it('permits the write that stamps the lock — that is planning completing', async () => {
    const task = await createTask()

    await expect(
      Task.updateOne(
        { _id: task._id },
        { $set: { originalEstimateMinutes: 420, estimateLockedAt: new Date() } }
      )
    ).resolves.toBeTruthy()
  })
})

describe('DAT-7 — the remaining estimate moves only through a revision', () => {
  useMongo()

  it('allows a direct set while planning is open', async () => {
    const task = await createTask()

    task.remainingEstimateMinutes = 300
    await expect(task.save()).resolves.toBeTruthy()
  })

  it('rejects a bare set once locked', async () => {
    const task = await lockedTask()

    task.remainingEstimateMinutes = 180

    await expect(task.save()).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
  })

  it('rejects a bare findOneAndUpdate once locked', async () => {
    const task = await lockedTask()

    await expect(
      Task.findOneAndUpdate({ _id: task._id }, { remainingEstimateMinutes: 180 })
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
  })

  it('accepts the change when a revision is appended in the same write', async () => {
    const task = await lockedTask()

    await expect(
      Task.findOneAndUpdate(
        { _id: task._id },
        {
          $set: { remainingEstimateMinutes: 180 },
          $push: {
            estimateRevisions: {
              previousRemainingMinutes: 360,
              newRemainingMinutes: 180,
              reason: 'underestimated',
              revisedBy: user,
              revisedAt: new Date()
            }
          }
        }
      )
    ).resolves.toBeTruthy()

    const reloaded = await Task.findById(task._id).lean()
    expect((reloaded as any).remainingEstimateMinutes).toBe(180)
    expect((reloaded as any).estimateRevisions).toHaveLength(1)
  })

  it('accepts a document save that appends a revision', async () => {
    const task = await lockedTask()

    task.remainingEstimateMinutes = 180
    task.estimateRevisions = [
      {
        previousRemainingMinutes: 360,
        newRemainingMinutes: 180,
        reason: 'scope_grew',
        revisedBy: user as unknown as mongoose.Types.ObjectId,
        revisedAt: new Date()
      }
    ]

    await expect(task.save()).resolves.toBeTruthy()
  })

  it('AC-17 — a revision never touches the original', async () => {
    const task = await lockedTask()

    await Task.findOneAndUpdate(
      { _id: task._id },
      {
        $set: { remainingEstimateMinutes: 180 },
        $push: {
          estimateRevisions: {
            previousRemainingMinutes: 360,
            newRemainingMinutes: 180,
            reason: 'underestimated',
            revisedBy: user,
            revisedAt: new Date()
          }
        }
      }
    )

    const reloaded: any = await Task.findById(task._id).lean()
    expect(reloaded.originalEstimateMinutes).toBe(360)
    expect(reloaded.remainingEstimateMinutes).toBe(180)
    expect(reloaded.estimateRevisions[0].reason).toBe('underestimated')
  })
})

describe('the legacy estimatedHours mirror', () => {
  useMongo()

  it('is derived on create so existing reports keep working', async () => {
    const task = await createTask({ originalEstimateMinutes: 360 })
    expect(task.estimatedHours).toBe(6)
  })

  it('follows a change made during planning', async () => {
    const task = await createTask()

    task.originalEstimateMinutes = 450
    await task.save()

    expect(task.estimatedHours).toBe(7.5)
  })

  it('keeps two decimals for an awkward minute count', async () => {
    const task = await createTask({ originalEstimateMinutes: 200 })
    // 200 minutes is 3.333…h
    expect(task.estimatedHours).toBe(3.33)
  })
})

describe('schema validation', () => {
  useMongo()

  it('rejects a fractional minute estimate', async () => {
    await expect(createTask({ originalEstimateMinutes: 90.5 })).rejects.toThrow(
      /whole number of minutes/
    )
  })

  it('rejects a negative estimate', async () => {
    await expect(createTask({ originalEstimateMinutes: -60 })).rejects.toThrow()
  })

  it('rejects an unknown estimate unit', async () => {
    await expect(createTask({ estimateUnit: 'bananas' })).rejects.toThrow()
  })

  it('ignores a spread body carrying the key as undefined', async () => {
    // Existing routes build updates as `{ ...body }`. A body without an
    // estimate still produces the key when the field is optional in TypeScript,
    // and treating that as a write would reject ordinary task edits.
    const task = await lockedTask()

    await expect(
      Task.findOneAndUpdate(
        { _id: task._id },
        { title: 'Renamed', originalEstimateMinutes: undefined }
      )
    ).resolves.toBeTruthy()

    const reloaded: any = await Task.findById(task._id).lean()
    expect(reloaded.title).toBe('Renamed')
    expect(reloaded.originalEstimateMinutes).toBe(360)
  })

  it('refuses a bulk update when only one matched task is locked', async () => {
    await createTask()
    await lockedTask()
    await createTask()

    await expect(
      Task.updateMany({ project }, { $set: { originalEstimateMinutes: 999 } })
    ).rejects.toMatchObject({ code: 'ESTIMATE_IMMUTABLE' })
  })

  it('allows a bulk update when nothing matched is locked', async () => {
    await createTask()
    await createTask()

    await expect(
      Task.updateMany({ project }, { $set: { originalEstimateMinutes: 999 } })
    ).resolves.toBeTruthy()
  })

  it('leaves an unestimated task with no estimate fields', async () => {
    const task = await createTask({
      originalEstimateMinutes: undefined,
      remainingEstimateMinutes: undefined,
      estimateUnit: undefined,
      estimateValue: undefined,
      estimateMethod: undefined
    })

    expect(task.originalEstimateMinutes).toBeUndefined()
    // Defaults that the allocation engine relies on being present.
    expect(task.totalLoggedMinutes).toBe(0)
    expect(task.standupSpillCount).toBe(0)
  })
})
