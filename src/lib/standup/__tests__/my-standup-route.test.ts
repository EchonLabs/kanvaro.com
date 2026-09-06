import mongoose from 'mongoose'
import { Standup } from '@/models/Standup'
import { ids, useMongo } from './helpers/mongo'

jest.mock('@/lib/db-config', () => ({
  __esModule: true,
  default: jest.fn().mockResolvedValue(undefined)
}))
jest.mock('@/lib/auth-utils', () => ({
  authenticateUser: jest.fn(async () => ({
    user: { id: String(mockCallerId), organization: String(mockOrgId) }
  }))
}))

let mockCallerId: mongoose.Types.ObjectId
let mockOrgId: mongoose.Types.ObjectId

import { GET } from '@/app/api/my/standup/route'

const { organization, project, sprint, member: caller, otherMember } = ids

beforeAll(() => {
  mockCallerId = caller
  mockOrgId = organization
})

async function seedStandup(overrides: Record<string, unknown> = {}) {
  return Standup.create({
    project,
    sprint,
    organization,
    standupDate: '2026-09-05',
    scheduledStartAt: new Date('2026-09-05T03:30:00.000Z'),
    durationMinutes: 15,
    sprintDayNumber: 3,
    totalSprintDays: 5,
    shape: 'mid_sprint',
    status: 'Scheduled',
    facilitator: caller,
    expectedAttendees: [caller],
    ...overrides
  })
}

describe('GET /api/my/standup', () => {
  useMongo()

  it('exposes the handler and opts out of static rendering', async () => {
    const route = await import('@/app/api/my/standup/route')
    expect(typeof route.GET).toBe('function')
    expect(route.dynamic).toBe('force-dynamic')
  })

  it('returns the In_Progress stand-up the caller is expected at, if one exists', async () => {
    const inProgress = await seedStandup({ status: 'In_Progress' })
    await seedStandup({
      status: 'Scheduled',
      standupDate: '2026-09-06',
      scheduledStartAt: new Date('2026-09-06T03:30:00.000Z')
    })

    const response = await GET()
    const payload = await response.json()

    expect(payload.data.standupId).toBe(String(inProgress._id))
  })

  it('prefers Ready over a later Scheduled one when both exist', async () => {
    const ready = await seedStandup({ status: 'Ready' })
    await seedStandup({
      status: 'Scheduled',
      standupDate: '2026-09-06',
      scheduledStartAt: new Date('2026-09-06T03:30:00.000Z')
    })

    const response = await GET()
    const payload = await response.json()

    expect(payload.data.standupId).toBe(String(ready._id))
  })

  it('falls back to the next Scheduled stand-up when nothing is Ready or In_Progress', async () => {
    const scheduled = await seedStandup({ status: 'Scheduled' })

    const response = await GET()
    const payload = await response.json()

    expect(payload.data.standupId).toBe(String(scheduled._id))
  })

  it('returns null when the caller is not expected at any open stand-up', async () => {
    await seedStandup({ status: 'Scheduled', expectedAttendees: [otherMember] })

    const response = await GET()
    const payload = await response.json()

    expect(payload.data.standupId).toBeNull()
  })

  it('ignores a Completed stand-up entirely', async () => {
    await seedStandup({ status: 'Completed' })

    const response = await GET()
    const payload = await response.json()

    expect(payload.data.standupId).toBeNull()
  })
})
