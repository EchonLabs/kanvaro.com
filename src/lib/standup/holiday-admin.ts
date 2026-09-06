/**
 * Organisation holiday administration (plan §5, DO-1..DO-6).
 *
 * The rule that shapes this file: **holidays are updated and revoked, never
 * deleted.** `resolveWorkingDay()` is dated, and a historical stand-up resolves
 * its calendar as of its own `standupDate` (DAT-1), so removing a row rewrites
 * what already happened. A revoked row stays put and stops affecting future
 * resolution.
 */
import { Holiday, REVOKE_REASON_MIN_LENGTH, type HolidayType } from '@/models/Holiday'
import { Standup } from '@/models/Standup'

import { StandupError } from './errors'

/**
 * A stand-up that already resolved a date being changed.
 *
 * DAT-1 makes calendar resolution dated: a stand-up resolved its working day as
 * of its own `standupDate`. Once that stand-up is history, changing the holiday
 * underneath it would rewrite what already happened, so the change is refused
 * rather than applied.
 */
export interface BlockingStandup {
  standupId: string
  date: string
  status: string
}

export type BlockingStandupLookup = (
  dates: string[],
  organizationId?: string
) => Promise<BlockingStandup[]>

/**
 * Statuses whose stand-ups are history and therefore protect their date.
 *
 * `Missed` is included deliberately. A missed stand-up is a record that the
 * team did not meet on a day the calendar said they should have — turning that
 * day into a holiday retroactively would erase the evidence, and SCH-15's
 * escalation counts depend on it. `Skipped_Holiday` and `Cancelled` are not
 * included: those days never ran, so nothing is rewritten by changing them.
 */
const BLOCKING_STATUSES = ['Completed', 'Reopened', 'Missed']

/**
 * Stand-ups that would be rewritten by a calendar change on these dates.
 *
 * Scoped to the organisation when one is given, so one tenant's history can
 * never block another's calendar edit.
 */
export const findBlockingStandupsPending: BlockingStandupLookup = async (
  dates,
  organizationId
) => {
  if (dates.length === 0) return []

  const standups = (await Standup.find({
    standupDate: { $in: dates },
    status: { $in: BLOCKING_STATUSES },
    ...(organizationId ? { organization: organizationId } : {})
  })
    .select('standupDate status')
    .lean()) as Array<{ _id: unknown; standupDate: string; status: string }>

  return standups.map((standup) => ({
    standupId: String(standup._id),
    date: standup.standupDate,
    status: standup.status
  }))
}

export class HolidayRevocationBlockedError extends StandupError {
  readonly blocking: BlockingStandup[]

  constructor(blocking: BlockingStandup[]) {
    super(
      'IMMUTABLE_COMPLETED_STANDUP',
      blocking.length === 1
        ? `A completed stand-up on ${blocking[0].date} already used this holiday. History cannot be edited.`
        : `${blocking.length} completed stand-ups already used this holiday. History cannot be edited.`,
      { blocking }
    )
    this.name = 'HolidayRevocationBlockedError'
    this.blocking = blocking
    Object.setPrototypeOf(this, HolidayRevocationBlockedError.prototype)
  }
}

export interface RevokeHolidayParams {
  holidayId: string
  /** Scopes the lookup, so one organisation cannot revoke another's holiday. */
  organizationId: string
  actorId: string
  reason: string
  findBlockingStandups?: BlockingStandupLookup
}

export async function revokeHoliday(params: RevokeHolidayParams): Promise<void> {
  const reason = params.reason?.trim() ?? ''
  if (reason.length < REVOKE_REASON_MIN_LENGTH) {
    throw new StandupError(
      'INVALID_JUSTIFICATION',
      `A revocation reason of at least ${REVOKE_REASON_MIN_LENGTH} characters is required, ` +
        'so the calendar explains itself to whoever reads it next.'
    )
  }

  const holiday = await Holiday.findOne({
    _id: params.holidayId,
    organization: params.organizationId
  })

  if (!holiday) {
    throw new StandupError('NOT_FOUND', 'That holiday was not found.')
  }

  // Already revoked is a no-op rather than an error: two admins clicking the
  // same button should not produce a failure neither of them can act on.
  if (holiday.status === 'revoked') return

  const lookup = params.findBlockingStandups ?? findBlockingStandupsPending
  const blocking = await lookup([holiday.date], params.organizationId)
  if (blocking.length > 0) {
    throw new HolidayRevocationBlockedError(blocking)
  }

  holiday.status = 'revoked'
  holiday.revokedAt = new Date()
  holiday.revokedBy = params.actorId as never
  holiday.revokeReason = reason
  await holiday.save()
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/** The shape the API and UI exchange. Never the raw Mongoose document. */
export interface HolidayView {
  id: string
  name: string
  date: string
  type: HolidayType
  isFullDay: boolean
  minutesIfPartial?: number
  status: string
  revokeReason?: string
}

const toView = (doc: any): HolidayView => ({
  id: doc._id.toString(),
  name: doc.name,
  date: doc.date,
  type: doc.type,
  isFullDay: doc.isFullDay !== false,
  minutesIfPartial: doc.minutesIfPartial,
  status: doc.status ?? 'active',
  revokeReason: doc.revokeReason
})

function assertIsoDate(date: string): void {
  if (!ISO_DATE.test(date ?? '')) {
    throw new StandupError(
      'VALIDATION_FAILED',
      `"${date}" is not a calendar date. Use YYYY-MM-DD.`
    )
  }
}

export interface CreateHolidayParams {
  holidaySetId: string
  organizationId: string
  actorId: string
  name: string
  date: string
  type: HolidayType
  isFullDay: boolean
  minutesIfPartial?: number
}

/**
 * Adds one holiday by hand.
 *
 * This is the path that matters for the case this workstream exists to fix: a
 * gazette published for a year nobody has loaded, and an administrator with no
 * shell access to run the seed script.
 */
export async function createHoliday(params: CreateHolidayParams): Promise<HolidayView> {
  assertIsoDate(params.date)

  const name = params.name?.trim() ?? ''
  if (name.length < 2) {
    throw new StandupError('VALIDATION_FAILED', 'Give the holiday a name.')
  }

  // Two holidays may legitimately share a date — 1 May 2026 in Sri Lanka is both
  // May Day and Vesak Poya — so only name-plus-date is a duplicate.
  const clash = await Holiday.findOne({
    holidaySet: params.holidaySetId,
    date: params.date,
    name
  })

  if (clash) {
    throw new StandupError(
      'VALIDATION_FAILED',
      `"${name}" is already recorded on ${params.date}.`
    )
  }

  const created = await Holiday.create({
    holidaySet: params.holidaySetId,
    organization: params.organizationId,
    name,
    date: params.date,
    type: params.type,
    isFullDay: params.isFullDay,
    minutesIfPartial: params.isFullDay ? undefined : params.minutesIfPartial,
    status: 'active',
    createdBy: params.actorId
  })

  return toView(created)
}

export interface UpdateHolidayParams {
  holidayId: string
  organizationId: string
  actorId: string
  changes: Partial<Pick<CreateHolidayParams, 'name' | 'date' | 'type' | 'isFullDay' | 'minutesIfPartial'>>
  findBlockingStandups?: BlockingStandupLookup
}

export async function updateHoliday(params: UpdateHolidayParams): Promise<HolidayView> {
  const holiday = await Holiday.findOne({
    _id: params.holidayId,
    organization: params.organizationId
  })

  if (!holiday) {
    throw new StandupError('NOT_FOUND', 'That holiday was not found.')
  }

  const { changes } = params
  const movingDate = changes.date !== undefined && changes.date !== holiday.date
  const changingWorkingDay =
    movingDate ||
    (changes.type !== undefined && changes.type !== holiday.type) ||
    (changes.isFullDay !== undefined && changes.isFullDay !== holiday.isFullDay)

  // Only changes that alter whether — or how much — a day is worked can rewrite
  // history. A rename cannot, and making an administrator justify a typo fix
  // would train them to click through the dialog that guards the real cases.
  if (changingWorkingDay) {
    if (changes.date !== undefined) assertIsoDate(changes.date)

    const lookup = params.findBlockingStandups ?? findBlockingStandupsPending
    const affected = movingDate ? [holiday.date, changes.date as string] : [holiday.date]
    const blocking = await lookup(affected, params.organizationId)
    if (blocking.length > 0) throw new HolidayRevocationBlockedError(blocking)
  }

  if (changes.name !== undefined) holiday.name = changes.name.trim()
  if (changes.date !== undefined) holiday.date = changes.date
  if (changes.type !== undefined) holiday.type = changes.type
  if (changes.isFullDay !== undefined) holiday.isFullDay = changes.isFullDay
  if (changes.minutesIfPartial !== undefined) {
    holiday.minutesIfPartial = holiday.isFullDay ? undefined : changes.minutesIfPartial
  }

  await holiday.save()
  return toView(holiday)
}

/** Lists a set's holidays. Revoked rows are included, flagged, so history is visible. */
export async function listHolidays(
  holidaySetId: string,
  organizationId: string
): Promise<HolidayView[]> {
  const rows = await Holiday.find({ holidaySet: holidaySetId, organization: organizationId })
    .sort({ date: 1 })
    .lean()

  return (rows as any[]).map(toView)
}
