import { NextRequest, NextResponse } from 'next/server'
import connectDB from '@/lib/db-config'
import { UserInvitation } from '@/models/UserInvitation'
import { authenticateUser } from '@/lib/auth-utils'

export async function DELETE(request: NextRequest) {
  try {
    await connectDB()

    const authResult = await authenticateUser()
    if ('error' in authResult) {
      return NextResponse.json(
        { error: authResult.error },
        { status: authResult.status }
      )
    }

    const { user } = authResult
    const userId = user.id
    const organizationId = user.organization

    const { searchParams } = new URL(request.url)
    const invitationId = searchParams.get('invitationId')

    if (!invitationId) {
      return NextResponse.json(
        { error: 'Invitation ID is required' },
        { status: 400 }
      )
    }

    // Check if user has permission to cancel invitations
    // Admin, Project Manager, and HR can cancel invitations
    if (!['admin', 'project_manager', 'human_resource'].includes(user.role)) {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      )
    }

    // Find the invitation
    const invitation = await UserInvitation.findOne({
      _id: invitationId,
      organization: organizationId
    })

    if (!invitation) {
      return NextResponse.json(
        { error: 'Invitation not found' },
        { status: 404 }
      )
    }

    // Check if invitation is already accepted
    if (invitation.isAccepted) {
      return NextResponse.json(
        { error: 'Cannot cancel an accepted invitation' },
        { status: 400 }
      )
    }

    // Delete the invitation
    await UserInvitation.findByIdAndDelete(invitationId)

    return NextResponse.json({
      success: true,
      message: 'Invitation cancelled successfully'
    })

  } catch (error) {
    console.error('Cancel invitation error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
