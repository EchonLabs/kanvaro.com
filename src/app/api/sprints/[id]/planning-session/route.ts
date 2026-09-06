/**
 * Sprint planning session (spec §17.4, PLN-4/5).
 *
 *   GET    /api/sprints/:id/planning-session   the open session, if any
 *   POST   /api/sprints/:id/planning-session   open one
 *   PATCH  /api/sprints/:id/planning-session   goal, notes, acknowledgements
 */
import mongoose from 'mongoose'

import { Sprint } from '@/models/Sprint'
import { SprintPlanningSession } from '@/models/SprintPlanningSession'
import { Permission } from '@/lib/permissions/permission-definitions'
import { recordAudit } from '@/lib/standup/audit'
import { StandupError } from '@/lib/standup/errors'
import { ok, readJson, withSprintPermission } from '@/lib/standup/route-helpers'
import { assertTransition, type SprintState } from '@/lib/standup/sprint-states'

export const GET = withSprintPermission(
  { permission: Permission.SPRINT_VIEW },
  async (_request, { sprintId }) => {
    const session = await SprintPlanningSession.findOne({
      sprint: sprintId,
      status: 'open'
    }).lean()

    const history = await SprintPlanningSession.find({ sprint: sprintId, status: 'completed' })
      .select('completedAt completedBy sprintGoal')
      .sort({ completedAt: -1 })
      .limit(10)
      .lean()

    return ok({ session, history })
  }
)

interface CreateBody {
  participantIds: string[]
  facilitatorId?: string
}

export const POST = withSprintPermission(
  { permission: Permission.SPRINT_UPDATE },
  async (request, { sprintId, sprint, organizationId, projectId, userId }) => {
    const body = await readJson<CreateBody>(request)

    // E20 — planning may be reopened after stand-ups have run. The state machine
    // decides whether that is legal from here; existing stand-ups are untouched.
    const status = sprint.status as SprintState
    if (status !== 'planning') {
      assertTransition(status, 'planning')
    }

    const existing = await SprintPlanningSession.findOne({ sprint: sprintId, status: 'open' })
    if (existing) {
      // PLN-4 — one open session. Returning the existing one rather than
      // erroring makes the button idempotent, which is what a PM expects when
      // two of them press it.
      return ok({ session: existing, reused: true })
    }

    const session = await SprintPlanningSession.create({
      organization: organizationId,
      project: projectId,
      sprint: sprintId,
      facilitator: body.facilitatorId ?? userId,
      participants: body.participantIds?.length ? body.participantIds : [userId],
      createdBy: userId,
      sprintGoal: sprint.goal
    })

    if (status !== 'planning') {
      await Sprint.findByIdAndUpdate(sprintId, { $set: { status: 'planning' } })
    }

    await recordAudit({
      actor: { type: 'user', userId },
      organizationId,
      projectId,
      action: 'planning_session_started',
      entityType: 'planning_session',
      entityId: session._id.toString(),
      entityName: sprint.name,
      before: null,
      after: { status: 'open', facilitator: session.facilitator }
    })

    return ok({ session }, { status: 201 })
  }
)

interface PatchBody {
  sprintGoal?: string
  notes?: string
  participantIds?: string[]
  acknowledgedCheckIds?: string[]
}

export const PATCH = withSprintPermission(
  { permission: Permission.SPRINT_UPDATE },
  async (request, { sprintId, organizationId, projectId, userId }) => {
    const body = await readJson<PatchBody>(request)

    const session = await SprintPlanningSession.findOne({ sprint: sprintId, status: 'open' })
    if (!session) {
      throw new StandupError('NOT_FOUND', 'No planning session is open for this sprint.', {
        sprintId
      })
    }

    const before = {
      sprintGoal: session.sprintGoal,
      participants: session.participants
    }

    if (body.sprintGoal !== undefined) {
      const goal = body.sprintGoal.trim()
      if (goal.length > 500) {
        throw new StandupError('VALIDATION_FAILED', 'A sprint goal is at most 500 characters.')
      }
      session.sprintGoal = goal
      // The goal lives on the sprint too — PC-1 reads it there, and so does
      // every existing screen.
      await Sprint.findByIdAndUpdate(sprintId, { $set: { goal } })
    }

    if (body.notes !== undefined) session.notes = body.notes
    if (body.participantIds) {
      session.participants = body.participantIds.map(
        (id) => new mongoose.Types.ObjectId(id)
      )
    }

    // PLN-7 acknowledgements are recorded on the checklist results so they
    // survive into the completed session.
    if (body.acknowledgedCheckIds?.length) {
      const now = new Date()
      const acknowledged = new Set(body.acknowledgedCheckIds)
      session.checklistResults = (session.checklistResults ?? []).map((result: any) =>
        acknowledged.has(result.checkId)
          ? { ...result, acknowledgedBy: new mongoose.Types.ObjectId(userId), acknowledgedAt: now }
          : result
      ) as any
    }

    await session.save()

    await recordAudit({
      actor: { type: 'user', userId },
      organizationId,
      projectId,
      action: 'planning_session_updated',
      entityType: 'planning_session',
      entityId: session._id.toString(),
      before,
      after: { sprintGoal: session.sprintGoal, participants: session.participants }
    })

    return ok({ session })
  }
)
