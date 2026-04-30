import { NextRequest, NextResponse } from 'next/server'
import connectDB from '@/lib/db-config'
import { User } from '@/models/User'
import { UserInvitation } from '@/models/UserInvitation'
import { Organization } from '@/models/Organization'
import { CustomRole } from '@/models/CustomRole'
import { emailService } from '@/lib/email/EmailService'
import { authenticateUser } from '@/lib/auth-utils'
import { notificationService } from '@/lib/notification-service'
import crypto from 'crypto'
import { generateInvitationEmailHtml } from '@/lib/email/invitation-template'
import mongoose from 'mongoose'
import { Permission } from '@/lib/permissions/permission-definitions'
import { PermissionService } from '@/lib/permissions/permission-service'

export async function POST(request: NextRequest) {
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

    const { email, role, firstName, lastName } = await request.json()

    // Validate required fields
    if (!email || !role) {
      return NextResponse.json(
        { error: 'Email and role are required' },
        { status: 400 }
      )
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'Invalid email format' },
        { status: 400 }
      )
    }

    // Check if user has permission to invite members
    const [hasTeamInvite, hasUserInvite] = await Promise.all([
      PermissionService.hasPermission(userId, Permission.TEAM_INVITE),
      PermissionService.hasPermission(userId, Permission.USER_INVITE)
    ])

    if (!hasTeamInvite && !hasUserInvite) {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      )
    }

    // Store user ID for async processing
    const inviterUserId = userId

    // Check if user already exists
    const existingUser = await User.findOne({
      email: email.toLowerCase(),
      organization: organizationId
    })

    if (existingUser) {
      return NextResponse.json(
        { error: 'User already exists in this organization' },
        { status: 400 }
      )
    }

    // Check for pending invitation
    const existingInvitation = await UserInvitation.findOne({
      email: email.toLowerCase(),
      organization: organizationId,
      isAccepted: false,
      expiresAt: { $gt: new Date() }
    })

    if (existingInvitation) {
      return NextResponse.json(
        { error: 'Invitation already sent to this email' },
        { status: 400 }
      )
    }

    // Determine if role is a custom role (ObjectId) or system role (enum value)
    const systemRoles = ['admin', 'project_manager', 'team_member', 'client', 'viewer', 'human_resource']
    let invitationRole: string = 'team_member' // Default role
    let customRoleId: mongoose.Types.ObjectId | undefined = undefined
    let roleDisplayName: string = 'Team Member' // For email template

    // Check if role is a valid MongoDB ObjectId (custom role)
    if (mongoose.Types.ObjectId.isValid(role) && !systemRoles.includes(role)) {
      // It's a custom role ID
      const customRole = await CustomRole.findOne({
        _id: role,
        organization: organizationId,
        isActive: true
      })

      if (!customRole) {
        return NextResponse.json(
          { error: 'Invalid custom role or role does not belong to this organization' },
          { status: 400 }
        )
      }

      customRoleId = customRole._id as mongoose.Types.ObjectId
      invitationRole = 'team_member' // Use default role when custom role is set
      roleDisplayName = customRole.name
    } else if (systemRoles.includes(role)) {
      // It's a system role
      invitationRole = role
      // Map system role to display name
      const roleNameMap: Record<string, string> = {
        'admin': 'Administrator',
        'project_manager': 'Project Manager',
        'team_member': 'Team Member',
        'client': 'Client',
        'viewer': 'Viewer',
        'human_resource': 'Human Resource'
      }
      roleDisplayName = roleNameMap[role] || role
    } else {
      return NextResponse.json(
        { error: 'Invalid role specified' },
        { status: 400 }
      )
    }

    // Generate invitation token
    const token = crypto.randomBytes(32).toString('hex')

    // Create invitation
    const invitationData: any = {
      email: email.toLowerCase(),
      organization: organizationId,
      invitedBy: userId,
      role: invitationRole,
      firstName,
      lastName,
      token,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
    }

    // Add customRole if it's a custom role
    if (customRoleId) {
      invitationData.customRole = customRoleId
    }

    const invitation = new UserInvitation(invitationData)
    await invitation.save()

    // Return success immediately - send email and notifications asynchronously
    const response = NextResponse.json({
      success: true,
      message: 'Invitation sent successfully',
      data: {
        email: invitation.email,
        role: invitation.role,
        customRole: invitation.customRole,
        roleDisplayName: roleDisplayName,
        expiresAt: invitation.expiresAt
      }
    })

      // Send email and notifications asynchronously (non-blocking)
      // This runs in the background without blocking the response
      ; (async () => {
        try {
          // Get inviter user details for email template
          const inviterUser = await User.findById(inviterUserId).select('firstName lastName email')
          const inviterName = inviterUser ? {
            firstName: inviterUser.firstName || '',
            lastName: inviterUser.lastName || '',
            email: inviterUser.email || ''
          } : { firstName: '', lastName: '', email: '' }

          // Get organization details
          const organization = await Organization.findById(organizationId)
          const organizationName = organization?.name || 'Kanvaro'
          const organizationLogo = organization?.logo
          const organizationDarkLogo = organization?.darkLogo
          const logoMode = organization?.logoMode || 'both'

          // Dynamically construct the invitation URL based on environment
          // Priority: 1. NEXT_PUBLIC_APP_URL env var, 2. Request headers (x-forwarded-*), 3. Origin/Referer headers, 4. Request host
          let baseUrl: string

          // First, check if NEXT_PUBLIC_APP_URL is explicitly set (recommended for all environments)
          if (process.env.NEXT_PUBLIC_APP_URL) {
            baseUrl = process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '') // Remove trailing slash
          } else {
            // Fall back to detecting from request headers
            // When behind a proxy/load balancer, check x-forwarded-* headers first
            const forwardedHost = request.headers.get('x-forwarded-host')
            const forwardedProto = request.headers.get('x-forwarded-proto')

            // Get the host from various sources, prioritizing origin/referer headers for external URLs
            const originHeader = request.headers.get('origin')
            const refererHeader = request.headers.get('referer')
            const hostHeader = request.headers.get('host')

            // Extract host from origin or referer (these usually have the correct external domain)
            let extractedHost: string | null = null
            let extractedProtocol: string | null = null

            if (originHeader) {
              try {
                const originUrl = new URL(originHeader)
                extractedHost = originUrl.host
                extractedProtocol = originUrl.protocol.replace(':', '')
              } catch (e) {
                // Invalid origin, continue
              }
            }

            if (!extractedHost && refererHeader) {
              try {
                const refererUrl = new URL(refererHeader)
                extractedHost = refererUrl.host
                extractedProtocol = refererUrl.protocol.replace(':', '')
              } catch (e) {
                // Invalid referer, continue
              }
            }

            // Determine protocol
            let protocol: string
            if (extractedProtocol) {
              protocol = extractedProtocol
            } else if (forwardedProto) {
              protocol = forwardedProto.split(',')[0].trim() // Use first proto if multiple
            } else if (hostHeader?.includes('localhost') || hostHeader?.includes('127.0.0.1')) {
              protocol = 'http'
            } else {
              protocol = 'https' // Default to https for production domains
            }

            // Determine host - prefer extracted host from origin/referer, then forwarded host, then host header
            let host: string
            if (extractedHost && !extractedHost.includes('localhost') && !extractedHost.includes('127.0.0.1')) {
              // Use extracted host if it's a valid external domain
              host = extractedHost
            } else if (forwardedHost) {
              host = forwardedHost.split(',')[0].trim() // Use first host if multiple
            } else if (hostHeader) {
              host = hostHeader.replace(/^https?:\/\//, '') // Remove protocol if present
            } else {
              host = 'localhost:3000' // Fallback
              protocol = 'http'
            }

            // Clean up host (remove any protocol prefix, remove trailing slash, remove port if default)
            host = host.replace(/^https?:\/\//, '').replace(/\/$/, '')
            // Remove default ports
            host = host.replace(/^(.+):80$/, '$1')
            host = host.replace(/^(.+):443$/, '$1')

            baseUrl = `${protocol}://${host}`
          }

          const invitationLink = `${baseUrl}/accept-invitation?token=${token}`
          console.log('invitationLink', invitationLink);

          const emailHtml = generateInvitationEmailHtml({
            organizationName,
            organizationLogo: organization?.logo || undefined,
            roleDisplayName,
            inviterFirstName: inviterName.firstName,
            inviterLastName: inviterName.lastName,
            invitationLink,
          })




          // Send invitation email (non-blocking)
          emailService.sendEmail({
            to: email,
            subject: `You're invited to join ${organizationName}`,
            html: emailHtml
          }).catch((emailError) => {
            console.error('Email sending error (non-blocking):', emailError)
            // Log error but don't fail the invitation
          })

          // Send notification to organization admins about the invitation (non-blocking)
          User.find({
            organization: organizationId,
            role: 'admin'
          }).select('_id').then((admins) => {
            const adminIds = admins.map(admin => admin._id.toString())

            if (adminIds.length > 0) {
              return notificationService.createBulkNotifications(adminIds, organizationId, {
                type: 'invitation',
                title: 'New Team Member Invitation',
                message: `${inviterName.firstName} ${inviterName.lastName} invited ${firstName || email} to join as ${roleDisplayName}`,
                data: {
                  entityType: 'user',
                  action: 'created',
                  priority: 'low'
                },
                sendEmail: false,
                sendPush: false
              })
            }
          }).catch((notificationError) => {
            console.error('Failed to send invitation notifications (non-blocking):', notificationError)
            // Don't fail the invitation if notification fails
          })
        } catch (error) {
          console.error('Error in async invitation processing:', error)
          // Don't fail the invitation if background processing fails
        }
      })()

    return response

  } catch (error) {
    console.error('Invitation error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
