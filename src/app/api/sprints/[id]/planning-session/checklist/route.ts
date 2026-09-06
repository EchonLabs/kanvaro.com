/**
 * The live planning checklist (spec §17.4, UI-4).
 *
 *   GET /api/sprints/:id/planning-session/checklist
 *
 * UI-4 requires the checklist to be live — fixing a task updates it without a
 * page refresh — so this is a pure read that can be polled cheaply. It never
 * writes, which also means the Complete button and this endpoint can never
 * disagree: both call the same evaluator.
 */
import { User } from '@/models/User'
import { Permission } from '@/lib/permissions/permission-definitions'
import { Task } from '@/models/Task'
import { evaluateSprintChecklist, withMemberNames } from '@/lib/standup/planning-service'
import { ok, withSprintPermission } from '@/lib/standup/route-helpers'

export const GET = withSprintPermission(
  { permission: Permission.SPRINT_VIEW },
  async (_request, { sprintId, sprint }) => {
    const { checklist } = await evaluateSprintChecklist(sprintId)

    // PA-5/PA-6 name a person. Resolve ids to names before the sentence reaches
    // the screen — an ObjectId in that warning is worse than no warning.
    const memberIds = (sprint.teamMembers ?? []).map((id: any) => id.toString())
    const users = memberIds.length
      ? await User.find({ _id: { $in: memberIds } }).select('firstName lastName email').lean()
      : []

    const names = new Map<string, string>()
    for (const user of users as any[]) {
      names.set(
        user._id.toString(),
        [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email
      )
    }

    const named = withMemberNames(checklist, names)

    // UI-5 needs each failure to expand into its offending tasks with a fix
    // control, so send enough of each task to render that row.
    const offendingTaskIds = Array.from(
      new Set(
        named.items
          .filter((item) => !item.passed)
          .flatMap((item) => item.offendingIds ?? [])
          .filter((id) => !names.has(id))
      )
    )

    const tasks = offendingTaskIds.length
      ? await Task.find({ _id: { $in: offendingTaskIds } })
          .select('displayId title type priority originalEstimateMinutes description')
          .lean()
      : []

    return ok({
      checklist: named,
      offendingTasks: (tasks as any[]).map((task) => ({
        id: task._id.toString(),
        key: task.displayId,
        title: task.title,
        type: task.type,
        priority: task.priority,
        originalEstimateMinutes: task.originalEstimateMinutes,
        hasDescription: (task.description ?? '').trim().length >= 10
      })),
      offendingMembers: Array.from(names.entries())
        .filter(([id]) =>
          named.items.some((item) => !item.passed && item.offendingIds?.includes(id))
        )
        .map(([id, name]) => ({ id, name }))
    })
  }
)
