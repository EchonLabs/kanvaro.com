/**
 * Organisation holiday sets (spec §17.3, CAL-7).
 *
 *   GET  /api/organization/holiday-sets   sets with counts and coverage
 *   POST /api/organization/holiday-sets   create a set
 *
 * Singular `organization`, matching `organization/settings`, and with no org id
 * in the path: the session resolves the caller's organisation server-side, so an
 * id here would be decorative and a second way to get authorisation wrong. The
 * spec's `/api/organizations/:orgId/...` assumes a multi-tenant shape Kanvaro
 * does not have.
 *
 * The organisation is taken from the session rather than the path — every other
 * route in Kanvaro scopes this way, and it removes a whole class of
 * cross-tenant mistakes.
 */
import { NextRequest } from 'next/server'

import { Holiday } from '@/models/Holiday'
import { HolidaySet } from '@/models/HolidaySet'
import { Permission } from '@/lib/permissions/permission-definitions'
import { recordAudit } from '@/lib/standup/audit'
import { StandupError } from '@/lib/standup/errors'
import { ok, readJson, withStandupPermission } from '@/lib/standup/route-helpers'

export const GET = withStandupPermission(
  { permission: Permission.STANDUP_VIEW },
  async (_request, { organizationId }) => {
    const sets = await HolidaySet.find({ organization: organizationId }).sort({ name: 1 }).lean()

    // One grouped aggregation rather than a count query per set.
    const stats = await Holiday.aggregate([
      // Revoked rows are excluded so the count and coverage shown here match
      // what the resolver will actually apply (DO-3).
      { $match: { organization: toObjectId(organizationId), status: { $ne: 'revoked' } } },
      {
        $group: {
          _id: '$holidaySet',
          count: { $sum: 1 },
          from: { $min: '$date' },
          to: { $max: '$date' }
        }
      }
    ])

    const statsBySet = new Map(stats.map((row) => [row._id.toString(), row]))

    return ok({
      holidaySets: (sets as any[]).map((set) => {
        const stat = statsBySet.get(set._id.toString())
        return {
          id: set._id.toString(),
          name: set.name,
          description: set.description,
          countryCode: set.countryCode,
          isActive: set.isActive,
          holidayCount: stat?.count ?? 0,
          // Sets are perpetual and topped up each year, so coverage is what
          // tells a PM whether next year's gazette has been loaded yet.
          coverage: stat ? { from: stat.from, to: stat.to } : null
        }
      })
    })
  }
)

interface CreateSetBody {
  name: string
  description?: string
  countryCode?: string
}

export const POST = withStandupPermission(
  { permission: Permission.HOLIDAY_MANAGE },
  async (request, { organizationId, userId }) => {
    const body = await readJson<CreateSetBody>(request)

    if (!body.name || body.name.trim().length < 3) {
      throw new StandupError(
        'INVALID_JUSTIFICATION',
        'Give the holiday set a name of at least 3 characters.'
      )
    }

    const existing = await HolidaySet.findOne({
      organization: organizationId,
      name: body.name.trim()
    })

    if (existing) {
      throw new StandupError(
        'INVALID_JUSTIFICATION',
        `A holiday set named "${body.name.trim()}" already exists.`
      )
    }

    const set = await HolidaySet.create({
      organization: organizationId,
      name: body.name.trim(),
      description: body.description?.trim(),
      countryCode: body.countryCode?.trim().toUpperCase(),
      createdBy: userId
    })

    await recordAudit({
      actor: { type: 'user', userId },
      organizationId,
      action: 'holiday_set_imported',
      entityType: 'working_calendar',
      entityId: set._id.toString(),
      entityName: set.name,
      before: null,
      after: { name: set.name, countryCode: set.countryCode }
    })

    return ok(
      { holidaySet: { id: set._id.toString(), name: set.name, holidayCount: 0 } },
      { status: 201 }
    )
  }
)

function toObjectId(id: string) {
  const mongoose = require('mongoose')
  return new mongoose.Types.ObjectId(id)
}
