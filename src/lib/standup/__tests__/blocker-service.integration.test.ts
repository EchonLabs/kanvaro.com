/**
 * blocker-service (Phase 10 — spec RUN-14..18).
 *
 * Exercises raiseBlocker and updateBlocker against a real database, per this
 * repo's rule that at least one test per service writes through the real
 * path rather than a pre-seeded row.
 */
import { loadBlockerPanel, raiseBlocker, updateBlocker } from '../blocker-service'
import { StandupBlocker } from '@/models/StandupBlocker'
import { CarryForwardItem } from '@/models/CarryForwardItem'
import { Allocation } from '@/models/Allocation'
import { ProjectStandupSettings } from '@/models/ProjectStandupSettings'
import { Standup } from '@/models/Standup'
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

  it('excludes a blocked allocation from capacity even without an explicit flag, when the project has not opted blocked tasks in (AC-25/RUN-15)', async () => {
    const allocation = await seedAllocation()
    await ProjectStandupSettings.create({
      project: ids.project,
      organization: ids.organization,
      blockedTasksConsumeCapacity: false
    })

    await raiseBlocker(
      raiseInput({ linkedAllocationId: String(allocation._id), taskId: String(allocation.task) })
    )

    const updatedAllocation = await Allocation.findById(allocation._id).lean()
    expect(updatedAllocation?.excludedFromCapacity).toBe(true)
  })

  it('keeps a blocked allocation counted toward capacity when the project has opted blocked tasks in', async () => {
    const allocation = await seedAllocation()
    await ProjectStandupSettings.create({
      project: ids.project,
      organization: ids.organization,
      blockedTasksConsumeCapacity: true
    })

    await raiseBlocker(
      raiseInput({ linkedAllocationId: String(allocation._id), taskId: String(allocation.task) })
    )

    const updatedAllocation = await Allocation.findById(allocation._id).lean()
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

describe('loadBlockerPanel', () => {
  const seedStandup = async (standupDate = '2026-08-05') =>
    Standup.create({
      project: ids.project,
      sprint: ids.sprint,
      organization: ids.organization,
      standupDate,
      scheduledStartAt: new Date(`${standupDate}T03:30:00.000Z`),
      durationMinutes: 15,
      sprintDayNumber: 1,
      totalSprintDays: 5,
      shape: 'day_one',
      status: 'In_Progress',
      facilitator: ids.user,
      expectedAttendees: [ids.member],
      version: 1
    })

  it('leaves overdue false and targetResolutionDate unset when the blocker has no target date', async () => {
    const standup = await seedStandup()
    await raiseBlocker(raiseInput({ standupId: String(standup._id) }))

    const rows = await loadBlockerPanel(String(standup._id))
    expect(rows).toHaveLength(1)
    expect(rows[0].overdue).toBe(false)
    expect(rows[0].targetResolutionDate).toBeUndefined()
  })

  it('flags a blocker overdue when its target resolution date is before the stand-up date (RUN-18)', async () => {
    const standup = await seedStandup('2026-08-05')
    const blocker = await raiseBlocker(raiseInput({ standupId: String(standup._id) }))
    await StandupBlocker.updateOne(
      { _id: blocker._id },
      { $set: { targetResolutionDate: new Date('2026-08-01T00:00:00.000Z') } }
    )

    const rows = await loadBlockerPanel(String(standup._id))
    expect(rows[0].overdue).toBe(true)
    expect(rows[0].targetResolutionDate).toBe('2026-08-01')
  })

  it('does not flag a blocker overdue when its target resolution date is still ahead', async () => {
    const standup = await seedStandup('2026-08-05')
    const blocker = await raiseBlocker(raiseInput({ standupId: String(standup._id) }))
    await StandupBlocker.updateOne(
      { _id: blocker._id },
      { $set: { targetResolutionDate: new Date('2026-08-10T00:00:00.000Z') } }
    )

    const rows = await loadBlockerPanel(String(standup._id))
    expect(rows[0].overdue).toBe(false)
  })

  it('populates freedMinutes from the linked allocation when it is excluded from capacity (RUN-15)', async () => {
    const standup = await seedStandup()
    const allocation = await seedAllocation()
    await raiseBlocker(
      raiseInput({
        standupId: String(standup._id),
        linkedAllocationId: String(allocation._id),
        taskId: String(allocation.task)
      })
    )

    const rows = await loadBlockerPanel(String(standup._id))
    expect(rows[0].freedMinutes).toBe(120)
  })

  it('leaves freedMinutes undefined when the linked allocation is not excluded from capacity', async () => {
    const standup = await seedStandup()
    const allocation = await seedAllocation()
    await raiseBlocker(
      raiseInput({
        standupId: String(standup._id),
        linkedAllocationId: String(allocation._id),
        taskId: String(allocation.task),
        allocatedDespiteBlocked: true,
        blockedNote: 'PM chose to keep this allocated despite the blocker.'
      })
    )

    const rows = await loadBlockerPanel(String(standup._id))
    expect(rows[0].freedMinutes).toBeUndefined()
  })

  it('formats blockerLabel as BLK- plus the last 6 hex characters of the id, uppercased', async () => {
    const standup = await seedStandup()
    const blocker = await raiseBlocker(raiseInput({ standupId: String(standup._id) }))

    const rows = await loadBlockerPanel(String(standup._id))
    const expected = `BLK-${String(blocker._id).slice(-6).toUpperCase()}`
    expect(rows[0].blockerLabel).toBe(expected)
  })

  it('throws NOT_FOUND for a stand-up that does not exist', async () => {
    await expect(loadBlockerPanel(String(anyId()))).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
})
