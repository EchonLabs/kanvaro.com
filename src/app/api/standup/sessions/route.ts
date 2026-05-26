import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'
import connectDB from '@/lib/db-config'
import { authenticateUser } from '@/lib/auth-utils'
import { getStandupAccessLevel } from '@/lib/standup-auth'
import { StandupSession } from '@/models/StandupSession'
import { StandupCommitment } from '@/models/StandupCommitment'
import { Sprint } from '@/models/Sprint'
import { Project } from '@/models/Project'
import { buildBriefingSnapshot } from '@/lib/services/standup-briefing.service'

const WORKING_CIRCLE_START_HOUR = parseInt(process.env.STANDUP_WORKING_CIRCLE_START_HOUR ?? '9', 10)
const ANALYSIS_HOUR = parseInt(process.env.STANDUP_ANALYSIS_HOUR ?? '8', 10)

function getWorkingCircle(date: Date): { start: Date; end: Date; sessionDate: Date } {
  const sessionDate = new Date(date)
  sessionDate.setHours(0, 0, 0, 0)

  const start = new Date(date)
  start.setHours(WORKING_CIRCLE_START_HOUR, 0, 0, 0)

  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  end.setHours(ANALYSIS_HOUR, 0, 0, 0)

  return { start, end, sessionDate }
}

// GET /api/standup/sessions?projectId=&date=
export async function GET(request: NextRequest) {
  try {
    await connectDB()

    const authResult = await authenticateUser()
    if ('error' in authResult) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status })
    }

    const { user } = authResult
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId')
    const dateParam = searchParams.get('date')
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '30', 10), 100)

    if (!projectId) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 })
    }

    const { level } = await getStandupAccessLevel(user, projectId)
    if (level === 'none') {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    const query: Record<string, any> = {
      project: new mongoose.Types.ObjectId(projectId),
      organization: new mongoose.Types.ObjectId(user.organization),
    }

    if (dateParam) {
      const d = new Date(dateParam)
      d.setHours(0, 0, 0, 0)
      const nextDay = new Date(d)
      nextDay.setDate(nextDay.getDate() + 1)
      query.date = { $gte: d, $lt: nextDay }
    }

    const sessions = await StandupSession.find(query)
      .sort({ date: -1 })
      .limit(limit)
      .populate('createdBy', 'firstName lastName')
      .lean() as any

    return NextResponse.json({ sessions })
  } catch (error: any) {
    console.error('[GET /api/standup/sessions]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/standup/sessions â€” create today's session for a project
export async function POST(request: NextRequest) {
  try {
    await connectDB()

    const authResult = await authenticateUser()
    if ('error' in authResult) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status })
    }

    const { user } = authResult
    const body = await request.json()
    const { projectId } = body

    if (!projectId) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 })
    }

    const { level } = await getStandupAccessLevel(user, projectId)
    if (level !== 'full') {
      return NextResponse.json({ error: 'Only PM, Admin, HR, or Account Manager can create sessions' }, { status: 403 })
    }

    const now = new Date()
    const { start, end, sessionDate } = getWorkingCircle(now)

    // Check for existing session today
    const existing = await StandupSession.findOne({
      project: new mongoose.Types.ObjectId(projectId),
      date: sessionDate,
    }).lean() as any

    if (existing) {
      return NextResponse.json({ session: existing, alreadyExists: true })
    }

    // Find active sprint for this project
    const activeSprint = await Sprint.findOne({
      project: new mongoose.Types.ObjectId(projectId),
      status: 'active',
      archived: false,
    })
      .select('_id')
      .lean() as any

    // Get all current project members
    const project = await Project.findById(projectId).select('teamMembers').lean() as any
    const members = project?.teamMembers ?? []

    // Find previous session for briefing
    const previousSession = await StandupSession.findOne({
      project: new mongoose.Types.ObjectId(projectId),
      date: { $lt: sessionDate },
    })
      .sort({ date: -1 })
      .select('_id')
      .lean() as any

    // Build briefing snapshot immediately on session creation
    const briefingSnapshot = await buildBriefingSnapshot({
      projectId: new mongoose.Types.ObjectId(projectId),
      sessionDate,
      workingCircleStart: start,
      workingCircleEnd: end,
      previousSessionId: previousSession ? (previousSession._id as mongoose.Types.ObjectId) : null,
    })

    const session = new StandupSession({
      organization: new mongoose.Types.ObjectId(user.organization),
      project: new mongoose.Types.ObjectId(projectId),
      sprint: activeSprint?._id ?? null,
      date: sessionDate,
      workingCircleStart: start,
      workingCircleEnd: end,
      status: 'active',
      createdBy: new mongoose.Types.ObjectId(user.id),
      members,
      briefingSnapshot,
    })

    await session.save()

    return NextResponse.json({ session }, { status: 201 })
  } catch (error: any) {
    if (error.code === 11000) {
      // Unique constraint â€” session already created by concurrent request
      const body = await request.json().catch(() => ({}))
      const existing = await StandupSession.findOne({
        project: body.projectId,
        date: new Date().setHours(0, 0, 0, 0),
      }).lean() as any
      return NextResponse.json({ session: existing, alreadyExists: true })
    }
    console.error('[POST /api/standup/sessions]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

