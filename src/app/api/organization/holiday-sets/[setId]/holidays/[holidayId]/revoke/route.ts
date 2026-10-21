/**
 * Withdraw a holiday (plan DO-3).
 *
 *   POST /api/organization/holiday-sets/:setId/holidays/:holidayId/revoke
 *
 * An explicit verb rather than a DELETE on the resource, because the behaviour
 * is genuinely not a deletion: the row stays, keeps its history, and stops
 * affecting future calendar resolution. Naming it `revoke` means no caller can
 * reach for DELETE and be surprised by what it does — there is no DELETE.
 */
import { Permission } from '@/lib/permissions/permission-definitions'
import { recordAudit } from '@/lib/standup/audit'
import { revokeHoliday } from '@/lib/standup/holiday-admin'
import { ok, readJson, withStandupPermission } from '@/lib/standup/route-helpers'

export const POST = withStandupPermission(
  { permission: Permission.HOLIDAY_MANAGE },
  async (request, { organizationId, userId, params }) => {
    const body = await readJson<{ reason: string }>(request)

    await revokeHoliday({
      holidayId: params.holidayId,
      organizationId,
      actorId: userId,
      reason: body.reason ?? ''
    })

    await recordAudit({
      actor: { type: 'user', userId },
      organizationId,
      action: 'holiday_set_imported',
      entityType: 'working_calendar',
      entityId: params.holidayId,
      before: { status: 'active' },
      after: { status: 'revoked', revokeReason: body.reason }
    })

    return ok({ revoked: true })
  }
)
