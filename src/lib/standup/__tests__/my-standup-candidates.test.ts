/**
 * findOpenStandupCandidates (fixes D2 — a second stand-up on the same day was
 * silently discarded by the old redirector). Real database, following this
 * suite's `useMongo()`/`ids` harness convention.
 */
import { Project } from '@/models/Project'
import { Sprint } from '@/models/Sprint'
import { Standup } from '@/models/Standup'
import { findOpenStandupCandidates } from '../my-standup-candidates'
import { anyId, ids, useMongo } from './helpers/mongo'

const { organization, member, user } = ids

describe('findOpenStandupCandidates', () => {
  useMongo()

  it('finds every open stand-up across projects, ordered by status priority', async () => {
    await Project.create({
      name: 'Project A',
      organization,
      createdBy: user,
      projectNumber: 1,
      status: 'active',
      startDate: new Date('2026-01-01'),
      teamMembers: [{ memberId: member }]
    })
    const projectB = await Project.create({
      name: 'Project B',
      organization,
      createdBy: user,
      projectNumber: 2,
      status: 'active',
      startDate: new Date('2026-01-01'),
      teamMembers: [{ memberId: member }]
    })

    // Two sprints, not one: SCH-2's unique (sprint, standupDate) index would
    // otherwise reject the second stand-up seeded below for the same date.
    const sprintB1 = await Sprint.create({
      name: 'Sprint 4',
      organization,
      project: projectB._id,
      createdBy: user,
      status: 'active',
      startDate: new Date('2026-09-01T00:00:00.000Z'),
      endDate: new Date('2026-09-14T00:00:00.000Z'),
      capacity: 0,
      teamMembers: [member]
    })
    const sprintB2 = await Sprint.create({
      name: 'Sprint 5',
      organization,
      project: projectB._id,
      createdBy: user,
      status: 'planning',
      startDate: new Date('2026-09-15T00:00:00.000Z'),
      endDate: new Date('2026-09-28T00:00:00.000Z'),
      capacity: 0,
      teamMembers: [member]
    })

    const readyStandup = await Standup.create({
      project: projectB._id,
      sprint: sprintB1._id,
      organization,
      standupDate: '2026-09-11',
      scheduledStartAt: new Date('2026-09-11T03:30:00Z'),
      durationMinutes: 15,
      sprintDayNumber: 1,
      totalSprintDays: 5,
      shape: 'mid_sprint',
      status: 'Ready',
      facilitator: user,
      expectedAttendees: [member],
      version: 0
    })
    const inProgressStandup = await Standup.create({
      project: projectB._id,
      sprint: sprintB2._id,
      organization,
      standupDate: '2026-09-11',
      scheduledStartAt: new Date('2026-09-11T04:00:00Z'),
      durationMinutes: 15,
      sprintDayNumber: 2,
      totalSprintDays: 5,
      shape: 'mid_sprint',
      status: 'In_Progress',
      facilitator: user,
      expectedAttendees: [member],
      version: 0
    })

    const candidates = await findOpenStandupCandidates({
      organizationId: String(organization),
      userId: String(member)
    })

    expect(candidates.map((c) => c.standupId)).toEqual([
      String(inProgressStandup._id),
      String(readyStandup._id)
    ])
    expect(candidates.every((c) => c.projectName === 'Project B')).toBe(true)

    const [inProgressCandidate, readyCandidate] = candidates
    expect(inProgressCandidate.sprintId).toBe(String(sprintB2._id))
    expect(inProgressCandidate.sprintName).toBe('Sprint 5')
    expect(readyCandidate.sprintId).toBe(String(sprintB1._id))
    expect(readyCandidate.sprintName).toBe('Sprint 4')
  })

  it('falls back to an empty sprint name rather than throwing when the sprint record is missing', async () => {
    const project = await Project.create({
      name: 'Project C',
      organization,
      createdBy: user,
      projectNumber: 3,
      status: 'active',
      startDate: new Date('2026-01-01'),
      teamMembers: [{ memberId: member }]
    })
    const danglingSprintId = anyId()
    await Standup.create({
      project: project._id,
      sprint: danglingSprintId,
      organization,
      standupDate: '2026-09-11',
      scheduledStartAt: new Date('2026-09-11T03:30:00Z'),
      durationMinutes: 15,
      sprintDayNumber: 1,
      totalSprintDays: 5,
      shape: 'mid_sprint',
      status: 'Ready',
      facilitator: user,
      expectedAttendees: [member],
      version: 0
    })

    const candidates = await findOpenStandupCandidates({
      organizationId: String(organization),
      userId: String(member)
    })

    expect(candidates).toHaveLength(1)
    expect(candidates[0].sprintId).toBe(String(danglingSprintId))
    expect(candidates[0].sprintName).toBe('')
  })

  it('returns an empty array when the member has no open stand-up', async () => {
    const candidates = await findOpenStandupCandidates({
      organizationId: String(organization),
      userId: String(member)
    })
    expect(candidates).toEqual([])
  })
})
