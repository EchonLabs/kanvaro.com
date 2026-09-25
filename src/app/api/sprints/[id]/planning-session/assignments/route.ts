/**
 * Assigning sprint tasks during planning (PC-8).
 *
 *   POST /api/sprints/:id/planning-session/assignments
 *
 * Deliberately not `/api/tasks/bulk`: that endpoint `$set`s the caller's object
 * verbatim, with no `assignedTo` shaping, no notifications, no activity log and
 * no sprint scoping. Teaching it the sprint roster rules would put planning
 * policy inside a generic write endpoint; this route owns them instead.
 *
 * One owner per task, because the whole point of assigning before planning
 * poker is that a round can say whose estimate it is.
 */
import { Permission } from '@/lib/permissions/permission-definitions'
import { PermissionService } from '@/lib/permissions/permission-service'
import { Project } from '@/models/Project'
import { logActivity } from '@/lib/activity-logger'
import { notificationService } from '@/lib/notification-service'
import { invalidateCache } from '@/lib/redis'
import { recordAudit } from '@/lib/standup/audit'
import {
  applyPlanningAssignments,
  type PlanningAssignment
} from '@/lib/standup/assignment-service'
import { StandupError } from '@/lib/standup/errors'
import { ok, readJson, withSprintPermission } from '@/lib/standup/route-helpers'
import { resolveBaseUrl } from '@/lib/request-base-url'

interface AssignmentsBody {
  assignments?: Array<{ taskId?: string; assigneeId?: string | null }>
  addToSprintTeam?: boolean
}

export const POST = withSprintPermission(
  { permission: Permission.SPRINT_UPDATE },
  async (request, { sprintId, sprint, organizationId, projectId, userId }) => {
    // SPRINT_UPDATE says you may shape this sprint; TASK_ASSIGN says you may
    // decide who does the work. They are separate permissions and this is the
    // one action that needs both.
    const canAssign = await PermissionService.hasPermission(
      userId,
      Permission.TASK_ASSIGN,
      projectId
    )
    if (!canAssign) {
      throw new StandupError(
        'OVERRIDE_NOT_PERMITTED',
        'You do not have permission to assign tasks.'
      )
    }

    const body = await readJson<AssignmentsBody>(request)

    const assignments: PlanningAssignment[] = (body.assignments ?? [])
      .filter((entry) => typeof entry?.taskId === 'string' && entry.taskId.length > 0)
      .map((entry) => ({
        taskId: entry.taskId as string,
        assigneeId:
          typeof entry.assigneeId === 'string' && entry.assigneeId.length > 0
            ? entry.assigneeId
            : null
      }))

    if (assignments.length === 0) {
      throw new StandupError('VALIDATION_FAILED', 'No assignments were sent.')
    }

    const result = await applyPlanningAssignments({
      sprintId,
      userId,
      organizationId: organizationId.toString(),
      assignments,
      addToSprintTeam: body.addToSprintTeam
    })

    await recordAudit({
      actor: { type: 'user', userId },
      organizationId: organizationId.toString(),
      projectId,
      action: 'planning_tasks_assigned',
      entityType: 'planning_session',
      entityId: sprintId,
      entityName: sprint.name,
      context: {
        taskCount: result.tasks.length,
        newlyAssigned: result.newlyAssigned.length,
        addedToSprintTeam: result.addedToSprintTeam
      }
    })

    // Parity with the task update route, and non-blocking for the same reason:
    // a PM assigning a bundle should not wait on a mail server.
    if (result.newlyAssigned.length > 0) {
      const baseUrl = resolveBaseUrl(request)

      setImmediate(() => {
        Project.findById(projectId)
          .select('name')
          .lean()
          .then((project: any) => {
            for (const entry of result.newlyAssigned) {
              logActivity({
                organizationId: organizationId.toString(),
                userId,
                action: 'task_assigned',
                entityType: 'task',
                entityId: entry.taskId,
                entityName: entry.taskTitle,
                projectId,
                projectName: project?.name,
                details: { assigneeId: entry.assigneeId, assignedDuring: 'sprint_planning' }
              }).catch((error) =>
                console.error('Failed to log planning assignment activity:', error)
              )

              notificationService
                .notifyTaskUpdate(
                  entry.taskId,
                  'assigned',
                  entry.assigneeId,
                  organizationId.toString(),
                  entry.taskTitle,
                  project?.name,
                  baseUrl
                )
                .catch((error: unknown) =>
                  console.error('Failed to send planning assignment notification:', error)
                )
            }
          })
          .catch((error: unknown) =>
            console.error('Failed to load project for assignment notifications:', error)
          )

        invalidateCache(`tasks:*:org:${organizationId}:*`).catch((error: unknown) =>
          console.error('Failed to invalidate task cache after assignment:', error)
        )
      })
    }

    return ok(result)
  }
)
