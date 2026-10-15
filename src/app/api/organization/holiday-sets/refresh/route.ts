/**
 * Refresh the "Sri Lanka Public Holidays" set from the induwara.lk API.
 *
 *   POST /api/organization/holiday-sets/refresh
 *
 * A manual, admin-triggered action — Kanvaro's self-hosted deployment has no
 * external cron, and the user deliberately asked for a button rather than a
 * background sync. Safe to click repeatedly: `syncHolidaysFromApi` upserts and
 * never resurrects a withdrawn holiday.
 */
import { Organization } from '@/models/Organization'
import { Permission } from '@/lib/permissions/permission-definitions'
import { recordAudit } from '@/lib/standup/audit'
import { syncHolidaysFromApi } from '@/lib/standup/holiday-api-sync'
import { ok, withStandupPermission } from '@/lib/standup/route-helpers'

/** Only these years are currently published by the API. */
const REFRESH_YEARS = [2026, 2027]

export const POST = withStandupPermission(
  { permission: Permission.HOLIDAY_MANAGE },
  async (_request, { organizationId, userId }) => {
    const organization = await Organization.findById(organizationId)
      .select('holidayApiConfig')
      .lean()

    const apiKey = (organization as any)?.holidayApiConfig?.apiKey || undefined

    const summary = await syncHolidaysFromApi({
      organizationId,
      userId,
      apiKey,
      years: REFRESH_YEARS
    })

    await Organization.updateOne(
      { _id: organizationId },
      { $set: { 'holidayApiConfig.lastRefreshedAt': new Date(summary.lastRefreshedAt) } }
    )

    await recordAudit({
      actor: { type: 'user', userId },
      organizationId,
      action: 'holiday_set_imported',
      entityType: 'working_calendar',
      entityId: summary.setId,
      entityName: 'Sri Lanka Public Holidays',
      before: null,
      after: { ...summary }
    })

    return ok(summary)
  }
)
