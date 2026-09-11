/**
 * findOpenStandupCandidates (fixes D2 — a second stand-up on the same day was
 * silently discarded by the old redirector). Real database, following this
 * suite's `useMongo()`/`ids` harness convention.
 */
import { Project } from '@/models/Project'
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

    const readyStandup = await Standup.create({
      project: projectB._id,
      sprint: anyId(),
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
      sprint: anyId(),
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
  })

  it('returns an empty array when the member has no open stand-up', async () => {
    const candidates = await findOpenStandupCandidates({
      organizationId: String(organization),
      userId: String(member)
    })
    expect(candidates).toEqual([])
  })
})
