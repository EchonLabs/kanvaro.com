import { NextRequest, NextResponse } from 'next/server'
import { getOrgConfigs } from '@/lib/config'
import { getOrgConnection, getModelOnConnection } from '@/lib/db-connection-manager'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const token = searchParams.get('token')

    if (!token) {
      return NextResponse.json(
        { error: 'Token is required' },
        { status: 400 }
      )
    }

    // ── Search ALL org databases for the invitation ───────────────────────────
    const orgs = getOrgConfigs()
    console.log(`[validate-invitation] Searching ${orgs.length} org(s) for token: ${token.substring(0, 8)}...`)
    let invitation: any = null
    let orgConn: any = null

    for (const org of orgs) {
      try {
        const conn = await getOrgConnection(org.id)
        const InvitationModel = getModelOnConnection<any>('UserInvitation', conn)

        // First check: does any invitation with this token exist at all?
        const anyInvitation = await InvitationModel.findOne({ token })
        if (anyInvitation) {
          console.log(`[validate-invitation] Found invitation in org [${org.id}] (db: ${conn.name}):`, {
            token: token.substring(0, 8),
            isAccepted: anyInvitation.isAccepted,
            expiresAt: anyInvitation.expiresAt,
            expired: anyInvitation.expiresAt < new Date(),
            email: anyInvitation.email,
          })
        }

        const found = await InvitationModel.findOne({
          token,
          isAccepted: false,
          expiresAt: { $gt: new Date() }
        }).populate('organization invitedBy', 'name firstName lastName')

        if (found) {
          invitation = found
          orgConn = conn
          break
        }
      } catch (err) {
        console.warn(`Could not check org [${org.id}] for invitation:`, err)
      }
    }

    if (!invitation) {
      console.log(`[validate-invitation] No valid invitation found for token: ${token.substring(0, 8)}...`)
      return NextResponse.json(
        { error: 'Invalid or expired invitation' },
        { status: 400 }
      )
    }

    // Get role display name
    let roleDisplayName = invitation.role
    if (invitation.customRole) {
      const CustomRoleModel = getModelOnConnection<any>('CustomRole', orgConn)
      const customRole = await CustomRoleModel.findById(invitation.customRole)
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
        'viewer': 'Viewer',
        'human_resource': 'Human Resource'
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
