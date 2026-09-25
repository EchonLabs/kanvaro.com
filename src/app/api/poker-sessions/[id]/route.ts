/**
 * Reading one poker session (spec §17.4, PLN-11).
 *
 *   GET /api/poker-sessions/:id
 *
 * Every client polls this while the modal is open. The facilitator advances the
 * queue, but only their own finalize response carries `nextTaskId` — without a
 * way to re-read the session, voters stay on a task that has already been
 * estimated and their votes are refused.
 *
 * `SPRINT_VIEW`, because a voter needs it and voting is not a sprint mutation.
 * No card values are ever returned here: reveal is the only endpoint that sends
 * those, and polling must not become a way around PLN-11.
 */
import { PokerVote } from '@/models/PokerSession'
import { Permission } from '@/lib/permissions/permission-definitions'
import { voteProgress } from '@/lib/standup/poker'
import { ok, withPokerPermission } from '@/lib/standup/route-helpers'

export const dynamic = 'force-dynamic'

export const GET = withPokerPermission(
  { permission: Permission.SPRINT_VIEW },
  async (_request, { pokerSession }) => {
    // A facilitator who opted out of voting (PLN-11) never casts a vote of
    // their own, so the vote() response — the only other place progress is
    // computed — never reaches them. Without this, their "Reveal" control
    // never has anything to key off and never appears.
    let progress: { round: number; voted: number; expected: number } | undefined
    const currentEntry = pokerSession.currentTask
      ? pokerSession.queue.find(
          (item: any) => item.task?.toString() === pokerSession.currentTask.toString()
        )
      : undefined

    if (currentEntry && (currentEntry.status === 'pending' || currentEntry.status === 'voting')) {
      const round = Math.max(1, currentEntry.roundCount || 1)
      const votes = await PokerVote.find({
        pokerSession: pokerSession._id,
        task: currentEntry.task,
        round
      })
        .select('voter')
        .lean()

      const result = voteProgress(
        (votes as any[]).map((vote) => ({ voterId: vote.voter.toString(), card: '' })),
        (pokerSession.participants ?? []).map((participant: any) => participant.toString())
      )
      progress = { round, voted: result.voted, expected: result.expected }
    }

    return ok({
      session: {
        _id: pokerSession._id.toString(),
        status: pokerSession.status,
        currentTask: pokerSession.currentTask?.toString() ?? null,
        deckType: pokerSession.deckType,
        estimationUnit: pokerSession.estimationUnit,
        pointsToHours: pokerSession.pointsToHours,
        hideVoterIdentity: pokerSession.hideVoterIdentity,
        allowRevote: pokerSession.allowRevote,
        autoRevealOnAllVoted: pokerSession.autoRevealOnAllVoted,
        facilitator: pokerSession.facilitator?.toString() ?? null,
        participants: (pokerSession.participants ?? []).map((id: any) => id.toString()),
        progress,
        queue: (pokerSession.queue ?? []).map((entry: any) => ({
          task: entry.task?.toString(),
          status: entry.status,
          roundCount: entry.roundCount
        }))
      }
    })
  }
)
