/**
 * blocker-service (Phase 10 — spec RUN-14..18).
 *
 * Exercises raiseBlocker and updateBlocker against a real database, per this
 * repo's rule that at least one test per service writes through the real
 * path rather than a pre-seeded row.
 */
import { raiseBlocker, updateBlocker } from '../blocker-service'
import { StandupBlocker } from '@/models/StandupBlocker'
import { CarryForwardItem } from '@/models/CarryForwardItem'
import { Allocation } from '@/models/Allocation'
import { anyId, ids, useMongo } from './helpers/mongo'

useMongo()

const seedAllocation = async () => {
  const allocation = await Allocation.create({
    standup: ids.user,
    sprint: ids.sprint,
    project: ids.project,
    organization: ids.organization,
    member: ids.member,
    task: anyId(),
    plannedMinutes: 120,
    source: 'assigned_in_standup',
    createdBy: ids.user
  })
  return allocation
}

const raiseInput = (overrides: Record<string, unknown> = {}) => ({
  standupId: String(ids.user),
  sprintId: String(ids.sprint),
  projectId: String(ids.project),
  organizationId: String(ids.organization),
  raisedBy: String(ids.user),
  description: 'The staging environment is down for the vendor migration.',
  blockerType: 'environment',
  severity: 'high',
  ...overrides
})

describe('raiseBlocker', () => {
  it('sets isBlocked/excludedFromCapacity on the linked allocation and creates a linked open_blocker item', async () => {
    const allocation = await seedAllocation()

    const blocker = await raiseBlocker(
      raiseInput({ linkedAllocationId: String(allocation._id), taskId: String(allocation.task) })
    )

    const updatedAllocation = await Allocation.findById(allocation._id).lean()
    expect(updatedAllocation?.isBlocked).toBe(true)
    expect(updatedAllocation?.excludedFromCapacity).toBe(true)
    expect(updatedAllocation?.allocatedDespiteBlocked).toBe(false)

    expect(blocker.linkedCarryForwardId).toBeDefined()
    const item = await CarryForwardItem.findById(blocker.linkedCarryForwardId).lean()
    expect(item).not.toBeNull()
    expect(item?.type).toBe('open_blocker')
    expect(item?.status).toBe('open')
    expect(item?.ageInStandups).toBe(1)
  })

  it('throws VALIDATION_FAILED when allocatedDespiteBlocked is true without a note', async () => {
    const allocation = await seedAllocation()

    await expect(
      raiseBlocker(
        raiseInput({
          linkedAllocationId: String(allocation._id),
          taskId: String(allocation.task),
          allocatedDespiteBlocked: true
        })
      )
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })

    expect(await StandupBlocker.countDocuments()).toBe(0)
  })

  it('keeps the allocation active and off excludedFromCapacity when allocatedDespiteBlocked has a note', async () => {
    const allocation = await seedAllocation()

    await raiseBlocker(
      raiseInput({
        linkedAllocationId: String(allocation._id),
        taskId: String(allocation.task),
        allocatedDespiteBlocked: true,
        blockedNote: 'PM chose to keep this allocated despite the blocker.'
      })
    )

    const updatedAllocation = await Allocation.findById(allocation._id).lean()
    expect(updatedAllocation?.isBlocked).toBe(true)
    expect(updatedAllocation?.allocatedDespiteBlocked).toBe(true)
    expect(updatedAllocation?.excludedFromCapacity).toBe(false)
  })
})

describe('updateBlocker', () => {
  it('throws when moving to resolved without a note', async () => {
    const allocation = await seedAllocation()
    const blocker = await raiseBlocker(
      raiseInput({ linkedAllocationId: String(allocation._id), taskId: String(allocation.task) })
    )

    await expect(
      updateBlocker({
        blockerId: String(blocker._id),
        updatedBy: String(ids.user),
        organizationId: String(ids.organization),
        projectId: String(ids.project),
        status: 'resolved'
      })
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
  })

  it('clears isBlocked/excludedFromCapacity and resolves the linked item when moving to resolved with a note', async () => {
    const allocation = await seedAllocation()
    const blocker = await raiseBlocker(
      raiseInput({ linkedAllocationId: String(allocation._id), taskId: String(allocation.task) })
    )

    const updated = await updateBlocker({
      blockerId: String(blocker._id),
      updatedBy: String(ids.user),
      organizationId: String(ids.organization),
      projectId: String(ids.project),
      status: 'resolved',
      resolutionNote: 'Vendor restored the sandbox environment this morning.'
    })

    expect(updated.status).toBe('resolved')

    const updatedAllocation = await Allocation.findById(allocation._id).lean()
    expect(updatedAllocation?.isBlocked).toBe(false)
    expect(updatedAllocation?.excludedFromCapacity).toBe(false)

    const item = await CarryForwardItem.findById(blocker.linkedCarryForwardId).lean()
    expect(item?.status).toBe('resolved')
    expect(item?.resolution?.resolutionType).toBe('done')
    expect(item?.resolution?.comment).toBe('Vendor restored the sandbox environment this morning.')
  })
})
