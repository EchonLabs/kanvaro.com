/**
 * Project stand-up configuration (spec §15.3).
 *
 *   GET /api/projects/:id/standup-settings
 *   PUT /api/projects/:id/standup-settings
 *
 * Hour-valued settings are exchanged in hours (a human interface) and stored in
 * minutes (ALO-2 / DAT-2). The conversion happens here, once.
 */
import { NextRequest } from 'next/server'

import { ProjectStandupSettings, OVERRUN_POLICIES } from '@/models/ProjectStandupSettings'
import { Permission } from '@/lib/permissions/permission-definitions'
import { auditSnapshot, recordAudit } from '@/lib/standup/audit'
import { StandupError } from '@/lib/standup/errors'
import { hoursToMinutes, minutesToHours } from '@/lib/standup/minutes'
import { ok, readJson, withStandupPermission } from '@/lib/standup/route-helpers'

const AUDITED_FIELDS = [
  'enabled',
  'standupLocalTime',
  'durationMinutes',
  'overrunPolicy',
  'underToleranceMinutes',
  'overToleranceMinutes',
  'carryForwardNoteThreshold',
  'allowSelfSelect',
  'blockedTasksConsumeCapacity'
] as const

export const GET = withStandupPermission(
  { permission: Permission.STANDUP_VIEW, projectIdParam: 'id' },
  async (_request, { projectId, organizationId }) => {
    let settings = await ProjectStandupSettings.findOne({ project: projectId }).lean()

    if (!settings) {
      // Return schema defaults without writing — the module is opt-in, and a
      // GET should not silently enable it.
      settings = new ProjectStandupSettings({
        project: projectId,
        organization: organizationId
      }).toObject()
    }

    return ok({ settings: serialise(settings) })
  }
)

export const PUT = withStandupPermission(
  { permission: Permission.STANDUP_CONFIGURE, projectIdParam: 'id' },
  async (request, { projectId, organizationId, userId }) => {
    const body = await readJson<Record<string, any>>(request)

    if (body.overrunPolicy && !OVERRUN_POLICIES.includes(body.overrunPolicy)) {
      throw new StandupError(
        'VALIDATION_FAILED',
        `Overrun policy must be one of ${OVERRUN_POLICIES.join(', ')}.`
      )
    }

    if (body.standupLocalTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(body.standupLocalTime)) {
      throw new StandupError('VALIDATION_FAILED', 'Stand-up time must be in HH:mm format.')
    }

    const update: Record<string, unknown> = {
      organization: organizationId,
      project: projectId,
      updatedBy: userId
    }

    // Straight pass-through fields.
    for (const field of [
      'enabled',
      'standupLocalTime',
      'durationMinutes',
      'readyLeadMinutes',
      'reminderLeadMinutes',
      'meetingUrl',
      'defaultFacilitator',
      'overrunPolicy',
      'carryForwardNoteThreshold',
      'carryForwardEscalationThreshold',
      'reopenWindowHours',
      'backfillWindowWorkingDays',
      'allowSelfSelect',
      'allowMemberPreEdit',
      'carryDebtBetweenSprints',
      'crossSprintCarryForward',
      'blockedTasksConsumeCapacity',
      'requireOverAllocationAck',
      'pointsToHours',
      'notificationSwitches'
    ]) {
      if (body[field] !== undefined) update[field] = body[field]
    }

    // Tolerances arrive as hours from the UI and are stored as minutes.
    if (body.underToleranceHours !== undefined) {
      update.underToleranceMinutes = hoursToMinutes(body.underToleranceHours)
    }
    if (body.overToleranceHours !== undefined) {
      update.overToleranceMinutes = hoursToMinutes(body.overToleranceHours)
    }

    const before = await ProjectStandupSettings.findOne({ project: projectId }).lean()

    const settings = await ProjectStandupSettings.findOneAndUpdate(
      { project: projectId },
      { $set: update },
      { new: true, upsert: true, runValidators: true }
    ).lean()

    await recordAudit({
      actor: { type: 'user', userId },
      organizationId,
      projectId,
      action: 'working_calendar_updated',
      entityType: 'working_calendar',
      entityId: (settings as any)._id.toString(),
      before: auditSnapshot(before as any, AUDITED_FIELDS),
      after: auditSnapshot(settings as any, AUDITED_FIELDS)
    })

    return ok({ settings: serialise(settings) })
  }
)

function serialise(settings: any) {
  return {
    ...settings,
    _id: settings._id?.toString(),
    project: settings.project?.toString(),
    organization: settings.organization?.toString(),
    defaultFacilitator: settings.defaultFacilitator?.toString(),
    // Read-only display conveniences (§17.1).
    underToleranceHours: minutesToHours(settings.underToleranceMinutes ?? 15),
    overToleranceHours: minutesToHours(settings.overToleranceMinutes ?? 15)
  }
}
