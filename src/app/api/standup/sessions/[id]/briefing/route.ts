import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'
import connectDB from '@/lib/db-config'
import { authenticateUser } from '@/lib/auth-utils'
import { getStandupAccessLevel } from '@/lib/standup-auth'
import { StandupSession } from '@/models/StandupSession'
import { buildBriefingSnapshot } from '@/lib/services/standup-briefing.service'

// GET /api/standup/sessions/[id]/briefing
// Returns the pre-standup briefing snapshot. Regenerates if forced via ?refresh=true
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await connectDB()

    const authResult = await authenticateUser()
    if ('error' in authResult) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status })
    }

    const { user } = authResult
    const refresh = request.nextUrl.searchParams.get('refresh') === 'true'

    const session = await StandupSession.findById(params.id).lean() as any
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    const { level } = await getStandupAccessLevel(user, session.project.toString())
    if (level !== 'full') {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Return cached snapshot unless refresh is requested
    if (session.briefingSnapshot && !refresh) {
      return NextResponse.json({ briefing: session.briefingSnapshot })
    }

    // Find previous session
    const previousSession = await StandupSession.findOne({
      project: session.project,
      date: { $lt: session.date },
    })
      .sort({ date: -1 })
      .select('_id')
      .lean() as any

    const snapshot = await buildBriefingSnapshot({
      projectId: session.project as mongoose.Types.ObjectId,
      sessionDate: session.date,
      workingCircleStart: session.workingCircleStart,
      workingCircleEnd: session.workingCircleEnd,
      previousSessionId: previousSession ? (previousSession._id as mongoose.Types.ObjectId) : null,
    })

    await StandupSession.findByIdAndUpdate(params.id, {
      $set: { briefingSnapshot: snapshot },
    })

    return NextResponse.json({ briefing: snapshot })
  } catch (error: any) {
    console.error('[GET /api/standup/sessions/[id]/briefing]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
