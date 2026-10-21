/**
 * The `Allocation` document against the database (Phase 7, Task 1).
 *
 * Two things here can only be proven against a real index.
 *
 * The first is DAT-3's uniqueness. An allocation is the unit the whole module
 * counts in — capacity, variance, and the debt ledger all sum them — so a
 * duplicate row is not a cosmetic defect, it is a member's day silently double
 * counted and a task accruing debt twice.
 *
 * The second is the *shape* of that uniqueness, which is the part application
 * logic cannot express. RUN-7 (§6.4 OB-13) detaches an absent member's
 * allocations by stamping `detachedReason: 'owner_absent'` rather than deleting
 * them — Phase 9 needs the rows to sweep into the carry-forward register. A
 * plain unique index on `(standup, member, task)` would then make the reassign
 * action impossible the moment the PM reassigns a task back to the same person
 * (they came back, or the absence was a mistyped click), because the detached
 * row still occupies the key. The index is therefore *partial*: it constrains
 * live allocations only.
 */
import mongoose from 'mongoose'

import { Allocation } from '@/models/Allocation'

import { anyId, ids, syncIndexes, useMongo } from './helpers/mongo'

const { organization, project, sprint, member, otherMember, user } = ids

const standup = new mongoose.Types.ObjectId()
const task = new mongoose.Types.ObjectId()

function allocationFor(overrides: Record<string, unknown> = {}) {
  return {
    standup,
    sprint,
    project,
    organization,
    member,
    task,
    plannedMinutes: 180,
    source: 'assigned_in_standup',
    createdBy: user,
    ...overrides
  }
}

describe('Allocation model', () => {
  useMongo()

  beforeEach(async () => {
    await syncIndexes(Allocation)
  })

  describe('DAT-3 uniqueness', () => {
    it('rejects a second live allocation of the same task to the same member on the same stand-up', async () => {
      await Allocation.create(allocationFor())

      await expect(Allocation.create(allocationFor({ plannedMinutes: 60 }))).rejects.toThrow(
        /E11000/
      )
    })

    it('permits the same key once the first row is detached, so RUN-7 reassignment is possible', async () => {
      const first = await Allocation.create(allocationFor())

      // The member was marked absent: the row is detached, not deleted, because
      // Phase 9 sweeps it into the carry-forward register with the tag.
      first.detachedReason = 'owner_absent'
      first.excludedFromCapacity = true
      await first.save()

      // The PM then reassigns the task back to the same member — they turned up
      // after all. A non-partial index would refuse this.
      const second = await Allocation.create(allocationFor({ plannedMinutes: 120 }))

      expect(second.detachedReason).toBeUndefined()
      expect(await Allocation.countDocuments({ standup, member, task })).toBe(2)
    })

    it('permits two members on the same task — deliberate pairing (ALO-9, CC-10)', async () => {
      await Allocation.create(allocationFor())

      const paired = await Allocation.create(
        allocationFor({ member: otherMember, plannedMinutes: 120, pairedDeliberately: true })
      )

      expect(paired.pairedDeliberately).toBe(true)
    })

    it('permits the same member and task on a different stand-up — that is a carry chain, not a duplicate', async () => {
      const first = await Allocation.create(allocationFor())

      const tomorrow = await Allocation.create(
        allocationFor({
          standup: anyId(),
          plannedMinutes: 120,
          source: 'carried_forward',
          carriedFromAllocation: first._id,
          carryChainRoot: first._id
        })
      )

      expect(tomorrow.carryChainRoot?.toString()).toBe(first._id.toString())
    })
  })

  describe('field validation', () => {
    it('rejects a non-integer plannedMinutes (DAT-2 — minutes are whole)', async () => {
      await expect(Allocation.create(allocationFor({ plannedMinutes: 22.5 }))).rejects.toThrow(
        /whole number of minutes/
      )
    })

    it('rejects a zero plannedMinutes — CC-5 refuses empty allocations at the schema', async () => {
      await expect(Allocation.create(allocationFor({ plannedMinutes: 0 }))).rejects.toThrow()
    })

    it('rejects a negative plannedMinutes', async () => {
      await expect(Allocation.create(allocationFor({ plannedMinutes: -60 }))).rejects.toThrow()
    })

    it('rejects an unknown source', async () => {
      await expect(Allocation.create(allocationFor({ source: 'invented' }))).rejects.toThrow()
    })

    it('rejects an unknown detachedReason', async () => {
      await expect(
        Allocation.create(allocationFor({ detachedReason: 'because_i_said_so' }))
      ).rejects.toThrow()
    })

    it('accepts every declared source', async () => {
      const sources = [
        'pre_assigned',
        'assigned_in_standup',
        'carried_forward',
        'auto_prefilled',
        'self_selected'
      ]

      for (const source of sources) {
        const created = await Allocation.create(
          allocationFor({ standup: anyId(), source })
        )
        expect(created.source).toBe(source)
      }
    })
  })

  describe('defaults', () => {
    it('starts live, unblocked and counted against capacity', async () => {
      const created = await Allocation.create(allocationFor())

      expect(created.isBlocked).toBe(false)
      expect(created.allocatedDespiteBlocked).toBe(false)
      expect(created.excludedFromCapacity).toBe(false)
      expect(created.pairedDeliberately).toBe(false)
      expect(created.addedAfterCompletion).toBe(false)
      expect(created.detachedReason).toBeUndefined()
      expect(created.frozenAt).toBeUndefined()
    })
  })
})
