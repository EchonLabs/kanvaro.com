/**
 * Removing a project calendar override (spec §17.3).
 *
 *   DELETE /api/projects/:id/working-calendar/overrides/:overrideId
 *
 * Returns `affectedStandups[]` for the same reason creation does — removing an
 * override restores or removes a working day just as readily as adding one.
 */
import { NextRequest } from 'next/server'

import { WorkingCalendar } from '@/models/WorkingCalendar'
import { Permission } from '@/lib/permissions/permission-definitions'
import { recordAudit } from '@/lib/standup/audit'
import { StandupError } from '@/lib/standup/errors'
import { notifyCalendarChangeSafely } from '@/lib/standup/notifications'
import { previewOverrideRemoval } from '@/lib/standup/preview-impact'
import { ok, withStandupPermission } from '@/lib/standup/route-helpers'

export const DELETE = withStandupPermission(
  { permission: Permission.STANDUP_CONFIGURE, projectIdParam: 'id' },
  async (_request, { projectId, organizationId, userId, params }) => {
    const overrideId = params.overrideId

    const calendar = await WorkingCalendar.findOne({
      project: projectId,
      scope: 'project'
    }).lean()

    const override = (calendar as any)?.overrides?.find(
      (candidate: any) => candidate._id?.toString() === overrideId
    )

    if (!override) {
      throw new StandupError('NOT_FOUND', 'That calendar override no longer exists.')
    }

    const impact = await previewOverrideRemoval(projectId!, overrideId, override.date)

    await WorkingCalendar.updateOne(
      { project: projectId, scope: 'project' },
      { $pull: { overrides: { _id: overrideId } } }
    )

    await recordAudit({
      actor: { type: 'user', userId },
      organizationId,
      projectId,
      action: 'working_calendar_updated',
      entityType: 'working_calendar',
      entityId: (calendar as any)._id.toString(),
      entityName: override.name,
      before: { override },
      after: null,
      context: { removed: true, affectedStandups: impact.items.length }
    })

    // CAL-15 — one consolidated notification for the whole removal.
    await notifyCalendarChangeSafely({
      projectId: projectId!,
      organizationId,
      recipientIds: [userId],
      items: impact.items,
      changeLabel: `"${override.name}" was removed from the working calendar.`
    })

    return ok({ affectedStandups: impact.items, impactSummary: impact.summary })
  }
)
