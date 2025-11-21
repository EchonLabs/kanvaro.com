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
import mongoose from 'mongoose'

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
    if (!['admin', 'project_manager'].includes(user.role)) {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      )
    }

    // Get full user details for email template
    const inviterUser = await User.findById(userId)
    if (!inviterUser) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      )
    }

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
    const systemRoles = ['admin', 'project_manager', 'team_member', 'client', 'viewer']
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
        'viewer': 'Viewer'
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

    // Get organization details
    const organization = await Organization.findById(organizationId)
    const organizationName = organization?.name || 'Kanvaro'
    const organizationLogo = organization?.logo
    const organizationDarkLogo = organization?.darkLogo
    const logoMode = organization?.logoMode || 'both'

    // Send invitation email
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
   
    const emailHtml = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>You're Invited to Join ${organizationName}</title>
        <style>
            body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                line-height: 1.6;
                color: #333;
                max-width: 600px;
                margin: 0 auto;
                padding: 20px;
                background-color: #f8fafc;
            }
            .container {
                background: white;
                border-radius: 8px;
                padding: 40px;
                box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
            }
            .header {
                text-align: center;
                margin-bottom: 30px;
            }
            .logo {
                width: 60px;
                height: 60px;
                border-radius: 8px;
                margin: 0 auto 20px;
                display: flex;
                align-items: center;
                justify-content: center;
                background: #f8fafc;
                border: 1px solid #e5e7eb;
            }
            .logo img {
                max-width: 100%;
                max-height: 100%;
                object-fit: contain;
            }
            .logo-fallback {
                background: #3b82f6;
                color: white;
                font-size: 24px;
                font-weight: bold;
                width: 100%;
                height: 100%;
                display: flex;
                align-items: center;
                justify-content: center;
                border-radius: 8px;
            }
            .button {
                display: inline-block;
                background: #3b82f6;
                color: white;
                padding: 12px 24px;
                text-decoration: none;
                border-radius: 6px;
                font-weight: 500;
                margin: 20px 0;
            }
            .footer {
                margin-top: 30px;
                padding-top: 20px;
                border-top: 1px solid #e5e7eb;
                text-align: center;
                color: #6b7280;
                font-size: 14px;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <div class="logo">
                    ${organizationLogo ? 
                        `<img src="${organizationLogo}" alt="${organizationName} Logo" style="max-width: 100%; max-height: 100%; object-fit: contain;" />` : 
                        `<div class="logo-fallback">${organizationName.charAt(0).toUpperCase()}</div>`
                    }
                </div>
                <h1>You're Invited to Join ${organizationName}</h1>
            </div>

            <p>You've been invited to join <strong>${organizationName}</strong> as a <strong>${roleDisplayName}</strong>.</p>
            
            <p>Click the button below to accept your invitation and set up your account:</p>

            <div style="text-align: center;">
                <a href="${invitationLink}" class="button">Accept Invitation</a>
            </div>

            <p><strong>This invitation will expire in 7 days.</strong></p>

            <p>If you can't click the button above, copy and paste this link into your browser:</p>
            <p style="word-break: break-all; color: #6b7280; font-size: 14px;">${invitationLink}</p>

            <div class="footer">
                <p>This invitation was sent by ${inviterUser.firstName} ${inviterUser.lastName}</p>
                <p>If you have any questions, contact your team administrator</p>
            </div>
        </div>
    </body>
    </html>
    `

    try {
      const emailSent = await emailService.sendEmail({
        to: email,
        subject: `You're invited to join ${organizationName}`,
        html: emailHtml
      })

      if (!emailSent) {
        console.error('Email service returned false for invitation email')
        return NextResponse.json(
          { error: 'Failed to send invitation email. Please check email configuration.' },
          { status: 500 }
        )
      }
    } catch (emailError) {
      console.error('Email sending error:', emailError)
      return NextResponse.json(
        { error: 'Failed to send invitation email. Please check email configuration.' },
        { status: 500 }
      )
    }

    // Send notification to organization admins about the invitation
    try {
      const admins = await User.find({ 
        organization: organizationId, 
        role: 'admin' 
      }).select('_id')
      
      const adminIds = admins.map(admin => admin._id.toString())
      
      if (adminIds.length > 0) {
        await notificationService.createBulkNotifications(adminIds, organizationId, {
          type: 'invitation',
          title: 'New Team Member Invitation',
          message: `${inviterUser.firstName} ${inviterUser.lastName} invited ${firstName || email} to join as ${roleDisplayName}`,
          data: {
            entityType: 'user',
            action: 'created',
            priority: 'low'
          },
          sendEmail: false,
          sendPush: false
        })
      }
    } catch (notificationError) {
      console.error('Failed to send invitation notifications:', notificationError)
      // Don't fail the invitation if notification fails
    }

    return NextResponse.json({
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

  } catch (error) {
    console.error('Invitation error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
