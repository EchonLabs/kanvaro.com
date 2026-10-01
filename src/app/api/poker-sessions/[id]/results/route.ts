/**
 * Everything the "planning poker results" screen shows, in one request.
 *
 *   GET /api/poker-sessions/:id/results
 *
 * The results screen wants, per estimated task: the final value, whether the
 * room agreed, the spread, min/median/max, how many of the round's voters
 * actually cast, and the per-voter breakdown. All of that already exists —
 * `reveal-state` derives it — but only one task at a time, so rendering the
 * table meant a fetch per row and the row-level columns (voters, stats) could
 * not be filled until a row was expanded. One query over every vote in the
 * session, grouped in memory, answers the whole table instead.
 *
 * `SPRINT_VIEW`, matching `reveal-state`: this returns the same numbers, for
 * rounds that are already over. Nothing here can leak a vote early — an entry
 * is only included once it is `revealed` or `estimated`.
 */
import { User } from '@/models/User'
import { Task } from '@/models/Task'
import { PokerVote } from '@/models/PokerSession'
import { revealVotes } from '@/lib/standup/poker'
import { ok, withPokerPermission } from '@/lib/standup/route-helpers'
import { Permission } from '@/lib/permissions/permission-definitions'

export const dynamic = 'force-dynamic'

export const GET = withPokerPermission(
  { permission: Permission.SPRINT_VIEW },
  async (_request, { pokerSession }) => {
    const entries = (pokerSession.queue ?? []).filter(
      (entry: any) => entry.status === 'revealed' || entry.status === 'estimated'
    )

    if (entries.length === 0) {
      return ok({
        estimationUnit: pokerSession.estimationUnit,
        pointsToHours: pokerSession.pointsToHours,
        deckType: pokerSession.deckType,
        participantCount: (pokerSession.participants ?? []).length,
        tasks: []
      })
    }

    // Only the round that produced each entry's stored outcome. A re-vote
    // bumps `roundCount`, and the earlier round's rows are still on disk —
    // counting those too would inflate the voter count and drag min/max to
    // numbers nobody on the final round actually voted.
    const rounds = new Map<string, number>(
      entries.map((entry: any) => [entry.task.toString(), Math.max(1, entry.roundCount || 1)])
    )

    const [votes, tasks] = await Promise.all([
      PokerVote.find({
        pokerSession: pokerSession._id,
        task: { $in: entries.map((entry: any) => entry.task) }
      })
        .select('task voter card round')
        .lean(),
      Task.find({ _id: { $in: entries.map((entry: any) => entry.task) } })
        .select('title displayId')
        .lean()
    ])

    const currentRoundVotes = (votes as any[]).filter(
      (vote) => vote.round === rounds.get(vote.task.toString())
    )

    let people = new Map<
      string,
      { name: string; firstName?: string; lastName?: string; email?: string; avatar?: string }
    >()
    if (!pokerSession.hideVoterIdentity) {
      const users = await User.find({
        _id: { $in: Array.from(new Set(currentRoundVotes.map((vote) => vote.voter.toString()))) }
      })
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

    const votesByTask = new Map<string, any[]>()
    for (const vote of currentRoundVotes) {
      const key = vote.task.toString()
      const bucket = votesByTask.get(key)
      if (bucket) bucket.push(vote)
      else votesByTask.set(key, [vote])
    }

    const titles = new Map(
      (tasks as any[]).map((task) => [
        task._id.toString(),
        { title: task.title as string, displayId: task.displayId as string | undefined }
      ])
    )

    return ok({
      estimationUnit: pokerSession.estimationUnit,
      pointsToHours: pokerSession.pointsToHours,
      deckType: pokerSession.deckType,
      participantCount: (pokerSession.participants ?? []).length,
      tasks: entries.map((entry: any) => {
        const taskId = entry.task.toString()
        const taskVotes = votesByTask.get(taskId) ?? []
        const result = revealVotes(
          pokerSession.deckType,
          pokerSession.consensusRule,
          taskVotes.map((vote) => ({ voterId: vote.voter.toString(), card: vote.card }))
        )

        return {
          taskId,
          title: titles.get(taskId)?.title ?? 'Task',
          displayId: titles.get(taskId)?.displayId,
          status: entry.status,
          roundCount: Math.max(1, entry.roundCount || 1),
          // The stored outcome wins over the re-derived one: `finalValue` is
          // what the facilitator actually set, which `suggestedValue` only
          // proposed, and E16 lets those differ.
          finalValue: entry.finalValue ?? null,
          consensusReached: entry.consensusReached ?? result.unanimous,
          voteSpread: entry.voteSpread ?? result.spread,
          min: result.min,
          max: result.max,
          median: result.median,
          votedCount: taskVotes.length,
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
        }
      })
    })
  }
)
