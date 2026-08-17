/**
 * Changing the story-point conversion factor (spec PLN-14, E17).
 *
 *   POST /api/projects/:id/standup-settings/points-migration          preview
 *   PUT  /api/projects/:id/standup-settings/points-migration          apply
 *
 * Two verbs on purpose. PLN-14 requires the change to be previewed and then
 * explicitly confirmed, so a single endpoint that took a factor and did the
 * work would be the silent recompute the requirement exists to prevent.
 */
import { ProjectStandupSettings } from '@/models/ProjectStandupSettings'
import { Permission } from '@/lib/permissions/permission-definitions'
import { recordAudit } from '@/lib/standup/audit'
import { StandupError } from '@/lib/standup/errors'
import {
  applyPointsToHoursChange,
  previewPointsToHoursChange
} from '@/lib/standup/points-migration'
import { ok, readJson, withStandupPermission } from '@/lib/standup/route-helpers'

interface Body {
  pointsToHours: number
  confirmedTaskIds?: string[]
}

const currentFactor = async (projectId: string) => {
  const settings = await ProjectStandupSettings.findOne({ project: projectId })
    .select('pointsToHours')
    .lean()
  return (settings as any)?.pointsToHours ?? 4
}

export const POST = withStandupPermission(
  { permission: Permission.STANDUP_VIEW, projectIdParam: 'id' },
  async (request, { projectId }) => {
    const body = await readJson<Body>(request)

    if (typeof body.pointsToHours !== 'number') {
      throw new StandupError('VALIDATION_FAILED', 'Give the new points-to-hours factor.')
    }

    const preview = await previewPointsToHoursChange(
      projectId!,
      await currentFactor(projectId!),
      body.pointsToHours
    )

    return ok(preview)
  }
)

export const PUT = withStandupPermission(
  { permission: Permission.STANDUP_CONFIGURE, projectIdParam: 'id' },
  async (request, { projectId, organizationId, userId }) => {
    const body = await readJson<Body>(request)

    if (typeof body.pointsToHours !== 'number') {
      throw new StandupError('VALIDATION_FAILED', 'Give the new points-to-hours factor.')
    }

    const previous = await currentFactor(projectId!)

    const result = await applyPointsToHoursChange({
      projectId: projectId!,
      currentFactor: previous,
      proposedFactor: body.pointsToHours,
      confirmedTaskIds: body.confirmedTaskIds ?? []
    })

    await ProjectStandupSettings.findOneAndUpdate(
      { project: projectId },
      { $set: { pointsToHours: body.pointsToHours, updatedBy: userId } },
      { upsert: true, runValidators: true }
    )

    await recordAudit({
      actor: { type: 'user', userId },
      organizationId,
      projectId,
      action: 'points_to_hours_changed',
      entityType: 'project_standup_settings',
      entityId: projectId!,
      before: { pointsToHours: previous },
      after: { pointsToHours: body.pointsToHours },
      context: {
        tasksReconverted: result.updated,
        tasksSkipped: result.skipped,
        totalDeltaMinutes: result.totalDeltaMinutes
      }
    })

    return ok(result)
  }
)
