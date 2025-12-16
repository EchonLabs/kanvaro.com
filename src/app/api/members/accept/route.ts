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

    // Check if email verification is required for this organization
    const requireEmailVerification = invitation.organization?.settings?.requireEmailVerification ?? true

    // Generate email verification token if required
    let emailVerificationToken = undefined
    let emailVerificationExpiry = undefined

    if (requireEmailVerification) {
      emailVerificationToken = crypto.randomBytes(32).toString('hex')
      emailVerificationExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
      console.log('Generated verification token for user:', invitation.email, 'Token length:', emailVerificationToken.length, 'Token starts with:', emailVerificationToken.substring(0, 10))
    }

    const userData: any = {
      firstName: userFirstName,
      lastName: userLastName,
      email: invitation.email,
      password: hashedPassword,
      role: invitation.role,
      organization: invitation.organization._id,
      isActive: true,
      emailVerified: !requireEmailVerification, // Set to false if verification is required, true if not required
      emailVerificationToken: emailVerificationToken,
      emailVerificationExpiry: emailVerificationExpiry
    }

    // Add customRole if it exists in the invitation
    if (invitation.customRole) {
      userData.customRole = invitation.customRole
    }

    const user = new User(userData)
    const savedUser = await user.save()

    if (requireEmailVerification) {
      console.log('User saved with verification token:', savedUser.emailVerificationToken ? 'Token present' : 'No token')
      if (savedUser.emailVerificationToken) {
        console.log('Saved token starts with:', savedUser.emailVerificationToken.substring(0, 10))
        console.log('Token expiry:', savedUser.emailVerificationExpiry)
      }
    }

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
      let baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
      const forwardedHost = request.headers.get('x-forwarded-host')
      const host = request.headers.get('host')
      const forwardedProto = request.headers.get('x-forwarded-proto')

      if (forwardedHost || host) {
        const protocol = forwardedProto || (request.url.startsWith('https') ? 'https' : 'http')
        let hostValue = forwardedHost || host || ''

        // Clean up host (remove any protocol prefix, remove trailing slash, remove port if default)
        hostValue = hostValue.replace(/^https?:\/\//, '').replace(/\/$/, '')
        // Remove default ports
        hostValue = hostValue.replace(/^(.+):80$/, '$1')
        hostValue = hostValue.replace(/^(.+):443$/, '$1')

        baseUrl = `${protocol}://${hostValue}`
      }

      if (requireEmailVerification) {
        // Send email verification email
        const verificationUrl = `${baseUrl}/verify-email?token=${emailVerificationToken}`

        const verificationEmailHtml = emailService.generateEmailVerificationEmail(
          user.firstName,
          user.lastName,
          user.email,
          roleDisplayName,
          organizationName,
          verificationUrl
        )

        emailService.sendEmail({
          to: user.email,
          subject: `Verify your email for ${organizationName}`,
          html: verificationEmailHtml
        }).catch((emailError) => {
          console.error('Failed to send verification email (non-blocking):', emailError)
          // Don't fail the account creation if email fails
        })
      } else {
        // Send welcome email (original behavior)
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
      }
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
