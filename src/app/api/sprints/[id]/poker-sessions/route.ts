/**
 * Planning poker sessions for a sprint (spec §17.4, PLN-9/10).
 *
 *   GET  /api/sprints/:id/poker-sessions   sessions for this sprint
 *   POST /api/sprints/:id/poker-sessions   open one over a queue of tasks
 */
import { PokerSession } from '@/models/PokerSession'
import { ProjectStandupSettings } from '@/models/ProjectStandupSettings'
import { SprintPlanningSession } from '@/models/SprintPlanningSession'
import { Task } from '@/models/Task'
import { broadcastUserEvent } from '@/lib/notification-broadcaster'
import { Permission } from '@/lib/permissions/permission-definitions'
import { StandupError } from '@/lib/standup/errors'
import { type EstimateUnit } from '@/lib/standup/estimates'
import {
  assertLateAdditionReason,
  isPastPlanning,
  isUnestimated
} from '@/lib/standup/late-addition'
import { TERMINAL_SPRINT_STATES } from '@/lib/standup/sprint-states'
import {
  CONSENSUS_RULES,
  deckCards,
  resolveEstimationSetup,
  resolveParticipants,
  type ConsensusRule,
  type DeckType
} from '@/lib/standup/poker'
import { ok, readJson, withSprintPermission } from '@/lib/standup/route-helpers'

export const GET = withSprintPermission(
  { permission: Permission.SPRINT_VIEW },
  async (_request, { sprintId }) => {
    const sessions = await PokerSession.find({ sprint: sprintId })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean()

    return ok({ sessions })
  }
)

interface CreateBody {
  taskIds: string[]
  deckType?: DeckType
  estimationUnit?: EstimateUnit
  consensusRule?: ConsensusRule
  participantIds?: string[]
  /** Facilitator deliberately left themselves off the voter picker (PLN-11). */
  excludeFacilitator?: boolean
  hideVoterIdentity?: boolean
  allowRevote?: boolean
  autoRevealOnAllVoted?: boolean
  /** Required once the sprint has left planning (E14); ignored before. */
  reason?: string
}

export const POST = withSprintPermission(
  { permission: Permission.SPRINT_UPDATE },
  async (request, { sprintId, sprint, organizationId, projectId, userId }) => {
    const body = await readJson<CreateBody>(request)

    if (!Array.isArray(body.taskIds) || body.taskIds.length === 0) {
      throw new StandupError('VALIDATION_FAILED', 'Choose at least one task to estimate.')
    }

    const consensusRule = body.consensusRule ?? 'facilitator_decides'
    if (!CONSENSUS_RULES.includes(consensusRule)) {
      throw new StandupError('VALIDATION_FAILED', `"${consensusRule}" is not a consensus rule.`, {
        allowed: CONSENSUS_RULES
      })
    }

    const settings = await ProjectStandupSettings.findOne({ project: projectId })
      .select('pointsToHours estimationUnit')
      .lean()

    // The planning screen sends neither, so the project's unit decides whether
    // a card is points (multiplied by `pointsToHours`) or hours as voted.
    const { deckType, estimationUnit } = resolveEstimationSetup({
      deckType: body.deckType,
      estimationUnit: body.estimationUnit,
      projectUnit: (settings as any)?.estimationUnit
    })

    // A sprint past planning makes this a late-addition round (E14): it needs a
    // reason, only touches tasks nobody has estimated, and finalize freezes
    // each result. Before that, nothing here changes.
    // A finished sprint is refused whichever way it ended: `cancelled` is not
    // "past planning" by `hasStandups`, but it is no more estimable than
    // `completed`.
    if (TERMINAL_SPRINT_STATES.includes(sprint.status)) {
      throw new StandupError(
        'VALIDATION_FAILED',
        `This sprint is ${sprint.status}; its tasks can no longer be estimated.`
      )
    }

    const lateAddition = isPastPlanning(sprint.status)
    const lateAdditionReason = lateAddition ? assertLateAdditionReason(body.reason) : undefined

    // Only tasks actually in this sprint, and only ones not already frozen —
    // a poker round over a locked estimate could not be applied (DAT-6).
    const tasks = await Task.find({
      _id: { $in: body.taskIds },
      sprint: sprintId,
      estimateLockedAt: { $exists: false }
    })
      .select('_id displayId title originalEstimateMinutes estimatedHours')
      .lean()

    if (lateAddition) {
      // A task that already has an estimate stays on the revision path. Say so
      // by name rather than quietly dropping it from the round.
      const estimated = (tasks as any[]).filter((task) => !isUnestimated(task))
      if (estimated.length > 0) {
        throw new StandupError(
          'VALIDATION_FAILED',
          `These tasks already have an estimate and cannot be estimated with poker: ${estimated
            .map((task) => task.displayId ?? task.title)
            .join(', ')}. Revise the remaining estimate instead.`,
          { taskIds: estimated.map((task) => task._id.toString()) }
        )
      }
    }

    if (tasks.length === 0) {
      throw new StandupError(
        'VALIDATION_FAILED',
        'None of those tasks can be estimated: they are not in this sprint, or their estimates are already frozen.',
        { taskIds: body.taskIds }
      )
    }

    const planningSession = await SprintPlanningSession.findOne({
      sprint: sprintId,
      status: 'open'
    })
      .select('_id')
      .lean()

    const session = await PokerSession.create({
      organization: organizationId,
      project: projectId,
      sprint: sprintId,
      planningSession: (planningSession as any)?._id,
      ...(lateAdditionReason ? { lateAdditionReason } : {}),
      deckType,
      estimationUnit,
      consensusRule,
      pointsToHours: (settings as any)?.pointsToHours ?? 4,
      hideVoterIdentity: body.hideVoterIdentity === true,
      allowRevote: body.allowRevote !== false,
      autoRevealOnAllVoted: body.autoRevealOnAllVoted !== false,
      facilitator: userId,
      participants: resolveParticipants(body.participantIds, sprint.teamMembers, userId, {
        excludeFacilitator: body.excludeFacilitator === true
      }),
      queue: (tasks as any[]).map((task) => ({ task: task._id, status: 'pending', roundCount: 0 })),
      currentTask: (tasks as any[])[0]._id,
      createdBy: userId
    })

    // Tell the people the PM picked that a round is open. Live delivery only;
    // anyone offline finds it via GET /api/poker-sessions/open-for-me. Best
    // effort — the session already exists whether or not this lands.
    broadcastUserEvent(
      ((session as any).participants ?? [])
        .map((participant: any) => participant.toString())
        .filter((participantId: string) => participantId !== userId),
      'poker_invite',
      {
        sessionId: (session as any)._id.toString(),
        sprintId,
        sprintName: sprint.name,
        facilitatorId: userId,
        ...(lateAddition ? { lateAddition: true } : {})
      }
    )

    return ok({ session, cards: deckCards(deckType) }, { status: 201 })
  }
)
