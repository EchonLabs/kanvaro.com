/**
 * Setting the agreed estimate, or opening a revote (spec §17.4, PLN-11 to PLN-13).
 *
 *   POST /api/poker-sessions/:id/tasks/:taskId/finalize   { finalValue }
 *   POST /api/poker-sessions/:id/tasks/:taskId/finalize   { revote: true }
 *
 * A revote is the same endpoint because it is the same decision point: having
 * seen the spread, the facilitator either sets a number or sends it round
 * again. Splitting them would put the two halves of one choice in two places.
 */
import mongoose from 'mongoose'

import { PokerSession, PokerVote } from '@/models/PokerSession'
import { Task } from '@/models/Task'
import { Permission } from '@/lib/permissions/permission-definitions'
import { recordAudit } from '@/lib/standup/audit'
import { StandupError } from '@/lib/standup/errors'
import { deriveEstimateMinutes } from '@/lib/standup/estimates'
import { finalizeVote } from '@/lib/standup/poker'
import { ok, readJson, withPokerPermission } from '@/lib/standup/route-helpers'

interface FinalizeBody {
  finalValue?: number
  revote?: boolean
}

export const POST = withPokerPermission(
  { permission: Permission.SPRINT_UPDATE },
  async (request, { pokerSession, params, organizationId, projectId, userId }) => {
    const taskId = params.taskId
    const body = await readJson<FinalizeBody>(request)

    if (pokerSession.facilitator.toString() !== userId) {
      throw new StandupError(
        'OVERRIDE_NOT_PERMITTED',
        'Only the facilitator can set the final estimate.'
      )
    }

    const entry = pokerSession.queue.find((item: any) => item.task.toString() === taskId)
    if (!entry) {
      throw new StandupError('NOT_FOUND', 'That task is not in this poker session.', { taskId })
    }

    const round = Math.max(1, entry.roundCount || 1)

    // --- Revote: a new round, leaving the previous one intact (PLN-12) -------
    if (body.revote) {
      if (!pokerSession.allowRevote) {
        throw new StandupError('VALIDATION_FAILED', 'This session does not allow revotes.')
      }
      entry.roundCount = round + 1
      entry.status = 'voting'
      entry.revealedAt = undefined
      await pokerSession.save()

      return ok({ round: entry.roundCount, status: 'voting' })
    }

    // --- Finalize -----------------------------------------------------------
    const task = await Task.findById(taskId)
    if (!task) {
      throw new StandupError('NOT_FOUND', 'That task no longer exists.', { taskId })
    }

    // DAT-6 — a frozen estimate is never overwritten, even by the facilitator.
    if (task.estimateLockedAt) {
      throw new StandupError(
        'ESTIMATE_IMMUTABLE',
        'The original estimate cannot be changed after planning. Revise the remaining estimate instead.',
        { taskId }
      )
    }

    const votes = await PokerVote.find({ pokerSession: pokerSession._id, task: taskId, round })
      .select('voter card')
      .lean()

    const result = finalizeVote({
      deckType: pokerSession.deckType,
      rule: pokerSession.consensusRule,
      votes: (votes as any[]).map((vote) => ({
        voterId: vote.voter.toString(),
        card: vote.card
      })),
      finalValue: body.finalValue as number,
      roundCount: round
    })

    const minutes = deriveEstimateMinutes({
      value: result.finalValue,
      unit: pokerSession.estimationUnit,
      pointsToHours: pokerSession.pointsToHours
    })

    const before = {
      originalEstimateMinutes: task.originalEstimateMinutes,
      estimateMethod: task.estimateMethod
    }

    task.originalEstimateMinutes = minutes
    task.remainingEstimateMinutes = minutes
    task.estimateUnit = pokerSession.estimationUnit
    task.estimateValue = result.finalValue
    task.estimateMethod = 'poker'
    task.pokerSession = pokerSession._id
    task.consensusReached = result.consensusReached
    task.estimatedAt = new Date()
    task.estimatedBy = new mongoose.Types.ObjectId(userId)
    await task.save()

    entry.status = 'estimated'
    entry.finalValue = result.finalValue
    entry.consensusReached = result.consensusReached
    entry.voteSpread = result.voteSpread ?? undefined
    entry.estimatedAt = new Date()
    entry.estimatedBy = new mongoose.Types.ObjectId(userId)

    // Move to the next unestimated task so the facilitator is not clicking
    // through the queue by hand.
    const next = pokerSession.queue.find((item: any) => item.status !== 'estimated')
    pokerSession.currentTask = next?.task
    if (!next) {
      pokerSession.status = 'completed'
      pokerSession.completedAt = new Date()
    }
    await pokerSession.save()

    await recordAudit({
      actor: { type: 'user', userId },
      organizationId,
      projectId,
      action: 'task_estimated',
      entityType: 'task',
      entityId: taskId,
      entityName: task.displayId,
      before,
      after: {
        originalEstimateMinutes: minutes,
        estimateMethod: 'poker',
        consensusReached: result.consensusReached
      },
      context: { voteSpread: result.voteSpread, roundCount: round }
    })

    return ok({
      taskId,
      finalValue: result.finalValue,
      originalEstimateMinutes: minutes,
      consensusReached: result.consensusReached,
      voteSpread: result.voteSpread,
      nextTaskId: next?.task?.toString() ?? null,
      sessionStatus: pokerSession.status
    })
  }
)
