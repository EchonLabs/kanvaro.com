/**
 * Ceremonies and fixed overhead (plan §4, DN-1 … DN-7).
 *
 * Kanvaro already holds this data: `SprintEvent` carries `eventType`,
 * `scheduledDate`, `duration` **in minutes**, `attendees[]`, `facilitator` and
 * `status`, and recurrences are materialised into one real dated row per
 * occurrence. Nothing needs generating; this module wires what exists into
 * capacity.
 *
 * The load-bearing decisions:
 *
 * - **DN-1. A ceremony reduces capacity; it never becomes an allocation.** An
 *   allocation points at a `taskId`, and a meeting is not a task. Creating one
 *   would push estimate-less rows into the unassigned pool, the variance engine
 *   and the debt ledger, where the twelve V1–V12 outcomes are undefined for
 *   them. Deducting keeps the hours visible and the ledger clean.
 * - **DN-3. The daily stand-up is deducted exactly once.** A project may hold a
 *   `daily_standup` SprintEvent *and* generated `Standup` records. Both are the
 *   same meeting. This module is the only place either can be turned into
 *   minutes, so double-counting is prevented by construction rather than by
 *   remembering: `daily_standup` events are dropped, and the stand-up's own
 *   configured duration is added by the caller passing `standupDurationMinutes`.
 * - **DN-4. Attendance-scoped.** A demo three people attend must not shrink the
 *   whole team's day.
 * - **DN-5. Cancelled events deduct nothing**, and because resolution is dated,
 *   moving an event after a stand-up completed cannot retroactively alter it.
 * - **DN-7. Itemised, never lumped.** One entry per event, so the member drawer
 *   can answer *why* a day is 6.5h rather than 8h.
 *
 * Rules live here as a pure planner; loading lives in `resolveCeremonyDeductions`
 * below — the same split `working-day.ts` and `calendar-service.ts` use.
 */
import { SprintEvent } from '@/models/SprintEvent'

import { dayBoundsInTimezone, type IsoDate } from './calendar-dates'
import { addMinutes, minutes, ZERO_MINUTES, type Minutes } from './minutes'

/** One named reason part of a member's day is already spoken for. */
export interface CeremonyDeduction {
  eventId: string
  title: string
  eventType: string
  minutes: Minutes
}

/**
 * A `SprintEvent` occurrence, flattened to the fields the rules need.
 *
 * Deliberately not the Mongoose document: the planner must stay pure and
 * testable without a database, and the loader is the only thing that should
 * know about ObjectIds.
 */
export interface CeremonyEventInput {
  eventId: string
  title: string
  eventType: string
  /** `SprintEvent.duration` — already minutes, so no conversion happens here. */
  durationMinutes: number
  status: string
  attendeeIds: string[]
  facilitatorId?: string
}

/** An event that deducts from nobody, surfaced as a warning (DN-4). */
export interface UnattendedCeremony {
  eventId: string
  title: string
  eventType: string
}

export interface CeremonyPlan {
  /** Keyed by memberId. Members with no ceremonies are absent, not empty. */
  deductions: Map<string, CeremonyDeduction[]>
  unattended: UnattendedCeremony[]
}

/**
 * Sentinel id for the stand-up's own duration.
 *
 * It is not a `SprintEvent`, so it has no event id — but it still has to be
 * addressable in the itemised breakdown, and a stable id means a UI can single
 * it out without matching on the label.
 */
export const PROJECT_STANDUP_EVENT_ID = 'project-standup'

/** Events of this type are the stand-up itself and never counted here (DN-3). */
const STANDUP_EVENT_TYPE = 'daily_standup'

/** A cancelled meeting consumed nobody's day (DN-5). */
const NON_CONSUMING_STATUSES = ['cancelled']

export interface PlanCeremonyDeductionsInput {
  events: CeremonyEventInput[]
  /** The members whose day is being computed. Attendees outside this are ignored. */
  memberIds: string[]
  /**
   * The stand-up's own configured duration, deducted from every member once.
   * Omit — or pass zero — to leave it out entirely.
   */
  standupDurationMinutes?: Minutes
}

/**
 * The pure rules. Given the day's events, who is expected, and the stand-up's
 * own duration, returns the itemised deduction list per member.
 */
export function planCeremonyDeductions(input: PlanCeremonyDeductionsInput): CeremonyPlan {
  const { events, memberIds, standupDurationMinutes = ZERO_MINUTES } = input

  const expected = new Set(memberIds)
  const deductions = new Map<string, CeremonyDeduction[]>()
  const unattended: UnattendedCeremony[] = []

  const push = (memberId: string, deduction: CeremonyDeduction) => {
    const existing = deductions.get(memberId)
    if (existing) existing.push(deduction)
    else deductions.set(memberId, [deduction])
  }

  // The stand-up itself goes first, so it reads as the baseline the rest of the
  // day's meetings are added to — and so DN-3's single deduction is visibly the
  // first row rather than buried among the ceremonies.
  if (standupDurationMinutes > 0) {
    for (const memberId of memberIds) {
      push(memberId, {
        eventId: PROJECT_STANDUP_EVENT_ID,
        title: 'Daily stand-up',
        eventType: STANDUP_EVENT_TYPE,
        minutes: minutes(standupDurationMinutes)
      })
    }
  }

  for (const event of events) {
    if (event.eventType === STANDUP_EVENT_TYPE) continue
    if (NON_CONSUMING_STATUSES.includes(event.status)) continue
    if (!(event.durationMinutes > 0)) continue

    // DN-4's literal rule: an event nobody is listed on deducts from nobody.
    // The warning is the point — a demo with an empty attendee list is a data
    // problem the PM should fix, not a silent zero.
    if (event.attendeeIds.length === 0) {
      unattended.push({
        eventId: event.eventId,
        title: event.title,
        eventType: event.eventType
      })
      continue
    }

    // The facilitator is running the meeting whether or not anyone remembered
    // to list them, so they are unioned in — but only once (a Set, not a push).
    const recipients = new Set<string>()
    for (const attendeeId of event.attendeeIds) {
      if (expected.has(attendeeId)) recipients.add(attendeeId)
    }
    if (event.facilitatorId && expected.has(event.facilitatorId)) {
      recipients.add(event.facilitatorId)
    }

    recipients.forEach((memberId) => {
      push(memberId, {
        eventId: event.eventId,
        title: event.title,
        eventType: event.eventType,
        minutes: minutes(event.durationMinutes)
      })
    })
  }

  return { deductions, unattended }
}

/** Integer-minute sum of an itemised deduction list. */
export function totalCeremonyMinutes(deductions: readonly CeremonyDeduction[]): Minutes {
  return deductions.reduce<Minutes>(
    (total, entry) => addMinutes(total, entry.minutes),
    ZERO_MINUTES
  )
}

export interface ResolveCeremonyDeductionsInput {
  projectId: string
  sprintId: string
  date: IsoDate
  memberIds: string[]
  /** The project's IANA timezone — decides which calendar date an event falls on. */
  timezone: string
  /** DN-3: the stand-up's own duration, deducted once. Omit to leave it out. */
  standupDurationMinutes?: Minutes
}

/**
 * Ceremony minutes per member for one date.
 *
 * The query is bounded by the *project timezone's* day, not UTC's: a 09:00
 * Colombo retro is 03:30 UTC and belongs to the Colombo date (CAL-5).
 *
 * Recurring series need no expansion — `sprint-events` materialises one row per
 * occurrence, and the series parent is itself the first occurrence, so every
 * occurrence is already a dated row this query returns.
 */
export async function resolveCeremonyDeductions(
  input: ResolveCeremonyDeductionsInput
): Promise<CeremonyPlan> {
  const { projectId, sprintId, date, memberIds, timezone, standupDurationMinutes } = input

  const { from, to } = dayBoundsInTimezone(date, timezone)

  const events = (await SprintEvent.find({
    project: projectId,
    sprint: sprintId,
    scheduledDate: { $gte: from, $lt: to },
    eventType: { $ne: STANDUP_EVENT_TYPE },
    status: { $nin: NON_CONSUMING_STATUSES }
  })
    .select('title eventType duration status attendees facilitator')
    .sort({ scheduledDate: 1 })
    .lean()) as any[]

  return planCeremonyDeductions({
    events: events.map(toCeremonyEventInput),
    memberIds,
    standupDurationMinutes
  })
}

/**
 * Project-wide ceremonies that deduct from nobody, for the Stand-up
 * Configuration screen (DN-4).
 *
 * Scoped to future dates: a badly configured event in the past cannot be fixed
 * in any way that matters — the stand-ups it should have affected are already
 * completed and frozen (DAT-1) — so warning about it is noise.
 */
export async function listUnattendedCeremonies(
  projectId: string,
  now: Date = new Date()
): Promise<UnattendedCeremony[]> {
  const events = (await SprintEvent.find({
    project: projectId,
    scheduledDate: { $gte: now },
    eventType: { $ne: STANDUP_EVENT_TYPE },
    status: { $nin: NON_CONSUMING_STATUSES },
    $or: [{ attendees: { $size: 0 } }, { attendees: { $exists: false } }]
  })
    .select('title eventType duration status attendees facilitator')
    .sort({ scheduledDate: 1 })
    .lean()) as any[]

  // Routed back through the planner rather than mapped directly, so the
  // definition of "unattended" can only ever live in one place.
  return planCeremonyDeductions({
    events: events.map(toCeremonyEventInput),
    memberIds: []
  }).unattended
}

function toCeremonyEventInput(event: any): CeremonyEventInput {
  return {
    eventId: String(event._id),
    title: event.title,
    eventType: event.eventType,
    durationMinutes: event.duration ?? 0,
    status: event.status,
    attendeeIds: (event.attendees ?? []).map((id: unknown) => String(id)),
    facilitatorId: event.facilitator ? String(event.facilitator) : undefined
  }
}
