/**
 * Casting a poker vote (spec §17.4, PLN-11).
 *
 *   POST /api/poker-sessions/:id/tasks/:taskId/vote
 *
 * **Returns a count only.** PLN-11 requires votes hidden until reveal, and the
 * only way to guarantee that is for the server never to send them — hiding them
 * in the client still puts every vote in the browser's network tab, where any
 * participant can read them before voting.
 */
import { PokerSession, PokerVote } from '@/models/PokerSession'
import { Permission } from '@/lib/permissions/permission-definitions'
import { StandupError } from '@/lib/standup/errors'
import { assertValidVote, cardValue, voteProgress } from '@/lib/standup/poker'
import { ok, readJson, withPokerPermission } from '@/lib/standup/route-helpers'

interface VoteBody {
  card: string | number
}

export const POST = withPokerPermission(
  { permission: Permission.SPRINT_VIEW },
  async (request, { pokerSession, params, userId }) => {
    const taskId = params.taskId
    const body = await readJson<VoteBody>(request)

    if (pokerSession.status !== 'open') {
      throw new StandupError('VALIDATION_FAILED', 'This poker session has been closed.')
    }

    const entry = pokerSession.queue.find((item: any) => item.task.toString() === taskId)
    if (!entry) {
      throw new StandupError('NOT_FOUND', 'That task is not in this poker session.', { taskId })
    }
    if (entry.status === 'estimated') {
      throw new StandupError('VALIDATION_FAILED', 'This task has already been estimated.')
    }
    if (entry.status === 'revealed' && !pokerSession.allowRevote) {
      throw new StandupError(
        'VALIDATION_FAILED',
        'Votes are revealed and this session does not allow a revote.'
      )
    }

    // Anyone on the participant list may vote. A viewer with SPRINT_VIEW who is
    // not a participant is an observer, not a voter.
    const isParticipant = (pokerSession.participants ?? []).some(
      (participant: any) => participant.toString() === userId
    )
    if (!isParticipant) {
      throw new StandupError('OVERRIDE_NOT_PERMITTED', 'You are not a participant in this session.')
    }

    if (body.card === undefined || body.card === null) {
      throw new StandupError('VALIDATION_FAILED', 'Pick a card.')
    }
    assertValidVote(pokerSession.deckType, body.card)

    // A revote opens a new round rather than editing the old vote, so PLN-12's
    // full history survives — the report can show 5, 5, 13 before settling.
    const round = Math.max(1, entry.roundCount || 1)

    await PokerVote.findOneAndUpdate(
      { pokerSession: pokerSession._id, task: taskId, voter: userId, round },
      {
        $set: {
          card: String(body.card),
          value: cardValue(pokerSession.deckType, body.card)
        }
      },
      { upsert: true, new: true }
    )

    if (entry.status === 'pending') {
      entry.status = 'voting'
      entry.roundCount = round
      pokerSession.currentTask = entry.task
      await pokerSession.save()
    }

    const votes = await PokerVote.find({
      pokerSession: pokerSession._id,
      task: taskId,
      round
    })
      .select('voter')
      .lean()

    const progress = voteProgress(
      (votes as any[]).map((vote) => ({ voterId: vote.voter.toString(), card: '' })),
      (pokerSession.participants ?? []).map((participant: any) => participant.toString())
    )

    return ok({
      round,
      voted: progress.voted,
      expected: progress.expected,
      // Who has voted is public; what they voted is not. Seeing the last two
      // names outstanding is how a facilitator knows whom to chase.
      votedIds: pokerSession.hideVoterIdentity ? [] : progress.votedIds,
      readyToReveal: progress.voted >= progress.expected && progress.expected > 0,
      autoReveal: pokerSession.autoRevealOnAllVoted
    })
  }
)
