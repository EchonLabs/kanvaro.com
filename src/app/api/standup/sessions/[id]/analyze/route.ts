import { NextRequest, NextResponse } from 'next/server'
import connectDB from '@/lib/db-config'
import { authenticateUser } from '@/lib/auth-utils'
import { getStandupAccessLevel } from '@/lib/standup-auth'
import { StandupSession } from '@/models/StandupSession'
import { runEodAnalysis } from '@/lib/services/standup-analysis.service'

// POST /api/standup/sessions/[id]/analyze
// Manually triggers the Groq analysis for a session (PM can run this during/after standup)
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

    const session = await StandupSession.findById(params.id).select('project analysis').lean() as any
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    const { level } = await getStandupAccessLevel(user, session.project.toString())
    if (level !== 'full') {
      return NextResponse.json({ error: 'Only PM, Admin, HR, or Account Manager can trigger analysis' }, { status: 403 })
    }

    const forceRerun = request.nextUrl.searchParams.get('force') === 'true'

    if (session.analysis?.generatedAt && !forceRerun) {
      return NextResponse.json({
        analysis: session.analysis,
        cached: true,
        message: 'Analysis already exists. Pass ?force=true to regenerate.',
      })
    }

    // Clear existing analysis if force re-run
    if (forceRerun) {
      await StandupSession.findByIdAndUpdate(params.id, { $unset: { analysis: '' } })
    }

    const analysis = await runEodAnalysis(params.id)

    return NextResponse.json({ analysis, cached: false })
  } catch (error: any) {
    console.error('[POST /api/standup/sessions/[id]/analyze]', error)
    const message = error.message?.includes('GROQ_API_KEY')
      ? 'Groq API key not configured'
      : 'Analysis failed — please try again'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
