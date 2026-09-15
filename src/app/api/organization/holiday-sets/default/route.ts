/**
 * The organisation's default holiday calendar.
 *
 *   PUT /api/organization/holiday-sets/default   { holidaySetId }
 *
 * "Default" here means the organisation-level `WorkingCalendar`'s
 * subscription list — every project with no calendar of its own inherits it
 * (see `/api/projects/:id/working-calendar`'s GET). The admin picks exactly
 * one set at a time: a seeded/manually-managed calendar, or the induwara.lk
 * API-backed one. `syncHolidaysFromApi` only ever sets this on the very first
 * refresh, when nothing has been chosen yet — every subsequent choice is the
 * admin's alone, and a later API refresh never overrides it.
 */
import { HolidaySet } from '@/models/HolidaySet'
import { WorkingCalendar } from '@/models/WorkingCalendar'
import { Permission } from '@/lib/permissions/permission-definitions'
import { recordAudit } from '@/lib/standup/audit'
import { StandupError } from '@/lib/standup/errors'
import { ok, readJson, withStandupPermission } from '@/lib/standup/route-helpers'

export const PUT = withStandupPermission(
  { permission: Permission.HOLIDAY_MANAGE },
  async (request, { organizationId, userId }) => {
    const body = await readJson<{ holidaySetId: string }>(request)
    const holidaySetId = body.holidaySetId

    if (!holidaySetId) {
      throw new StandupError('VALIDATION_FAILED', 'A holiday set id is required.')
    }

    const set = await HolidaySet.findOne({ _id: holidaySetId, organization: organizationId })
    if (!set) {
      throw new StandupError('NOT_FOUND', 'That holiday set does not exist.')
    }

    const before = await WorkingCalendar.findOne({
      organization: organizationId,
      scope: 'organization'
    })
      .select('subscribedHolidaySets')
      .lean()

    await WorkingCalendar.updateOne(
      { organization: organizationId, scope: 'organization' },
      { $set: { subscribedHolidaySets: [holidaySetId] } },
      { upsert: true }
    )

    await recordAudit({
      actor: { type: 'user', userId },
      organizationId,
      action: 'holiday_set_imported',
      entityType: 'working_calendar',
      entityId: holidaySetId,
      entityName: set.name,
      before: { subscribedHolidaySets: (before as any)?.subscribedHolidaySets ?? [] },
      after: { subscribedHolidaySets: [holidaySetId] }
    })

    return ok({ defaultHolidaySetId: holidaySetId })
  }
)
