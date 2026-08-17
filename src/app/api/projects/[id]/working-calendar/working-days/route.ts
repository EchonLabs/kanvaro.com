/**
 * Resolved working days for a date range (spec §17.3).
 *
 *   GET /api/projects/:id/working-calendar/working-days?from=&to=
 *
 * Returns the full `WorkingDayResolution[]` — CAL-2 forbids collapsing this to
 * booleans, because callers need the reason, the holiday name, the partial-day
 * hours and the optional holidays.
 */
import { NextRequest } from 'next/server'

import { Permission } from '@/lib/permissions/permission-definitions'
import { assertIsoDate, eachDateInRange } from '@/lib/standup/calendar-dates'
import { checkHolidayCoverage, resolveWorkingDays } from '@/lib/standup/calendar-service'
import { StandupError } from '@/lib/standup/errors'
import { minutesToHours } from '@/lib/standup/minutes'
import { ok, withStandupPermission } from '@/lib/standup/route-helpers'

/** Guards against a request that would resolve an unbounded span. */
const MAX_RANGE_DAYS = 800

export const GET = withStandupPermission(
  { permission: Permission.STANDUP_VIEW, projectIdParam: 'id' },
  async (request, { projectId }) => {
    const { searchParams } = new URL(request.url)
    const from = searchParams.get('from')
    const to = searchParams.get('to')

    if (!from || !to) {
      throw new StandupError('VALIDATION_FAILED', 'Both from and to are required.')
    }

    assertIsoDate(from, 'from')
    assertIsoDate(to, 'to')

    if (to < from) {
      throw new StandupError('VALIDATION_FAILED', 'The end date must not be before the start date.')
    }

    if (eachDateInRange(from, to).length > MAX_RANGE_DAYS) {
      throw new StandupError(
        'VALIDATION_FAILED',
        `Ranges are limited to ${MAX_RANGE_DAYS} days. Request a narrower window.`
      )
    }

    const resolutions = await resolveWorkingDays(projectId!, from, to)
    const coverageWarning = await checkHolidayCoverage(projectId!, from, to)

    return ok({
      workingDays: resolutions.map((resolution) => ({
        ...resolution,
        // Read-only display convenience (§17.1); minutes remain the contract.
        standardHours: minutesToHours(resolution.standardMinutes)
      })),
      workingDayCount: resolutions.filter((r) => r.isWorkingDay).length,
      coverageWarning
    })
  }
)
