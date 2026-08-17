/**
 * Completing the planning session (spec §17.4, PLN-1, PLN-8, UI-7, AC-6).
 *
 *   POST /api/sprints/:id/planning-session/complete
 *
 * Returns 422 `COMPLETION_CHECKS_FAILED` with every failing check and its
 * offending entity ids, in the §17.8 payload shape. The checklist is
 * re-evaluated server side — a client that saw green thirty seconds ago is not
 * evidence, and UI-6 disabling the button is a convenience, not the gate.
 */
import { SprintPlanningSession } from '@/models/SprintPlanningSession'
import { Permission } from '@/lib/permissions/permission-definitions'
import { recordAudit } from '@/lib/standup/audit'
import { StandupError } from '@/lib/standup/errors'
import { completePlanning } from '@/lib/standup/planning-service'
import { ok, readJson, withSprintPermission } from '@/lib/standup/route-helpers'

interface CompleteBody {
  acknowledgedCheckIds?: string[]
}

export const POST = withSprintPermission(
  { permission: Permission.SPRINT_UPDATE },
  async (request, { sprintId, sprint, organizationId, projectId, userId }) => {
    const body = await readJson<CompleteBody>(request)

    const session = await SprintPlanningSession.findOne({ sprint: sprintId, status: 'open' })
    if (!session) {
      throw new StandupError('NOT_FOUND', 'No planning session is open for this sprint.', {
        sprintId
      })
    }

    const result = await completePlanning({
      sprintId,
      sessionId: session._id.toString(),
      userId,
      acknowledgedCheckIds: body.acknowledgedCheckIds
    })

    await recordAudit({
      actor: { type: 'user', userId },
      organizationId,
      projectId,
      action: 'planning_session_completed',
      entityType: 'planning_session',
      entityId: session._id.toString(),
      entityName: sprint.name,
      before: { sprintStatus: sprint.status },
      after: { sprintStatus: 'planned' },
      context: {
        taskCount: result.checklist.totals.taskCount,
        totalEstimatedMinutes: result.checklist.totals.totalEstimatedMinutes,
        acknowledged: body.acknowledgedCheckIds ?? []
      }
    })

    return ok({
      sprint: result.sprint,
      session: result.session,
      checklist: result.checklist,
      // UI-7 shows the generated schedule on the confirmation screen. Generation
      // itself is Phase 3 (SCH-1); the sprint is now in the state that triggers
      // it, and this field is where that summary will land.
      generatedStandups: null,
      message:
        'Planning complete. This sprint is now Planned and its estimates are frozen.'
    })
  }
)
