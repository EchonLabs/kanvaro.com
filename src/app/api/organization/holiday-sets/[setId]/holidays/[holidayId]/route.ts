/**
 * One holiday (plan DO-1, DO-3).
 *
 *   PATCH /api/organization/holiday-sets/:setId/holidays/:holidayId
 *
 * No DELETE. Holidays are revoked through the sibling `revoke` route so the row
 * survives — a deleted holiday would rewrite the calendar a completed stand-up
 * already resolved against (DAT-1).
 */
import { HOLIDAY_TYPES, type HolidayType } from '@/models/Holiday'
import { Permission } from '@/lib/permissions/permission-definitions'
import { recordAudit } from '@/lib/standup/audit'
import { StandupError } from '@/lib/standup/errors'
import { updateHoliday } from '@/lib/standup/holiday-admin'
import { ok, readJson, withStandupPermission } from '@/lib/standup/route-helpers'

interface PatchBody {
  name?: string
  date?: string
  type?: HolidayType
  isFullDay?: boolean
  minutesIfPartial?: number
}

export const PATCH = withStandupPermission(
  { permission: Permission.HOLIDAY_MANAGE },
  async (request, { organizationId, userId, params }) => {
    const body = await readJson<PatchBody>(request)

    if (body.type !== undefined && !HOLIDAY_TYPES.includes(body.type)) {
      throw new StandupError(
        'VALIDATION_FAILED',
        `Holiday type must be one of: ${HOLIDAY_TYPES.join(', ')}.`
      )
    }

    const holiday = await updateHoliday({
      holidayId: params.holidayId,
      organizationId,
      actorId: userId,
      changes: body
    })

    await recordAudit({
      actor: { type: 'user', userId },
      organizationId,
      action: 'holiday_set_imported',
      entityType: 'working_calendar',
      entityId: holiday.id,
      entityName: `${holiday.name} (${holiday.date})`,
      before: body,
      after: { ...holiday }
    })

    return ok({ holiday })
  }
)
