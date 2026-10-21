/**
 * Open poker rounds the current user has been asked to vote in.
 *
 *   GET /api/poker-sessions/open-for-me
 *
 * Backs the "planning poker started" popup. The live invite travels over the
 * notification SSE stream, but that only reaches people connected at that
 * moment; this is how everyone else (page load, tab refocus, SSE down) learns a
 * round is open. Facilitators are excluded — they started it.
 */
import { NextResponse } from 'next/server'

import { authenticateUser } from '@/lib/auth-utils'
import connectDB from '@/lib/db-config'
import { Permission } from '@/lib/permissions/permission-definitions'
import { PermissionService } from '@/lib/permissions/permission-service'
import { toErrorResponse } from '@/lib/standup/errors'
import { ok } from '@/lib/standup/route-helpers'
import { PokerSession } from '@/models/PokerSession'
import { Project } from '@/models/Project'
import { Sprint } from '@/models/Sprint'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    await connectDB()

    const authResult = await authenticateUser()
    if ('error' in authResult) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status })
    }

    const userId = authResult.user.id

    const sessions = await PokerSession.find({
      organization: authResult.user.organization,
      status: 'open',
      participants: userId,
      facilitator: { $ne: userId }
    })
      .sort({ createdAt: -1 })
      .select('sprint project createdAt')
      .lean()

    const visible: any[] = []
    for (const session of sessions as any[]) {
      // Same gate as reading the session itself (SPRINT_VIEW on its project).
      const allowed = await PermissionService.hasPermission(
        userId,
        Permission.SPRINT_VIEW,
        session.project?.toString()
      )
      if (allowed) visible.push(session)
    }

    const [sprints, projects] = await Promise.all([
      Sprint.find({ _id: { $in: visible.map((session) => session.sprint) } })
        .select('name')
        .lean(),
      Project.find({ _id: { $in: visible.map((session) => session.project) } })
        .select('name')
        .lean()
    ])

    const sprintName = new Map((sprints as any[]).map((sprint) => [sprint._id.toString(), sprint.name]))
    const projectName = new Map(
      (projects as any[]).map((project) => [project._id.toString(), project.name])
    )

    return ok({
      sessions: visible.map((session) => ({
        sessionId: session._id.toString(),
        sprintId: session.sprint?.toString(),
        sprintName: sprintName.get(session.sprint?.toString()) ?? null,
        projectName: projectName.get(session.project?.toString()) ?? null,
        createdAt: session.createdAt
      }))
    })
  } catch (error) {
    const { status, body } = toErrorResponse(error)
    if (status === 500) console.error('Poker open-for-me error:', error)
    return NextResponse.json(body, { status })
  }
}
