import { NextRequest, NextResponse } from 'next/server'
import connectDB from '@/lib/db-config'
import { authenticateUser } from '@/lib/auth-utils'
import { getStandupAccessLevel } from '@/lib/standup-auth'
import { StandupSession } from '@/models/StandupSession'
import { StandupCommitment } from '@/models/StandupCommitment'

// PUT /api/standup/sessions/[id]/commitments/[commitmentId]/note
// Body: { content: string, blocker?: string, targetResolution?: string }
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string; commitmentId: string } }
) {
  try {
    await connectDB()

    const authResult = await authenticateUser()
    if ('error' in authResult) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status })
    }

    const { user } = authResult

    const session = await StandupSession.findById(params.id).select('project status').lean() as any
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    const { level } = await getStandupAccessLevel(user, session.project.toString())
    if (level !== 'full') {
      return NextResponse.json({ error: 'Only PM, Admin, HR, or Account Manager can add notes' }, { status: 403 })
    }

    const body = await request.json()
    const { content, blocker, targetResolution } = body as {
      content: string
      blocker?: string
      targetResolution?: string
    }

    if (!content?.trim()) {
      return NextResponse.json({ error: 'Note content is required' }, { status: 400 })
    }

    const commitment = await StandupCommitment.findById(params.commitmentId)
    if (!commitment) {
      return NextResponse.json({ error: 'Commitment not found' }, { status: 404 })
    }

    const now = new Date()
    if (commitment.pmNote) {
      // Update existing note
      commitment.pmNote.content = content.trim()
      commitment.pmNote.blocker = blocker?.trim() ?? null
      commitment.pmNote.targetResolution = targetResolution ? new Date(targetResolution) : null
      commitment.pmNote.updatedAt = now
    } else {
      // Create new note
      commitment.pmNote = {
        content: content.trim(),
        blocker: blocker?.trim() ?? null,
        targetResolution: targetResolution ? new Date(targetResolution) : null,
        resolved: false,
        resolvedAt: null,
        createdAt: now,
        updatedAt: now,
      }
    }

    await commitment.save()

    return NextResponse.json({ pmNote: commitment.pmNote })
  } catch (error: any) {
    console.error('[PUT /api/standup/sessions/[id]/commitments/[commitmentId]/note]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/standup/sessions/[id]/commitments/[commitmentId]/note
// Marks note as resolved (soft delete — preserves history)
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string; commitmentId: string } }
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
    if (level !== 'full') {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    const commitment = await StandupCommitment.findById(params.commitmentId)
    if (!commitment || !commitment.pmNote) {
      return NextResponse.json({ error: 'Note not found' }, { status: 404 })
    }

    commitment.pmNote.resolved = true
    commitment.pmNote.resolvedAt = new Date()
    commitment.pmNote.updatedAt = new Date()
    await commitment.save()

    return NextResponse.json({ success: true, pmNote: commitment.pmNote })
  } catch (error: any) {
    console.error('[DELETE /api/standup/sessions/[id]/commitments/[commitmentId]/note]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
