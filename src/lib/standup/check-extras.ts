/**
 * CC-9's blockers and CC-11's sprint health, loaded the same way regardless of
 * caller.
 *
 * Before this existed, `assembleCompletionContext` (the `/complete` saga) computed
 * these two inline, and `GET /checks` — Panel 7's read-only, provisional look —
 * never computed them at all, so CC-9 and CC-11 always read `not_evaluated` from
 * that route even when blockers were plainly loaded and displayed on the same
 * screen. `assembleCompletionContext`'s own docblock already warned that leaving
 * either of these `undefined` makes the server-side re-check disagree with what
 * the client saw — the fix is one loader both callers share, not two that could
 * drift again.
 */
import { Sprint } from '@/models/Sprint'
import { StandupBlocker } from '@/models/StandupBlocker'
import { Task } from '@/models/Task'

import type { CheckBlocker } from './completion-checks'
import { loadSprintHealthTotals } from './jobs/sprint-health'
import { minutes } from './minutes'
import type { SprintHealthInput } from './sprint-health'

export async function loadBlockersAndSprintHealth(
  standupId: string,
  sprintId: string
): Promise<{ blockerDocs: any[]; blockers: CheckBlocker[]; sprintHealth: SprintHealthInput }> {
  const [blockerDocs, sprint] = await Promise.all([
    StandupBlocker.find({ standup: standupId }).lean() as Promise<any[]>,
    Sprint.findById(sprintId).select('project endDate').lean() as Promise<any>
  ])

  // Blockers are a separate collection (`StandupBlocker.task`), so their
  // display key still needs a second query — `loadAllocationBoard` resolves
  // allocation task keys itself, but has nothing to do with blockers.
  const blockerTaskIds = blockerDocs.filter((blocker) => blocker.task).map((blocker) => blocker.task)
  const blockerTasks = blockerTaskIds.length
    ? ((await Task.find({ _id: { $in: blockerTaskIds } })
        .select('displayId')
        .lean()) as any[])
    : []
  const taskKeyById = new Map(blockerTasks.map((task) => [String(task._id), task.displayId as string]))

  const blockers: CheckBlocker[] = blockerDocs.map((blocker) => ({
    blockerId: String(blocker._id),
    taskKey: blocker.task ? taskKeyById.get(String(blocker.task)) : undefined,
    hasOwner: Boolean(blocker.owner),
    hasTargetDate: Boolean(blocker.targetResolutionDate)
  }))

  const sprintHealth = sprint
    ? await loadSprintHealthTotals(sprint, new Date())
    : { remainingEstimateMinutes: minutes(0), remainingCapacityMinutes: minutes(0) }

  return { blockerDocs, blockers, sprintHealth }
}
