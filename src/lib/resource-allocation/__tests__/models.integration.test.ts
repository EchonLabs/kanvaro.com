/**
 * The resource allocation collections against a real database.
 *
 * The constraints asserted here are the ones the services lean on instead of
 * re-checking: one live row per member × project, whole-number percents, and at
 * most one pending request per member (enforced by a partial unique index so
 * two PMs submitting at once cannot both win).
 */
import mongoose from 'mongoose'

import { ResourceAllocation } from '@/models/ResourceAllocation'
import { AllocationRequest } from '@/models/AllocationRequest'
import { AllocationHistory } from '@/models/AllocationHistory'
import { Organization } from '@/models/Organization'

import { ids, syncIndexes, useMongo } from '@/lib/standup/__tests__/helpers/mongo'

const { organization, project, otherProject, member, user } = ids

const requestFor = (memberId = member, status = 'pending') => ({
  organization,
  member: memberId,
  requestedBy: user,
  reason: 'New project requirement',
  status,
  lines: [{ project, previousPercent: 0, newPercent: 40 }],
  totalBefore: 0,
  totalAfter: 40
})

describe('resource allocation models', () => {
  useMongo()

  beforeEach(async () => {
    await syncIndexes(ResourceAllocation, AllocationRequest, AllocationHistory)
  })

  it('rejects a duplicate member+project allocation in the same org', async () => {
    const row = { organization, member, project, percent: 40, updatedBy: user }
    await ResourceAllocation.create(row)

    await expect(ResourceAllocation.create({ ...row, percent: 20 })).rejects.toMatchObject({
      code: 11000
    })
  })

  it('allows the same member on two different projects', async () => {
    await ResourceAllocation.create({ organization, member, project, percent: 40, updatedBy: user })
    await expect(
      ResourceAllocation.create({ organization, member, project: otherProject, percent: 60, updatedBy: user })
    ).resolves.toBeDefined()
  })

  it.each([0, 101, 50.5])('rejects percent %p', async (percent) => {
    await expect(
      ResourceAllocation.create({ organization, member, project, percent, updatedBy: user })
    ).rejects.toMatchObject({ name: 'ValidationError' })
  })

  it('requires a reason on a request', async () => {
    await expect(
      AllocationRequest.create({ ...requestFor(), reason: '   ' })
    ).rejects.toMatchObject({ name: 'ValidationError' })
  })

  it('requires at least one line on a request', async () => {
    await expect(
      AllocationRequest.create({ ...requestFor(), lines: [] })
    ).rejects.toMatchObject({ name: 'ValidationError' })
  })

  it('rejects a non-integer line percent on a request', async () => {
    await expect(
      AllocationRequest.create({
        ...requestFor(),
        lines: [{ project, previousPercent: 0, newPercent: 12.5 }]
      })
    ).rejects.toMatchObject({ name: 'ValidationError' })
  })

  it('defaults a new request to pending', async () => {
    const { status, ...rest } = requestFor()
    const created = await AllocationRequest.create(rest)
    expect(created.status).toBe('pending')
  })

  it('allows only one pending request per member', async () => {
    await AllocationRequest.create(requestFor())

    await expect(AllocationRequest.create(requestFor())).rejects.toMatchObject({ code: 11000 })
  })

  it('allows a new pending request once the earlier one is decided', async () => {
    const first = await AllocationRequest.create(requestFor())
    await AllocationRequest.updateOne({ _id: first._id }, { status: 'approved' })

    await expect(AllocationRequest.create(requestFor())).resolves.toBeDefined()
  })

  it('does not restrict pending requests for different members', async () => {
    await AllocationRequest.create(requestFor())
    await expect(
      AllocationRequest.create(requestFor(new mongoose.Types.ObjectId()))
    ).resolves.toBeDefined()
  })

  it('records history rows with a creation time and no update time', async () => {
    const row = await AllocationHistory.create({
      organization,
      member,
      project,
      changedBy: user,
      previousPercent: 0,
      newPercent: 40,
      reason: 'Initial allocation',
      kind: 'direct'
    })
    expect(row.createdAt).toBeInstanceOf(Date)
    expect((row as any).updatedAt).toBeUndefined()
  })

  it('defaults the org over-allocation threshold to 100', () => {
    const org = new Organization({ name: 'Acme' })
    expect(org.settings.resourceAllocation.overAllocationThresholdPercent).toBe(100)
  })

  it.each([49, 201])('rejects a threshold of %p', async (value) => {
    const org = new Organization({
      name: 'Acme',
      settings: { resourceAllocation: { overAllocationThresholdPercent: value } }
    })
    await expect(org.validate()).rejects.toMatchObject({ name: 'ValidationError' })
  })
})
