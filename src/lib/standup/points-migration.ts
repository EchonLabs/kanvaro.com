/**
 * Changing the story-point conversion factor (spec PLN-14, E17).
 *
 * `pointsToHours` turns a poker card into the minutes the allocation engine
 * uses. Changing it after estimates exist is a genuine decision, not a setting
 * tweak: every story-pointed task in the project was converted with the old
 * factor, so the project now holds two incompatible generations of estimate.
 *
 * PLN-14 forbids the obvious shortcut. The system "must not silently recompute
 * historical derivedHours" — it must list what would change and demand an
 * explicit confirm. Two hard rules follow:
 *
 *   1. **Completed sprints are never touched.** Their estimates are history,
 *      and rewriting history breaks every variance figure computed from it.
 *   2. **Frozen estimates are never touched** (DAT-6). A task whose sprint has
 *      left Planning keeps its original estimate whatever the factor says.
 *
 * Tasks estimated in hours are unaffected by definition — the factor does not
 * enter their conversion.
 */
import { Sprint } from '@/models/Sprint'
import { Task } from '@/models/Task'

import { StandupError } from './errors'
import { deriveEstimateMinutes } from './estimates'

export interface AffectedTask {
  id: string
  key?: string
  title?: string
  /** The raw poker value, which does not change. */
  estimateValue: number
  currentMinutes: number
  proposedMinutes: number
  deltaMinutes: number
  sprintId?: string
  sprintName?: string
}

export interface ExcludedTask {
  id: string
  key?: string
  title?: string
  reason: 'completed_sprint' | 'estimate_frozen'
  sprintName?: string
}

export interface MigrationPreview {
  currentFactor: number
  proposedFactor: number
  affected: AffectedTask[]
  excluded: ExcludedTask[]
  totalDeltaMinutes: number
  /** True when nothing at all would change, so no dialog is needed. */
  noop: boolean
}

/**
 * Works out what changing the factor would do, changing nothing.
 *
 * This is what PLN-14's dialog is built from, so it has to be exact rather than
 * indicative — a PM confirming a list that turns out to be wrong is worse than
 * no dialog.
 */
export async function previewPointsToHoursChange(
  projectId: string,
  currentFactor: number,
  proposedFactor: number
): Promise<MigrationPreview> {
  if (!Number.isFinite(proposedFactor) || proposedFactor <= 0) {
    throw new StandupError(
      'VALIDATION_FAILED',
      'The points-to-hours factor must be greater than zero.',
      { proposedFactor }
    )
  }

  // Only story-pointed tasks carrying a raw value can be reconverted. A task
  // estimated in hours never went through the factor.
  const tasks = await Task.find({
    project: projectId,
    archived: { $ne: true },
    estimateUnit: 'story_points',
    estimateValue: { $gt: 0 }
  })
    .select('displayId title estimateValue originalEstimateMinutes estimateLockedAt sprint')
    .lean()

  const sprintIds = Array.from(
    new Set(
      (tasks as any[])
        .map((task) => task.sprint?.toString())
        .filter(Boolean)
    )
  )

  const sprints = sprintIds.length
    ? await Sprint.find({ _id: { $in: sprintIds } }).select('name status').lean()
    : []

  const sprintById = new Map(
    (sprints as any[]).map((sprint) => [sprint._id.toString(), sprint])
  )

  const affected: AffectedTask[] = []
  const excluded: ExcludedTask[] = []

  for (const task of tasks as any[]) {
    const sprintId = task.sprint?.toString()
    const sprint = sprintId ? sprintById.get(sprintId) : undefined

    // Rule 1 — a completed sprint's estimates are history.
    if (sprint?.status === 'completed') {
      excluded.push({
        id: task._id.toString(),
        key: task.displayId,
        title: task.title,
        reason: 'completed_sprint',
        sprintName: sprint.name
      })
      continue
    }

    // Rule 2 — DAT-6. A frozen original stays frozen.
    if (task.estimateLockedAt) {
      excluded.push({
        id: task._id.toString(),
        key: task.displayId,
        title: task.title,
        reason: 'estimate_frozen',
        sprintName: sprint?.name
      })
      continue
    }

    const proposedMinutes = deriveEstimateMinutes({
      value: task.estimateValue,
      unit: 'story_points',
      pointsToHours: proposedFactor
    })

    const currentMinutes = task.originalEstimateMinutes ?? 0
    if (proposedMinutes === currentMinutes) continue

    affected.push({
      id: task._id.toString(),
      key: task.displayId,
      title: task.title,
      estimateValue: task.estimateValue,
      currentMinutes,
      proposedMinutes,
      deltaMinutes: proposedMinutes - currentMinutes,
      sprintId,
      sprintName: sprint?.name
    })
  }

  return {
    currentFactor,
    proposedFactor,
    affected,
    excluded,
    totalDeltaMinutes: affected.reduce((total, task) => total + task.deltaMinutes, 0),
    noop: affected.length === 0
  }
}

export interface ApplyMigrationInput {
  projectId: string
  proposedFactor: number
  currentFactor: number
  /**
   * The tasks the PM confirmed. Required — applying to "everything affected"
   * without echoing back the list is exactly the silent recompute PLN-14
   * forbids.
   */
  confirmedTaskIds: string[]
}

export interface ApplyMigrationResult {
  updated: number
  skipped: number
  totalDeltaMinutes: number
}

/**
 * Applies a confirmed migration.
 *
 * Re-derives the preview rather than trusting the ids it was handed: between
 * the dialog opening and the confirm landing, a sprint may have completed or a
 * planning session may have frozen its estimates. Anything no longer eligible
 * is skipped, not forced.
 */
export async function applyPointsToHoursChange(
  input: ApplyMigrationInput
): Promise<ApplyMigrationResult> {
  const { projectId, proposedFactor, currentFactor, confirmedTaskIds } = input

  if (!confirmedTaskIds?.length) {
    throw new StandupError(
      'VALIDATION_FAILED',
      'Confirm which tasks should be reconverted before applying the change.'
    )
  }

  const preview = await previewPointsToHoursChange(projectId, currentFactor, proposedFactor)

  const confirmed = new Set(confirmedTaskIds)
  const eligible = preview.affected.filter((task) => confirmed.has(task.id))
  const skipped = confirmedTaskIds.length - eligible.length

  let updated = 0
  let totalDeltaMinutes = 0

  for (const task of eligible) {
    // One document at a time so the model hooks run. A bulk write would bypass
    // exactly the guard that stops a frozen estimate being rewritten.
    const document = await Task.findById(task.id)
    if (!document || document.estimateLockedAt) continue

    document.originalEstimateMinutes = task.proposedMinutes
    // The remaining estimate follows only when no work has been logged against
    // it yet. Once a revision exists, the PM's number outranks the conversion.
    if (!document.estimateRevisions?.length) {
      document.remainingEstimateMinutes = task.proposedMinutes
    }

    await document.save()
    updated += 1
    totalDeltaMinutes += task.deltaMinutes
  }

  return { updated, skipped, totalDeltaMinutes }
}
