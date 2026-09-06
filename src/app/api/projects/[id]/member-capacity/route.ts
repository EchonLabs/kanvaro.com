/**
 * Member capacity for a project (spec §15.4).
 *
 *   GET /api/projects/:id/member-capacity[?asOf=YYYY-MM-DD]
 *   PUT /api/projects/:id/member-capacity
 *
 * DAT-1: capacity is dated. Updating someone's hours creates a new record from
 * an effective date and closes the previous one, so a historical stand-up still
 * resolves the hours that applied on its own day rather than today's.
 */
import { NextRequest } from 'next/server'

import { MemberCapacity } from '@/models/MemberCapacity'
import { Project } from '@/models/Project'
import { WorkingCalendar } from '@/models/WorkingCalendar'
import { Permission } from '@/lib/permissions/permission-definitions'
import { recordAudit } from '@/lib/standup/audit'
import { assertIsoDate, todayInTimezone } from '@/lib/standup/calendar-dates'
import { selectCapacityAsOf } from '@/lib/standup/capacity'
import { StandupError } from '@/lib/standup/errors'
import { hoursToMinutes, minutesToHours } from '@/lib/standup/minutes'
import { ok, readJson, withStandupPermission } from '@/lib/standup/route-helpers'

export const GET = withStandupPermission(
  { permission: Permission.STANDUP_VIEW, projectIdParam: 'id' },
  async (request, { projectId }) => {
    const { searchParams } = new URL(request.url)
    const asOfParam = searchParams.get('asOf')

    const calendar = await WorkingCalendar.findOne({
      project: projectId,
      scope: 'project'
    }).lean()

    const timezone = (calendar as any)?.timezone ?? 'UTC'
    const asOf = asOfParam ? assertIsoDate(asOfParam, 'asOf') : todayInTimezone(timezone)
    const projectStandardMinutes = (calendar as any)?.standardMinutesPerDay ?? 480

    const project = await Project.findById(projectId)
      .select('teamMembers')
      .populate('teamMembers.memberId', 'firstName lastName email')
      .lean()

    const records = await MemberCapacity.find({ project: projectId }).lean()

    const byMember = new Map<string, any[]>()
    for (const record of records as any[]) {
      const key = record.member.toString()
      const existing = byMember.get(key)
      if (existing) existing.push(record)
      else byMember.set(key, [record])
    }

    const members = ((project as any)?.teamMembers ?? []).map((entry: any) => {
      const memberId = (entry.memberId?._id ?? entry.memberId)?.toString()
      const history = byMember.get(memberId) ?? []
      const current = selectCapacityAsOf(history, asOf)

      const dailyCapacityMinutes = current?.dailyCapacityMinutes ?? projectStandardMinutes

      return {
        memberId,
        firstName: entry.memberId?.firstName,
        lastName: entry.memberId?.lastName,
        email: entry.memberId?.email,
        dailyCapacityMinutes,
        dailyCapacityHours: minutesToHours(dailyCapacityMinutes),
        // Explicit, so the screen can show "inherited from project standard"
        // rather than implying someone set this deliberately.
        isDefault: !current,
        effectiveFrom: current?.effectiveFrom,
        nonProjectCommitments: current?.nonProjectCommitments ?? [],
        leave: current?.leave ?? [],
        observedOptionalHolidays: (current?.observedOptionalHolidays ?? []).map((id: any) =>
          id.toString()
        )
      }
    })

    return ok({ asOf, projectStandardMinutes, members })
  }
)

interface UpdateBody {
  memberId: string
  dailyCapacityHours: number
  effectiveFrom?: string
  nonProjectCommitments?: Array<{ label: string; hoursPerDay: number; daysOfWeek: number[] }>
  observedOptionalHolidayIds?: string[]
}

export const PUT = withStandupPermission(
  { permission: Permission.STANDUP_CONFIGURE, projectIdParam: 'id' },
  async (request, { projectId, organizationId, userId }) => {
    const body = await readJson<UpdateBody>(request)

    if (!body.memberId) {
      throw new StandupError('VALIDATION_FAILED', 'A member is required.')
    }

    if (body.dailyCapacityHours === undefined || body.dailyCapacityHours < 0) {
      throw new StandupError('VALIDATION_FAILED', 'Daily capacity must be zero or more hours.')
    }

    const calendar = await WorkingCalendar.findOne({
      project: projectId,
      scope: 'project'
    }).lean()
    const timezone = (calendar as any)?.timezone ?? 'UTC'

    const effectiveFrom = body.effectiveFrom
      ? assertIsoDate(body.effectiveFrom, 'effectiveFrom')
      : todayInTimezone(timezone)

    const dailyCapacityMinutes = hoursToMinutes(body.dailyCapacityHours)

    const previous = await MemberCapacity.findOne({
      project: projectId,
      member: body.memberId,
      effectiveTo: { $exists: false }
    })

    // DAT-1 — close the open record rather than editing it, so history stays
    // truthful and past stand-ups keep resolving the hours that applied then.
    if (previous) {
      if (previous.effectiveFrom === effectiveFrom) {
        previous.dailyCapacityMinutes = dailyCapacityMinutes
        if (body.nonProjectCommitments) {
          previous.nonProjectCommitments = mapCommitments(body.nonProjectCommitments)
        }
        if (body.observedOptionalHolidayIds) {
          previous.observedOptionalHolidays = body.observedOptionalHolidayIds as any
        }
        await previous.save()

        await auditCapacity(userId, organizationId, projectId!, body.memberId, previous)
        return ok({ capacity: serialise(previous.toObject()) })
      }

      previous.effectiveTo = effectiveFrom
      await previous.save()
    }

    const created = await MemberCapacity.create({
      project: projectId,
      member: body.memberId,
      dailyCapacityMinutes,
      effectiveFrom,
      nonProjectCommitments: mapCommitments(body.nonProjectCommitments ?? []),
      observedOptionalHolidays: body.observedOptionalHolidayIds ?? [],
      leave: previous?.leave ?? []
    })

    await auditCapacity(userId, organizationId, projectId!, body.memberId, created, previous)

    return ok({ capacity: serialise(created.toObject()) }, { status: 201 })
  }
)

const mapCommitments = (
  commitments: Array<{ label: string; hoursPerDay: number; daysOfWeek: number[] }>
) =>
  commitments.map((commitment) => ({
    label: commitment.label,
    minutesPerDay: hoursToMinutes(commitment.hoursPerDay),
    daysOfWeek: commitment.daysOfWeek ?? []
  }))

async function auditCapacity(
  userId: string,
  organizationId: string,
  projectId: string,
  memberId: string,
  after: any,
  before?: any
) {
  await recordAudit({
    actor: { type: 'user', userId },
    organizationId,
    projectId,
    action: 'member_capacity_updated',
    entityType: 'member_capacity',
    entityId: after._id.toString(),
    before: before
      ? {
          dailyCapacityMinutes: before.dailyCapacityMinutes,
          effectiveFrom: before.effectiveFrom
        }
      : null,
    after: {
      dailyCapacityMinutes: after.dailyCapacityMinutes,
      effectiveFrom: after.effectiveFrom
    },
    context: { memberId }
  })
}

function serialise(record: any) {
  return {
    id: record._id?.toString(),
    memberId: record.member?.toString(),
    dailyCapacityMinutes: record.dailyCapacityMinutes,
    dailyCapacityHours: minutesToHours(record.dailyCapacityMinutes),
    effectiveFrom: record.effectiveFrom,
    effectiveTo: record.effectiveTo,
    nonProjectCommitments: record.nonProjectCommitments ?? [],
    leave: record.leave ?? []
  }
}
