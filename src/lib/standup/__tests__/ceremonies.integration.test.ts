/**
 * Ceremonies against the database (plan §4, Phase 6 exit).
 *
 * The pure planner in `ceremonies.test.ts` proves the rules. This suite proves
 * the two things it structurally cannot: that the loader's query actually finds
 * the rows `sprint-events` writes — through the real create path, not a
 * hand-planted document — and that the deduction reaches
 * `buildStandupSnapshot`'s capacity breakdown.
 *
 * R5 is the risk this file exists for. Ceremony double-counting shrinks every
 * member's day by the stand-up's own duration twice, every day, and the
 * resulting numbers still look entirely plausible.
 */
import mongoose from 'mongoose'

import { MemberCapacity } from '@/models/MemberCapacity'
import { ProjectStandupSettings } from '@/models/ProjectStandupSettings'
import { Sprint } from '@/models/Sprint'
import { SprintEvent } from '@/models/SprintEvent'
import { Standup } from '@/models/Standup'
import { WorkingCalendar } from '@/models/WorkingCalendar'

import {
  listUnattendedCeremonies,
  resolveCeremonyDeductions,
  totalCeremonyMinutes
} from '../ceremonies'
import { generateStandupsForSprint } from '../generation'
import { minutes } from '../minutes'
import { buildStandupSnapshot } from '../snapshot'
import { ids, useMongo } from './helpers/mongo'

const { organization, project, member, otherMember, user } = ids

/** Colombo is +05:30 — a zone where the UTC day and the project day disagree. */
const TIMEZONE = 'Asia/Colombo'

/** A Monday inside the sprint below. */
const DAY = '2026-08-17'

async function seedProject(overrides: Record<string, unknown> = {}) {
  await WorkingCalendar.create({
    scope: 'project',
    organization,
    project,
    workingDaysOfWeek: [1, 2, 3, 4, 5],
    standardMinutesPerDay: 480,
    timezone: TIMEZONE,
    subscribedHolidaySets: [],
    overrides: []
  })

  await ProjectStandupSettings.create({
    project,
    organization,
    enabled: true,
    standupLocalTime: '09:00',
    durationMinutes: 15,
    defaultFacilitator: user,
    ...overrides
  })

  await MemberCapacity.create({
    project,
    member,
    dailyCapacityMinutes: 480,
    effectiveFrom: '2026-01-01',
    isActive: true
  })

  await MemberCapacity.create({
    project,
    member: otherMember,
    dailyCapacityMinutes: 480,
    effectiveFrom: '2026-01-01',
    isActive: true
  })
}

async function seedSprint() {
  return Sprint.create({
    _id: ids.sprint,
    name: 'Sprint 21',
    organization,
    project,
    createdBy: user,
    status: 'active',
    startDate: new Date('2026-08-17T00:00:00.000Z'),
    endDate: new Date('2026-08-21T00:00:00.000Z'),
    capacity: 0,
    teamMembers: [member, otherMember]
  })
}

/**
 * Writes an event the way the application does — through the model, with the
 * facilitator folded into the attendee list, as `POST /api/sprint-events` does.
 */
async function createEvent(partial: Record<string, any> = {}) {
  const attendees = partial.attendees ?? [member, otherMember]
  return SprintEvent.create({
    sprint: ids.sprint,
    project,
    eventType: 'review',
    title: 'Sprint Review',
    // 14:00 Colombo on the 17th, i.e. 08:30 UTC.
    scheduledDate: new Date('2026-08-17T08:30:00.000Z'),
    duration: 60,
    facilitator: user,
    status: 'scheduled',
    ...partial,
    attendees
  })
}

describe('resolveCeremonyDeductions loads what sprint-events writes', () => {
  useMongo()

  beforeEach(async () => {
    await seedProject()
    await seedSprint()
  })

  const resolve = (memberIds = [String(member), String(otherMember)]) =>
    resolveCeremonyDeductions({
      projectId: String(project),
      sprintId: String(ids.sprint),
      date: DAY,
      memberIds,
      timezone: TIMEZONE,
      standupDurationMinutes: minutes(15)
    })

  it('finds a persisted event and deducts it from its attendees', async () => {
    await createEvent()

    const plan = await resolve()

    expect(totalCeremonyMinutes(plan.deductions.get(String(member)) ?? [])).toBe(75)
    expect(totalCeremonyMinutes(plan.deductions.get(String(otherMember)) ?? [])).toBe(75)
  })

  it('attributes an event to the project timezone date, not the UTC one', async () => {
    // 09:00 Colombo on the 18th is 03:30 UTC on the 18th — same UTC day here,
    // but 23:00 Colombo on the 17th is 17:30 UTC on the 17th. The case that
    // separates the two is late-evening local time.
    await createEvent({
      title: 'Late demo',
      eventType: 'demo',
      // 01:00 Colombo on the 18th = 19:30 UTC on the 17th.
      scheduledDate: new Date('2026-08-17T19:30:00.000Z'),
      duration: 30
    })

    const onTheSeventeenth = await resolve()
    expect(totalCeremonyMinutes(onTheSeventeenth.deductions.get(String(member)) ?? [])).toBe(15)

    const onTheEighteenth = await resolveCeremonyDeductions({
      projectId: String(project),
      sprintId: String(ids.sprint),
      date: '2026-08-18',
      memberIds: [String(member)],
      timezone: TIMEZONE,
      standupDurationMinutes: minutes(15)
    })
    expect(totalCeremonyMinutes(onTheEighteenth.deductions.get(String(member)) ?? [])).toBe(45)
  })

  it('deducts every occurrence of a materialised recurring series independently', async () => {
    const parent = await createEvent({
      title: 'Weekly design sync',
      eventType: 'other',
      duration: 30,
      isRecurringSeries: true,
      recurrence: { type: 'weekly', interval: 1, daysOfWeek: [1] }
    })

    await createEvent({
      title: 'Weekly design sync',
      eventType: 'other',
      duration: 30,
      scheduledDate: new Date('2026-08-18T08:30:00.000Z'),
      parentEventId: parent._id
    })

    // The series parent *is* the first occurrence, so it counts on its own day
    // and the child counts on its own — never both on either.
    const first = await resolve([String(member)])
    expect(totalCeremonyMinutes(first.deductions.get(String(member)) ?? [])).toBe(45)
  })

  it('deducts nothing for a cancelled event (DN-5)', async () => {
    await createEvent({ status: 'cancelled' })

    const plan = await resolve()

    expect(totalCeremonyMinutes(plan.deductions.get(String(member)) ?? [])).toBe(15)
  })

  it('deducts only from the named attendees (DN-4)', async () => {
    await createEvent({ title: 'Customer demo', eventType: 'demo', attendees: [member] })

    const plan = await resolve()

    expect(totalCeremonyMinutes(plan.deductions.get(String(member)) ?? [])).toBe(75)
    expect(totalCeremonyMinutes(plan.deductions.get(String(otherMember)) ?? [])).toBe(15)
  })

  it('ignores events belonging to another sprint', async () => {
    await createEvent({ sprint: ids.otherSprint })

    const plan = await resolve()

    expect(totalCeremonyMinutes(plan.deductions.get(String(member)) ?? [])).toBe(15)
  })
})

describe('R5 / DN-3 — the stand-up is deducted once, never twice', () => {
  useMongo()

  beforeEach(async () => {
    await seedProject()
    await seedSprint()
  })

  it('removes fifteen minutes once when a daily_standup event and generated stand-ups both exist', async () => {
    // The exact configuration that produces the defect: a PM created a
    // "Daily stand-up" calendar event *and* the module generates its own
    // Standup records for the same meeting.
    await SprintEvent.create({
      sprint: ids.sprint,
      project,
      eventType: 'daily_standup',
      title: 'Daily stand-up',
      scheduledDate: new Date('2026-08-17T03:30:00.000Z'),
      duration: 15,
      facilitator: user,
      attendees: [member, otherMember],
      status: 'scheduled'
    })

    await generateStandupsForSprint(String(ids.sprint), { actorId: String(user) })

    const standup = await Standup.findOne({ sprint: ids.sprint, standupDate: DAY }).lean<any>()
    expect(standup).toBeTruthy()

    await Standup.updateOne(
      { _id: standup._id },
      { $set: { expectedAttendees: [member, otherMember] } }
    )

    const snapshot = await buildStandupSnapshot(String(standup._id))
    const row = snapshot.members.find((entry) => entry.memberId === String(member))!

    const ceremonies = row.adjustments.filter((entry) => entry.type === 'ceremony')
    expect(ceremonies).toEqual([{ type: 'ceremony', label: 'Daily stand-up', minutes: 15 }])
    expect(row.effectiveMinutes).toBe(465)
  })

  it('still removes fifteen minutes when no calendar event exists at all', async () => {
    await generateStandupsForSprint(String(ids.sprint), { actorId: String(user) })

    const standup = await Standup.findOne({ sprint: ids.sprint, standupDate: DAY }).lean<any>()
    await Standup.updateOne({ _id: standup._id }, { $set: { expectedAttendees: [member] } })

    const snapshot = await buildStandupSnapshot(String(standup._id))
    const row = snapshot.members.find((entry) => entry.memberId === String(member))!

    expect(row.adjustments).toEqual([
      { type: 'ceremony', label: 'Daily stand-up', minutes: 15 }
    ])
    expect(row.effectiveMinutes).toBe(465)
  })
})

describe('DN-6 — the ceremonies opt-out', () => {
  useMongo()

  beforeEach(async () => {
    await seedSprint()
  })

  async function snapshotFor(ceremoniesConsumeCapacity: boolean) {
    await seedProject({ ceremoniesConsumeCapacity })
    await createEvent({ attendees: [member] })

    await generateStandupsForSprint(String(ids.sprint), { actorId: String(user) })

    const standup = await Standup.findOne({ sprint: ids.sprint, standupDate: DAY }).lean<any>()
    await Standup.updateOne({ _id: standup._id }, { $set: { expectedAttendees: [member] } })

    return buildStandupSnapshot(String(standup._id))
  }

  it('defaults to deducting — a two-hour review is two hours nobody is coding', async () => {
    const snapshot = await snapshotFor(true)
    const row = snapshot.members[0]

    expect(snapshot.ceremoniesConsumeCapacity).toBe(true)
    // 480 nominal − 15 stand-up − 60 review.
    expect(row.effectiveMinutes).toBe(405)
  })

  it('restores nominal capacity when switched off, and says it did', async () => {
    const snapshot = await snapshotFor(false)
    const row = snapshot.members[0]

    expect(snapshot.ceremoniesConsumeCapacity).toBe(false)
    expect(row.effectiveMinutes).toBe(480)
    expect(row.adjustments).toHaveLength(0)
  })

  it('defaults to true on a settings document that predates the field', async () => {
    // Written straight to the collection so no schema default applies — the
    // shape an existing install has after upgrading.
    await ProjectStandupSettings.collection.insertOne({
      project: new mongoose.Types.ObjectId(String(project)),
      organization: new mongoose.Types.ObjectId(String(organization)),
      enabled: true,
      standupLocalTime: '09:00',
      durationMinutes: 15
    } as any)

    const settings = await ProjectStandupSettings.findOne({ project }).lean<any>()
    expect(settings.ceremoniesConsumeCapacity).toBeUndefined()

    // `!== false` is what makes the absent field mean "deduct".
    expect(settings.ceremoniesConsumeCapacity !== false).toBe(true)
  })
})

describe('DN-5 — moving an event does not rewrite history', () => {
  useMongo()

  beforeEach(async () => {
    await seedProject()
    await seedSprint()
  })

  /**
   * Generates the sprint, points the stand-up at one member and freezes a
   * snapshot onto it, the way the promote-to-ready job does.
   */
  async function readyStandupWithFrozenSnapshot() {
    await generateStandupsForSprint(String(ids.sprint), { actorId: String(user) })

    const standup = await Standup.findOne({ sprint: ids.sprint, standupDate: DAY }).lean<any>()
    await Standup.updateOne(
      { _id: standup._id },
      { $set: { expectedAttendees: [member], status: 'Ready' } }
    )

    await buildStandupSnapshot(String(standup._id), { persist: true })
    return String(standup._id)
  }

  const frozenAdjustments = async (standupId: string) => {
    const standup = await Standup.findById(standupId).lean<any>()
    return standup.snapshot.members[0].adjustments
  }

  it('keeps the minutes a completed stand-up was built with when the event later moves', async () => {
    const event = await createEvent({ attendees: [member] })
    const standupId = await readyStandupWithFrozenSnapshot()

    expect(await frozenAdjustments(standupId)).toEqual([
      { type: 'ceremony', label: 'Daily stand-up', minutes: 15 },
      { type: 'ceremony', label: 'Sprint Review', minutes: 60 }
    ])

    await Standup.updateOne({ _id: standupId }, { $set: { status: 'Completed' } })

    // The PM reschedules the review to a later day, after the fact.
    await SprintEvent.updateOne(
      { _id: event._id },
      { $set: { scheduledDate: new Date('2026-08-19T08:30:00.000Z') } }
    )

    // History is not editable. The completed record still says 6.75h, because
    // that is the day the team actually planned (DAT-1, CAL-14).
    expect(await frozenAdjustments(standupId)).toEqual([
      { type: 'ceremony', label: 'Daily stand-up', minutes: 15 },
      { type: 'ceremony', label: 'Sprint Review', minutes: 60 }
    ])

    // …and the freeze is doing real work: recomputing the same stand-up now
    // returns a different day. Without this the assertion above would pass
    // even if nothing were ever frozen.
    const recomputed = await buildStandupSnapshot(standupId)
    expect(recomputed.members[0].adjustments).toEqual([
      { type: 'ceremony', label: 'Daily stand-up', minutes: 15 }
    ])
    expect(recomputed.members[0].effectiveMinutes).toBe(465)
  })

  it('survives the event being cancelled outright afterwards', async () => {
    const event = await createEvent({ attendees: [member] })
    const standupId = await readyStandupWithFrozenSnapshot()

    await Standup.updateOne({ _id: standupId }, { $set: { status: 'Completed' } })
    await SprintEvent.updateOne({ _id: event._id }, { $set: { status: 'cancelled' } })

    expect(await frozenAdjustments(standupId)).toHaveLength(2)
  })

  it('moves the deduction to the new date on any day not yet frozen', async () => {
    const event = await createEvent({ attendees: [member] })

    const resolveOn = (date: string) =>
      resolveCeremonyDeductions({
        projectId: String(project),
        sprintId: String(ids.sprint),
        date,
        memberIds: [String(member)],
        timezone: TIMEZONE
      })

    expect(totalCeremonyMinutes((await resolveOn(DAY)).deductions.get(String(member)) ?? [])).toBe(60)

    await SprintEvent.updateOne(
      { _id: event._id },
      { $set: { scheduledDate: new Date('2026-08-19T08:30:00.000Z') } }
    )

    // The old date gives the hour back and the new date takes it — resolution
    // is dated, so a future day always reflects where the meeting is *now*.
    expect(totalCeremonyMinutes((await resolveOn(DAY)).deductions.get(String(member)) ?? [])).toBe(0)
    expect(
      totalCeremonyMinutes((await resolveOn('2026-08-19')).deductions.get(String(member)) ?? [])
    ).toBe(60)
  })
})

describe('listUnattendedCeremonies (DN-4 warning)', () => {
  useMongo()

  beforeEach(async () => {
    await seedProject()
    await seedSprint()
  })

  const now = new Date('2026-08-16T00:00:00.000Z')

  it('names an upcoming event that deducts from nobody', async () => {
    await createEvent({ title: 'All hands', eventType: 'other', attendees: [] })

    await expect(listUnattendedCeremonies(String(project), now)).resolves.toEqual([
      expect.objectContaining({ title: 'All hands' })
    ])
  })

  it('says nothing about a well-formed event', async () => {
    await createEvent()

    await expect(listUnattendedCeremonies(String(project), now)).resolves.toEqual([])
  })

  it('ignores a cancelled event — it deducts nothing by design', async () => {
    await createEvent({ attendees: [], status: 'cancelled' })

    await expect(listUnattendedCeremonies(String(project), now)).resolves.toEqual([])
  })

  it('ignores the stand-up event, which never deducts here anyway (DN-3)', async () => {
    await createEvent({ eventType: 'daily_standup', title: 'Daily stand-up', attendees: [] })

    await expect(listUnattendedCeremonies(String(project), now)).resolves.toEqual([])
  })

  it('stays quiet about the past, where nothing can be fixed', async () => {
    await createEvent({ title: 'All hands', attendees: [] })

    const afterTheEvent = new Date('2026-08-20T00:00:00.000Z')
    await expect(listUnattendedCeremonies(String(project), afterTheEvent)).resolves.toEqual([])
  })
})
