import { NextRequest, NextResponse } from 'next/server'
import connectDB from '@/lib/db-config'
import { authenticateUser } from '@/lib/auth-utils'
import { getStandupAccessLevel } from '@/lib/standup-auth'
import { StandupSession } from '@/models/StandupSession'

// POST /api/standup/sessions/[id]/complete
export async function POST(
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

    const session = await StandupSession.findById(params.id).lean() as any
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    const { level } = await getStandupAccessLevel(user, session.project.toString())
    if (level !== 'full') {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    if (session.status === 'completed') {
      return NextResponse.json({ error: 'Session is already completed' }, { status: 400 })
    }

    const updated = await StandupSession.findByIdAndUpdate(
      params.id,
      { $set: { status: 'completed', completedAt: new Date() } },
      { new: true }
    ).lean() as any

    return NextResponse.json({ session: updated })
  } catch (error: any) {
    console.error('[POST /api/standup/sessions/[id]/complete]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
