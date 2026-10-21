/**
 * Holidays inside one set (plan DO-1).
 *
 *   GET  /api/organization/holiday-sets/:setId/holidays   list, revoked included
 *   POST /api/organization/holiday-sets/:setId/holidays   add one by hand
 *
 * The POST is the whole point of this workstream: before it, the only way to
 * load a newly published gazette was `npm run seed:holidays`, which needs shell
 * access to the container. The person holding the gazette is an administrator,
 * not a sysadmin.
 *
 * There is deliberately no DELETE anywhere under this path — see
 * `holiday-admin.ts` and the revoke route.
 */
import { HOLIDAY_TYPES, type HolidayType } from '@/models/Holiday'
import { Permission } from '@/lib/permissions/permission-definitions'
import { recordAudit } from '@/lib/standup/audit'
import { StandupError } from '@/lib/standup/errors'
import { createHoliday, listHolidays } from '@/lib/standup/holiday-admin'
import { ok, readJson, withStandupPermission } from '@/lib/standup/route-helpers'

interface CreateBody {
  name: string
  date: string
  type: HolidayType
  isFullDay: boolean
  minutesIfPartial?: number
}

export const GET = withStandupPermission(
  { permission: Permission.STANDUP_VIEW },
  async (_request, { organizationId, params }) => {
    const holidays = await listHolidays(params.setId, organizationId)

    return ok({ holidays })
  }
)

export const POST = withStandupPermission(
  { permission: Permission.HOLIDAY_MANAGE },
  async (request, { organizationId, userId, params }) => {
    const body = await readJson<CreateBody>(request)

    if (!body.type || !HOLIDAY_TYPES.includes(body.type)) {
      throw new StandupError(
        'VALIDATION_FAILED',
        `Holiday type must be one of: ${HOLIDAY_TYPES.join(', ')}.`
      )
    }

    if (!body.name || !body.date) {
      throw new StandupError('VALIDATION_FAILED', 'A holiday needs both a name and a date.')
    }

    const holiday = await createHoliday({
      holidaySetId: params.setId,
      organizationId,
      actorId: userId,
      name: body.name,
      date: body.date,
      type: body.type,
      isFullDay: body.isFullDay !== false,
      minutesIfPartial: body.minutesIfPartial
    })

    await recordAudit({
      actor: { type: 'user', userId },
      organizationId,
      action: 'holiday_set_imported',
      entityType: 'working_calendar',
      entityId: holiday.id,
      entityName: `${holiday.name} (${holiday.date})`,
      before: null,
      after: { ...holiday }
    })

    return ok({ holiday }, { status: 201 })
  }
)
