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
 *
 * `'estimated'` is included alongside `'revealed'` so a completed round stays
 * inspectable afterwards — finalizing a task never deletes its `PokerVote`
 * rows, and a "view results" screen needs the same breakdown after the fact,
 * not only in the moment right after reveal.
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

    if (!entry || (entry.status !== 'revealed' && entry.status !== 'estimated')) {
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

    // The identity fields travel with the name so the reveal can draw each
    // voter's real avatar rather than initials in a coloured circle.
    let people = new Map<
      string,
      { name: string; firstName?: string; lastName?: string; email?: string; avatar?: string }
    >()
    if (!pokerSession.hideVoterIdentity) {
      const users = await User.find({ _id: { $in: (votes as any[]).map((vote) => vote.voter) } })
        .select('firstName lastName email avatar')
        .lean()
      people = new Map(
        (users as any[]).map((user) => [
          user._id.toString(),
          {
            name: [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email,
            avatar: user.avatar
          }
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
      votes: result.votes.map((vote) => {
        const person = pokerSession.hideVoterIdentity ? undefined : people.get(vote.voterId)
        return {
          voterId: pokerSession.hideVoterIdentity ? null : vote.voterId,
          voterName: person?.name ?? null,
          firstName: person?.firstName,
          lastName: person?.lastName,
          email: person?.email,
          avatar: person?.avatar,
          card: vote.card,
          value: vote.value,
          isOutlier: vote.isOutlier
        }
      })
    })
  }
)
