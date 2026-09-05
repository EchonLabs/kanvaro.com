/**
 * override-service (Phase 10 — spec OVR-1..9).
 *
 * Exercises issueOverride and detectChronicUnderAllocation against a real
 * database, per this repo's rule that at least one test per service writes
 * through the real path rather than a pre-seeded row.
 */
import { issueOverride, detectChronicUnderAllocation } from '../override-service'
import { StandupOverride } from '@/models/StandupOverride'
import { CarryForwardItem } from '@/models/CarryForwardItem'
import { ids, useMongo } from './helpers/mongo'

useMongo()

const baseInput = (overrides = {}) => ({
  standupId: String(ids.user),
  sprintId: String(ids.sprint),
  projectId: String(ids.project),
  organizationId: String(ids.organization),
  type: 'under_allocation' as const,
  affectedMemberIds: [String(ids.member)],
  reasonCode: 'blocked_capacity',
  justification: 'All of Kasun’s remaining work is blocked on the vendor sandbox.',
  gapMinutes: 180,
  issuedBy: String(ids.user),
  adminRecipientIds: [] as string[],
  ...overrides
})

describe('issueOverride', () => {
  it('creates an override record for an overridable type', async () => {
    const override = await issueOverride(baseInput())
    expect(override.type).toBe('under_allocation')
    expect(await StandupOverride.countDocuments()).toBe(1)
  })

  it('refuses O6 with OVERRIDE_NOT_PERMITTED', async () => {
    await expect(
      issueOverride(baseInput({ type: 'unestimated_task_allocation' }))
    ).rejects.toMatchObject({ code: 'OVERRIDE_NOT_PERMITTED' })
  })

  it('refuses a weak justification with INVALID_JUSTIFICATION', async () => {
    await expect(
      issueOverride(baseInput({ justification: 'n/a' }))
    ).rejects.toMatchObject({ code: 'INVALID_JUSTIFICATION' })
  })

  it('refuses an over-allocation override without member acknowledgement', async () => {
    await expect(
      issueOverride(baseInput({ type: 'over_allocation', memberAcknowledged: false }))
    ).rejects.toMatchObject({ code: 'INVALID_JUSTIFICATION' })
  })

  it('creates an override_followup carry-forward item for skip_reestimate', async () => {
    const override = await issueOverride(
      baseInput({ type: 'skip_reestimate', affectedTaskIds: ['507f1f77bcf86cd799439020'] })
    )
    const item = await CarryForwardItem.findOne({ type: 'override_followup', task: '507f1f77bcf86cd799439020' })
    expect(item).not.toBeNull()
    expect(String(override.linkedCarryForwardId)).toBe(String(item!._id))
  })

  it('refuses a second skip_reestimate override for the same task while the first is still open', async () => {
    await issueOverride(baseInput({ type: 'skip_reestimate', affectedTaskIds: ['507f1f77bcf86cd799439020'] }))
    await expect(
      issueOverride(baseInput({ type: 'skip_reestimate', affectedTaskIds: ['507f1f77bcf86cd799439020'] }))
    ).rejects.toThrow(/already been deferred once/)
  })
})

describe('detectChronicUnderAllocation', () => {
  it('flags chronic under-allocation on the third consecutive override for the same member', async () => {
    const memberId = String(ids.member)
    for (let i = 0; i < 2; i++) {
      await issueOverride(baseInput({ affectedMemberIds: [memberId] }))
    }
    const before = await detectChronicUnderAllocation({
      sprintId: String(ids.sprint),
      memberId,
      organizationId: String(ids.organization),
      projectId: String(ids.project),
      adminRecipientIds: [String(ids.otherMember)],
      standupId: String(ids.user)
    })
    expect(before).toBe(false)

    await issueOverride(baseInput({ affectedMemberIds: [memberId] }))
    const after = await detectChronicUnderAllocation({
      sprintId: String(ids.sprint),
      memberId,
      organizationId: String(ids.organization),
      projectId: String(ids.project),
      adminRecipientIds: [String(ids.otherMember)],
      standupId: String(ids.user)
    })
    expect(after).toBe(true)
  })
})
