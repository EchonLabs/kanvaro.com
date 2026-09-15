/**
 * The org-admin cross-project stand-up oversight rollup.
 *
 * Deliberately does not re-prove capacity-balance arithmetic — that's
 * `computeSprintHealth`/`loadSprintHealthTotals`'s own job, already covered
 * by `sprint-health.test.ts` and `jobs.sprint-health.test.ts`. This proves
 * what's actually new here: the org-wide rollup, the escalation flags, the
 * worst-first sort, and org isolation.
 */
import mongoose from 'mongoose'

import { CarryForwardItem } from '@/models/CarryForwardItem'
import { MemberSprintDebtSummary } from '@/models/MemberSprintDebtSummary'
import { Project } from '@/models/Project'
import { Sprint } from '@/models/Sprint'
import { Standup } from '@/models/Standup'
import { StandupBlocker } from '@/models/StandupBlocker'
import { StandupOverride } from '@/models/StandupOverride'

import { getOrgStandupOversight } from '../admin-oversight'
import { ids, useMongo } from './helpers/mongo'

const { organization, project, otherProject, user, member } = ids

let projectNumber = 1

async function seedProject(id: mongoose.Types.ObjectId, name: string, org = organization) {
  await Project.create({
    _id: id,
    name,
    organization: org,
    createdBy: user,
    status: 'active',
    projectNumber: projectNumber++,
    startDate: new Date('2026-08-01T00:00:00.000Z'),
    projectRoles: []
  })
}

async function seedSprint(
  id: mongoose.Types.ObjectId,
  projectId: mongoose.Types.ObjectId,
  overrides: Record<string, unknown> = {}
) {
  await Sprint.create({
    _id: id,
    name: 'Sprint 1',
    organization,
    project: projectId,
    createdBy: user,
    status: 'active',
    startDate: new Date('2026-08-17T00:00:00.000Z'),
    endDate: new Date('2026-08-21T00:00:00.000Z'),
    capacity: 0,
    teamMembers: [member],
    ...overrides
  })
}

async function seedStandup(sprintId: mongoose.Types.ObjectId, projectId: mongoose.Types.ObjectId, date: string, status: string) {
  return Standup.create({
    project: projectId,
    sprint: sprintId,
    organization,
    standupDate: date,
    scheduledStartAt: new Date(`${date}T03:30:00.000Z`),
    durationMinutes: 15,
    sprintDayNumber: 1,
    totalSprintDays: 5,
    shape: 'mid_sprint',
    status,
    facilitator: user,
    expectedAttendees: [member],
    version: 0
  })
}

describe('getOrgStandupOversight', () => {
  useMongo()

  it('only includes active sprints from the caller\'s own organisation', async () => {
    await seedProject(project, 'Kanvaro')
    await seedSprint(new mongoose.Types.ObjectId(), project, { status: 'completed' })
    await seedSprint(new mongoose.Types.ObjectId(), project, { status: 'planning' })

    const foreignOrg = new mongoose.Types.ObjectId()
    const foreignProject = new mongoose.Types.ObjectId()
    await seedProject(foreignProject, 'Someone else\'s project', foreignOrg)
    await Sprint.create({
      name: 'Foreign sprint',
      organization: foreignOrg,
      project: foreignProject,
      createdBy: user,
      status: 'active',
      startDate: new Date('2026-08-17T00:00:00.000Z'),
      endDate: new Date('2026-08-21T00:00:00.000Z'),
      capacity: 0,
      teamMembers: []
    })

    const result = await getOrgStandupOversight(String(organization))
    expect(result.sprints).toEqual([])
  })

  it('flags an open blocker and counts it in the org totals', async () => {
    await seedProject(project, 'Kanvaro')
    const sprintId = new mongoose.Types.ObjectId()
    await seedSprint(sprintId, project)
    const standup = await seedStandup(sprintId, project, '2026-08-17', 'Completed')

    await StandupBlocker.create({
      standup: standup._id,
      sprint: sprintId,
      project,
      organization,
      raisedBy: member,
      description: 'Vendor sandbox is still down',
      blockerType: 'external_party',
      severity: 'high'
    })

    const result = await getOrgStandupOversight(String(organization))
    expect(result.sprints).toHaveLength(1)
    expect(result.sprints[0].openBlockersCount).toBe(1)
    expect(result.sprints[0].flags).toContain('open_blockers')
    expect(result.totals.openBlockers).toBe(1)
  })

  it('flags a carry-forward item that has aged into the chronic band', async () => {
    await seedProject(project, 'Kanvaro')
    const sprintId = new mongoose.Types.ObjectId()
    await seedSprint(sprintId, project)
    const standup = await seedStandup(sprintId, project, '2026-08-17', 'Completed')

    await CarryForwardItem.create({
      sprint: sprintId,
      project,
      organization,
      type: 'unfinished_task',
      originStandup: standup._id,
      originDate: '2026-08-17',
      currentStandup: standup._id,
      ageInStandups: 8,
      status: 'open'
    })

    const result = await getOrgStandupOversight(String(organization))
    expect(result.sprints[0].carryForward).toEqual({
      openCount: 1,
      oldestAgeInStandups: 8,
      chronicCount: 1,
      ageBands: { normal: 0, noteRequired: 0, escalated: 0, chronic: 1 }
    })
    expect(result.sprints[0].flags).toContain('chronic_carry_forward')
    expect(result.totals.chronicCarryForwardItems).toBe(1)
  })

  it('buckets open carry-forward items into §13.3 age bands for the histogram', async () => {
    await seedProject(project, 'Kanvaro')
    const sprintId = new mongoose.Types.ObjectId()
    await seedSprint(sprintId, project)
    const standup = await seedStandup(sprintId, project, '2026-08-17', 'Completed')

    // One per band: normal (1), note-required (3), escalated (6), chronic (9).
    for (const age of [1, 3, 6, 9]) {
      await CarryForwardItem.create({
        sprint: sprintId,
        project,
        organization,
        type: 'unfinished_task',
        originStandup: standup._id,
        originDate: '2026-08-17',
        currentStandup: standup._id,
        ageInStandups: age,
        status: 'open'
      })
    }

    const result = await getOrgStandupOversight(String(organization))
    expect(result.carryForwardAgeBands).toEqual({
      normal: 1,
      noteRequired: 1,
      escalated: 1,
      chronic: 1
    })
  })

  it('reports stand-up discipline, excluding skipped days from the denominator', async () => {
    await seedProject(project, 'Kanvaro')
    const sprintId = new mongoose.Types.ObjectId()
    await seedSprint(sprintId, project)
    await seedStandup(sprintId, project, '2026-08-17', 'Completed')
    await seedStandup(sprintId, project, '2026-08-18', 'Completed')
    await seedStandup(sprintId, project, '2026-08-19', 'Missed')
    await seedStandup(sprintId, project, '2026-08-20', 'Scheduled')
    // A holiday was never a working day, so it is not part of the measure.
    await seedStandup(sprintId, project, '2026-08-21', 'Skipped_Holiday')

    const result = await getOrgStandupOversight(String(organization))
    expect(result.sprints[0].discipline).toEqual({
      completedDays: 2,
      missedDays: 1,
      remainingDays: 1,
      totalWorkingDays: 4
    })
  })

  it('keeps the day sequence as well as the counts, so a run of misses is visible (SCH-15)', async () => {
    await seedProject(project, 'Kanvaro')
    const sprintId = new mongoose.Types.ObjectId()
    await seedSprint(sprintId, project)
    await seedStandup(sprintId, project, '2026-08-17', 'Completed')
    await seedStandup(sprintId, project, '2026-08-18', 'Missed')
    await seedStandup(sprintId, project, '2026-08-19', 'Skipped_Holiday')
    await seedStandup(sprintId, project, '2026-08-20', 'Scheduled')

    const result = await getOrgStandupOversight(String(organization))
    // Partitioned exactly the way `discipline` counts, so the ribbon the
    // dashboard draws can never disagree with the figure printed beside it.
    expect(result.sprints[0].cadence).toEqual([
      { date: '2026-08-17', state: 'ran' },
      { date: '2026-08-18', state: 'missed' },
      { date: '2026-08-19', state: 'off' },
      { date: '2026-08-20', state: 'ahead' }
    ])
  })

  it('ranks override reason codes across every active sprint (OVR-8)', async () => {
    await seedProject(project, 'Kanvaro')
    const sprintId = new mongoose.Types.ObjectId()
    await seedSprint(sprintId, project)
    const standup = await seedStandup(sprintId, project, '2026-08-17', 'Completed')

    const override = (reasonCode: string) => ({
      standup: standup._id,
      sprint: sprintId,
      project,
      organization,
      type: 'under_allocation',
      affectedMemberIds: [member],
      affectedTaskIds: [],
      reasonCode,
      justification: 'Blocked on the vendor sandbox all day, proceeding under capacity.',
      gapMinutes: 480,
      issuedBy: user
    })

    await StandupOverride.create(override('blocked_capacity'))
    await StandupOverride.create(override('blocked_capacity'))
    await StandupOverride.create(override('no_work_available'))

    const result = await getOrgStandupOversight(String(organization))
    expect(result.overrideReasons[0]).toEqual({
      type: 'under_allocation',
      reasonCode: 'blocked_capacity',
      count: 2
    })
    expect(result.overrideReasons[1].reasonCode).toBe('no_work_available')
    expect(result.totals.overridesIssued).toBe(3)
  })

  it('surfaces an active planning waiver and flags an expired one (PLN-18)', async () => {
    await seedProject(project, 'Kanvaro')
    const liveId = new mongoose.Types.ObjectId()
    await seedSprint(liveId, project, {
      name: 'Waived sprint',
      planningWaiver: {
        waivedCheckIds: ['PC-4'],
        justification: 'Pilot customer deadline agreed with the delivery lead on 12 August.',
        issuedBy: user,
        issuedAt: new Date('2026-08-12T00:00:00.000Z'),
        expiresAt: new Date('2020-01-01T00:00:00.000Z')
      }
    })

    const result = await getOrgStandupOversight(String(organization))
    expect(result.waivers).toHaveLength(1)
    expect(result.waivers[0].waivedCheckIds).toEqual(['PC-4'])
    expect(result.waivers[0].expired).toBe(true)
  })

  it('ignores a revoked waiver', async () => {
    await seedProject(project, 'Kanvaro')
    await seedSprint(new mongoose.Types.ObjectId(), project, {
      planningWaiver: {
        waivedCheckIds: ['PC-4'],
        justification: 'Pilot customer deadline agreed with the delivery lead on 12 August.',
        issuedBy: user,
        issuedAt: new Date('2026-08-12T00:00:00.000Z'),
        expiresAt: new Date('2026-08-19T00:00:00.000Z'),
        revokedAt: new Date('2026-08-13T00:00:00.000Z')
      }
    })

    const result = await getOrgStandupOversight(String(organization))
    expect(result.waivers).toEqual([])
  })

  it('flags three consecutive missed stand-ups (SCH-15)', async () => {
    await seedProject(project, 'Kanvaro')
    const sprintId = new mongoose.Types.ObjectId()
    await seedSprint(sprintId, project)
    await seedStandup(sprintId, project, '2026-08-17', 'Completed')
    await seedStandup(sprintId, project, '2026-08-18', 'Missed')
    await seedStandup(sprintId, project, '2026-08-19', 'Missed')
    await seedStandup(sprintId, project, '2026-08-20', 'Missed')

    const result = await getOrgStandupOversight(String(organization))
    expect(result.sprints[0].consecutiveMissedDays).toBe(3)
    expect(result.sprints[0].flags).toContain('consecutive_misses')
  })

  it('does not flag two consecutive misses — the threshold is three', async () => {
    await seedProject(project, 'Kanvaro')
    const sprintId = new mongoose.Types.ObjectId()
    await seedSprint(sprintId, project)
    await seedStandup(sprintId, project, '2026-08-17', 'Completed')
    await seedStandup(sprintId, project, '2026-08-18', 'Missed')
    await seedStandup(sprintId, project, '2026-08-19', 'Missed')

    const result = await getOrgStandupOversight(String(organization))
    expect(result.sprints[0].flags).not.toContain('consecutive_misses')
  })

  it('sums outstanding debt and override counts, and sorts the worst sprint first', async () => {
    await seedProject(project, 'Kanvaro')
    await seedProject(otherProject, 'Second Project')

    const healthySprintId = new mongoose.Types.ObjectId()
    await seedSprint(healthySprintId, otherProject, { name: 'Healthy sprint' })

    const troubledSprintId = new mongoose.Types.ObjectId()
    await seedSprint(troubledSprintId, project, { name: 'Troubled sprint' })
    const standup = await seedStandup(troubledSprintId, project, '2026-08-17', 'Completed')

    await MemberSprintDebtSummary.create({
      project,
      sprint: troubledSprintId,
      member,
      organization,
      outstandingMinutes: 180,
      accruedMinutes: 180,
      creditedMinutes: 0,
      settledMinutes: 0,
      writtenOffMinutes: 0,
      carriedInMinutes: 0,
      lastRebuiltAt: new Date(),
      sourceVersion: 1
    })

    await StandupOverride.create({
      standup: standup._id,
      sprint: troubledSprintId,
      project,
      organization,
      type: 'under_allocation',
      affectedMemberIds: [member],
      affectedTaskIds: [],
      reasonCode: 'blocked_capacity',
      justification: 'Blocked on the vendor sandbox all day, proceeding under capacity.',
      gapMinutes: 480,
      issuedBy: user
    })

    await StandupBlocker.create({
      standup: standup._id,
      sprint: troubledSprintId,
      project,
      organization,
      raisedBy: member,
      description: 'Still waiting on the vendor',
      blockerType: 'external_party',
      severity: 'high'
    })

    const result = await getOrgStandupOversight(String(organization))

    expect(result.sprints).toHaveLength(2)
    // Worst-first: the troubled sprint has a flag (open_blockers), the
    // healthy one has none.
    expect(result.sprints[0].sprintName).toBe('Troubled sprint')
    expect(result.sprints[0].estimateDebtMinutes).toBe(180)
    expect(result.sprints[0].overridesCount).toBe(1)
    expect(result.sprints[1].sprintName).toBe('Healthy sprint')
    expect(result.sprints[1].flags).toEqual([])

    expect(result.totals.outstandingDebtMinutes).toBe(180)
    expect(result.totals.overridesIssued).toBe(1)
  })
})
