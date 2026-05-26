import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'
import connectDB from '@/lib/db-config'
import { authenticateUser } from '@/lib/auth-utils'
import { getStandupAccessLevel } from '@/lib/standup-auth'
import { StandupSession } from '@/models/StandupSession'
import { StandupCommitment } from '@/models/StandupCommitment'
import { Task } from '@/models/Task'

// GET /api/standup/sessions/[id]/commitments
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

    const session = await StandupSession.findById(params.id).select('project').lean() as any
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    const { level } = await getStandupAccessLevel(user, session.project.toString())
    if (level === 'none') {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    const query: Record<string, any> = { standupSession: params.id }
    if (level === 'own') {
      query.user = new mongoose.Types.ObjectId(user.id)
    }

    const commitments = await StandupCommitment.find(query)
      .populate('user', 'firstName lastName avatar role')
      .lean() as any

    return NextResponse.json({ commitments })
  } catch (error: any) {
    console.error('[GET /api/standup/sessions/[id]/commitments]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/standup/sessions/[id]/commitments
// Body: { userId: string, taskIds: string[] }
// Creates or replaces the commitment for a user in this session
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
      return NextResponse.json({ error: 'Only PM, Admin, HR, or Account Manager can capture commitments' }, { status: 403 })
    }

    if (session.status === 'completed') {
      return NextResponse.json({ error: 'Cannot modify a completed session' }, { status: 400 })
    }

    const body = await request.json()
    const { userId, taskIds } = body as { userId: string; taskIds: string[] }

    if (!userId || !Array.isArray(taskIds)) {
      return NextResponse.json({ error: 'userId and taskIds[] are required' }, { status: 400 })
    }

    // Fetch tasks to snapshot title and current status
    const tasks = await Task.find({
      _id: { $in: taskIds.map((id) => new mongoose.Types.ObjectId(id)) },
      project: session.project,
    })
      .select('_id title status')
      .lean() as any

    const taskMap = new Map(tasks.map((t: any) => [t._id.toString(), t]))

    const commitmentTasks = taskIds
      .filter((id) => taskMap.has(id))
      .map((id) => {
        const t = taskMap.get(id) as any
        return {
          task: new mongoose.Types.ObjectId(id),
          taskTitle: t.title,
          statusAtCommitment: t.status,
          statusAtEndOfDay: null,
          timeLoggedMinutes: 0,
          fulfilled: t.status === 'done',
          noMovement: false,
          zeroTime: false,
        }
      })

    // Find if there's a carry-over from a previous session
    const yesterday = new Date(session.date)
    yesterday.setDate(yesterday.getDate() - 1)

    const previousCommitment = await StandupCommitment.findOne({
      project: session.project,
      user: new mongoose.Types.ObjectId(userId),
      date: { $gte: yesterday, $lt: session.date },
    }).lean() as any

    const carriedFromDate = previousCommitment?.date ?? null
    const daysOpen = carriedFromDate
      ? Math.floor(
          (session.date.getTime() - new Date(carriedFromDate).getTime()) /
            (1000 * 60 * 60 * 24)
        )
      : 0

    // Upsert — one commitment per user per session
    const commitment = await StandupCommitment.findOneAndUpdate(
      { standupSession: params.id, user: new mongoose.Types.ObjectId(userId) },
      {
        $set: {
          organization: session.organization,
          project: session.project,
          date: session.date,
          tasks: commitmentTasks,
          carriedFromDate,
          daysOpen,
        },
      },
      { upsert: true, new: true }
    ).populate('user', 'firstName lastName avatar role')

    return NextResponse.json({ commitment }, { status: 201 })
  } catch (error: any) {
    console.error('[POST /api/standup/sessions/[id]/commitments]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
