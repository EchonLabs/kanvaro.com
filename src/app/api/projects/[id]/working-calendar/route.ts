/**
 * Project working calendar (spec §17.3).
 *
 * Named `working-calendar` rather than `calendar` because `/api/calendar`
 * already serves the task and sprint event feed — a different concern entirely.
 *
 *   GET  /api/projects/:id/working-calendar   the calendar plus coverage warning
 *   PUT  /api/projects/:id/working-calendar   working week, hours, timezone, subscriptions
 */
import { NextRequest } from 'next/server'

import { HolidaySet } from '@/models/HolidaySet'
import { Organization } from '@/models/Organization'
import { WorkingCalendar } from '@/models/WorkingCalendar'
import { Permission } from '@/lib/permissions/permission-definitions'
import { recordAudit, auditSnapshot } from '@/lib/standup/audit'
import { isValidTimezone } from '@/lib/standup/calendar-dates'
import { checkHolidayCoverage } from '@/lib/standup/calendar-service'
import { StandupError } from '@/lib/standup/errors'
import { hoursToMinutes, minutesToHours } from '@/lib/standup/minutes'
import { notifyCalendarChangeSafely } from '@/lib/standup/notifications'
import { previewWorkingWeekChange } from '@/lib/standup/preview-impact'
import { ok, readJson, withStandupPermission } from '@/lib/standup/route-helpers'

const AUDITED_FIELDS = [
  'workingDaysOfWeek',
  'standardMinutesPerDay',
  'timezone',
  'subscribedHolidaySets'
] as const

export const GET = withStandupPermission(
  { permission: Permission.STANDUP_VIEW, projectIdParam: 'id' },
  async (_request, { projectId, organizationId }) => {
    let calendar = await WorkingCalendar.findOne({ project: projectId, scope: 'project' }).lean()

    // A project that has never been configured inherits the organisation's
    // working week. Returned as a preview with `inherited: true` rather than
    // written, so nothing is persisted until the PM actually saves.
    let inherited = false
    if (!calendar) {
      inherited = true
      const orgCalendar = await WorkingCalendar.findOne({
        organization: organizationId,
        scope: 'organization'
      }).lean()

      const organization = await Organization.findById(organizationId)
        .select('timezone')
        .lean()

      calendar = (orgCalendar as any) ?? {
        workingDaysOfWeek: [1, 2, 3, 4, 5],
        standardMinutesPerDay: 480,
        timezone: (organization as any)?.timezone ?? 'UTC',
        subscribedHolidaySets: [],
        overrides: []
      }
    }

    const sets = await HolidaySet.find({ organization: organizationId, isActive: true })
      .select('name description countryCode')
      .lean()

    const coverageWarning = projectId
      ? await checkHolidayCoverage(projectId, isoToday(), isoOneYearOut())
      : null

    return ok({
      inherited,
      calendar: serialiseCalendar(calendar),
      availableHolidaySets: sets.map((set: any) => ({
        id: set._id.toString(),
        name: set.name,
        description: set.description,
        countryCode: set.countryCode
      })),
      coverageWarning
    })
  }
)

interface UpdateBody {
  workingDaysOfWeek: number[]
  standardHoursPerDay: number
  timezone: string
  subscribedHolidaySetIds: string[]
}

export const PUT = withStandupPermission(
  { permission: Permission.STANDUP_CONFIGURE, projectIdParam: 'id' },
  async (request, { projectId, organizationId, userId }) => {
    const body = await readJson<UpdateBody>(request)

    if (!Array.isArray(body.workingDaysOfWeek) || body.workingDaysOfWeek.length === 0) {
      throw new StandupError(
        'VALIDATION_FAILED',
        'Select at least one working day of the week.'
      )
    }

    if (!body.timezone || !isValidTimezone(body.timezone)) {
      throw new StandupError(
        'VALIDATION_FAILED',
        `"${body.timezone}" is not a recognised timezone.`
      )
    }

    const standardMinutesPerDay = hoursToMinutes(body.standardHoursPerDay ?? 8)

    const before = await WorkingCalendar.findOne({ project: projectId, scope: 'project' }).lean()

    // Work out the consequences of a working-week change *before* saving, so the
    // CAL-15 notification can name them. Only computed when the week actually
    // changed — a timezone or hours edit does not move any stand-up date.
    const weekChanged =
      !!before &&
      JSON.stringify((before as any).workingDaysOfWeek ?? []) !==
        JSON.stringify(body.workingDaysOfWeek)

    const weekImpact = weekChanged
      ? await previewWorkingWeekChange(
          projectId!,
          { workingDaysOfWeek: body.workingDaysOfWeek },
          { from: isoToday(), to: isoOneYearOut() }
        )
      : null

    const calendar = await WorkingCalendar.findOneAndUpdate(
      { project: projectId, scope: 'project' },
      {
        $set: {
          scope: 'project',
          organization: organizationId,
          project: projectId,
          workingDaysOfWeek: body.workingDaysOfWeek,
          standardMinutesPerDay,
          timezone: body.timezone,
          subscribedHolidaySets: body.subscribedHolidaySetIds ?? []
        },
        // Preserve existing overrides — this endpoint owns layers 1 and 2 only.
        $setOnInsert: { overrides: [] }
      },
      { new: true, upsert: true, runValidators: true }
    ).lean()

    await recordAudit({
      actor: { type: 'user', userId },
      organizationId,
      projectId,
      action: 'working_calendar_updated',
      entityType: 'working_calendar',
      entityId: (calendar as any)._id.toString(),
      before: auditSnapshot(before as any, AUDITED_FIELDS),
      after: auditSnapshot(calendar as any, AUDITED_FIELDS)
    })

    if (weekImpact) {
      // CAL-15 — one notification covering every date the new week moved.
      await notifyCalendarChangeSafely({
        projectId: projectId!,
        organizationId,
        recipientIds: [userId],
        items: weekImpact.items,
        changeLabel: 'The working week for this project changed.'
      })
    }

    return ok({
      calendar: serialiseCalendar(calendar),
      impactSummary: weekImpact?.summary ?? null,
      affectedStandups: weekImpact?.items ?? []
    })
  }
)

function serialiseCalendar(calendar: any) {
  return {
    id: calendar._id?.toString(),
    workingDaysOfWeek: calendar.workingDaysOfWeek ?? [1, 2, 3, 4, 5],
    standardMinutesPerDay: calendar.standardMinutesPerDay ?? 480,
    // `Hours` fields are a read-only display convenience (§17.1); minutes are
    // the contract.
    standardHoursPerDay: minutesToHours(calendar.standardMinutesPerDay ?? 480),
    timezone: calendar.timezone ?? 'UTC',
    subscribedHolidaySetIds: (calendar.subscribedHolidaySets ?? []).map((id: any) =>
      id.toString()
    ),
    overrides: (calendar.overrides ?? []).map((override: any) => ({
      id: override._id?.toString(),
      date: override.date,
      name: override.name,
      effect: override.effect,
      isPartialDay: override.isPartialDay === true,
      minutesIfPartial: override.minutesIfPartial,
      recurringAnnually: override.recurringAnnually === true,
      appliesToMemberIds: (override.appliesToMemberIds ?? []).map((id: any) => id.toString())
    }))
  }
}

const isoToday = () => new Date().toISOString().slice(0, 10)

const isoOneYearOut = () => {
  const date = new Date()
  date.setUTCFullYear(date.getUTCFullYear() + 1)
  return date.toISOString().slice(0, 10)
}
