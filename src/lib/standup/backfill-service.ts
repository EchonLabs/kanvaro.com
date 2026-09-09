/**
 * Backfilling a Missed stand-up (SCH-14, E49, §17.6).
 *
 * `wasBackfilled` and `backfilledAt` (`Standup` model) and
 * `backfillWindowWorkingDays` (`ProjectStandupSettings`, default 2) were all
 * real, schema-level fields with zero writers or enforcement anywhere in
 * production code before this file existed — `wasBackfilled` was read-only
 * (display, `schedule.ts`), and `backfillWindowWorkingDays` was only an
 * allowed field name in the settings-update route's whitelist. No route at
 * all existed under `src/app/api/standups/:id/backfill`.
 *
 * A backfill is functionally "run the real completion saga
 * (`runCompletionSaga`) against a `Missed` standup instead of an
 * `In_Progress` one, then additionally stamp `wasBackfilled`/`backfilledAt`."
 * The saga itself does not care what status a standup was in before it ran —
 * its only status guards are "not already Completed" and the optimistic
 * version check — so no saga change was needed; this service supplies the
 * two things the saga does not: restricting the action to a genuinely
 * `Missed` standup, and enforcing SCH-14's window.
 *
 * **Window arithmetic reuses `working-day.ts`/`calendar-service.ts` rather
 * than inventing new date math.** CAL-1 makes calendar resolution the single
 * place weekend/holiday logic may live; a bespoke "days since" calculation
 * here would silently ignore the project's working week and holidays.
 *
 * **No `X-Standup-Version` optimistic-concurrency header is required on the
 * route**, unlike `start`/`complete`. A `Missed` standup is, by definition,
 * one nobody is actively running — RUN-2 already guarantees at most one
 * `In_Progress` standup per sprint, and a `Missed` one sits idle until either
 * a reconcile job or this backfill touches it. There is no concurrent editor
 * to race against the way a live "Complete" click has to race a second click
 * on the same run screen. The service still reads the standup's current
 * version itself and passes it through as `CompletionContext.expectedVersion`
 * — the saga's own stale-version guard stays intact — it is only the
 * *client-supplied* version header that is skipped.
 */
import { Standup } from '@/models/Standup'
import { ProjectStandupSettings } from '@/models/ProjectStandupSettings'

import { addDays, isoOfStoredDate, todayInTimezone, type IsoDate } from './calendar-dates'
import { loadCalendarContext } from './calendar-service'
import { resolveWorkingDaysFrom } from './working-day'
import { assembleCompletionContext } from './completion-context'
import { runCompletionSaga } from './completion-saga'
import { recordAudit } from './audit'
import { StandupError } from './errors'

/** Mirrors `ProjectStandupSettings`'s own schema default for this field. */
const DEFAULT_BACKFILL_WINDOW_WORKING_DAYS = 2

export interface BackfillStandupInput {
  standupId: string
  backfilledBy: string
  notes?: string
  now?: Date
}

export interface BackfillStandupResult {
  standup: InstanceType<typeof Standup>
  summaryId: string
}

/** SCH-14: back-fills a `Missed` stand-up, within the project's configured window. */
export async function backfillStandup(
  input: BackfillStandupInput
): Promise<BackfillStandupResult> {
  const standup = await Standup.findById(input.standupId)
  if (!standup) throw new StandupError('NOT_FOUND', 'Stand-up not found.')

  if (standup.status !== 'Missed') {
    throw new StandupError(
      'STANDUP_NOT_STARTABLE',
      'Only a stand-up marked Missed can be backfilled.',
      { status: standup.status }
    )
  }

  const now = input.now ?? new Date()
  const projectId = String(standup.project)
  const organizationId = String(standup.organization)

  const settings = (await ProjectStandupSettings.findOne({ project: projectId })
    .select('backfillWindowWorkingDays')
    .lean()) as { backfillWindowWorkingDays?: number } | null
  const windowDays = settings?.backfillWindowWorkingDays ?? DEFAULT_BACKFILL_WINDOW_WORKING_DAYS

  const elapsedWorkingDays = await countElapsedWorkingDays(projectId, standup.standupDate, now)

  if (elapsedWorkingDays > windowDays) {
    throw new StandupError(
      'VALIDATION_FAILED',
      `This stand-up was missed ${elapsedWorkingDays} working day(s) ago, which is outside the ` +
        `${windowDays}-working-day backfill window for this project.`,
      { standupDate: standup.standupDate, elapsedWorkingDays, windowDays }
    )
  }

  const ctx = await assembleCompletionContext({
    standupId: input.standupId,
    standup,
    projectId,
    organizationId,
    completedBy: input.backfilledBy,
    notes: input.notes,
    expectedVersion: standup.version
  })

  const result = await runCompletionSaga(ctx)

  // The saga's own `finalize` step already flipped status/completedAt/version
  // via a targeted `updateOne`; this stamps the two backfill-specific fields
  // the same way, rather than re-saving the whole (now stale) in-memory doc.
  await Standup.updateOne(
    { _id: input.standupId },
    { $set: { wasBackfilled: true, backfilledAt: now } }
  )

  await recordAudit({
    actor: { type: 'user', userId: input.backfilledBy },
    organizationId,
    action: 'standup_backfilled',
    entityType: 'standup',
    entityId: input.standupId,
    projectId,
    before: { status: 'Missed', wasBackfilled: false },
    after: { status: 'Completed', wasBackfilled: true, elapsedWorkingDays, windowDays }
  })

  const reloaded = await Standup.findById(input.standupId)
  if (!reloaded) throw new StandupError('NOT_FOUND', 'Stand-up not found.')

  return { standup: reloaded, summaryId: result.summaryId }
}

/**
 * Working days elapsed between a stand-up's date (exclusive) and `now`
 * (inclusive), in the project's own calendar — CAL-1's single resolution
 * path, not bespoke date arithmetic.
 */
async function countElapsedWorkingDays(
  projectId: string,
  standupDate: IsoDate,
  now: Date
): Promise<number> {
  // A generous upper bound for the holiday-range query below: the project's
  // timezone is not known yet (it comes back inside the loaded context), so
  // this pads a day past the UTC reading of `now` to safely cover timezones
  // ahead of UTC too.
  const approxToday = addDays(isoOfStoredDate(now), 1)
  const rangeUpperBound = approxToday > standupDate ? approxToday : standupDate

  const context = await loadCalendarContext(projectId, standupDate, rangeUpperBound)
  const todayIso = todayInTimezone(context.timezone, now)

  const rangeFrom = addDays(standupDate, 1)
  if (rangeFrom > todayIso) return 0

  const resolutions = resolveWorkingDaysFrom(rangeFrom, todayIso, context)
  return resolutions.filter((resolution) => resolution.isWorkingDay).length
}
