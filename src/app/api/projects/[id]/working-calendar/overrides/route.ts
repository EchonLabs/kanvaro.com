/**
 * Project calendar overrides — layer 3 of working-day resolution (spec §17.3).
 *
 *   POST /api/projects/:id/working-calendar/overrides
 *
 * Returns the created override together with `affectedStandups[]`, because UI-2
 * requires the confirmation dialog to list every stand-up the change touches and
 * what will happen to it.
 */
import { NextRequest } from 'next/server'

import { WorkingCalendar } from '@/models/WorkingCalendar'
import { Permission } from '@/lib/permissions/permission-definitions'
import { recordAudit } from '@/lib/standup/audit'
import { assertIsoDate } from '@/lib/standup/calendar-dates'
import { StandupError } from '@/lib/standup/errors'
import { hoursToMinutes } from '@/lib/standup/minutes'
import { notifyCalendarChangeSafely } from '@/lib/standup/notifications'
import { ok, readJson, withStandupPermission } from '@/lib/standup/route-helpers'
import { previewCalendarChange } from '@/lib/standup/preview-impact'

interface CreateOverrideBody {
  date: string
  name: string
  effect: 'non_working' | 'observed_as_working'
  isPartialDay?: boolean
  hoursIfPartial?: number
  recurringAnnually?: boolean
  appliesToMemberIds?: string[]
}

export const POST = withStandupPermission(
  { permission: Permission.STANDUP_CONFIGURE, projectIdParam: 'id' },
  async (request, { projectId, organizationId, userId }) => {
    const body = await readJson<CreateOverrideBody>(request)

    if (!body.date) {
      throw new StandupError('VALIDATION_FAILED', 'A date is required.')
    }
    assertIsoDate(body.date, 'date')

    if (!body.name || body.name.trim().length < 3) {
      throw new StandupError(
        'INVALID_JUSTIFICATION',
        'Give the override a name of at least 3 characters so the schedule explains itself.'
      )
    }

    if (body.effect !== 'non_working' && body.effect !== 'observed_as_working') {
      throw new StandupError(
        'VALIDATION_FAILED',
        'Effect must be either non_working or observed_as_working.'
      )
    }

    const isPartialDay = body.isPartialDay === true
    if (isPartialDay && !body.hoursIfPartial) {
      throw new StandupError(
        'VALIDATION_FAILED',
        'A partial day needs the number of hours actually worked.'
      )
    }

    // Work out the consequences before writing, so the response can carry them.
    const impact = await previewCalendarChange(projectId!, {
      date: body.date,
      effect: body.effect
    })

    const override = {
      date: body.date,
      name: body.name.trim(),
      effect: body.effect,
      isPartialDay,
      minutesIfPartial: isPartialDay ? hoursToMinutes(body.hoursIfPartial!) : undefined,
      recurringAnnually: body.recurringAnnually === true,
      appliesToMemberIds: body.appliesToMemberIds ?? [],
      createdBy: userId,
      createdAt: new Date()
    }

    const calendar = await WorkingCalendar.findOneAndUpdate(
      { project: projectId, scope: 'project' },
      {
        $push: { overrides: override },
        $setOnInsert: {
          scope: 'project',
          organization: organizationId,
          project: projectId
        }
      },
      { new: true, upsert: true, runValidators: true }
    ).lean()

    const created = (calendar as any).overrides.at(-1)

    await recordAudit({
      actor: { type: 'user', userId },
      organizationId,
      projectId,
      action: 'working_calendar_updated',
      entityType: 'working_calendar',
      entityId: (calendar as any)._id.toString(),
      entityName: override.name,
      before: null,
      after: { override },
      context: { affectedStandups: impact.items.length }
    })

    // CAL-15 — one consolidated notification, never one per affected date.
    // Deliberately not awaited into the failure path: the override is saved and
    // audited, and a notification problem must not report it as failed.
    await notifyCalendarChangeSafely({
      projectId: projectId!,
      organizationId,
      recipientIds: [userId],
      items: impact.items,
      changeLabel: `"${override.name}" was added to the working calendar.`
    })

    return ok(
      {
        override: { ...override, id: created?._id?.toString() },
        affectedStandups: impact.items,
        impactSummary: impact.summary
      },
      { status: 201 }
    )
  }
)
