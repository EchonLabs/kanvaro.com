/**
 * Applies a schedule change to a sprint's stand-ups (spec SCH-6, SCH-7,
 * CAL-12..CAL-16).
 *
 * The decisions live in `reconcile-rules.ts`, which is pure and exhaustively
 * tested across all nine triggers × eight statuses. This file does nothing but
 * carry them out, in an order chosen so that a crash halfway leaves a state the
 * next run repairs rather than one nothing can explain:
 *
 *   1. Plan. A refusal (SCH-7) happens here, before any write.
 *   2. Skips and cancellations, so a day that must not run stops being live
 *      first.
 *   3. Creations, then renumbering, so day numbers are computed against the
 *      final set.
 *   4. One consolidated N10 (CAL-15).
 *
 * Re-running is safe by construction: every action is expressed as a target
 * state, not a delta.
 */
import { ProjectStandupSettings } from '@/models/ProjectStandupSettings'
import { Sprint } from '@/models/Sprint'
import { Standup } from '@/models/Standup'

import { recordAudit, systemActor, type AuditActor } from './audit'
import { loadCalendarContext } from './calendar-service'
import { isoOfStoredDate, toInstant, type IsoDate } from './calendar-dates'
import { immutableCompletedStandup, StandupError } from './errors'
import { notifyCalendarChangeSafely } from './notifications'
import {
  planReconcile,
  type ExistingStandupRow,
  type ReconcileTrigger
} from './reconcile-rules'
import { resolveWorkingDaysFrom, workingDatesFrom } from './working-day'

export type { ReconcileTrigger }

export interface ReconcileResult {
  created: number
  skipped: number
  cancelled: number
  renumbered: number
  rescheduled: number
  /** Dates where a completed stand-up blocked the change (CAL-12, AC-4). */
  anomalies: IsoDate[]
  /** Dates where an in-progress stand-up needs the facilitator's decision. */
  warnings: IsoDate[]
  notificationsSent: number
}

/**
 * Where prepared carry-forward items go when their day stops running (CAL-12,
 * AC-3, SCH-13).
 *
 * **Phase 9 seam.** The carry-forward register is Phase 9's; until it exists
 * there is nothing to move, so the default is a no-op that is accurate rather
 * than permissive — exactly the shape Phase 3 used for the completed-stand-up
 * lookup. Phase 9 replaces these two defaults and inherits the behaviour AC-3
 * already pins through injection here.
 */
export interface CarryForwardMove {
  fromStandupId: string
  fromDate: IsoDate
  /** `null` when the skipped day was the last one — nothing left to carry to. */
  toStandupId: string | null
  toDate: IsoDate | null
  count: number
}

export type CarryForwardMover = (move: CarryForwardMove) => Promise<void>
export type CarryForwardCounter = (standupId: string) => Promise<number>

const moveCarryForwardPending: CarryForwardMover = async () => {}
const countCarryForwardPending: CarryForwardCounter = async () => 0

export interface ReconcileOptions {
  actorId?: string
  systemActorName?: string
  /** Names the change in the N10 notification, e.g. "Nikini Poya was declared." */
  changeLabel?: string
  moveCarryForward?: CarryForwardMover
  carryForwardCountByStandupId?: CarryForwardCounter
}

export async function reconcileSprintSchedule(
  sprintId: string,
  trigger: ReconcileTrigger,
  options: ReconcileOptions = {}
): Promise<ReconcileResult> {
  const sprint = (await Sprint.findById(sprintId).lean()) as any
  if (!sprint) {
    throw new StandupError('NOT_FOUND', 'That sprint no longer exists.', { sprintId })
  }

  const projectId = sprint.project.toString()
  const from = isoOfStoredDate(sprint.startDate)
  const to = isoOfStoredDate(sprint.endDate)

  const existingDocs = (await Standup.find({ sprint: sprintId })
    .sort({ standupDate: 1 })
    .lean()) as any[]

  const countCarryForward =
    options.carryForwardCountByStandupId ?? countCarryForwardPending

  const existing: ExistingStandupRow[] = await Promise.all(
    existingDocs.map(async (doc) => ({
      id: doc._id.toString(),
      date: doc.standupDate,
      status: doc.status,
      sprintDayNumber: doc.sprintDayNumber,
      totalSprintDays: doc.totalSprintDays,
      shape: doc.shape,
      displayedDayNumber: doc.displayedDayNumber,
      carryForwardCount: await countCarryForward(doc._id.toString())
    }))
  )

  // The range still has to be resolved for a cancellation, because the plan
  // reports on dates either way, and resolving is cheap next to the writes.
  const context = await loadCalendarContext(projectId, minDate(from, existingDocs), to)
  const resolutions = resolveWorkingDaysFrom(from, to, context)
  const workingDates = workingDatesFrom(resolutions)

  const reasonByDate: Record<IsoDate, string> = {}
  for (const resolution of resolutions) {
    if (resolution.isWorkingDay) continue
    reasonByDate[resolution.date] =
      resolution.holidayName ?? resolution.overrideName ?? describeReason(resolution.reason)
  }

  // Throws IMMUTABLE_COMPLETED_STANDUP before anything is written (SCH-7, E9).
  const plan = planReconcile({
    trigger,
    range: { from, to },
    workingDates,
    existing,
    reasonByDate
  })

  const settings = ((await ProjectStandupSettings.findOne({ project: projectId }).lean()) ??
    {}) as any
  const localTime = settings.standupLocalTime ?? '09:15'
  const durationMinutes = settings.durationMinutes ?? 15

  const result: ReconcileResult = {
    created: 0,
    skipped: 0,
    cancelled: 0,
    renumbered: 0,
    rescheduled: 0,
    anomalies: [],
    warnings: [],
    notificationsSent: 0
  }

  const moveCarryForward = options.moveCarryForward ?? moveCarryForwardPending
  const nextWorkingDate = (after: IsoDate) =>
    workingDates.filter((date) => date > after).sort()[0] ?? null

  // --- 1. Days that stop running --------------------------------------------
  for (const action of plan.actions) {
    if (action.kind === 'skip') {
      await Standup.updateOne(
        { _id: action.standupId },
        {
          $set: {
            status: 'Skipped_Holiday',
            skippedReason: action.reason,
            // CAL-12 Missed row: the day was never missed if it was a holiday.
            ...(action.clearMissed ? { missedAt: null } : {})
          },
          $inc: { version: 1 }
        }
      )
      result.skipped += 1

      if (action.carryForwardCount > 0) {
        const toDate = nextWorkingDate(action.date)
        const toStandup = toDate
          ? await Standup.findOne({ sprint: sprintId, standupDate: toDate })
              .select('_id')
              .lean()
          : null

        await moveCarryForward({
          fromStandupId: action.standupId,
          fromDate: action.date,
          toStandupId: toStandup ? String((toStandup as any)._id) : null,
          toDate,
          count: action.carryForwardCount
        })
      }
    }

    if (action.kind === 'cancel') {
      await Standup.updateOne(
        { _id: action.standupId },
        { $set: { status: 'Cancelled', cancelledReason: action.reason }, $inc: { version: 1 } }
      )
      result.cancelled += 1
    }

    if (action.kind === 'anomaly') {
      // CAL-16: the stand-up itself is untouched. Only a note is appended, and
      // only once — re-running must not stack duplicate notes.
      const updated = await Standup.updateOne(
        { _id: action.standupId, 'calendarAnomalies.reason': { $ne: action.reason } },
        {
          $push: { calendarAnomalies: { recordedAt: new Date(), reason: action.reason } }
        }
      )

      if (updated.modifiedCount > 0) {
        await Sprint.updateOne(
          { _id: sprintId },
          {
            $push: {
              calendarAnomalies: {
                date: action.date,
                reason: action.reason,
                recordedAt: new Date()
              }
            }
          }
        )
      }

      result.anomalies.push(action.date)
    }

    if (action.kind === 'warn') {
      result.warnings.push(action.date)
    }
  }

  // --- 2. Days that start running -------------------------------------------
  for (const action of plan.actions) {
    if (action.kind !== 'create') continue

    const shared = {
      sprintDayNumber: action.sprintDayNumber,
      totalSprintDays: action.totalSprintDays,
      shape: action.shape,
      scheduledStartAt: toInstant(action.date, localTime, context.timezone),
      durationMinutes
    }

    if (action.standupId) {
      // Reviving a Skipped_Holiday or Cancelled row. Inserting instead would
      // collide with the unique (sprint, standupDate) index, and deleting it
      // would erase the record that the day was once skipped.
      await Standup.updateOne(
        { _id: action.standupId },
        {
          $set: { ...shared, status: 'Scheduled' },
          $unset: { skippedReason: '', cancelledReason: '', missedAt: '' },
          $inc: { version: 1 }
        }
      )
    } else {
      await Standup.create({
        project: sprint.project,
        sprint: sprint._id,
        organization: sprint.organization,
        standupDate: action.date,
        status: 'Scheduled',
        facilitator: settings.defaultFacilitator ?? sprint.createdBy,
        expectedAttendees: sprint.teamMembers ?? [],
        ...(settings.meetingUrl ? { meetingUrl: settings.meetingUrl } : {}),
        notificationsSent: {},
        ...shared
      })
    }

    result.created += 1
  }

  // --- 3. Renumbering and rescheduling --------------------------------------
  for (const action of plan.actions) {
    if (action.kind === 'renumber') {
      await Standup.updateOne(
        { _id: action.standupId },
        {
          $set: {
            sprintDayNumber: action.sprintDayNumber,
            totalSprintDays: action.totalSprintDays,
            shape: action.shape,
            ...(action.freezeDisplayedDayNumber === undefined
              ? {}
              : { displayedDayNumber: action.freezeDisplayedDayNumber })
          }
        }
      )
      result.renumbered += 1
    }

    if (action.kind === 'reschedule') {
      await Standup.updateOne(
        { _id: action.standupId },
        {
          $set: { scheduledStartAt: toInstant(action.date, localTime, context.timezone) },
          $inc: { version: 1 }
        }
      )
      result.rescheduled += 1
    }
  }

  // --- 4. One notification for the whole change (CAL-15) ---------------------
  if (plan.items.some((item) => item.disposition !== 'no_change')) {
    result.notificationsSent = await notifyCalendarChangeSafely({
      projectId,
      organizationId: sprint.organization.toString(),
      recipientIds: recipientsFor(sprint, settings),
      items: plan.items,
      changeLabel: options.changeLabel ?? describeTrigger(trigger),
      projectName: sprint.projectName
    })
  }

  if (plan.actions.length > 0) {
    await recordAudit({
      actor: auditActor(options),
      organizationId: sprint.organization.toString(),
      action: 'standup_reconciled',
      entityType: 'sprint',
      entityId: sprintId,
      entityName: sprint.name,
      projectId,
      context: { trigger },
      after: {
        created: result.created,
        skipped: result.skipped,
        cancelled: result.cancelled,
        renumbered: result.renumbered,
        rescheduled: result.rescheduled,
        anomalies: result.anomalies
      }
    })
  }

  return result
}


/**
 * Refuses a proposed sprint date change that would strand protected history
 * (SCH-6 rows 2 and 4, SCH-7, E9).
 *
 * Checked **before** the dates are written. Reconciling afterwards and rolling
 * back on failure would work, but a compensating write is exactly what plan D-A
 * says not to rely on when transactions cannot be assumed: a crash between the
 * two leaves a sprint whose dates have moved past a completed stand-up, which
 * is the state this rule exists to make impossible.
 */
export async function assertScheduleChangeAllowed(
  sprintId: string,
  proposed: { from: IsoDate; to: IsoDate }
): Promise<void> {
  const stranded = (await Standup.find({
    sprint: sprintId,
    status: { $in: ['Completed', 'Reopened', 'In_Progress'] },
    $or: [{ standupDate: { $lt: proposed.from } }, { standupDate: { $gt: proposed.to } }]
  })
    .select('standupDate')
    .sort({ standupDate: 1 })
    .lean()) as Array<{ standupDate: IsoDate }>

  if (stranded.length > 0) {
    throw immutableCompletedStandup(stranded.map((row) => row.standupDate))
  }
}

const auditActor = (options: ReconcileOptions): AuditActor =>
  options.actorId
    ? { type: 'user', userId: options.actorId }
    : systemActor(options.systemActorName ?? 'reconcile-standups')

/**
 * The earliest date the calendar must be loaded for.
 *
 * A stand-up can sit outside the current sprint range — that is precisely what
 * happens when the start moves later — and the context has to cover it or the
 * resolution for that date is missing rather than wrong.
 */
function minDate(from: IsoDate, existing: Array<{ standupDate: IsoDate }>): IsoDate {
  return existing.reduce(
    (earliest, doc) => (doc.standupDate < earliest ? doc.standupDate : earliest),
    from
  )
}

/** Who hears about a schedule change (SCH-16 N10: the facilitator). */
function recipientsFor(sprint: any, settings: any): string[] {
  const ids = [settings?.defaultFacilitator, sprint.createdBy]
    .filter(Boolean)
    .map((id: unknown) => String(id))

  return Array.from(new Set(ids))
}

function describeTrigger(trigger: ReconcileTrigger): string {
  switch (trigger) {
    case 'sprint_start_earlier':
    case 'sprint_start_later':
      return 'The sprint start date changed.'
    case 'sprint_end_earlier':
    case 'sprint_end_later':
      return 'The sprint end date changed.'
    case 'date_became_non_working':
    case 'date_became_working':
      return 'The working calendar changed.'
    case 'standup_time_changed':
      return 'The stand-up time changed.'
    case 'project_timezone_changed':
      return 'The project timezone changed.'
    case 'sprint_cancelled':
      return 'The sprint was cancelled.'
  }
}

function describeReason(reason: string): string {
  switch (reason) {
    case 'weekend':
      return 'Not a working day for this project.'
    case 'holiday':
      return 'Public holiday.'
    case 'override':
      return 'Closed by a calendar override.'
    default:
      return 'This date is no longer a working day.'
  }
}
