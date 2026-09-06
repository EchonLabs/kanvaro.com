/**
 * Live impact preview for a proposed calendar change (spec §17.3, UI-1).
 *
 *   POST /api/projects/:id/working-calendar/preview-impact
 *
 * UI-1 requires the impact panel to recompute **before saving** and to name the
 * specific stand-up dates that would be created or skipped. Nothing here writes.
 */
import { NextRequest } from 'next/server'

import { Permission } from '@/lib/permissions/permission-definitions'
import { addDays, assertIsoDate } from '@/lib/standup/calendar-dates'
import { StandupError } from '@/lib/standup/errors'
import {
  previewCalendarChange,
  previewOverrideRemoval,
  previewWorkingWeekChange
} from '@/lib/standup/preview-impact'
import { ok, readJson, withStandupPermission } from '@/lib/standup/route-helpers'

interface PreviewBody {
  change:
    | { kind: 'override'; date: string; effect: 'non_working' | 'observed_as_working'; recurringAnnually?: boolean }
    | { kind: 'remove_override'; overrideId: string; date: string }
    | { kind: 'working_week'; workingDaysOfWeek: number[]; from?: string; to?: string }
}

export const POST = withStandupPermission(
  { permission: Permission.STANDUP_VIEW, projectIdParam: 'id' },
  async (request, { projectId }) => {
    const body = await readJson<PreviewBody>(request)
    const change = body.change

    if (!change || typeof change !== 'object') {
      throw new StandupError('VALIDATION_FAILED', 'A proposed change is required.')
    }

    switch (change.kind) {
      case 'override': {
        assertIsoDate(change.date, 'date')
        return ok(await previewCalendarChange(projectId!, change))
      }

      case 'remove_override': {
        assertIsoDate(change.date, 'date')
        return ok(await previewOverrideRemoval(projectId!, change.overrideId, change.date))
      }

      case 'working_week': {
        if (!Array.isArray(change.workingDaysOfWeek) || change.workingDaysOfWeek.length === 0) {
          throw new StandupError(
            'VALIDATION_FAILED',
            'Select at least one working day of the week.'
          )
        }

        // A working-week change is unbounded in time, so preview a concrete
        // window: today through a year out unless the caller narrows it.
        const from = change.from ?? new Date().toISOString().slice(0, 10)
        const to = change.to ?? addDays(from, 365)
        assertIsoDate(from, 'from')
        assertIsoDate(to, 'to')

        return ok(
          await previewWorkingWeekChange(projectId!, change, { from, to })
        )
      }

      default:
        throw new StandupError('VALIDATION_FAILED', 'Unrecognised change kind.')
    }
  }
)
