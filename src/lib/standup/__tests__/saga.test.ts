import { inMemoryCheckpoint, runSaga, type SagaStep } from '@/lib/standup/saga'

interface Ctx {
  runId: string
  ran: string[]
}

const steps = (onTwo?: () => void): SagaStep<Ctx>[] => [
  { name: 'one', run: async (ctx) => { ctx.ran.push('one') } },
  { name: 'two', run: async (ctx) => { ctx.ran.push('two'); onTwo?.() } },
  { name: 'three', run: async (ctx) => { ctx.ran.push('three') } }
]

describe('runSaga', () => {
  it('runs every step in order and finishes', async () => {
    const checkpoint = inMemoryCheckpoint()
    const ctx: Ctx = { runId: 'r1', ran: [] }

    await runSaga(steps(), ctx, checkpoint)

    expect(ctx.ran).toEqual(['one', 'two', 'three'])
    await expect(checkpoint.load('r1')).resolves.toEqual({ lastCompletedStep: null })
  })

  it('resumes after the last completed step rather than repeating it', async () => {
    const checkpoint = inMemoryCheckpoint()
    const first: Ctx = { runId: 'r2', ran: [] }

    await expect(
      runSaga(
        steps(() => {
          throw new Error('ledger write failed')
        }),
        first,
        checkpoint
      )
    ).rejects.toThrow('ledger write failed')

    expect(first.ran).toEqual(['one', 'two'])
    await expect(checkpoint.load('r2')).resolves.toEqual({ lastCompletedStep: 'one' })

    // Same runId: the retry must skip 'one' and pick up at 'two'.
    const retry: Ctx = { runId: 'r2', ran: [] }
    await runSaga(steps(), retry, checkpoint)

    expect(retry.ran).toEqual(['two', 'three'])
  })

  it('replays from the start once a run has finished', async () => {
    const checkpoint = inMemoryCheckpoint()
    const ctx: Ctx = { runId: 'r3', ran: [] }

    await runSaga(steps(), ctx, checkpoint)
    const again: Ctx = { runId: 'r3', ran: [] }
    await runSaga(steps(), again, checkpoint)

    // A finished run leaves no checkpoint, so a replay re-runs from the start.
    // Idempotency of the individual steps — not the saga — is what makes that
    // safe, which is why every completion step must be independently idempotent.
    expect(again.ran).toEqual(['one', 'two', 'three'])
  })

  it('refuses to run when the checkpoint names a step that no longer exists', async () => {
    const checkpoint = inMemoryCheckpoint()
    await checkpoint.save('r4', 'a-step-that-was-renamed')

    await expect(runSaga(steps(), { runId: 'r4', ran: [] }, checkpoint)).rejects.toThrow(
      /unknown step/i
    )
  })
})
