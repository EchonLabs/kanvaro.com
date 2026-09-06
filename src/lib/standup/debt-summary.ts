/**
 * The `MemberSprintDebtSummary` read model (spec DAT-5, DAT-9, NFR-9).
 *
 * The ledger is the source of truth; this is a cache of its sum, refreshed at
 * each stand-up completion so the board does not re-aggregate the whole sprint
 * on every read. Nothing is ever recorded here that cannot be recomputed —
 * which is what makes NFR-9's guarantee real: drop the collection, run
 * `npm run standup:rebuild-debt-summaries`, and the numbers come back
 * identical.
 *
 * Separate from `debt-service.ts` on purpose. `variance-service.ts` refreshes
 * summaries as part of completing a stand-up, but has no business with
 * write-offs or carry-ins; keeping the maintenance half here means the writer
 * does not import the PM-facing actions to get at it.
 */
import { EstimateDebtLedger } from '@/models/EstimateDebtLedger'
import { MemberSprintDebtSummary } from '@/models/MemberSprintDebtSummary'

import { computeDebtPosition, type DebtPosition, type LedgerEntryLike } from './debt'
import { minutes } from './minutes'

export interface SummaryScope {
  projectId: string
  sprintId: string
  organizationId: string
  memberId: string
}

/** Recomputes one member's summary from the ledger and stores it. */
export async function refreshDebtSummary(scope: SummaryScope): Promise<DebtPosition> {
  const entries = (await EstimateDebtLedger.find({
    sprint: scope.sprintId,
    member: scope.memberId
  }).lean()) as any[]

  const position = computeDebtPosition(
    entries.map((entry): LedgerEntryLike => ({
      entryType: entry.entryType,
      minutes: minutes(entry.minutes)
    }))
  )

  await MemberSprintDebtSummary.updateOne(
    { sprint: scope.sprintId, member: scope.memberId },
    {
      $set: {
        project: scope.projectId,
        organization: scope.organizationId,
        outstandingMinutes: position.outstandingMinutes,
        accruedMinutes: position.accruedMinutes,
        creditedMinutes: position.creditedMinutes,
        settledMinutes: position.settledMinutes,
        writtenOffMinutes: position.writtenOffMinutes,
        carriedInMinutes: position.carriedInMinutes,
        lastRebuiltAt: new Date(),
        // DAT-9: the entry count this row was built from, so a reader can tell
        // it is behind the ledger and compute live instead of quoting a stale
        // number.
        sourceVersion: entries.length
      }
    },
    { upsert: true }
  )

  return position
}

/**
 * NFR-9's maintenance command, as a function.
 *
 * Rebuilds every summary the ledger implies, for one sprint or for all of
 * them. Members whose ledger is empty get no row: a summary of nothing is not
 * a fact worth storing, and `loadDebtPositions` already reads an absent row as
 * zero.
 */
export async function rebuildDebtSummaries(
  input: { sprintId?: string } = {}
): Promise<{ rebuilt: number }> {
  const match = input.sprintId ? { sprint: input.sprintId } : {}

  const groups: { _id: { sprint: unknown; member: unknown; project: unknown; organization: unknown } }[] =
    await EstimateDebtLedger.aggregate([
      { $match: match },
      {
        $group: {
          _id: {
            sprint: '$sprint',
            member: '$member',
            project: '$project',
            organization: '$organization'
          }
        }
      }
    ])

  let rebuilt = 0
  for (const group of groups) {
    await refreshDebtSummary({
      projectId: String(group._id.project),
      sprintId: String(group._id.sprint),
      organizationId: String(group._id.organization),
      memberId: String(group._id.member)
    })
    rebuilt += 1
  }

  return { rebuilt }
}
