/**
 * Bulk holiday import (spec §17.3, CAL-10).
 *
 *   POST /api/organization/holiday-sets/:setId/import
 *
 * Accepts either a multipart file upload or a raw CSV body. **All or nothing**:
 * if any row fails validation nothing is written and the failing row numbers
 * come back, because a half-loaded calendar silently misses public holidays.
 */
import { NextRequest } from 'next/server'

import { Holiday } from '@/models/Holiday'
import { HolidaySet } from '@/models/HolidaySet'
import { Permission } from '@/lib/permissions/permission-definitions'
import { recordAudit } from '@/lib/standup/audit'
import { StandupError } from '@/lib/standup/errors'
import { describeImportFailure, parseHolidayCsv } from '@/lib/standup/holiday-import'
import { ok, withStandupPermission } from '@/lib/standup/route-helpers'

export const POST = withStandupPermission(
  { permission: Permission.HOLIDAY_MANAGE },
  async (request, { organizationId, userId, params }) => {
    const setId = params.setId

    const set = await HolidaySet.findOne({ _id: setId, organization: organizationId })
    if (!set) {
      throw new StandupError('NOT_FOUND', 'That holiday set does not exist.')
    }

    const csv = await readCsv(request)
    if (!csv.trim()) {
      throw new StandupError('VALIDATION_FAILED', 'No CSV content was supplied.')
    }

    const parsed = parseHolidayCsv(csv)

    if (!parsed.ok) {
      // 422 with the row numbers, per CAL-10. Nothing has been written.
      throw new StandupError('VALIDATION_FAILED', describeImportFailure(parsed.errors), {
        imported: 0,
        rejected: parsed.errors
      })
    }

    // Re-importing a year that is already loaded should be idempotent rather
    // than duplicating every row, so existing name+date pairs are updated.
    const operations = parsed.rows.map((row) => ({
      updateOne: {
        filter: { holidaySet: set._id, date: row.date, name: row.name },
        update: {
          $set: {
            holidaySet: set._id,
            organization: organizationId,
            name: row.name,
            date: row.date,
            type: row.type,
            isFullDay: row.isFullDay,
            minutesIfPartial: row.minutesIfPartial,
            createdBy: userId
          }
        },
        upsert: true
      }
    }))

    const result = await Holiday.bulkWrite(operations, { ordered: false })

    await recordAudit({
      actor: { type: 'user', userId },
      organizationId,
      action: 'holiday_set_imported',
      entityType: 'working_calendar',
      entityId: set._id.toString(),
      entityName: set.name,
      before: null,
      after: { rowCount: parsed.rows.length },
      context: {
        inserted: result.upsertedCount ?? 0,
        updated: result.modifiedCount ?? 0
      }
    })

    return ok({
      imported: parsed.rows.length,
      inserted: result.upsertedCount ?? 0,
      updated: result.modifiedCount ?? 0,
      rejected: [],
      dateRange: {
        from: parsed.rows[0].date,
        to: parsed.rows[parsed.rows.length - 1].date
      }
    })
  }
)

/** Accepts a multipart upload from the UI, or a raw body for scripted imports. */
async function readCsv(request: NextRequest): Promise<string> {
  const contentType = request.headers.get('content-type') ?? ''

  if (contentType.includes('multipart/form-data')) {
    const form = await request.formData()
    const file = form.get('file')
    if (file && typeof file !== 'string') {
      return await file.text()
    }
    const inline = form.get('csv')
    return typeof inline === 'string' ? inline : ''
  }

  return await request.text()
}
