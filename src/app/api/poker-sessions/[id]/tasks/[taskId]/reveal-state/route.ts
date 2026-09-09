/**
 * Read-only reveal state for a poker task (spec §8.4, PLN-11).
 *
 *   GET /api/poker-sessions/:id/tasks/:taskId/reveal-state
 *
 * The reveal POST route (`../reveal/route.ts`) is the only place vote values
 * are computed, but its response only ever reaches the single browser that
 * called it — the facilitator's. Every other participant polls the session
 * (`../../route.ts`) and sees the queue entry's `status` flip to `'revealed'`
 * with no way to learn what was revealed. This route re-derives the same
 * result from the same stored `PokerVote` rows `revealVotes` already reads,
 * so any participant can ask for it once the entry is revealed.
 */
import { User } from '@/models/User'
import { PokerVote } from '@/models/PokerSession'
import { revealVotes } from '@/lib/standup/poker'
import { ok, withPokerPermission } from '@/lib/standup/route-helpers'
import { Permission } from '@/lib/permissions/permission-definitions'

export const dynamic = 'force-dynamic'

export const GET = withPokerPermission(
  { permission: Permission.SPRINT_VIEW },
  async (_request, { pokerSession, params }) => {
    const taskId = params.taskId
    const entry = pokerSession.queue.find((item: any) => item.task.toString() === taskId)

    if (!entry || entry.status !== 'revealed') {
      return ok({ revealed: false })
    }

    const round = Math.max(1, entry.roundCount || 1)
    const votes = await PokerVote.find({ pokerSession: pokerSession._id, task: taskId, round })
      .select('voter card')
      .lean()

    const result = revealVotes(
      pokerSession.deckType,
      pokerSession.consensusRule,
      (votes as any[]).map((vote) => ({ voterId: vote.voter.toString(), card: vote.card }))
    )

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
      revealed: true,
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
