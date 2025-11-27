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
    ;(async () => {
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
       
        const emailHtml = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <meta http-equiv="X-UA-Compatible" content="IE=edge">
            <title>You're Invited to Join ${organizationName}</title>
            <!--[if mso]>
            <style type="text/css">
                body, table, td {font-family: Arial, sans-serif !important;}
            </style>
            <![endif]-->
            <style>
                * {
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box;
                }
                body {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
                    line-height: 1.7;
                    color: #1f2937;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    padding: 40px 20px;
                    -webkit-font-smoothing: antialiased;
                    -moz-osx-font-smoothing: grayscale;
                }
                .email-wrapper {
                    max-width: 600px;
                    margin: 0 auto;
                    background-color: #ffffff;
                    border-radius: 16px;
                    overflow: hidden;
                    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
                }
                .header-gradient {
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    padding: 48px 40px 32px;
                    text-align: center;
                }
                .logo-container {
                    width: 80px;
                    height: 80px;
                    margin: 0 auto 24px;
                    border-radius: 16px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: rgba(255, 255, 255, 0.2);
                    backdrop-filter: blur(10px);
                    border: 2px solid rgba(255, 255, 255, 0.3);
                    box-shadow: 0 8px 16px rgba(0, 0, 0, 0.1);
                }
                .logo-container img {
                    max-width: 100%;
                    max-height: 100%;
                    object-fit: contain;
                    border-radius: 12px;
                }
                .logo-fallback {
                    background: rgba(255, 255, 255, 0.95);
                    color: #667eea;
                    font-size: 32px;
                    font-weight: 700;
                    width: 100%;
                    height: 100%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border-radius: 14px;
                }
                .header-title {
                    color: #ffffff;
                    font-size: 28px;
                    font-weight: 700;
                    margin: 0 0 8px;
                    letter-spacing: -0.5px;
                }
                .header-subtitle {
                    color: rgba(255, 255, 255, 0.9);
                    font-size: 16px;
                    font-weight: 400;
                    margin: 0;
                }
                .content {
                    padding: 48px 40px;
                }
                .welcome-section {
                    text-align: center;
                    margin-bottom: 40px;
                }
                .welcome-icon {
                    width: 64px;
                    height: 64px;
                    margin: 0 auto 20px;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    border-radius: 16px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 32px;
                }
                .welcome-text {
                    font-size: 18px;
                    color: #374151;
                    margin-bottom: 12px;
                    line-height: 1.6;
                }
                .organization-name {
                    color: #667eea;
                    font-weight: 700;
                    font-size: 20px;
                }
                .role-badge {
                    display: inline-block;
                    background: linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%);
                    color: #374151;
                    padding: 8px 16px;
                    border-radius: 20px;
                    font-size: 14px;
                    font-weight: 600;
                    margin: 8px 0;
                    border: 1px solid #d1d5db;
                }
                .cta-section {
                    text-align: center;
                    margin: 40px 0;
                    padding: 32px;
                    background: linear-gradient(135deg, #f9fafb 0%, #f3f4f6 100%);
                    border-radius: 12px;
                    border: 1px solid #e5e7eb;
                }
                .cta-button {
                    display: inline-block;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: #ffffff !important;
                    padding: 16px 40px;
                    text-decoration: none;
                    border-radius: 12px;
                    font-weight: 600;
                    font-size: 16px;
                    letter-spacing: 0.5px;
                    box-shadow: 0 4px 14px 0 rgba(102, 126, 234, 0.39);
                    transition: all 0.3s ease;
                    margin: 8px 0;
                }
                .cta-button:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 6px 20px 0 rgba(102, 126, 234, 0.5);
                }
                .expiry-notice {
                    background: #fef3c7;
                    border-left: 4px solid #f59e0b;
                    padding: 16px 20px;
                    border-radius: 8px;
                    margin: 32px 0;
                    display: flex;
                    align-items: flex-start;
                    gap: 12px;
                }
                .expiry-icon {
                    color: #f59e0b;
                    font-size: 20px;
                    flex-shrink: 0;
                    margin-top: 2px;
                }
                .expiry-text {
                    color: #92400e;
                    font-size: 14px;
                    font-weight: 500;
                    line-height: 1.5;
                }
                .link-section {
                    margin: 32px 0;
                    padding: 20px;
                    background: #f9fafb;
                    border-radius: 8px;
                    border: 1px dashed #d1d5db;
                }
                .link-label {
                    font-size: 12px;
                    color: #6b7280;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                    font-weight: 600;
                    margin-bottom: 8px;
                }
                .link-url {
                    word-break: break-all;
                    color: #667eea;
                    font-size: 13px;
                    font-family: 'Courier New', monospace;
                    line-height: 1.6;
                    text-decoration: none;
                }
                .info-grid {
                    display: grid;
                    grid-template-columns: 1fr;
                    gap: 16px;
                    margin: 32px 0;
                }
                .info-item {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    padding: 16px;
                    background: #f9fafb;
                    border-radius: 8px;
                    border: 1px solid #e5e7eb;
                }
                .info-icon {
                    width: 40px;
                    height: 40px;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    border-radius: 10px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: white;
                    font-size: 18px;
                    flex-shrink: 0;
                }
                .info-content {
                    flex: 1;
                }
                .info-label {
                    font-size: 12px;
                    color: #6b7280;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                    font-weight: 600;
                    margin-bottom: 4px;
                }
                .info-value {
                    font-size: 15px;
                    color: #1f2937;
                    font-weight: 600;
                }
                .footer {
                    background: #f9fafb;
                    padding: 32px 40px;
                    border-top: 1px solid #e5e7eb;
                    text-align: center;
                }
                .footer-text {
                    color: #6b7280;
                    font-size: 14px;
                    line-height: 1.6;
                    margin: 8px 0;
                }
                .footer-inviter {
                    color: #374151;
                    font-weight: 600;
                    margin-top: 16px;
                }
                .footer-divider {
                    height: 1px;
                    background: #e5e7eb;
                    margin: 24px 0;
                }
                @media only screen and (max-width: 600px) {
                    body {
                        padding: 20px 10px;
                    }
                    .header-gradient {
                        padding: 32px 24px 24px;
                    }
                    .header-title {
                        font-size: 24px;
                    }
                    .content {
                        padding: 32px 24px;
                    }
                    .cta-section {
                        padding: 24px;
                    }
                    .cta-button {
                        padding: 14px 32px;
                        font-size: 15px;
                    }
                    .info-grid {
                        grid-template-columns: 1fr;
                    }
                    .footer {
                        padding: 24px;
                    }
                }
            </style>
        </head>
        <body>
            <div class="email-wrapper">
                <div class="header-gradient">
                    <div class="logo-container">
                        ${organizationLogo ? 
                            `<img src="${organizationLogo}" alt="${organizationName} Logo" />` : 
                            `<div class="logo-fallback">${organizationName.charAt(0).toUpperCase()}</div>`
                        }
                    </div>
                    <h1 class="header-title">You're Invited! 🎉</h1>
                    <p class="header-subtitle">Join ${organizationName} and start collaborating</p>
                </div>

                <div class="content">
                    <div class="welcome-section">
                        <div class="welcome-icon">👋</div>
                        <p class="welcome-text">
                            You've been invited to join <span class="organization-name">${organizationName}</span>
                        </p>
                        <div class="role-badge">${roleDisplayName}</div>
                    </div>

                    <div class="info-grid">
                        <div class="info-item">
                            <div class="info-icon">🏢</div>
                            <div class="info-content">
                                <div class="info-label">Organization</div>
                                <div class="info-value">${organizationName}</div>
                            </div>
                        </div>
                        <div class="info-item">
                            <div class="info-icon">👤</div>
                            <div class="info-content">
                                <div class="info-label">Your Role</div>
                                <div class="info-value">${roleDisplayName}</div>
                            </div>
                        </div>
                        <div class="info-item">
                            <div class="info-icon">✉️</div>
                            <div class="info-content">
                                <div class="info-label">Invited By</div>
                                <div class="info-value">${inviterName.firstName} ${inviterName.lastName}</div>
                            </div>
                        </div>
                    </div>

                    <div class="cta-section">
                        <p style="margin: 0 0 24px; color: #374151; font-size: 16px; font-weight: 500;">
                            Ready to get started? Click below to accept your invitation and set up your account.
                        </p>
                        <a href="${invitationLink}" class="cta-button">Accept Invitation →</a>
                    </div>

                    <div class="expiry-notice">
                        <div class="expiry-icon">⏰</div>
                        <div class="expiry-text">
                            <strong>Important:</strong> This invitation will expire in 7 days. Please accept it soon to ensure access to your account.
                        </div>
                    </div>

                    <div class="link-section">
                        <div class="link-label">Having trouble with the button?</div>
                        <div style="margin-top: 8px;">
                            <a href="${invitationLink}" class="link-url">${invitationLink}</a>
                        </div>
                        <p style="margin-top: 12px; font-size: 12px; color: #6b7280;">
                            Copy and paste this link into your browser if the button above doesn't work.
                        </p>
                    </div>
                </div>

                <div class="footer">
                    <p class="footer-text">
                        This invitation was sent by <span class="footer-inviter">${inviterName.firstName} ${inviterName.lastName}</span>
                    </p>
                    <div class="footer-divider"></div>
                    <p class="footer-text">
                        If you have any questions or didn't expect this invitation, please contact your team administrator.
                    </p>
                    <p class="footer-text" style="margin-top: 16px; font-size: 12px; color: #9ca3af;">
                        This is an automated message. Please do not reply to this email.
                    </p>
                </div>
            </div>
        </body>
        </html>
        `

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
