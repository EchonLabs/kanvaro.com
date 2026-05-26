import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'
import connectDB from '@/lib/db-config'
import { authenticateUser } from '@/lib/auth-utils'
import { StandupCommitment } from '@/models/StandupCommitment'

// GET /api/standup/my-commitments?date=&limit=7
// Returns the current user's own commitments â€” no role gate needed (own data only)
export async function GET(request: NextRequest) {
  try {
    await connectDB()

    const authResult = await authenticateUser()
    if ('error' in authResult) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status })
    }

    const { user } = authResult
    const { searchParams } = new URL(request.url)
    const dateParam = searchParams.get('date')
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '7', 10), 30)

    const query: Record<string, any> = {
      user: new mongoose.Types.ObjectId(user.id),
      organization: new mongoose.Types.ObjectId(user.organization),
    }

    if (dateParam) {
      const d = new Date(dateParam)
      d.setHours(0, 0, 0, 0)
      const nextDay = new Date(d)
      nextDay.setDate(nextDay.getDate() + 1)
      query.date = { $gte: d, $lt: nextDay }
    }

    const commitments = await StandupCommitment.find(query)
      .sort({ date: -1 })
      .limit(limit)
      .populate('project', 'name')
      .lean() as any

    // Strip pmNote from own view â€” members see it only as a read-only notice
    const sanitized = commitments.map((c: any) => ({
      ...c,
      pmNote: c.pmNote
        ? {
            content: c.pmNote.content,
            blocker: c.pmNote.blocker,
            targetResolution: c.pmNote.targetResolution,
            resolved: c.pmNote.resolved,
            createdAt: c.pmNote.createdAt,
          }
        : null,
    }))

    return NextResponse.json({ commitments: sanitized })
  } catch (error: any) {
    console.error('[GET /api/standup/my-commitments]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

