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
import { Permission } from '@/lib/permissions/permission-definitions'
import { StandupError } from '@/lib/standup/errors'
import { type EstimateUnit } from '@/lib/standup/estimates'
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

    // Only tasks actually in this sprint, and only ones not already frozen —
    // a poker round over a locked estimate could not be applied (DAT-6).
    const tasks = await Task.find({
      _id: { $in: body.taskIds },
      sprint: sprintId,
      estimateLockedAt: { $exists: false }
    })
      .select('_id')
      .lean()

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

    return ok({ session, cards: deckCards(deckType) }, { status: 201 })
  }
)
