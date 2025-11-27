import { NextRequest, NextResponse } from 'next/server'
import connectDB from '@/lib/db-config'
import { UserInvitation } from '@/models/UserInvitation'
import { Organization } from '@/models/Organization'
import { CustomRole } from '@/models/CustomRole'
import '@/models/User' // Ensure User model is registered for populate('invitedBy')

export async function GET(request: NextRequest) {
  try {
    await connectDB()

    const { searchParams } = new URL(request.url)
    const token = searchParams.get('token')

    if (!token) {
      return NextResponse.json(
        { error: 'Token is required' },
        { status: 400 }
      )
    }

    // Find valid invitation
    const invitation = await UserInvitation.findOne({
      token,
      isAccepted: false,
      expiresAt: { $gt: new Date() }
    }).populate('organization invitedBy', 'name firstName lastName')

    if (!invitation) {
      return NextResponse.json(
        { error: 'Invalid or expired invitation' },
        { status: 400 }
      )
    }

    // Get role display name
    let roleDisplayName = invitation.role
    if (invitation.customRole) {
      const customRole = await CustomRole.findById(invitation.customRole)
      if (customRole) {
        roleDisplayName = customRole.name
      }
    } else {
      // Map system role to display name
      const roleNameMap: Record<string, string> = {
        'admin': 'Administrator',
        'project_manager': 'Project Manager',
        'team_member': 'Team Member',
        'client': 'Client',
        'viewer': 'Viewer'
      }
      roleDisplayName = roleNameMap[invitation.role] || invitation.role
    }

    return NextResponse.json({
      success: true,
      data: {
        email: invitation.email,
        role: invitation.role,
        customRole: invitation.customRole,
        roleDisplayName: roleDisplayName,
        organization: invitation.organization.name,
        invitedBy: `${invitation.invitedBy.firstName} ${invitation.invitedBy.lastName}`,
        firstName: invitation.firstName,
        lastName: invitation.lastName,
        expiresAt: invitation.expiresAt
      }
    })

  } catch (error) {
    console.error('Validate invitation error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
