/**
 * Manual generation and reconciliation (spec SCH-1, SCH-2, SCH-6).
 *
 *   POST /api/sprints/:id/standups/generate
 *   POST /api/sprints/:id/standups/generate  { "reconcile": "sprint_end_later" }
 *
 * Generation normally happens when planning completes. This endpoint exists for
 * the two cases that need a human: an operator repairing a schedule the audit
 * job refused to touch, and a PM confirming the E6 timezone-change preview.
 *
 * It is a separate permission from viewing the schedule on purpose — a
 * reconcile can cancel stand-ups.
 */
import { Permission } from '@/lib/permissions/permission-definitions'
import { generateStandupsForSprint } from '@/lib/standup/generation'
import { reconcileSprintSchedule, type ReconcileTrigger } from '@/lib/standup/reconcile'
import { ok, readJson, withSprintPermission } from '@/lib/standup/route-helpers'
import { getSprintSchedule } from '@/lib/standup/schedule'

interface GenerateBody {
  /** When set, reconciles against this SCH-6 trigger instead of generating. */
  reconcile?: ReconcileTrigger
  changeLabel?: string
}

export const POST = withSprintPermission(
  { permission: Permission.STANDUP_GENERATE },
  async (request, { sprintId, userId }) => {
    const body = await readJson<GenerateBody>(request)

    const result = body.reconcile
      ? await reconcileSprintSchedule(sprintId, body.reconcile, {
          actorId: userId,
          changeLabel: body.changeLabel
        })
      : await generateStandupsForSprint(sprintId, { actorId: userId })

    return ok({ result, schedule: await getSprintSchedule(sprintId) })
  }
)
