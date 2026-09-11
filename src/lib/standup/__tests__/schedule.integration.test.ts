/**
 * The schedule read model and its routes (spec UI-8, UI-9, §17.4).
 *
 * UI-9 is the rule that shapes the payload: skipped days stay **permanently
 * visible with their reason**. Filtering them out would make a nine-stand-up
 * sprint look like a nine-day sprint, and the holiday that removed the tenth
 * would be invisible to everyone who was not there when it was declared.
 */
import fs from 'fs'
import path from 'path'

import mongoose from 'mongoose'

import { Allocation } from '@/models/Allocation'
import { CarryForwardItem } from '@/models/CarryForwardItem'
import { MemberSprintDebtSummary } from '@/models/MemberSprintDebtSummary'
import { ProjectStandupSettings } from '@/models/ProjectStandupSettings'
import { Sprint } from '@/models/Sprint'
import { Standup } from '@/models/Standup'
import { StandupOverride } from '@/models/StandupOverride'
import { StandupSummary } from '@/models/StandupSummary'
import { User } from '@/models/User'
import { WorkingCalendar } from '@/models/WorkingCalendar'

import { generateStandupsForSprint } from '../generation'
import { getSprintSchedule } from '../schedule'
import { anyId, ids, syncIndexes, useMongo } from './helpers/mongo'

const { organization, project, member, otherMember, user } = ids

async function seedProject() {
  await WorkingCalendar.create({
    scope: 'project',
    organization,
    project,
    workingDaysOfWeek: [1, 2, 3, 4, 5],
    standardMinutesPerDay: 480,
    timezone: 'Asia/Colombo',
    subscribedHolidaySets: [],
    overrides: []
  })

  await ProjectStandupSettings.create({
    project,
    organization,
    enabled: true,
    standupLocalTime: '09:00',
    defaultFacilitator: user
  })
}

async function seedSprint() {
  const sprint = await Sprint.create({
    name: 'Sprint 14',
    organization,
    project,
    createdBy: user,
    status: 'active',
    startDate: new Date('2026-08-10T00:00:00.000Z'),
    endDate: new Date('2026-08-14T00:00:00.000Z'),
    capacity: 0,
    teamMembers: [member, otherMember]
  })

  await generateStandupsForSprint(String(sprint._id))
  return sprint
}

describe('getSprintSchedule', () => {
  useMongo()

  beforeEach(async () => {
    await syncIndexes(Standup)
  })

  it('returns every stand-up in date order with its shape and day number', async () => {
    await seedProject()
    const sprint = await seedSprint()

    const schedule = await getSprintSchedule(String(sprint._id))

    expect(schedule.days.map((day) => day.date)).toEqual([
      '2026-08-10',
      '2026-08-11',
      '2026-08-12',
      '2026-08-13',
      '2026-08-14'
    ])
    expect(schedule.days[0]).toMatchObject({ sprintDayNumber: 1, shape: 'day_one' })
    expect(schedule.days[4].shape).toBe('final_day')
    expect(schedule.totalSprintDays).toBe(5)
  })

  it('UI-9: keeps skipped days visible, with the reason', async () => {
    await seedProject()
    const sprint = await seedSprint()

    await Standup.updateOne(
      { sprint: sprint._id, standupDate: '2026-08-12' },
      { $set: { status: 'Skipped_Holiday', skippedReason: 'Nikini Full Moon Poya Day' } }
    )

    const schedule = await getSprintSchedule(String(sprint._id))

    const skipped = schedule.days.find((day) => day.date === '2026-08-12')
    expect(skipped).toMatchObject({
      status: 'Skipped_Holiday',
      skippedReason: 'Nikini Full Moon Poya Day'
    })
    expect(schedule.days).toHaveLength(5)
  })

  it('UI-8: names today in the project timezone so the row can be pinned', async () => {
    await seedProject()
    const sprint = await seedSprint()

    // 20:00 UTC on the 11th is already the 12th in Colombo.
    const schedule = await getSprintSchedule(String(sprint._id), {
      now: new Date('2026-08-11T20:00:00.000Z')
    })

    expect(schedule.today).toBe('2026-08-12')
    expect(schedule.timezone).toBe('Asia/Colombo')
  })

  it('reports the sprint date range so the banner can ask about coverage (OB-3)', async () => {
    await seedProject()
    const sprint = await seedSprint()

    const schedule = await getSprintSchedule(String(sprint._id))

    expect(schedule.dateRange).toEqual({ from: '2026-08-10', to: '2026-08-14' })
  })

  it('returns an empty schedule rather than throwing for a sprint with none', async () => {
    await seedProject()
    const sprint = await Sprint.create({
      name: 'Unplanned',
      organization,
      project,
      createdBy: user,
      status: 'planning',
      startDate: new Date('2026-09-07T00:00:00.000Z'),
      endDate: new Date('2026-09-11T00:00:00.000Z'),
      capacity: 0,
      teamMembers: []
    })

    const schedule = await getSprintSchedule(String(sprint._id))

    expect(schedule.days).toEqual([])
    expect(schedule.totalSprintDays).toBe(0)
  })

  it('refuses a sprint that does not exist', async () => {
    await expect(
      getSprintSchedule(String(new mongoose.Types.ObjectId()))
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('resolves the facilitator id to a real name', async () => {
    await User.create({
      _id: user,
      firstName: 'Priya',
      lastName: 'Fernando',
      email: 'priya@example.com',
      organization,
      role: 'project_manager',
      password: 'hashed'
    })
    await seedProject()
    const sprint = await seedSprint()

    const schedule = await getSprintSchedule(String(sprint._id))

    expect(schedule.days[0].facilitatorName).toBe('Priya Fernando')
  })

  it('falls back to the raw id when the facilitator has no User document', async () => {
    await seedProject()
    const sprint = await seedSprint()

    const schedule = await getSprintSchedule(String(sprint._id))

    expect(schedule.days[0].facilitatorName).toBe(String(user))
  })

  it('spec §15.7: includes sprint health summary and operational metrics', async () => {
    await seedProject()
    const sprint = await seedSprint()

    const schedule = await getSprintSchedule(String(sprint._id))

    expect(schedule.health).toBeDefined()
    expect(schedule.health!.progress).toEqual({
      completedDays: 0,
      missedDays: 0,
      totalWorkingDays: 5,
      percentComplete: 0
    })
    expect(schedule.health!.estimateDebt).toEqual({
      outstandingMinutes: 0,
      affectedMembersCount: 0
    })
    expect(schedule.health!.carryForward).toEqual({
      openCount: 0,
      oldestAgeInStandups: 0,
      chronicCount: 0
    })
    expect(schedule.health!.overrides).toEqual({
      totalCount: 0
    })
  })

  describe('spec §15.7: per-day operational metrics', () => {
    it('computes allocationPercentage from real planned minutes against expected attendee capacity', async () => {
      await seedProject()
      const sprint = await seedSprint()
      const standup = (await Standup.findOne({ sprint: sprint._id, standupDate: '2026-08-10' }).lean()) as any

      // Two expected attendees (member, otherMember) at 480 standard minutes
      // each is 960 minutes of capacity for the day; 480 planned is half.
      await Allocation.create({
        standup: standup._id,
        sprint: sprint._id,
        project,
        organization,
        member,
        task: anyId(),
        plannedMinutes: 480,
        source: 'assigned_in_standup',
        createdBy: user
      })

      const schedule = await getSprintSchedule(String(sprint._id))

      const day = schedule.days.find((d) => d.date === '2026-08-10')
      expect(day?.allocationPercentage).toBe(50)
      expect(day?.totalPlannedMinutes).toBe(480)
    })

    it('caps allocationPercentage at 100 even when the day is over-planned', async () => {
      await seedProject()
      const sprint = await seedSprint()
      const standup = (await Standup.findOne({ sprint: sprint._id, standupDate: '2026-08-10' }).lean()) as any

      await Allocation.create({
        standup: standup._id,
        sprint: sprint._id,
        project,
        organization,
        member,
        task: anyId(),
        plannedMinutes: 1200,
        source: 'assigned_in_standup',
        createdBy: user
      })

      const schedule = await getSprintSchedule(String(sprint._id))

      const day = schedule.days.find((d) => d.date === '2026-08-10')
      expect(day?.allocationPercentage).toBe(100)
    })

    it('counts live overrides and open carry-forward items issued against an in-flight day', async () => {
      await seedProject()
      const sprint = await seedSprint()
      const standup = (await Standup.findOne({ sprint: sprint._id, standupDate: '2026-08-10' }).lean()) as any

      await StandupOverride.create({
        standup: standup._id,
        sprint: sprint._id,
        project,
        organization,
        type: 'under_allocation',
        reasonCode: 'team_member_unavailable',
        justification: 'Team member out sick, capacity intentionally left short today.',
        issuedBy: user
      })

      await CarryForwardItem.create({
        sprint: sprint._id,
        project,
        organization,
        type: 'unfinished_task',
        originStandup: standup._id,
        originDate: '2026-08-09',
        currentStandup: standup._id,
        ageInStandups: 1,
        status: 'open'
      })

      const schedule = await getSprintSchedule(String(sprint._id))

      const day = schedule.days.find((d) => d.date === '2026-08-10')
      expect(day?.overridesCount).toBe(1)
      expect(day?.carryForwardCount).toBe(1)
    })

    it('reads attendance from the live standup document before it is completed', async () => {
      await seedProject()
      const sprint = await seedSprint()

      await Standup.updateOne(
        { sprint: sprint._id, standupDate: '2026-08-10' },
        { $set: { attendance: [{ user: member, state: 'present' }, { user: otherMember, state: 'absent' }] } }
      )

      const schedule = await getSprintSchedule(String(sprint._id))

      const day = schedule.days.find((d) => d.date === '2026-08-10')
      expect(day?.attendance).toEqual({ present: 1, total: 2 })
    })

    it('reads its operational metrics from the frozen StandupSummary once a day is Completed', async () => {
      await seedProject()
      const sprint = await seedSprint()
      const standup = (await Standup.findOne({ sprint: sprint._id, standupDate: '2026-08-10' }).lean()) as any

      await Standup.updateOne({ _id: standup._id }, { $set: { status: 'Completed' } })
      await StandupSummary.create({
        standup: standup._id,
        sprint: sprint._id,
        project,
        organization,
        headerFacts: { durationMinutes: 14 },
        attendance: [
          { memberId: member, name: 'Amal', status: 'present' },
          { memberId: otherMember, name: 'Nadeesha', status: 'present' },
          { memberId: user, name: 'Priya', status: 'absent' }
        ],
        carryForwardState: [{ itemId: 'c1' }, { itemId: 'c2' }],
        overridesIssued: [{ overrideId: 'o1' }]
      })

      const schedule = await getSprintSchedule(String(sprint._id))

      const day = schedule.days.find((d) => d.date === '2026-08-10')
      expect(day?.actualDurationMinutes).toBe(14)
      expect(day?.attendance).toEqual({ present: 2, total: 3 })
      expect(day?.carryForwardCount).toBe(2)
      expect(day?.overridesCount).toBe(1)
    })
  })

  describe('spec §15.7: sprint-wide health summary reflects real data', () => {
    it('sums outstanding estimate debt only across members who actually carry it', async () => {
      await seedProject()
      const sprint = await seedSprint()

      await MemberSprintDebtSummary.create({
        project,
        sprint: sprint._id,
        member,
        organization,
        outstandingMinutes: 90,
        lastRebuiltAt: new Date()
      })
      await MemberSprintDebtSummary.create({
        project,
        sprint: sprint._id,
        member: otherMember,
        organization,
        outstandingMinutes: 0,
        lastRebuiltAt: new Date()
      })

      const schedule = await getSprintSchedule(String(sprint._id))

      expect(schedule.health!.estimateDebt).toEqual({
        outstandingMinutes: 90,
        affectedMembersCount: 1
      })
    })

    it('reports the oldest open carry-forward age and counts a tagged-chronic item even before it ages past the threshold', async () => {
      await seedProject()
      const sprint = await seedSprint()
      const standup = (await Standup.findOne({ sprint: sprint._id, standupDate: '2026-08-10' }).lean()) as any

      await CarryForwardItem.create({
        sprint: sprint._id,
        project,
        organization,
        type: 'unfinished_task',
        originStandup: standup._id,
        originDate: '2026-08-08',
        currentStandup: standup._id,
        ageInStandups: 5,
        status: 'escalated'
      })
      await CarryForwardItem.create({
        sprint: sprint._id,
        project,
        organization,
        type: 'open_blocker',
        originStandup: standup._id,
        originDate: '2026-08-10',
        currentStandup: standup._id,
        ageInStandups: 1,
        status: 'noted',
        tags: ['chronic']
      })
      // Resolved items are not "open" and must not count.
      await CarryForwardItem.create({
        sprint: sprint._id,
        project,
        organization,
        type: 'unfinished_task',
        originStandup: standup._id,
        originDate: '2026-08-09',
        currentStandup: standup._id,
        ageInStandups: 2,
        status: 'resolved'
      })

      const schedule = await getSprintSchedule(String(sprint._id))

      expect(schedule.health!.carryForward).toEqual({
        openCount: 2,
        oldestAgeInStandups: 5,
        chronicCount: 2
      })
    })

    it('totals overrides issued across the whole sprint, not just one day', async () => {
      await seedProject()
      const sprint = await seedSprint()
      const days = await Standup.find({ sprint: sprint._id }).sort({ standupDate: 1 }).lean()

      await StandupOverride.create({
        standup: days[0]._id,
        sprint: sprint._id,
        project,
        organization,
        type: 'under_allocation',
        reasonCode: 'team_member_unavailable',
        justification: 'Day 1: capacity intentionally left short due to leave.',
        issuedBy: user
      })
      await StandupOverride.create({
        standup: days[1]._id,
        sprint: sprint._id,
        project,
        organization,
        type: 'over_allocation',
        reasonCode: 'urgent_production_issue',
        justification: 'Day 2: took on urgent work beyond planned capacity.',
        issuedBy: user
      })

      const schedule = await getSprintSchedule(String(sprint._id))

      expect(schedule.health!.overrides.totalCount).toBe(2)
      expect(schedule.days.find((d) => d.date === '2026-08-10')?.overridesCount).toBe(1)
      expect(schedule.days.find((d) => d.date === '2026-08-11')?.overridesCount).toBe(1)
    })
  })
})

describe('the schedule routes are permission-gated (SEC-1)', () => {
  const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8')

  it('GET the schedule requires STANDUP_VIEW', () => {
    const source = read('src/app/api/sprints/[id]/standups/route.ts')
    expect(source).toContain('Permission.STANDUP_VIEW')
    expect(source).toContain('withSprintPermission')
  })

  it('POST generate requires STANDUP_GENERATE, not merely view', () => {
    const source = read('src/app/api/sprints/[id]/standups/generate/route.ts')
    expect(source).toContain('Permission.STANDUP_GENERATE')
    expect(source).not.toContain('Permission.STANDUP_VIEW')
  })

  it('GET one stand-up goes through the stand-up-scoped helper, not an org check', () => {
    const source = read('src/app/api/standups/[id]/route.ts')
    expect(source).toContain('withStandupIdPermission')
    expect(source).toContain('Permission.STANDUP_VIEW')
  })

  it('every route exports a handler', async () => {
    const schedule = await import('@/app/api/sprints/[id]/standups/route')
    const generate = await import('@/app/api/sprints/[id]/standups/generate/route')
    const detail = await import('@/app/api/standups/[id]/route')

    expect(typeof schedule.GET).toBe('function')
    expect(typeof generate.POST).toBe('function')
    expect(typeof detail.GET).toBe('function')
  })
})
