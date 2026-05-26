import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'
import connectDB from '@/lib/db-config'
import { authenticateUser } from '@/lib/auth-utils'
import { getStandupAccessLevel } from '@/lib/standup-auth'
import { computeHistoricalTrends } from '@/lib/services/standup-briefing.service'

// GET /api/standup/trends?projectId=&days=7
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
    const days = Math.min(parseInt(searchParams.get('days') ?? '14', 10), 90)

    if (!projectId) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 })
    }

    const { level } = await getStandupAccessLevel(user, projectId)
    if (level !== 'full') {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    const trends = await computeHistoricalTrends(
      new mongoose.Types.ObjectId(projectId),
      new Date(),
      days
    )

    return NextResponse.json({ trends, days })
  } catch (error: any) {
    console.error('[GET /api/standup/trends]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
