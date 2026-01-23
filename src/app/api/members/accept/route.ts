import { NextRequest, NextResponse } from 'next/server'
import connectDB from '@/lib/db-config'
import { User } from '@/models/User'
import { UserInvitation } from '@/models/UserInvitation'
import '@/models/Organization' // Ensure Organization model is registered for populate
import { notificationService } from '@/lib/notification-service'
import { emailService } from '@/lib/email/EmailService'
import { formatToTitleCase } from '@/lib/utils'
import bcrypt from 'bcryptjs'
import { generateAvatarImage } from '@/lib/avatar-generator'
import crypto from 'crypto'

export async function POST(request: NextRequest) {
  try {
    await connectDB()

    const { token, password, firstName, lastName } = await request.json()

    // Find valid invitation
    const invitation = await UserInvitation.findOne({
      token,
      isAccepted: false,
      expiresAt: { $gt: new Date() }
    }).populate('organization')

    if (!invitation) {
      return NextResponse.json(
        { error: 'Invalid or expired invitation' },
        { status: 400 }
      )
    }

    // Check if user already exists
    const existingUser = await User.findOne({
      email: invitation.email,
      organization: invitation.organization._id
    })

    if (existingUser) {
      return NextResponse.json(
        { error: 'User already exists' },
        { status: 400 }
      )
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12)

    // Create user
    const userFirstName = firstName || invitation.firstName || ''
    const userLastName = lastName || invitation.lastName || ''


    const userData: any = {
      firstName: userFirstName,
      lastName: userLastName,
      email: invitation.email,
      password: hashedPassword,
      role: invitation.role,
      organization: invitation.organization._id,
      isActive: true,
      emailVerified: true
    }

    // Add customRole if it exists in the invitation
    if (invitation.customRole) {
      userData.customRole = invitation.customRole
    }

    const user = new User(userData)
    const savedUser = await user.save()


    // Generate and save avatar image
    try {
      const avatarUrl = await generateAvatarImage(
        user._id.toString(),
        userFirstName,
        userLastName
      )
      user.avatar = avatarUrl
      await user.save()
    } catch (avatarError) {
      console.error('Failed to generate avatar (non-blocking):', avatarError)
      // Don't fail user creation if avatar generation fails
    }

    // Mark invitation as accepted
    invitation.isAccepted = true
    invitation.acceptedAt = new Date()
    await invitation.save()

    // Send appropriate email based on verification requirement (non-blocking)
    try {
      const organizationName = invitation.organization?.name || 'Kanvaro'
      const roleDisplayName = invitation.roleDisplayName || formatToTitleCase(invitation.role) || 'Team Member'

      // Get base URL from request headers (same as invite route)
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
      // Send welcome email
      const loginUrl = `${baseUrl}/login`

      const welcomeEmailHtml = emailService.generateWelcomeEmail(
        user.firstName,
        user.lastName,
        user.email,
        roleDisplayName,
        organizationName,
        loginUrl
      )

      emailService.sendEmail({
        to: user.email,
        subject: `Welcome to ${organizationName}! Your Account is Ready 🎉`,
        html: welcomeEmailHtml
      }).catch((emailError) => {
        console.error('Failed to send welcome email (non-blocking):', emailError)
        // Don't fail the account creation if email fails
      })
    } catch (emailError) {
      console.error('Error preparing email (non-blocking):', emailError)
      // Don't fail the account creation if email preparation fails
    }

    // Send notification to organization members about new team member
    try {
      const organizationMembers = await User.find({ 
        organization: invitation.organization._id,
        _id: { $ne: user._id } // Exclude the new user
      }).select('_id')
      
      const memberIds = organizationMembers.map(member => member._id.toString())
      
      if (memberIds.length > 0) {
        await notificationService.notifyTeamUpdate(
          'member_joined',
          memberIds,
          invitation.organization._id.toString(),
          `${user.firstName} ${user.lastName}`,
          `joined as ${invitation.role.replace(/_/g, ' ')}`
        )
      }
    } catch (notificationError) {
      console.error('Failed to send team update notifications:', notificationError)
      // Don't fail the account creation if notification fails
    }

    return NextResponse.json({
      success: true,
      message: 'Account created successfully',
      data: {
        user: {
          id: user._id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role
        }
      }
    })

  } catch (error) {
    console.error('Accept invitation error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
