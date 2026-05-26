import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'
import connectDB from '@/lib/db-config'
import { authenticateUser } from '@/lib/auth-utils'
import { getStandupAccessLevel, filterSessionByAccess } from '@/lib/standup-auth'
import { StandupSession } from '@/models/StandupSession'
import { StandupCommitment } from '@/models/StandupCommitment'

// GET /api/standup/sessions/[id]
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
    const session = await StandupSession.findById(params.id)
      .populate('createdBy', 'firstName lastName avatar')
      .populate('members', 'firstName lastName avatar role')
      .lean() as any

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    const { level } = await getStandupAccessLevel(user, session.project.toString())
    if (level === 'none') {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Fetch commitments — filtered by role
    const commitmentQuery: Record<string, any> = { standupSession: session._id }
    if (level === 'own') {
      commitmentQuery.user = new mongoose.Types.ObjectId(user.id)
    }

    const commitments = await StandupCommitment.find(commitmentQuery)
      .populate('user', 'firstName lastName avatar role')
      .lean() as any

    const filteredSession = filterSessionByAccess(session, user.id, level)

    return NextResponse.json({ session: filteredSession, commitments, accessLevel: level })
  } catch (error: any) {
    console.error('[GET /api/standup/sessions/[id]]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
