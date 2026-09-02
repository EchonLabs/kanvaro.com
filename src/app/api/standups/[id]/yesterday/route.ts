/**
 * Panel 2 — yesterday's review (spec §10.2 step 2, §15.8.4, RUN-9..RUN-13).
 *
 *   GET   /api/standups/:id/yesterday   — the four buckets
 *   PATCH /api/standups/:id/yesterday   — act on a row without leaving the screen
 *
 * RUN-10 requires the PM to change a task's status, adjust logged hours, or add
 * a note from inside the stand-up. RUN-11 adds the rule that matters: a change
 * made *on somebody else's behalf* records who really made it and notifies the
 * person it was made for. Editing another person's record silently is how a
 * stand-up screen becomes something people stop trusting.
 */
import { notificationService } from '@/lib/notification-service'
import { Permission } from '@/lib/permissions/permission-definitions'
import { recordAudit } from '@/lib/standup/audit'
import { StandupError } from '@/lib/standup/errors'
import {
  ok,
  readJson,
  requireStandupVersion,
  withStandupIdPermission
} from '@/lib/standup/route-helpers'
import { adjustLoggedMinutes, loadYesterdayPanel } from '@/lib/standup/yesterday-service'
import { Standup } from '@/models/Standup'
import { Task } from '@/models/Task'

export const dynamic = 'force-dynamic'

export const GET = withStandupIdPermission(
  { permission: Permission.STANDUP_VIEW },
  async (_request, { standupId }) => ok(await loadYesterdayPanel(standupId))
)

interface PatchBody {
  /** One task, or several for RUN-13's bulk confirm. */
  taskIds: string[]
  status?: string
  note?: string
  /**
   * RUN-10's logged-hours adjustment, in minutes. Only meaningful for a
   * single row — bulk-confirm never carries this field.
   */
  loggedMinutes?: number
  /** The member the change is being made for, when it is not the actor. */
  onBehalfOf?: string
}

export const PATCH = withStandupIdPermission(
  { permission: Permission.STANDUP_RUN },
  async (request, { standupId, standup, userId, organizationId, projectId }) => {
    const body = await readJson<PatchBody>(request)
    const expectedVersion = requireStandupVersion(request)

    const current = (standup as any).version ?? 0
    if (current !== expectedVersion) {
      throw new StandupError(
        'STALE_STANDUP',
        'Somebody else changed this stand-up while you were working.',
        { currentVersion: current, standupId, status: (standup as any).status }
      )
    }

    const taskIds = (body.taskIds ?? []).map(String).filter(Boolean)
    if (taskIds.length === 0) {
      throw new StandupError('VALIDATION_FAILED', 'Name at least one task to change.', {
        field: 'taskIds'
      })
    }

    if (body.loggedMinutes !== undefined && taskIds.length !== 1) {
      throw new StandupError(
        'VALIDATION_FAILED',
        'A logged-hours adjustment applies to exactly one row.',
        { field: 'loggedMinutes' }
      )
    }

    const tasks = (await Task.find({ _id: { $in: taskIds }, project: projectId })
      .select('displayId status assignedTo')
      .lean()) as any[]

    if (tasks.length !== taskIds.length) {
      throw new StandupError('NOT_FOUND', 'One of those tasks no longer exists.', { taskIds })
    }

    if (body.loggedMinutes !== undefined) {
      await adjustLoggedMinutes({
        standupId,
        taskId: taskIds[0],
        memberId: body.onBehalfOf ?? userId,
        requestedMinutes: Number(body.loggedMinutes),
        actor: { userId }
      })
    }

    for (const task of tasks) {
      const before = { status: task.status }

      if (body.status !== undefined) {
        await Task.updateOne({ _id: task._id }, { $set: { status: String(body.status) } })
      }

      await recordAudit({
        actor: { type: 'user', userId },
        organizationId,
        projectId,
        action: 'standup_attendance_set',
        entityType: 'task',
        entityId: String(task._id),
        entityName: task.displayId,
        before,
        after: { status: body.status ?? task.status, note: body.note },
        context: {
          standupId,
          // RUN-11: whose record this really was.
          ...(body.onBehalfOf ? { changedOnBehalfOf: String(body.onBehalfOf) } : {})
        }
      })

      // RUN-11's N11. Never blocks the change: the status is already saved, and
      // a downed transport must not report a failure that did not happen.
      if (body.onBehalfOf && String(body.onBehalfOf) !== userId) {
        await notificationService
          .createNotification(String(body.onBehalfOf), organizationId, {
            type: 'standup',
            title: 'Your task was updated in stand-up',
            message: `${task.displayId} was moved to ${body.status ?? task.status} during today's stand-up.`,
            data: {
              entityType: 'task',
              entityId: String(task._id),
              action: 'updated',
              priority: 'low',
              url: `/tasks/${task._id}`,
              metadata: { notificationId: 'N11', standupId }
            }
          })
          .catch(() => undefined)
      }
    }

    const updated = await Standup.findOneAndUpdate(
      { _id: standupId },
      { $inc: { version: 1 } },
      { new: true, projection: { version: 1 } }
    ).lean()

    return ok({
      standupId,
      standupVersion: (updated as any)?.version ?? current,
      panel: await loadYesterdayPanel(standupId)
    })
  }
)
