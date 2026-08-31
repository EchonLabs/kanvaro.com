/**
 * Everything needed to compute one stand-up's capacity, loaded once.
 *
 * `computeCapacity()` is pure and is the module's sole capacity authority, but
 * feeding it is not trivial: the calendar has to be resolved, the member's
 * *dated* capacity row selected (DAT-1), ceremonies resolved for the day
 * (DN-1 … DN-7), and the project's tolerances and overrun policy read. That is
 * four collections and a resolution step, and until now it lived inside
 * `snapshot.ts`.
 *
 * Phase 7 needs the identical computation on every allocation write, because
 * every mutation returns the member's recomputed breakdown. Copying the loader
 * would have created a second place where capacity is assembled — and two
 * assemblies that disagree by one input produce a board whose meter and whose
 * completion checks quietly contradict each other, which is the exact failure
 * `computeCapacity` being "the only authority" was meant to prevent. So the
 * loader moved here and both callers share it.
 *
 * The context is a **snapshot of inputs**, not a cache of results. Call
 * `computeFor` as often as you like; pass the allocated minutes you have just
 * written and it recomputes honestly.
 */
import { MemberCapacity } from '@/models/MemberCapacity'
import { ProjectStandupSettings } from '@/models/ProjectStandupSettings'
import { Standup } from '@/models/Standup'

import type { IsoDate } from './calendar-dates'
import { loadCalendarContext } from './calendar-service'
import {
  computeCapacity,
  selectCapacityAsOf,
  type AttendanceStatus,
  type CapacityBreakdown
} from './capacity'
import { resolveCeremonyDeductions, type CeremonyDeduction } from './ceremonies'
import { StandupError } from './errors'
import { minutes, ZERO_MINUTES, type Minutes } from './minutes'
import { resolveWorkingDayFrom } from './working-day'

export interface ComputeForOptions {
  /**
   * Minutes already allocated to this member today, **excluding** rows that are
   * blocked or detached. The caller owns that exclusion because it is the one
   * doing the query.
   */
  allocatedMinutes?: Minutes
  /**
   * Minutes detached from this member that nobody has taken over (RUN-7).
   * Surfaces as `strandedMinutes`, which is what OB-12's alert renders.
   */
  detachedMinutes?: Minutes
  /**
   * Overrides the attendance recorded on the stand-up. The attendance service
   * uses it to compute the *proposed* breakdown before it writes.
   */
  attendance?: AttendanceStatus
  attendancePartialMinutes?: Minutes
  /** Phase 8 supplies this from the ledger. Zero until then. */
  outstandingDebtMinutes?: Minutes
}

export interface CapacityContext {
  standup: any
  standupId: string
  projectId: string
  organizationId: string
  sprintId: string
  date: IsoDate
  settings: any
  /** DN-6. False means ceremony minutes were deliberately not deducted. */
  ceremoniesConsumeCapacity: boolean
  /** Everyone expected at this stand-up. */
  memberIds: string[]
  computeFor(memberId: string, options?: ComputeForOptions): CapacityBreakdown
}

/**
 * Loads the inputs for one stand-up's capacity arithmetic.
 *
 * Accepts an already-loaded stand-up so a caller that has just read one — which
 * every mutating service has, for the version guard — does not read it twice.
 */
export async function loadCapacityContext(
  standupId: string,
  preloaded?: any
): Promise<CapacityContext> {
  const standup = preloaded ?? ((await Standup.findById(standupId).lean()) as any)
  if (!standup) {
    throw new StandupError('NOT_FOUND', 'That stand-up no longer exists.', { standupId })
  }

  const projectId = standup.project.toString()
  const date: IsoDate = standup.standupDate

  const [settings, capacities, calendar] = await Promise.all([
    ProjectStandupSettings.findOne({ project: projectId }).lean() as Promise<any>,
    MemberCapacity.find({ project: projectId }).lean() as Promise<any[]>,
    loadCalendarContext(projectId, date, date)
  ])

  const resolution = resolveWorkingDayFrom(date, calendar)
  const memberIds: string[] = (standup.expectedAttendees ?? []).map((id: unknown) => String(id))

  // DN-3: the stand-up's own duration is passed here and nowhere else.
  // `resolveCeremonyDeductions` drops `daily_standup` SprintEvents and adds it
  // exactly once, so a project holding both loses fifteen minutes once.
  const ceremoniesConsumeCapacity = settings?.ceremoniesConsumeCapacity !== false
  const ceremonyPlan = ceremoniesConsumeCapacity
    ? await resolveCeremonyDeductions({
        projectId,
        sprintId: String(standup.sprint),
        date,
        memberIds,
        timezone: calendar.timezone,
        standupDurationMinutes: minutes(settings?.durationMinutes ?? 0)
      })
    : null

  const capacityByMember = new Map<string, any[]>()
  for (const record of capacities) {
    const key = record.member.toString()
    const existing = capacityByMember.get(key)
    if (existing) existing.push(record)
    else capacityByMember.set(key, [record])
  }

  /** Attendance as recorded on the stand-up, by member. */
  const attendanceByMember = new Map<string, { state: AttendanceStatus; partialMinutes?: number }>()
  for (const entry of standup.attendance ?? []) {
    attendanceByMember.set(String(entry.user), {
      state: entry.state,
      partialMinutes: entry.partialMinutes
    })
  }

  return {
    standup,
    standupId: String(standup._id),
    projectId,
    organizationId: String(standup.organization),
    sprintId: String(standup.sprint),
    date,
    settings,
    ceremoniesConsumeCapacity,
    memberIds,

    computeFor(memberId, options = {}) {
      // DAT-1: capacity is dated, so the row that applied *on this date* is the
      // one that counts — not whatever is current when this happens to run.
      const record = selectCapacityAsOf(capacityByMember.get(memberId) ?? [], date)
      const recorded = attendanceByMember.get(memberId)

      const attendance = options.attendance ?? recorded?.state
      const partial =
        options.attendancePartialMinutes ??
        (recorded?.partialMinutes === undefined
          ? undefined
          : minutes(recorded.partialMinutes))

      return computeCapacity({
        memberId,
        date,
        resolution,
        nominalMinutes: minutes(
          record?.dailyCapacityMinutes ?? resolution.fullStandardMinutes
        ),
        ...(attendance ? { attendance } : {}),
        ...(partial === undefined ? {} : { attendancePartialMinutes: partial }),
        leave: (record?.leave ?? []).map((entry: any) => ({
          startDate: entry.startDate,
          endDate: entry.endDate,
          minutesPerDay: entry.minutesPerDay,
          reason: entry.reason
        })),
        nonProjectCommitments: record?.nonProjectCommitments ?? [],
        ceremonies: (ceremonyPlan?.deductions.get(memberId) ?? []) as CeremonyDeduction[],
        observedOptionalHolidayIds: (record?.observedOptionalHolidayIds ?? []).map(String),
        outstandingDebtMinutes: options.outstandingDebtMinutes ?? ZERO_MINUTES,
        allocatedMinutes: options.allocatedMinutes ?? ZERO_MINUTES,
        detachedMinutes: options.detachedMinutes ?? ZERO_MINUTES,
        overrunPolicy: settings?.overrunPolicy,
        underToleranceMinutes: settings?.underToleranceMinutes,
        overToleranceMinutes: settings?.overToleranceMinutes
      })
    }
  }
}
