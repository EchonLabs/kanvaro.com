/**
 * The spec's §12.3 worked example, seeded into a real database.
 *
 * §12.3 says the example "must be implemented exactly as described and should
 * be used as the primary QA fixture", so Phase 8's service, capacity-wiring
 * and end-to-end suites all build on this one seeder rather than each
 * inventing a scenario. When the scenario changes, it changes once.
 *
 * The numbers live in `../../fixtures/worked-example.ts` — that module is pure
 * and is imported by pure tests, so the database work stays here rather than
 * dragging Mongoose into it.
 *
 * The scenario:
 *
 *   Kasun's nominal capacity is 8.0h. On day 3 the PM planned KAN-214 for 6.0h
 *   and KAN-231 for 2.0h. Kasun spent the whole day on KAN-214, logging 8.0h,
 *   and never touched KAN-231. KAN-214 is still in progress.
 *
 *   Day 4 must therefore show KAN-214 as V6 open_over_consumed (2.0h over) and
 *   KAN-231 as V7 not_started, with a 2.0h accrual against Kasun once day 4
 *   completes.
 *
 * Allocations are seeded directly here, not written through
 * `createAllocation`. That is deliberate and narrow: this fixture is
 * reconstructing a stand-up that already *ran*, in the past, whose service-time
 * preconditions (an open stand-up, a live version) no longer hold. The suites
 * that test the writer write through the writer.
 */
import mongoose from 'mongoose'

import { Allocation } from '@/models/Allocation'
import { MemberCapacity } from '@/models/MemberCapacity'
import { ProjectStandupSettings } from '@/models/ProjectStandupSettings'
import { Sprint } from '@/models/Sprint'
import { Standup } from '@/models/Standup'
import { Task } from '@/models/Task'
import { TimeEntry } from '@/models/TimeEntry'
import { User } from '@/models/User'
import { WorkingCalendar } from '@/models/WorkingCalendar'

import {
  AMAL,
  FIXTURE_DAY_3,
  FIXTURE_DAY_4,
  FIXTURE_STANDARD_MINUTES,
  FIXTURE_TIMEZONE,
  FIXTURE_WORKING_DAYS,
  KAN_214,
  KAN_231,
  KASUN
} from '../../fixtures/worked-example'

import { ids } from './mongo'

const { organization, project, sprint, user } = ids

/** A fifth sprint day, so a test can assert what day 4's settlement did to day 5. */
const FIXTURE_DAY_5 = '2026-08-21'

export interface WorkedExample {
  projectId: string
  sprintId: string
  organizationId: string
  pmId: string
  kasunId: string
  amalId: string
  day3: string
  day4: string
  day5: string
  kan214: string
  kan231: string
  /** The day-3 allocations, by task key. */
  allocations: { 'KAN-214': string; 'KAN-231': string }
}

export interface SeedOptions {
  overrunPolicy?: 'absorb' | 'reduce'
  /** Overrides the logged hours on KAN-214, for the cases that vary them. */
  loggedOnKan214Minutes?: number
  /** Leaves day 3 unallocated, for the day-one cases. */
  skipAllocations?: boolean
}

async function seedPerson(reference: typeof KASUN | typeof AMAL, id: mongoose.Types.ObjectId) {
  await User.create({
    _id: id,
    firstName: reference.firstName,
    lastName: reference.lastName,
    email: `${reference.reference}@example.test`,
    password: 'seeded-password-hash',
    role: 'team_member',
    organization,
    isActive: true
  })
  await MemberCapacity.create({
    project,
    member: id,
    dailyCapacityMinutes: reference.nominalMinutes,
    effectiveFrom: '2026-01-01',
    isActive: true
  })
}

async function seedStandup(input: {
  date: string
  dayNumber: number
  status: string
  attendees: mongoose.Types.ObjectId[]
}) {
  const standup = await Standup.create({
    project,
    sprint,
    organization,
    standupDate: input.date,
    scheduledStartAt: new Date(`${input.date}T03:30:00.000Z`),
    durationMinutes: 15,
    sprintDayNumber: input.dayNumber,
    totalSprintDays: 5,
    shape: 'mid_sprint',
    status: input.status,
    facilitator: user,
    expectedAttendees: input.attendees,
    version: 1
  })
  return String(standup._id)
}

/** Seeds the §12.3 scenario and returns every id a test needs. */
export async function seedWorkedExample(options: SeedOptions = {}): Promise<WorkedExample> {
  const kasunId = new mongoose.Types.ObjectId()
  const amalId = new mongoose.Types.ObjectId()

  await WorkingCalendar.create({
    scope: 'project',
    organization,
    project,
    workingDaysOfWeek: [...FIXTURE_WORKING_DAYS],
    standardMinutesPerDay: FIXTURE_STANDARD_MINUTES,
    timezone: FIXTURE_TIMEZONE,
    subscribedHolidaySets: [],
    overrides: []
  })

  await ProjectStandupSettings.create({
    project,
    organization,
    enabled: true,
    standupLocalTime: '09:00',
    durationMinutes: 15,
    // DN-6, switched off so the fixture's arithmetic is the spec's: §12.3
    // works in whole 8.0h days, and deducting the stand-up's own quarter hour
    // would put every expected number fifteen minutes out.
    ceremoniesConsumeCapacity: false,
    defaultFacilitator: user,
    overrunPolicy: options.overrunPolicy ?? 'absorb'
  })

  await User.create({
    _id: user,
    firstName: 'Priya',
    lastName: 'De Silva',
    email: 'pm@example.test',
    password: 'seeded-password-hash',
    role: 'project_manager',
    organization,
    isActive: true
  })

  await seedPerson(KASUN, kasunId)
  await seedPerson(AMAL, amalId)

  await Sprint.create({
    _id: sprint,
    name: 'Sprint 21',
    organization,
    project,
    createdBy: user,
    status: 'active',
    startDate: new Date(`${FIXTURE_DAY_3}T00:00:00.000Z`),
    endDate: new Date(`${FIXTURE_DAY_5}T00:00:00.000Z`),
    capacity: 0,
    teamMembers: [kasunId, amalId]
  })

  const attendees = [kasunId, amalId]
  const day3 = await seedStandup({
    date: FIXTURE_DAY_3,
    dayNumber: 3,
    status: 'Completed',
    attendees
  })
  const day4 = await seedStandup({
    date: FIXTURE_DAY_4,
    dayNumber: 4,
    status: 'In_Progress',
    attendees
  })
  const day5 = await seedStandup({
    date: FIXTURE_DAY_5,
    dayNumber: 5,
    status: 'Scheduled',
    attendees
  })

  const kan214 = await Task.create({
    title: KAN_214.title,
    organization,
    project,
    sprint,
    createdBy: user,
    assignedTo: [{ user: kasunId, assignedAt: new Date() }],
    taskNumber: 214,
    displayId: KAN_214.key,
    status: KAN_214.statusAtDay4,
    originalEstimateMinutes: KAN_214.originalEstimateMinutes,
    remainingEstimateMinutes: KAN_214.remainingBeforeDay3Minutes,
    estimateLockedAt: new Date(`${FIXTURE_DAY_3}T00:00:00.000Z`)
  })

  const kan231 = await Task.create({
    title: KAN_231.title,
    organization,
    project,
    sprint,
    createdBy: user,
    assignedTo: [{ user: kasunId, assignedAt: new Date() }],
    taskNumber: 231,
    displayId: KAN_231.key,
    status: KAN_231.statusAtDay4,
    originalEstimateMinutes: KAN_231.originalEstimateMinutes,
    remainingEstimateMinutes: KAN_231.remainingBeforeDay3Minutes,
    estimateLockedAt: new Date(`${FIXTURE_DAY_3}T00:00:00.000Z`)
  })

  const allocations = { 'KAN-214': '', 'KAN-231': '' }

  if (!options.skipAllocations) {
    const a214 = await Allocation.create({
      standup: day3,
      sprint,
      project,
      organization,
      member: kasunId,
      task: kan214._id,
      plannedMinutes: KAN_214.plannedDay3Minutes,
      source: 'assigned_in_standup',
      taskStatusAtAllocation: KAN_214.statusAtDay4,
      createdBy: user
    })
    const a231 = await Allocation.create({
      standup: day3,
      sprint,
      project,
      organization,
      member: kasunId,
      task: kan231._id,
      plannedMinutes: KAN_231.plannedDay3Minutes,
      source: 'assigned_in_standup',
      taskStatusAtAllocation: KAN_231.statusAtDay4,
      createdBy: user
    })
    allocations['KAN-214'] = String(a214._id)
    allocations['KAN-231'] = String(a231._id)
  }

  // Kasun spent the whole day on KAN-214 and never opened KAN-231.
  const loggedOnKan214 = options.loggedOnKan214Minutes ?? KAN_214.loggedDay3Minutes
  if (loggedOnKan214 > 0) {
    await TimeEntry.create({
      user: kasunId,
      organization,
      project,
      task: kan214._id,
      description: 'Invoice model',
      startTime: new Date(`${FIXTURE_DAY_3}T09:00:00+05:30`),
      duration: loggedOnKan214,
      isBillable: false,
      status: 'completed'
    })
  }

  return {
    projectId: String(project),
    sprintId: String(sprint),
    organizationId: String(organization),
    pmId: String(user),
    kasunId: String(kasunId),
    amalId: String(amalId),
    day3,
    day4,
    day5,
    kan214: String(kan214._id),
    kan231: String(kan231._id),
    allocations
  }
}

export { FIXTURE_DAY_3, FIXTURE_DAY_4, FIXTURE_DAY_5 }
