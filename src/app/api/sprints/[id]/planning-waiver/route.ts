/**
 * The planning waiver (spec §17.4, PLN-16/17/19).
 *
 *   POST   /api/sprints/:id/planning-waiver   issue one
 *   DELETE /api/sprints/:id/planning-waiver   revoke it
 *
 * Org Admin only, enforced by `STANDUP_PLANNING_WAIVER`, which is granted to
 * that role alone. PLN-16 is explicit: "an Org Admin, and only an Org Admin".
 */
import { Sprint } from '@/models/Sprint'
import { Permission } from '@/lib/permissions/permission-definitions'
import { recordAudit } from '@/lib/standup/audit'
import { StandupError } from '@/lib/standup/errors'
import {
  NEVER_WAIVABLE_FOR_ALLOCATION,
  buildWaiver,
  describeWaiver
} from '@/lib/standup/planning-gate'
import { waiverFromSprint } from '@/lib/standup/planning-service'
import { ok, readJson, withSprintPermission } from '@/lib/standup/route-helpers'
import { standupStrings } from '@/lib/standup/strings'

interface WaiverBody {
  waivedCheckIds: string[]
  justification: string
  expiresAt?: string
}

export const POST = withSprintPermission(
  { permission: Permission.STANDUP_PLANNING_WAIVER },
  async (request, { sprintId, sprint, organizationId, projectId, userId }) => {
    const body = await readJson<WaiverBody>(request)

    if (!Array.isArray(body.waivedCheckIds) || body.waivedCheckIds.length === 0) {
      throw new StandupError('VALIDATION_FAILED', 'Name at least one check to waive.')
    }

    const waiver = buildWaiver({
      waivedCheckIds: body.waivedCheckIds,
      justification: body.justification ?? '',
      issuedBy: userId,
      sprintEndDate: new Date(sprint.endDate),
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined
    })

    await Sprint.findByIdAndUpdate(sprintId, { $set: { planningWaiver: waiver } })

    await recordAudit({
      actor: { type: 'user', userId },
      organizationId,
      projectId,
      action: 'planning_waiver_issued',
      entityType: 'sprint',
      entityId: sprintId,
      entityName: sprint.name,
      before: { planningWaiver: sprint.planningWaiver ?? null },
      after: { planningWaiver: waiver }
    })

    return ok(
      {
        waiver,
        banner: describeWaiver(waiver),
        // PLN-19, stated back to the caller so nobody has to discover it by
        // being refused later: waiving PC-3 lets planning complete with some
        // tasks unestimated, but those tasks still cannot be allocated.
        note: body.waivedCheckIds.some((id) =>
          (NEVER_WAIVABLE_FOR_ALLOCATION as readonly string[]).includes(id)
        )
          ? standupStrings.planning.waiverCannotCoverEstimates()
          : undefined
      },
      { status: 201 }
    )
  }
)

export const DELETE = withSprintPermission(
  { permission: Permission.STANDUP_PLANNING_WAIVER },
  async (_request, { sprintId, sprint, organizationId, projectId, userId }) => {
    const existing = waiverFromSprint(sprint)
    if (!existing) {
      throw new StandupError('NOT_FOUND', 'This sprint has no planning waiver.', { sprintId })
    }

    const now = new Date()
    await Sprint.findByIdAndUpdate(sprintId, {
      $set: { 'planningWaiver.revokedAt': now, 'planningWaiver.revokedBy': userId }
    })

    await recordAudit({
      actor: { type: 'user', userId },
      organizationId,
      projectId,
      action: 'planning_waiver_revoked',
      entityType: 'sprint',
      entityId: sprintId,
      entityName: sprint.name,
      before: { planningWaiver: sprint.planningWaiver },
      after: { revokedAt: now }
    })

    return ok({ revokedAt: now })
  }
)
