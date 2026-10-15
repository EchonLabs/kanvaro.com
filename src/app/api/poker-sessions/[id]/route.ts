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
import { Task } from '@/models/Task'
import { User } from '@/models/User'
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
    let progress:
      | { round: number; voted: number; expected: number; votedVoterIds: string[] }
      | undefined
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
      // `votedVoterIds` is who has cast, never what they cast. The roster panel
      // needs to name the person everyone is waiting on, and a bare count
      // cannot do that. Returning ids here does not weaken PLN-11: the cards
      // themselves are still only ever computed by reveal.
      progress = {
        round,
        voted: result.voted,
        expected: result.expected,
        votedVoterIds: result.votedIds
      }
    }

    // The queue's tasks, named by the server.
    //
    // The modal used to be handed a queue the planning screen had built from
    // whatever it had loaded into `scope` at the moment the round opened. A
    // task missing from that snapshot — scope still loading, or the task since
    // moved — rendered permanently as "— Task", because the queue is built
    // once and never rebuilt. Reading the titles here means the round names
    // its own tasks no matter what the opener happened to have in hand.
    const queueTaskIds = (pokerSession.queue ?? []).map((entry: any) => entry.task)
    const tasks = await Task.find({ _id: { $in: queueTaskIds } })
      .select('title displayId description')
      .lean()

    const taskById = new Map((tasks as any[]).map((task) => [task._id.toString(), task]))

    // Who is at the table, named here rather than matched up client side.
    //
    // `resolveParticipants` always appends the facilitator, who is often a PM
    // outside `project.teamMembers` — and the project roster the planning
    // screen has loaded contains only those. Resolving names there therefore
    // left a real participant showing as a placeholder. The list that decides
    // who may vote and the list that names them have to come from one place.
    const participantIds = (pokerSession.participants ?? []).map((id: any) => id.toString())

    let participantProfiles: Array<{
      memberId: string
      name: string
      firstName?: string
      lastName?: string
      email?: string
      avatar?: string
    }> = []

    // An anonymous round names nobody: the roster would otherwise reintroduce
    // the identities `hideVoterIdentity` exists to keep out of the reveal.
    if (!pokerSession.hideVoterIdentity && participantIds.length > 0) {
      const users = await User.find({ _id: { $in: participantIds } })
        .select('firstName lastName email avatar')
        .lean()

      const byId = new Map((users as any[]).map((user) => [user._id.toString(), user]))
      participantProfiles = participantIds.map((memberId: string) => {
        const user = byId.get(memberId)
        return {
          memberId,
          // A participant whose user record has since been deleted still has
          // to occupy a row, or the roster silently disagrees with `expected`.
          name:
            [user?.firstName, user?.lastName].filter(Boolean).join(' ') ||
            user?.email ||
            'Former member',
          firstName: user?.firstName,
          lastName: user?.lastName,
          email: user?.email,
          avatar: user?.avatar
        }
      })
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
        participants: participantIds,
        participantProfiles,
        progress,
        queue: (pokerSession.queue ?? []).map((entry: any) => {
          const task = taskById.get(entry.task?.toString())
          return {
            task: entry.task?.toString(),
            status: entry.status,
            roundCount: entry.roundCount,
            title: task?.title ?? null,
            displayId: task?.displayId ?? null,
            description: task?.description ?? null
          }
        })
      }
    })
  }
)
