/**
 * RUN-19–22. The completion saga.
 *
 * No Mongo transaction exists on this platform, so RUN-21's "a partial
 * completion must never be persisted" is delivered by resumability, not
 * atomicity: every step is either read-only, idempotent (safe to redo), or
 * itself the write of a uniquely-keyed idempotent record (variance rows,
 * ledger entries, carry-forward items, notification sends — all already
 * proven idempotent by their own phases). `completionState` on the Standup
 * document remembers the last *completed* step name; a re-entrant call
 * (retry after a crash, or the client double-clicking Complete) resumes from
 * there rather than re-running finished steps or, worse, skipping unfinished
 * ones.
 *
 * The very last step flips `status: 'Completed'`. Everything before it can
 * safely re-run; that one cannot, which is why it is last, not first.
 *
 * **`runId` must be reused, not re-minted, for a call to actually resume.**
 * `standupCheckpoint.load` only recognises a stored checkpoint whose
 * `completionState.runId` matches `ctx.runId` exactly; a different `runId` —
 * e.g. a fresh UUID generated per HTTP request — reads as "no prior run" and
 * the saga restarts from `freeze-allocations` instead of resuming. Every step
 * here tolerates that (each is independently idempotent), so a restart is not
 * *incorrect*, but it defeats the point of resuming. Whoever builds the
 * `/complete` route (Task 17) must read `standup.completionState?.runId` back
 * off the document when one is already present and pass that same id in,
 * rather than generating a new one on every request.
 *
 * **N7 (override issued) fires from here, not from `issueOverride`.**
 * `override-service.ts`'s own docblock says so explicitly: issuing an
 * override happens *during* the run, but N7's spec timing is "on completion"
 * (§9.5, RUN-20 step 9, AC-10), so `ctx.overridesIssued` — the override
 * records the route already loaded to build the summary's `overridesIssued`
 * list — drives one `notifyOverrideIssued` call per override here.
 *
 * **N9 (aged carry-forward escalation) is deliberately not fired from this
 * saga.** `buildCarryForwardSet`'s `BuildCarryForwardResult` reports only
 * counts (`created`/`aged`/`autoClosed`/`totalOpen`), not which item ids
 * crossed a threshold on this run. Re-deriving that here would mean either
 * changing Phase 9's already-tested return shape or re-querying
 * `CarryForwardItem` and duplicating `ageBandFor`'s threshold logic — both
 * out of this task's "delegate all actual logic to the modules it calls"
 * mandate. `jobs/escalate-carry-forward.ts`'s nightly sweep already covers
 * every aged item, keyed by `item.originStandup` and `item._id`
 * (`N9_escalated_<id>` / `N9_chronic_<id>`), and `sendStandupNotificationOnce`'s
 * ledger makes it safe for that job to be the sole sender regardless of
 * timing relative to this saga.
 */
import { Allocation } from '@/models/Allocation'
import { Standup } from '@/models/Standup'
import { StandupSummary } from '@/models/StandupSummary'

import { runSaga, type SagaCheckpoint, type SagaStep } from './saga'
import {
  evaluateCompletionChecks,
  blockingFailures,
  type EvaluateCompletionChecksInput
} from './completion-checks'
import { filterOverriddenFailures } from './override'
import { classifyAndPost } from './variance-service'
import { buildCarryForwardSet } from './carry-forward-service'
import { buildSummaryDocument, type BuildSummaryInput } from './summary'
import {
  evaluateFinalDayCarryForwardDisposition,
  type CarryForwardDispositionRow
} from './sprint-close'
import {
  notifyPersonalCommitment,
  notifyStandupCompleted,
  notifyNotAllocated,
  notifyOverrideIssued
} from './notifications'
import { checkSprintHealth } from './jobs/sprint-health'
import { recordAudit } from './audit'
import { alreadyCompleted, completionChecksFailed, staleStandup } from './errors'

export interface CompletionContext {
  /**
   * Identifies one completion attempt across retries. **Must be the same
   * value on a resume call as it was on the attempt being resumed** — read it
   * back from `standup.completionState?.runId` when that field is already
   * present, rather than minting a fresh id per request. A mismatched
   * `runId` is indistinguishable from "no prior run" to
   * {@link standupCheckpoint}, so the saga restarts from `freeze-allocations`
   * instead of resuming (harmless, since every step tolerates it, but not a
   * resume). See the module docblock.
   */
  runId: string
  standupId: string
  sprintId: string
  projectId: string
  organizationId: string
  completedBy: string
  notes?: string
  checkInput: EvaluateCompletionChecksInput
  expectedVersion: number
  // Everything the notification/summary steps need, assembled by the route
  // from the same board load the checks used — see Task 17.
  attendeeIds: string[]
  adminRecipientIds: string[]
  memberCommitments: Array<{ memberId: string; hasAnyAllocation: boolean }>
  /**
   * Dual purpose. RUN-20 step 9 / AC-10: drives one N7 per override, sent to
   * `adminRecipientIds`. **Also** (Task 21): the guard just below
   * `evaluateCompletionChecks` reconciles each hard-blocking failure against
   * these records via `filterOverriddenFailures` — an override only unblocks
   * completion when it actually names the specific member/task a failure is
   * about, so `affectedMemberIds`/`affectedTaskIds` must be populated
   * alongside `type`, not left as an empty array, or reconciliation silently
   * resolves nothing.
   */
  overridesIssued: Array<{
    overrideId: string
    type: string
    affectedMemberIds: string[]
    affectedTaskIds: string[]
  }>
  summaryInputs: Omit<BuildSummaryInput, 'standupId' | 'sprintId' | 'projectId' | 'organizationId'>
  summaryUrl: string
  /**
   * CFW-9 (Phase 11). The still-open carry-forward register, for the final-day
   * gate. Deliberately *not* one of the eleven `CheckId`s — CFW-9 governs the
   * carry-forward register (§13), which has its own resolution vocabulary, so
   * P11-1 evaluates it as a sibling of `evaluateCompletionChecks` rather than
   * inventing a twelfth check. It still has to be a hard server-side block, or
   * the run screen's client-side version of it is the only thing standing
   * between a PM and closing a sprint with unresolved items.
   *
   * `undefined` (or an empty list) means nothing to answer for — the check is
   * only consulted on `final_day` anyway.
   */
  carryForwardCloseItems?: CarryForwardDispositionRow[]
}

export interface CompletionResult {
  status: 'completed'
  summaryId: string
}

function standupCheckpoint(standupId: string): SagaCheckpoint {
  return {
    async load(runId) {
      const doc = await Standup.findById(standupId, { completionState: 1 }).lean()
      if (!doc?.completionState || doc.completionState.runId !== runId) {
        return { lastCompletedStep: null }
      }
      return { lastCompletedStep: doc.completionState.lastCompletedStep }
    },
    async save(runId, lastCompletedStep) {
      await Standup.updateOne(
        { _id: standupId },
        { $set: { completionState: { runId, lastCompletedStep, updatedAt: new Date() } } }
      )
    },
    async finish(_runId) {
      await Standup.updateOne({ _id: standupId }, { $unset: { completionState: 1 } })
    }
  }
}

export async function runCompletionSaga(ctx: CompletionContext): Promise<CompletionResult> {
  const standup = await Standup.findById(ctx.standupId)
  if (!standup) throw new Error('Standup not found')
  if (standup.status === 'Completed') throw alreadyCompleted()
  if (standup.version !== ctx.expectedVersion) throw staleStandup(standup.version, standup)

  // RUN-19: re-run the checks server-side against server-loaded data.
  const results = evaluateCompletionChecks(ctx.checkInput)
  const blocking = blockingFailures(results)
  // §14 / AC-10: an issued override only unblocks the specific member/task
  // failure it actually names — see `filterOverriddenFailures`'s own docblock.
  const unresolved = filterOverriddenFailures(blocking, ctx.overridesIssued)
  if (unresolved.length > 0) throw completionChecksFailed(unresolved)

  // CFW-9, the second final-day gate (P11-1). Reuses the same
  // COMPLETION_CHECKS_FAILED (422) path the client's `onComplete()` already
  // catches and surfaces, so an unresolved carry-forward item refuses
  // completion exactly the way a failing CC-* check does.
  if (ctx.checkInput.shape === 'final_day') {
    const { offenders } = evaluateFinalDayCarryForwardDisposition(
      ctx.carryForwardCloseItems ?? []
    )
    if (offenders.length > 0) throw completionChecksFailed(offenders)
  }

  let summaryId = ''

  const steps: SagaStep<CompletionContext>[] = [
    {
      name: 'freeze-allocations',
      async run() {
        // Idempotent: re-running just stamps a later `frozenAt` on the same
        // rows, which no downstream reader treats as meaningfully different
        // from the first stamp.
        await Allocation.updateMany({ standup: ctx.standupId }, { $set: { frozenAt: new Date() } })
      }
    },
    {
      name: 'classify-and-post-variance',
      async run() {
        // Idempotent per Phase 8's own unique indexes — safe to re-run.
        await classifyAndPost({ standupId: ctx.standupId, actor: { userId: ctx.completedBy } })
      }
    },
    {
      name: 'build-carry-forward-set',
      async run() {
        // Idempotent per Phase 9's own discovery/ageing design — safe to re-run.
        await buildCarryForwardSet({
          standupId: ctx.standupId,
          actor: { type: 'user', userId: ctx.completedBy }
        })
      }
    },
    {
      name: 'persist-summary',
      async run() {
        const doc = buildSummaryDocument({
          standupId: ctx.standupId,
          sprintId: ctx.sprintId,
          projectId: ctx.projectId,
          organizationId: ctx.organizationId,
          ...ctx.summaryInputs
        })
        // Upsert keyed on the unique `standup` index — a re-run overwrites
        // its own prior (possibly partial) write rather than duplicating it.
        const saved = await StandupSummary.findOneAndUpdate(
          { standup: ctx.standupId },
          { $set: doc },
          { upsert: true, new: true }
        )
        summaryId = String(saved._id)
      }
    },
    {
      name: 'notify-members',
      async run() {
        for (const attendeeId of ctx.attendeeIds) {
          await notifyPersonalCommitment({
            standupId: ctx.standupId,
            projectId: ctx.projectId,
            organizationId: ctx.organizationId,
            memberId: attendeeId,
            summaryUrl: ctx.summaryUrl
          })
        }
        for (const member of ctx.memberCommitments) {
          if (!member.hasAnyAllocation) {
            await notifyNotAllocated({
              standupId: ctx.standupId,
              projectId: ctx.projectId,
              organizationId: ctx.organizationId,
              memberId: member.memberId
            })
          }
        }
      }
    },
    {
      name: 'notify-completion',
      async run() {
        await notifyStandupCompleted({
          standupId: ctx.standupId,
          projectId: ctx.projectId,
          organizationId: ctx.organizationId,
          recipientIds: ctx.adminRecipientIds,
          summaryUrl: ctx.summaryUrl
        })
      }
    },
    {
      name: 'notify-overrides-issued',
      async run() {
        // N7 — deliberately not sent from `issueOverride` itself; see the
        // module docblock. `sendStandupNotificationOnce`'s ledger is keyed
        // per `overrideId` (`N7:<overrideId>:<recipient>`), so a re-run here
        // sends nothing twice even if several overrides were issued today.
        for (const override of ctx.overridesIssued) {
          await notifyOverrideIssued({
            standupId: ctx.standupId,
            projectId: ctx.projectId,
            organizationId: ctx.organizationId,
            recipientIds: ctx.adminRecipientIds,
            overrideType: override.type,
            overrideId: override.overrideId
          })
        }
      }
    },
    {
      name: 'sprint-health-check',
      async run() {
        // §18.1: the completion saga calls the per-sprint unit of work
        // directly, not the daily sweep — `runSprintHealthJob` iterates every
        // active sprint in the whole system, which is not what completing one
        // stand-up should trigger.
        await checkSprintHealth(ctx.sprintId)
      }
    },
    {
      name: 'audit-completion',
      async run() {
        await recordAudit({
          actor: { type: 'user', userId: ctx.completedBy },
          organizationId: ctx.organizationId,
          action: 'standup_completed',
          entityType: 'standup',
          entityId: ctx.standupId,
          projectId: ctx.projectId,
          before: null,
          after: { notes: ctx.notes }
        })
      }
    },
    {
      name: 'finalize',
      async run() {
        // `IStandup` has no `completedBy` field (only `completedAt`) — who
        // completed it is already on the `standup_completed` audit entry the
        // previous step wrote, per SEC-3.
        await Standup.updateOne(
          { _id: ctx.standupId },
          {
            $set: { status: 'Completed', completedAt: new Date() },
            $inc: { version: 1 }
          }
        )
      }
    }
  ]

  await runSaga(steps, ctx, standupCheckpoint(ctx.standupId))

  return { status: 'completed', summaryId }
}
