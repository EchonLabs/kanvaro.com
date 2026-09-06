/**
 * Revealing the votes (spec §17.4, PLN-11, PLN-12).
 *
 *   POST /api/poker-sessions/:id/tasks/:taskId/reveal
 *
 * Facilitator only, and the first point at which the server sends any card
 * values at all. Returns every vote with its voter (unless identities are
 * hidden), the spread, and which votes are the outliers to discuss.
 */
import { User } from '@/models/User'
import { PokerSession, PokerVote } from '@/models/PokerSession'
import { Permission } from '@/lib/permissions/permission-definitions'
import { StandupError } from '@/lib/standup/errors'
import { revealVotes } from '@/lib/standup/poker'
import { ok, withPokerPermission } from '@/lib/standup/route-helpers'

export const POST = withPokerPermission(
  { permission: Permission.SPRINT_UPDATE },
  async (_request, { pokerSession, params, userId }) => {
    const taskId = params.taskId

    if (pokerSession.facilitator.toString() !== userId) {
      throw new StandupError(
        'OVERRIDE_NOT_PERMITTED',
        'Only the facilitator can reveal the votes.'
      )
    }

    const entry = pokerSession.queue.find((item: any) => item.task.toString() === taskId)
    if (!entry) {
      throw new StandupError('NOT_FOUND', 'That task is not in this poker session.', { taskId })
    }

    const round = Math.max(1, entry.roundCount || 1)
    const votes = await PokerVote.find({ pokerSession: pokerSession._id, task: taskId, round })
      .select('voter card')
      .lean()

    if (votes.length === 0) {
      throw new StandupError(
        'VALIDATION_FAILED',
        'Nobody has voted yet. Reveal needs at least one vote.'
      )
    }

    const result = revealVotes(
      pokerSession.deckType,
      pokerSession.consensusRule,
      (votes as any[]).map((vote) => ({ voterId: vote.voter.toString(), card: vote.card }))
    )

    entry.status = 'revealed'
    entry.revealedAt = new Date()
    entry.voteSpread = result.spread ?? undefined
    await pokerSession.save()

    // Names only when identities are not hidden — resolving them regardless and
    // letting the client drop them would defeat the setting.
    let names = new Map<string, string>()
    if (!pokerSession.hideVoterIdentity) {
      const users = await User.find({ _id: { $in: (votes as any[]).map((vote) => vote.voter) } })
        .select('firstName lastName email')
        .lean()
      names = new Map(
        (users as any[]).map((user) => [
          user._id.toString(),
          [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email
        ])
      )
    }

    return ok({
      round,
      spread: result.spread,
      min: result.min,
      max: result.max,
      median: result.median,
      unanimous: result.unanimous,
      suggestedValue: result.suggestedValue,
      numericCount: result.numericCount,
      abstainCount: result.abstainCount,
      votes: result.votes.map((vote) => ({
        voterId: pokerSession.hideVoterIdentity ? null : vote.voterId,
        voterName: pokerSession.hideVoterIdentity ? null : names.get(vote.voterId) ?? null,
        card: vote.card,
        value: vote.value,
        isOutlier: vote.isOutlier
      }))
    })
  }
)
