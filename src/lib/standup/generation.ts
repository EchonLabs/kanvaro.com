/**
 * Stand-up generation (spec SCH-1..SCH-5).
 *
 * One stand-up per working day in the sprint's inclusive range, resolved
 * through `resolveWorkingDay()` — CAL-1 makes that the only calendar authority,
 * so nothing here tests for a weekend or a holiday itself.
 *
 * **Idempotence replaces SCH-4's transaction.** The Mongo URI is user-supplied
 * (plan D-A) and may point at a standalone `mongod`, so a multi-document
 * transaction cannot be a precondition for the module working at all. Instead
 * the unique `(sprint, standupDate)` index makes a duplicate write a no-op:
 * running generation twice, or racing two generators, converges on the same
 * nine documents (SCH-2, E10). A partially written schedule is not a corrupt
 * state here — it is a state the next run completes.
 */
import mongoose from 'mongoose'

import { ProjectStandupSettings } from '@/models/ProjectStandupSettings'
import { Sprint } from '@/models/Sprint'
import { Standup } from '@/models/Standup'

import { recordAudit, systemActor, type AuditActor } from './audit'
import { checkHolidayCoverage, loadCalendarContext } from './calendar-service'
import { isoOfStoredDate, toInstant, type IsoDate } from './calendar-dates'
import { numberSprintDays } from './day-numbering'
import { StandupError } from './errors'
import { resolveWorkingDaysFrom, workingDatesFrom } from './working-day'

export interface GenerateResult {
  created: number
  /** Dates that already had a stand-up. AC-2 reports these rather than failing. */
  skipped: number
  standupDates: IsoDate[]
  totalSprintDays: number
  /** Set when the sprint runs past the loaded holiday data (register row 12). */
  coverageWarning?: string
}

/**
 * Settings a project has not configured yet.
 *
 * Mirrors the schema defaults rather than reading them off the model: a sprint
 * whose project never opened the configuration screen must still generate, and
 * silently generating nothing would be the worst of the available behaviours.
 */
const SETTINGS_DEFAULTS = {
  standupLocalTime: '09:15',
  durationMinutes: 15
}

export interface GenerateOptions {
  actorId?: string
  /** Names the caller in the audit trail when a job generates rather than a person. */
  systemActorName?: string
}

export async function generateStandupsForSprint(
  sprintId: string,
  options: GenerateOptions = {}
): Promise<GenerateResult> {
  const sprint = (await Sprint.findById(sprintId).lean()) as any
  if (!sprint) {
    throw new StandupError('NOT_FOUND', 'That sprint no longer exists.', { sprintId })
  }

  const projectId = sprint.project.toString()
  const from = isoOfStoredDate(sprint.startDate)
  const to = isoOfStoredDate(sprint.endDate)

  if (from > to) {
    throw new StandupError(
      'VALIDATION_FAILED',
      'This sprint ends before it starts, so no stand-ups can be generated.',
      { from, to }
    )
  }

  const settings = ((await ProjectStandupSettings.findOne({ project: projectId }).lean()) ??
    {}) as any

  // One context load for the whole range, then a pure resolution per date — the
  // batched path exists precisely so a 60-day sprint is not 60 round trips.
  const context = await loadCalendarContext(projectId, from, to)
  const resolutions = resolveWorkingDaysFrom(from, to, context)
  const workingDates = workingDatesFrom(resolutions)

  if (workingDates.length === 0) {
    // SCH-5. The message is the spec's own wording; the PM sees it on the
    // planning screen, where the fix is to move the sprint dates.
    throw new StandupError(
      'VALIDATION_FAILED',
      'This sprint contains no working days between its start and end dates.',
      { from, to }
    )
  }

  const numbering = numberSprintDays(workingDates)

  const existing = (await Standup.find({ sprint: sprintId })
    .select('standupDate')
    .lean()) as Array<{ standupDate: IsoDate }>
  const existingDates = new Set(existing.map((standup) => standup.standupDate))

  const localTime = settings.standupLocalTime ?? SETTINGS_DEFAULTS.standupLocalTime
  const durationMinutes = settings.durationMinutes ?? SETTINGS_DEFAULTS.durationMinutes
  const facilitator = settings.defaultFacilitator ?? sprint.createdBy
  const expectedAttendees = sprint.teamMembers ?? []

  const pending = numbering
    .filter((day) => !existingDates.has(day.date))
    .map((day) => ({
      project: sprint.project,
      sprint: sprint._id,
      organization: sprint.organization,
      standupDate: day.date,
      scheduledStartAt: toInstant(day.date, localTime, context.timezone),
      durationMinutes,
      sprintDayNumber: day.sprintDayNumber,
      totalSprintDays: day.totalSprintDays,
      shape: day.shape,
      status: 'Scheduled' as const,
      facilitator,
      expectedAttendees,
      ...(settings.meetingUrl ? { meetingUrl: settings.meetingUrl } : {}),
      notificationsSent: {}
    }))

  let created = 0
  if (pending.length > 0) {
    try {
      const inserted = await Standup.insertMany(pending, { ordered: false })
      created = inserted.length
    } catch (error) {
      // A racing generator won some of these dates. That is the designed
      // outcome of the unique index, not a failure: count what landed and
      // treat the collisions as skips (E10).
      created = countInsertedDespiteDuplicates(error, pending.length)
    }
  }

  const coverage = await checkHolidayCoverage(projectId, from, to)

  await recordAudit({
    actor: auditActor(options),
    organizationId: sprint.organization.toString(),
    action: 'standup_generated',
    entityType: 'sprint',
    entityId: sprintId,
    entityName: sprint.name,
    projectId,
    after: {
      created,
      totalSprintDays: numbering.length,
      from,
      to
    }
  })

  return {
    created,
    skipped: numbering.length - created,
    standupDates: workingDates,
    totalSprintDays: numbering.length,
    ...(coverage ? { coverageWarning: coverage.message } : {})
  }
}

const auditActor = (options: GenerateOptions): AuditActor =>
  options.actorId
    ? { type: 'user', userId: options.actorId }
    : systemActor(options.systemActorName ?? 'generate-standups')

/**
 * How many documents survived an unordered `insertMany` that hit duplicates.
 *
 * Rethrows anything that is not a duplicate-key failure — a validation error
 * must not be quietly reported as a skip.
 */
function countInsertedDespiteDuplicates(error: unknown, attempted: number): number {
  const bulkError = error as {
    code?: number
    writeErrors?: Array<{ err?: { code?: number }; code?: number }>
    insertedDocs?: unknown[]
    result?: { result?: { nInserted?: number } }
  }

  const writeErrors = bulkError.writeErrors ?? []
  const allDuplicates =
    writeErrors.length > 0 &&
    writeErrors.every((writeError) => (writeError.err?.code ?? writeError.code) === 11000)

  if (!allDuplicates && bulkError.code !== 11000) {
    throw error
  }

  if (Array.isArray(bulkError.insertedDocs)) {
    return bulkError.insertedDocs.length
  }

  return Math.max(0, attempted - (writeErrors.length || 1))
}

/** Exposed for the reconciler, which needs the same id shape when it creates. */
export const toObjectId = (id: string): mongoose.Types.ObjectId =>
  new mongoose.Types.ObjectId(id)
