/**
 * `PUT /api/organization` — the timezone half.
 *
 * Changing the org zone moves the org-scoped working calendar with it and
 * audits that move, but never touches a project calendar (a deliberate PM
 * override, even when it matches the old org zone). An unknown zone is
 * refused before anything is written.
 */
import mongoose from 'mongoose'
import { NextRequest } from 'next/server'

import { ActivityLog } from '@/models/ActivityLog'
import { Organization } from '@/models/Organization'
import { WorkingCalendar } from '@/models/WorkingCalendar'

import * as organizationRoute from '@/app/api/organization/route'

import { ids, useMongo } from './helpers/mongo'

jest.mock('@/lib/db-config', () => ({
  __esModule: true,
  default: jest.fn().mockResolvedValue(undefined),
  hasDatabaseConfig: jest.fn().mockResolvedValue(true)
}))

jest.mock('@/lib/auth-utils', () => ({
  authenticateUser: jest.fn(async () => ({
    user: { id: String(mockUserId), organization: String(mockOrgId) }
  }))
}))

jest.mock('@/lib/permissions/permission-service', () => ({
  PermissionService: {
    hasPermission: jest.fn().mockResolvedValue(true)
  }
}))

let mockUserId: mongoose.Types.ObjectId
let mockOrgId: mongoose.Types.ObjectId

const { organization, project, user } = ids

const put = (body: Record<string, unknown>) =>
  organizationRoute.PUT(
    new NextRequest('http://localhost/api/organization', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
  )

beforeAll(() => {
  mockUserId = user
  mockOrgId = organization
})

describe('PUT /api/organization — timezone', () => {
  useMongo()

  beforeEach(async () => {
    await Organization.create({ _id: organization, name: 'Kanvaro', timezone: 'Asia/Colombo' })
    await WorkingCalendar.create({
      scope: 'organization',
      organization,
      timezone: 'Asia/Colombo'
    })
    // A PM chose the same zone as the org on purpose.
    await WorkingCalendar.create({
      scope: 'project',
      organization,
      project,
      timezone: 'Asia/Colombo'
    })
  })

  it('moves only the org calendar and audits the move', async () => {
    const response = await put({ timezone: 'Europe/London' })
    expect(response.status).toBe(200)

    const orgCalendar = (await WorkingCalendar.findOne({ scope: 'organization' }).lean()) as any
    const projectCalendar = (await WorkingCalendar.findOne({ scope: 'project' }).lean()) as any
    expect(orgCalendar?.timezone).toBe('Europe/London')
    expect(projectCalendar?.timezone).toBe('Asia/Colombo')

    const audits = await ActivityLog.find({ action: 'working_calendar_updated' }).lean()
    expect(audits).toHaveLength(1)
    expect(String(audits[0].entityId)).toBe(String(orgCalendar?._id))
    expect((audits[0] as any).details).toMatchObject({
      before: { timezone: 'Asia/Colombo' },
      after: { timezone: 'Europe/London' },
      source: 'organization_timezone_change'
    })
  })

  it('stores a zone sent in the wrong case in its standard spelling', async () => {
    const response = await put({ timezone: 'europe/london' })
    expect(response.status).toBe(200)

    const org = (await Organization.findById(organization).lean()) as any
    const orgCalendar = (await WorkingCalendar.findOne({ scope: 'organization' }).lean()) as any
    expect(org?.timezone).toBe('Europe/London')
    expect(orgCalendar?.timezone).toBe('Europe/London')
  })

  it('writes no audit when the zone does not change', async () => {
    const response = await put({ timezone: 'Asia/Colombo' })
    expect(response.status).toBe(200)
    expect(await ActivityLog.countDocuments({})).toBe(0)
  })

  it.each(['Mars/Base', '', 42])('refuses %p without writing anything', async (timezone) => {
    const response = await put({ timezone, name: 'Renamed' })
    expect(response.status).toBe(400)

    const org = (await Organization.findById(organization).lean()) as any
    expect(org?.timezone).toBe('Asia/Colombo')
    expect(org?.name).toBe('Kanvaro')
    const calendars = await WorkingCalendar.find({}).lean()
    expect(calendars.every((calendar) => calendar.timezone === 'Asia/Colombo')).toBe(true)
  })
})
