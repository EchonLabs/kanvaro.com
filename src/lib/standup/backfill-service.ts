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
import mongoose from 'mongoose'

import { ATTENDANCE_STATES, Standup, type AttendanceState } from '@/models/Standup'
import { ProjectStandupSettings } from '@/models/ProjectStandupSettings'

import { ABSENT_STATES, assertPartialMinutes, detachAllocations } from './attendance-service'
import { addDays, isoOfStoredDate, todayInTimezone, type IsoDate } from './calendar-dates'
import { loadCapacityContext } from './capacity-context'
import type { Minutes } from './minutes'
import { loadCalendarContext } from './calendar-service'
import { resolveWorkingDaysFrom } from './working-day'
import { assembleCompletionContext } from './completion-context'
import { blockingFailures, evaluateCompletionChecks } from './completion-checks'
import { runCompletionSaga, type CompletionContext } from './completion-saga'
import {
  backfillNeedsMemberConfirmation,
  CHECK_TO_OVERRIDE_TYPE,
  filterOverriddenFailures,
  isCheckAcknowledgeableByBackfill
} from './override'
import { issueOverride } from './override-service'
import { recordAudit } from './audit'
import { overrideNotPermitted, StandupError } from './errors'

/** Mirrors `ProjectStandupSettings`'s own schema default for this field. */
const DEFAULT_BACKFILL_WINDOW_WORKING_DAYS = 2

/**
 * One row of SCH-14's "full run payload": the room as the facilitator recalls
 * it. `memberId` must be one of the stand-up's own `expectedAttendees`.
 */
export interface BackfillAttendanceEntry {
  memberId: string
  state: AttendanceState
  /** Required when `state` is `partial` — stored as `attendance.partialMinutes`. */
  minutes?: number
}

/** What a backfill actually wrote, for the audit trail (SEC-3). */
interface RecordedBackfillAttendance {
  memberId: string
  state: AttendanceState
  minutes?: number
  /** Allocations RUN-7 detached because this member was recorded absent. */
  detachedAllocationIds: string[]
}

/**
 * A member whose absence an *earlier* attempt recorded, and whose work this
 * call detached. Kept apart from `recorded` so the audit never claims a row
 * was written when it was not — see `applyBackfillAttendance`'s detach loop.
 */
interface DetachedForAlreadyRecorded {
  memberId: string
  state: AttendanceState
  detachedAllocationIds: string[]
}

interface BackfillAttendanceOutcome {
  /** Attendance rows this call wrote. */
  recorded: RecordedBackfillAttendance[]
  /** Absences an earlier attempt wrote, whose allocations this call detached. */
  detachedForAlreadyRecorded: DetachedForAlreadyRecorded[]
}

/**
 * Ruling 21: the facilitator's attestation for an overridable check that a
 * past day cannot pass. One justification per failing check id.
 */
export interface BackfillCheckAcknowledgement {
  checkId: string
  justification: string
  /**
   * CC-6 only (OVR-6). The facilitator's explicit confirmation that the
   * members named by the check agreed to the overtime. Required for that
   * check, ignored for the others.
   */
  memberAcknowledged?: boolean
}

export interface BackfillStandupInput {
  standupId: string
  backfilledBy: string
  notes?: string
  /** SCH-14's run payload. Fills gaps in `attendance`; never rewrites a record. */
  attendance?: BackfillAttendanceEntry[]
  /** Ruling 21: the facilitator's attestation for checks a past day cannot pass. */
  acknowledgedChecks?: BackfillCheckAcknowledgement[]
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

  // Ruling 21, checked here rather than inside `issueAcknowledgedOverrides`:
  // "is every acknowledged check one a backfill may waive at all" needs no
  // context and no database read, so it must be answered BEFORE the attendance
  // write below. Refusing it afterwards would leave a `Missed` stand-up with a
  // half-applied backfill — attendance persisted and allocations detached for
  // a call that then 422s.
  assertAcknowledgementsWaivable(input.acknowledgedChecks)

  // SCH-14's "full run payload", and the only way CC-7 can ever be satisfied
  // on a missed day. A `Missed` stand-up has no attendance by definition;
  // `attendance-service` refuses to add any (its `MUTABLE_STATUSES` excludes
  // `Missed`, correctly) and `reopen-service` admits only `Completed`, so
  // without this the hard, non-overridable CC-7 makes backfill unreachable.
  // Backfill is the one sanctioned exception — `Missed` stays immutable
  // everywhere else.
  //
  // Written BEFORE `assembleCompletionContext`, and persisted rather than
  // only mutated in memory: the context's own loaders (`loadAllocationBoard`)
  // re-read the stand-up from the database, so an in-memory-only edit would
  // leave the capacity board and CC-7 reading the pre-write room.
  const attendanceOutcome: BackfillAttendanceOutcome = input.attendance?.length
    ? await applyBackfillAttendance(standup, input.attendance)
    : { recorded: [], detachedForAlreadyRecorded: [] }

  const assemble = () =>
    assembleCompletionContext({
      standupId: input.standupId,
      standup,
      projectId,
      organizationId,
      completedBy: input.backfilledBy,
      notes: input.notes,
      expectedVersion: standup.version
    })

  let ctx = await assemble()

  // Ruling 21. Some hard checks can never pass on a past day — CC-1 above all,
  // because a missed day by definition had nothing allocated and work cannot
  // be planned retroactively. Backfill is NOT exempted from those checks (that
  // would re-open the gate bypass Task 8 closed: a stand-up completing with
  // nobody allocated and every check green). Instead it reuses the live
  // completion path's own answer — the facilitator issues a real override for
  // the failing *overridable* check, and the saga's `filterOverriddenFailures`
  // lifts the block. One check engine, and an overridden check stays a
  // recorded, audited fact rather than a silent exemption.
  //
  // Strictly opt-in: a failing overridable check the payload does not
  // acknowledge still blocks, and nothing is ever issued on the facilitator's
  // behalf. See `issueAcknowledgedOverrides`.
  const issuedOverrideIds = await issueAcknowledgedOverrides({
    ctx,
    acknowledgements: input.acknowledgedChecks,
    sprintId: String(standup.sprint),
    projectId,
    organizationId,
    issuedBy: input.backfilledBy
  })

  if (issuedOverrideIds.length > 0) {
    // Re-assembled rather than patched: the context reads the issued overrides
    // out of the database (`StandupOverride.find`) into two separate fields —
    // the saga's `overridesIssued` *and* the summary's own override list — so
    // rebuilding is the only way both see what was just written. Paid for only
    // on the override path.
    ctx = await assemble()
  }

  const result = await runCompletionSaga(ctx)

  // The saga's own `finalize` step already flipped status/completedAt/version
  // via a targeted `updateOne`; this stamps the two backfill-specific fields
  // the same way, rather than re-saving the whole (now stale) in-memory doc.
  await Standup.updateOne(
    { _id: input.standupId },
    { $set: { wasBackfilled: true, backfilledAt: now } }
  )

  const memberAgreementAttestedFor = (input.acknowledgedChecks ?? [])
    .filter((entry) => backfillNeedsMemberConfirmation(entry.checkId) && entry.memberAcknowledged === true)
    .map((entry) => entry.checkId)

  await recordAudit({
    actor: { type: 'user', userId: input.backfilledBy },
    organizationId,
    action: 'standup_backfilled',
    entityType: 'standup',
    entityId: input.standupId,
    projectId,
    before: { status: 'Missed', wasBackfilled: false },
    after: {
      status: 'Completed',
      wasBackfilled: true,
      elapsedWorkingDays,
      windowDays,
      // SEC-3. A backfill fabricates history from somebody's recollection, so
      // the claim itself is the part of this write that most needs a trace.
      // The sanctioned path audits every per-member attendance write as
      // `standup_attendance_set`; this is the only record that a backfilled
      // room was ever asserted, by whom, and what it detached.
      attendance: attendanceOutcome.recorded,
      // Absent unless a retry finished a detach an earlier attempt started, so
      // an ordinary backfill's entry keeps its existing shape.
      ...(attendanceOutcome.detachedForAlreadyRecorded.length
        ? { detachedForAlreadyRecorded: attendanceOutcome.detachedForAlreadyRecorded }
        : {}),
      // Ruling 21: which overrides this backfill had to issue to get past a
      // check the day could not pass. Each one is separately audited by
      // `issueOverride` as `override_issued`; this ties them to the backfill
      // that caused them, so the trail reads as one decision.
      ...(issuedOverrideIds.length ? { acknowledgedOverrideIds: issuedOverrideIds } : {}),
      // OVR-6's tick on a backfill is the facilitator's word that the members
      // agreed, not the members' own — recorded as such so nobody reads the
      // override's `memberAcknowledged` as consent that was actually given.
      ...(issuedOverrideIds.length && memberAgreementAttestedFor.length
        ? { memberAgreementAttestedFor }
        : {})
    }
  })

  const reloaded = await Standup.findById(input.standupId)
  if (!reloaded) throw new StandupError('NOT_FOUND', 'Stand-up not found.')

  return { standup: reloaded, summaryId: result.summaryId }
}

/**
 * Ruling 21's override step.
 *
 * Evaluates the completion checks against the context the saga is about to
 * re-evaluate, and for each hard failure that is **both overridable and
 * acknowledged by the payload** issues one real `StandupOverride` through
 * `issueOverride` — the same function the live `POST /overrides` route calls,
 * so OVR-2's table, OVR-5's justification rule and SEC-3's audit all apply
 * unchanged.
 *
 * Three refusals, all deliberate:
 *
 * - a failing overridable check that is **not** acknowledged is left alone, so
 *   it still blocks. Nothing is issued on the facilitator's behalf.
 * - acknowledging a check that has no override type — every non-overridable
 *   check, CC-7 included — is refused outright rather than ignored. Ignoring
 *   it would let a client believe it had waved a gate it cannot wave.
 * - a check that is not actually failing issues nothing, so an over-eager
 *   payload cannot manufacture an override record for a clean board.
 *
 * Returns the ids it issued, for the backfill audit entry.
 */
/**
 * OVR-2's server-side half, and Ruling 21's narrowing of it.
 *
 * `isCheckAcknowledgeableByBackfill` is the single rule — shared with the
 * backfill dialog, which renders exactly the set this will accept — covering
 * both "this check is not overridable by anybody" (no `OVERRIDE_TABLE` entry)
 * and "this check needs something a backfill cannot supply" (CC-6's member
 * tick, CC-3's one-task deferral). See that function for why each is excluded.
 *
 * Pure and context-free on purpose, so the whole payload can be judged before
 * anything is written.
 */
function assertAcknowledgementsWaivable(
  acknowledgements: BackfillCheckAcknowledgement[] | undefined
): void {
  for (const entry of acknowledgements ?? []) {
    if (!isCheckAcknowledgeableByBackfill(entry.checkId)) {
      throw overrideNotPermitted(entry.checkId)
    }
    // Before any write, like the refusal above: a backfill cannot obtain the
    // member's own tick, so the facilitator has to say, in as many words, that
    // they agreed. Anything short of an explicit `true` is refused.
    if (backfillNeedsMemberConfirmation(entry.checkId) && entry.memberAcknowledged !== true) {
      throw new StandupError(
        'VALIDATION_FAILED',
        'Confirm that the affected members agreed to this overtime.',
        { checkId: entry.checkId, field: 'memberAcknowledged' }
      )
    }
  }
}

async function issueAcknowledgedOverrides(args: {
  ctx: CompletionContext
  acknowledgements: BackfillCheckAcknowledgement[] | undefined
  sprintId: string
  projectId: string
  organizationId: string
  issuedBy: string
}): Promise<string[]> {
  const { ctx, acknowledgements, sprintId, projectId, organizationId, issuedBy } = args
  if (!acknowledgements?.length) return []

  // Re-asserted rather than assumed: `backfillStandup` already refused an
  // unwaivable check before writing anything, and this keeps the guarantee
  // local to the function that actually issues the records.
  assertAcknowledgementsWaivable(acknowledgements)

  const justificationByCheckId = new Map<string, string>()
  const memberConfirmedCheckIds = new Set<string>()
  for (const entry of acknowledgements) {
    justificationByCheckId.set(entry.checkId, entry.justification)
    if (entry.memberAcknowledged === true) memberConfirmedCheckIds.add(entry.checkId)
  }

  // Filtered against the overrides this stand-up ALREADY carries, exactly as
  // the saga's own gate does — a failure an existing override already covers is
  // not failing any more, so re-issuing for it would be a duplicate record.
  //
  // This is what makes a retry idempotent, and it is not cosmetic: on
  // `COMPLETION_CHECKS_FAILED` the dialog stays open without reloading, so a
  // second press re-sends the same acknowledgements. Without this filter that
  // writes a second identical `under_allocation` override, and
  // `detectChronicUnderAllocation` counts three per member per sprint with no
  // per-stand-up dedupe — three presses on one missed day could raise an N7
  // chronic-under-allocation flag against a real person. Same bug class as
  // RUN-7's detach idempotency, one field along.
  const failures = filterOverriddenFailures(
    blockingFailures(evaluateCompletionChecks(ctx.checkInput)),
    ctx.overridesIssued
  )
  const issuedIds: string[] = []

  for (const failure of failures) {
    if (!failure.overridable) continue

    const justification = justificationByCheckId.get(failure.checkId)
    if (justification === undefined) continue // not acknowledged — still blocks

    const overrideType = CHECK_TO_OVERRIDE_TYPE[failure.checkId]
    if (!overrideType) continue

    // Scoped to the entities the check actually named, so the override cannot
    // cover a member or task this failure did not flag — the same per-entity
    // granularity `filterOverriddenFailures` matches on. Both id kinds are
    // read because the entity shape differs per check (member-scoped CC-1/CC-6
    // vs. task-scoped CC-3/CC-10).
    const affectedMemberIds = uniqueStrings(failure.entities.map((entity) => entity.memberId))
    const affectedTaskIds = uniqueStrings(failure.entities.map((entity) => entity.taskId))
    const gapMinutes = failure.entities.reduce(
      (total, entity) => total + (typeof entity.gapMinutes === 'number' ? entity.gapMinutes : 0),
      0
    )

    const override = await issueOverride({
      standupId: ctx.standupId,
      sprintId,
      projectId,
      organizationId,
      type: overrideType,
      affectedMemberIds,
      affectedTaskIds,
      // The one honest code for "the day was never run": the detail lives in
      // the facilitator's justification, which OVR-5 already forces to be
      // substantive. `other` is a member of both OVR-3/OVR-4 reason-code lists.
      reasonCode: 'other',
      justification,
      gapMinutes,
      // OVR-6's tick, set only where the facilitator explicitly confirmed it
      // (`assertAcknowledgementsWaivable` has already refused CC-6 without
      // that). It is the facilitator's attestation, not the member's own, and
      // the backfill audit entry says so.
      ...(backfillNeedsMemberConfirmation(failure.checkId) &&
      memberConfirmedCheckIds.has(failure.checkId)
        ? { memberAcknowledged: true }
        : {}),
      issuedBy,
      // N7's recipients are looked up and notified from the completion saga,
      // exactly as `POST /api/standups/:id/overrides` leaves them.
      adminRecipientIds: []
    })

    issuedIds.push(String(override._id))
  }

  return issuedIds
}

function uniqueStrings(values: readonly unknown[]): string[] {
  const seen: string[] = []
  for (const value of values) {
    if (typeof value === 'string' && !seen.includes(value)) seen.push(value)
  }
  return seen
}

/**
 * Merges a backfill payload into a stand-up's `attendance`, mirroring
 * `start-service`'s RUN-6 merge: a `Set` keyed on the stored user id, and a
 * `push` only for members who have no record yet. The array is never rebuilt,
 * so any pre-existing record — in any state, however it got there — survives
 * untouched. Backfill fills the gaps a missed day left; it is not a back door
 * for rewriting attendance somebody already recorded.
 */
async function applyBackfillAttendance(
  standup: InstanceType<typeof Standup>,
  entries: BackfillAttendanceEntry[]
): Promise<BackfillAttendanceOutcome> {
  const expected = new Set(standup.expectedAttendees.map((attendee) => String(attendee)))
  const recorded = new Set(standup.attendance.map((entry) => String(entry.user)))

  // The nominal day each member would otherwise have, which is what bounds a
  // `partial` entry. Loaded without the hydrated document on purpose, so the
  // context reads independently of the doc being mutated below.
  const capacityContext = await loadCapacityContext(String(standup._id))

  const written: RecordedBackfillAttendance[] = []

  for (const entry of entries) {
    // Mirrors `attendance-service`'s own guards. The payload arrives from a
    // route body, and a bad value would otherwise surface as a Mongoose
    // validation error (a 500) rather than a 422.
    if (!ATTENDANCE_STATES.includes(entry.state)) {
      throw new StandupError('VALIDATION_FAILED', 'Unknown attendance state.', {
        state: entry.state
      })
    }
    if (!expected.has(entry.memberId)) {
      throw new StandupError(
        'VALIDATION_FAILED',
        'That person is not expected at this stand-up.',
        { memberId: entry.memberId }
      )
    }
    if (entry.state === 'partial') {
      // RUN-6's real bound — at least one allocation step, at most the
      // member's day less one step — reused rather than restated weakly here.
      // Passed unbranded on purpose: `assertPartialMinutes` answers a
      // non-integer with a 422, where `minutes()` would throw `RangeError`.
      const nominal = capacityContext.computeFor(entry.memberId, { attendance: 'present' })
      assertPartialMinutes(entry.minutes as Minutes | undefined, nominal.adjustedMinutes)
    }

    if (recorded.has(entry.memberId)) continue

    standup.attendance.push({
      // Cast explicitly rather than leaning on Mongoose's own string coercion:
      // the id was just matched against `expectedAttendees`, so it is a valid
      // ObjectId, and the explicit construction keeps the pushed subdocument's
      // shape identical to `start-service`'s.
      user: new mongoose.Types.ObjectId(entry.memberId),
      state: entry.state,
      ...(entry.state === 'partial' ? { partialMinutes: entry.minutes } : {})
    })
    recorded.add(entry.memberId)
    written.push({
      memberId: entry.memberId,
      state: entry.state,
      ...(entry.state === 'partial' ? { minutes: entry.minutes } : {}),
      detachedAllocationIds: []
    })
  }

  if (written.length > 0) {
    // `validateModifiedOnly` on purpose: the pushed subdocument still gets the
    // schema's `enum`/`min` validators — the reason for saving rather than
    // `updateOne`-ing — but one unrelated invalid field on a legacy stand-up
    // does not turn a backfill into a 500.
    await standup.save({ validateModifiedOnly: true })
  }

  // RUN-7: an absence detaches that member's work, exactly as the live path
  // does. Without this, the allocations of somebody the record says was away
  // stay attached and counting toward their capacity, and the saga's
  // `freeze-allocations` step freezes that wrong state — silently, because an
  // absent member's effective capacity is zero, so `allocationStatus` reads
  // `unavailable`, CC-1 exempts them and CC-6 only fires on an
  // over-allocation. Two of the backfill dialog's three options are absent
  // states, so this is the common path, not a corner.
  //
  // Driven by the payload against the **stored** state, not by the rows this
  // call happened to write, so the step is idempotent. A first attempt that
  // wrote the absence row and then died — in this loop, or later in the saga —
  // leaves a retry's merge correctly skipping that row; keying the detach off
  // `written` would then detach nothing and the saga would freeze the
  // undetached state, which is the very defect this step exists to prevent,
  // reached by a path that never self-heals. Re-running is a genuine no-op:
  // `detachAllocations` filters on `detachedReason: { $exists: false }`.
  const storedState = new Map(
    standup.attendance.map((entry) => [String(entry.user), entry.state])
  )
  const detachedForAlreadyRecorded: DetachedForAlreadyRecorded[] = []
  const visited = new Set<string>()

  for (const entry of entries) {
    if (visited.has(entry.memberId)) continue
    visited.add(entry.memberId)

    const stored = storedState.get(entry.memberId)
    if (!stored || !ABSENT_STATES.has(stored)) continue

    const detached = await detachAllocations(String(standup._id), entry.memberId)
    const allocationIds = detached.map((allocation) => allocation.allocationId)

    const row = written.find((candidate) => candidate.memberId === entry.memberId)
    if (row) {
      row.detachedAllocationIds = allocationIds
    } else if (allocationIds.length > 0) {
      // This call did not write the row, so the audit must not claim it did —
      // but detaching its work is a real action this call took, and the trail
      // has to show which attempt finally performed it.
      detachedForAlreadyRecorded.push({
        memberId: entry.memberId,
        state: stored,
        detachedAllocationIds: allocationIds
      })
    }
  }

  return { recorded: written, detachedForAlreadyRecorded }
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
