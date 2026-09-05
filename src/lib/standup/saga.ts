/**
 * A resumable, ordered sequence of writes (plan D-A, spec NFR-6).
 *
 * NFR-6 asks for stand-up completion to be one MongoDB transaction. Kanvaro
 * cannot promise that: the connection string is supplied by the operator
 * through the setup wizard and may point at a standalone `mongod`, where
 * multi-document transactions are unavailable. Rather than make a replica set a
 * precondition for the whole module, completion becomes a saga that records how
 * far it reached, so an interrupted run resumes instead of being replayed or
 * abandoned half-applied.
 *
 * The trade this makes explicit: **each step must be independently idempotent.**
 * The checkpoint stops the common case of a step repeating, but a crash between
 * a step's write and its checkpoint save will still re-run that step. The unique
 * indexes (`allocationVariances.allocationId`, the sparse
 * `{sourceAllocationId, entryType}` on the debt ledger) are what make that safe.
 */
export interface SagaStep<C> {
  name: string
  run: (ctx: C) => Promise<void>
}

/** Persists how far a run reached. Phase 10 backs this with `standups.completionState`. */
export interface SagaCheckpoint {
  load(runId: string): Promise<{ lastCompletedStep: string | null }>
  save(runId: string, lastCompletedStep: string): Promise<void>
  finish(runId: string): Promise<void>
}

export async function runSaga<C extends { runId: string }>(
  steps: SagaStep<C>[],
  ctx: C,
  checkpoint: SagaCheckpoint
): Promise<void> {
  const { lastCompletedStep } = await checkpoint.load(ctx.runId)

  const resumeAt = lastCompletedStep
    ? steps.findIndex((step) => step.name === lastCompletedStep) + 1
    : 0

  // A checkpoint naming a step this saga no longer has means the step list
  // changed under a run in flight. Failing loudly beats silently restarting and
  // repeating writes the operator believes already happened.
  if (lastCompletedStep && resumeAt === 0) {
    throw new Error(
      `Saga checkpoint for run ${ctx.runId} names unknown step "${lastCompletedStep}"`
    )
  }

  for (const step of steps.slice(resumeAt)) {
    await step.run(ctx)
    await checkpoint.save(ctx.runId, step.name)
  }

  await checkpoint.finish(ctx.runId)
}

/** For tests, and for any caller that does not need durability. */
export function inMemoryCheckpoint(): SagaCheckpoint {
  const state = new Map<string, string>()

  return {
    async load(runId) {
      return { lastCompletedStep: state.get(runId) ?? null }
    },
    async save(runId, lastCompletedStep) {
      state.set(runId, lastCompletedStep)
    },
    async finish(runId) {
      state.delete(runId)
    }
  }
}
