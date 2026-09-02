/**
 * `GET /api/standups/:id/summary` and `GET /api/standups/:id/summary/export`
 * (Task 19 — §15.13, UI-10).
 *
 * Real handler invocation against a real (in-memory) database, mirroring
 * `complete-route.test.ts`'s approach: only the auth/permission layer is
 * mocked, `Standup` and `StandupSummary` run for real.
 */
import mongoose from 'mongoose'
import { NextRequest } from 'next/server'

import { Standup } from '@/models/Standup'
import { StandupSummary } from '@/models/StandupSummary'

import { anyId, ids, syncIndexes, useMongo } from './helpers/mongo'

const hasPermission = jest.fn()
const requireProjectAccess = jest.fn()

jest.mock('@/lib/db-config', () => ({
  __esModule: true,
  default: jest.fn().mockResolvedValue(undefined)
}))

jest.mock('@/lib/auth-utils', () => ({
  authenticateUser: jest.fn(async () => ({
    user: { id: String(mockUserId), organization: String(mockOrgId) }
  }))
}))

jest.mock('@/lib/permissions/permission-service', () => ({
  PermissionService: {
    hasPermission: (...args: unknown[]) => hasPermission(...args),
    requireProjectAccess: (...args: unknown[]) => requireProjectAccess(...args)
  }
}))

let mockUserId: mongoose.Types.ObjectId
let mockOrgId: mongoose.Types.ObjectId

import * as summaryRoute from '@/app/api/standups/[id]/summary/route'
import * as exportRoute from '@/app/api/standups/[id]/summary/export/route'

const { organization, project, member, user } = ids

const buildGet = (url: string) => new NextRequest(`http://localhost${url}`, { method: 'GET' })

async function seedStandup(overrides: Record<string, unknown> = {}) {
  return Standup.create({
    project,
    sprint: ids.sprint,
    organization,
    standupDate: '2026-08-17',
    scheduledStartAt: new Date('2026-08-17T03:30:00.000Z'),
    durationMinutes: 15,
    sprintDayNumber: 1,
    totalSprintDays: 5,
    shape: 'day_one',
    status: 'Completed',
    facilitator: user,
    expectedAttendees: [member],
    attendance: [{ user: member, state: 'present' }],
    version: 1,
    ...overrides
  })
}

async function seedSummary(standupId: mongoose.Types.ObjectId, overrides: Record<string, unknown> = {}) {
  return StandupSummary.create({
    standup: standupId,
    sprint: ids.sprint,
    project,
    organization,
    headerFacts: {
      standupDate: '2026-08-17',
      dayNumber: 1,
      totalDays: 5,
      facilitatorName: 'Kasun',
      durationMinutes: 15
    },
    attendance: [{ memberId: member, name: 'Kasun', status: 'present' }],
    ...overrides
  })
}

beforeAll(() => {
  mockUserId = user
  mockOrgId = organization
})

beforeEach(() => {
  hasPermission.mockReset().mockResolvedValue(true)
  requireProjectAccess.mockReset().mockResolvedValue(undefined)
})

describe('GET /api/standups/:id/summary', () => {
  useMongo()

  beforeEach(async () => {
    await syncIndexes(StandupSummary)
  })

  it('exposes the handler and opts out of static rendering', () => {
    expect(typeof summaryRoute.GET).toBe('function')
    expect(summaryRoute.dynamic).toBe('force-dynamic')
  })

  it('returns the persisted summary for a completed stand-up', async () => {
    const standup = await seedStandup()
    await seedSummary(standup._id as mongoose.Types.ObjectId)

    const response = await summaryRoute.GET(buildGet(`/api/standups/${standup._id}/summary`), {
      params: { id: String(standup._id) }
    })
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.data.headerFacts.standupDate).toBe('2026-08-17')
    expect(payload.data.attendance).toHaveLength(1)
  })

  it('404s with NOT_FOUND when the stand-up has no summary yet', async () => {
    const standup = await seedStandup({ status: 'In_Progress' })

    const response = await summaryRoute.GET(buildGet(`/api/standups/${standup._id}/summary`), {
      params: { id: String(standup._id) }
    })
    const payload = await response.json()

    expect(response.status).toBe(404)
    expect(payload.error.code).toBe('NOT_FOUND')
  })

  it('gates on standup:view, not a write permission', () => {
    const fs = require('fs')
    const path = require('path')
    const source = fs.readFileSync(
      path.join(process.cwd(), 'src/app/api/standups/[id]/summary/route.ts'),
      'utf8'
    )
    expect(source).toContain('Permission.STANDUP_VIEW')
    expect(source).toContain('withStandupIdPermission')
  })

  it('404s (not merely absent) for a stand-up in another organisation', async () => {
    const standup = await seedStandup({ organization: anyId() })

    const response = await summaryRoute.GET(buildGet(`/api/standups/${standup._id}/summary`), {
      params: { id: String(standup._id) }
    })

    expect(response.status).toBe(404)
  })
})

describe('GET /api/standups/:id/summary/export', () => {
  useMongo()

  beforeEach(async () => {
    await syncIndexes(StandupSummary)
  })

  it('exposes the handler and opts out of static rendering', () => {
    expect(typeof exportRoute.GET).toBe('function')
    expect(exportRoute.dynamic).toBe('force-dynamic')
  })

  it('?format=markdown returns real rendered text', async () => {
    const standup = await seedStandup()
    await seedSummary(standup._id as mongoose.Types.ObjectId)

    const response = await exportRoute.GET(
      buildGet(`/api/standups/${standup._id}/summary/export?format=markdown`),
      { params: { id: String(standup._id) } }
    )
    const text = await response.text()

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toContain('text/markdown')
    expect(text).toContain('# Stand-up — 2026-08-17 (Day 1 of 5)')
    expect(text).toContain('Kasun: present')
  })

  it('defaults to markdown when no format is given', async () => {
    const standup = await seedStandup()
    await seedSummary(standup._id as mongoose.Types.ObjectId)

    const response = await exportRoute.GET(
      buildGet(`/api/standups/${standup._id}/summary/export`),
      { params: { id: String(standup._id) } }
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toContain('text/markdown')
  })

  it('?format=pdf returns a clear 501, never a silent 200', async () => {
    const standup = await seedStandup()
    await seedSummary(standup._id as mongoose.Types.ObjectId)

    const response = await exportRoute.GET(
      buildGet(`/api/standups/${standup._id}/summary/export?format=pdf`),
      { params: { id: String(standup._id) } }
    )
    const payload = await response.json()

    expect(response.status).toBe(501)
    expect(payload.error.code).toBe('NOT_IMPLEMENTED')
    expect(payload.error.message).toMatch(/summary screen/i)
  })

  it('?format=pdf 404s (not 501) when the stand-up has no summary yet', async () => {
    const standup = await seedStandup({ status: 'In_Progress' })

    const response = await exportRoute.GET(
      buildGet(`/api/standups/${standup._id}/summary/export?format=markdown`),
      { params: { id: String(standup._id) } }
    )
    const payload = await response.json()

    expect(response.status).toBe(404)
    expect(payload.error.code).toBe('NOT_FOUND')
  })
})
