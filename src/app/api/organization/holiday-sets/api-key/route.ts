/**
 * The induwara.lk API key used by the holiday refresh action.
 *
 *   GET /api/organization/holiday-sets/api-key    whether a key is configured
 *   PUT /api/organization/holiday-sets/api-key    set or replace the key
 *
 * The raw key is never returned to the client once saved — only whether one
 * is configured. Stored as a plaintext field on the Organization document,
 * the same precedent `emailConfig.smtp.password` already sets; this route
 * differs from `/api/settings/email` only in that it goes through
 * `withStandupPermission`, so it is actually gated on `HOLIDAY_MANAGE` rather
 * than left open to anyone who can reach the endpoint.
 */
import { Organization } from '@/models/Organization'
import { Permission } from '@/lib/permissions/permission-definitions'
import { recordAudit } from '@/lib/standup/audit'
import { StandupError } from '@/lib/standup/errors'
import { ok, readJson, withStandupPermission } from '@/lib/standup/route-helpers'

export const GET = withStandupPermission(
  { permission: Permission.HOLIDAY_MANAGE },
  async (_request, { organizationId }) => {
    const organization = await Organization.findById(organizationId)
      .select('holidayApiConfig')
      .lean()

    const apiKey = (organization as any)?.holidayApiConfig?.apiKey
    return ok({ hasApiKey: Boolean(apiKey) })
  }
)

export const PUT = withStandupPermission(
  { permission: Permission.HOLIDAY_MANAGE },
  async (request, { organizationId, userId }) => {
    const body = await readJson<{ apiKey: string }>(request)
    const apiKey = body.apiKey?.trim()

    if (!apiKey) {
      throw new StandupError('VALIDATION_FAILED', 'An API key is required.')
    }

    await Organization.updateOne(
      { _id: organizationId },
      { $set: { 'holidayApiConfig.provider': 'induwara', 'holidayApiConfig.apiKey': apiKey } }
    )

    await recordAudit({
      actor: { type: 'user', userId },
      organizationId,
      action: 'holiday_set_imported',
      entityType: 'working_calendar',
      entityName: 'Holiday API key',
      before: null,
      after: { hasApiKey: true }
    })

    return ok({ hasApiKey: true })
  }
)
