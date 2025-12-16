import { NextRequest, NextResponse } from 'next/server'
import connectDB from '@/lib/db-config'
import { User } from '@/models/User'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const token = searchParams.get('token')

    console.log('Email verification attempt with token:', token ? 'present' : 'missing')

    if (!token) {
      console.log('No token provided in verification request')
      return NextResponse.redirect(new URL('/login?error=Invalid verification link', request.url))
    }

    console.log('Verification token starts with:', token.substring(0, 10))
    console.log('Token length:', token.length)

    await connectDB()
    console.log('Database connected for verification')

    // Find user with valid verification token
    const currentTime = new Date()
    console.log('Current time for expiry check:', currentTime.toISOString())
    console.log('Searching for exact token match...')

    const user = await User.findOne({
      emailVerificationToken: token,
      emailVerificationExpiry: { $gt: new Date() }
    })

    // Also try a more permissive search to see if there are similar tokens
    const similarTokens = await User.find({
      emailVerificationToken: { $regex: new RegExp(token.substring(0, 10), 'i') }
    }).limit(3)

    console.log('Found similar tokens:', similarTokens.length)

    console.log('User lookup result:', user ? `Found user: ${user.email}` : 'No user found')

    // Also try to find the token without expiry check to see if it exists but is expired
    const tokenExists = await User.findOne({
      emailVerificationToken: token
    })

    if (tokenExists) {
      console.log('Token exists in database for user:', tokenExists.email)
      console.log('Token expiry in DB:', tokenExists.emailVerificationExpiry?.toISOString())
      console.log('Token expired?', tokenExists.emailVerificationExpiry <= currentTime)
      console.log('User emailVerified status:', tokenExists.emailVerified)
    } else {
      console.log('Token not found in database at all')

      // Try to find any user with email verification tokens to see if there are any tokens in the system
      const anyUsersWithTokens = await User.find({ emailVerificationToken: { $exists: true, $ne: null } }).limit(5)
      console.log('Number of users with verification tokens in system:', anyUsersWithTokens.length)
      if (anyUsersWithTokens.length > 0) {
        console.log('Sample user emails with tokens:', anyUsersWithTokens.map(u => u.email))
      }
    }

    if (!user) {
      // Try to find if token exists but is expired
      const expiredUser = await User.findOne({
        emailVerificationToken: token
      })

      if (expiredUser) {
        console.log('Token exists but is expired for user:', expiredUser.email)
        return NextResponse.redirect(new URL('/login?error=Verification link has expired. Please request a new one.', request.url))
      } else {
        console.log('Token not found in database')
        return NextResponse.redirect(new URL('/login?error=Invalid verification link', request.url))
      }
    }

    // Update user as verified
    user.emailVerified = true
    user.emailVerificationToken = undefined
    user.emailVerificationExpiry = undefined
    await user.save()

    // Redirect to login with success message
    return NextResponse.redirect(new URL('/login?success=Email verified successfully! You can now sign in.', request.url))

  } catch (error) {
    console.error('Email verification error:', error)
    return NextResponse.redirect(new URL('/login?error=Verification failed. Please try again.', request.url))
  }
}

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json()

    if (!email) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      )
    }

    await connectDB()

    // Find user by email
    const user = await User.findOne({ email: email.toLowerCase() })

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      )
    }

    if (user.emailVerified) {
      return NextResponse.json(
        { error: 'Email is already verified' },
        { status: 400 }
      )
    }

    // Generate new verification token (24 hours expiry)
    const crypto = await import('crypto')
    const verificationToken = crypto.default.randomBytes(32).toString('hex')

    user.emailVerificationToken = verificationToken
    user.emailVerificationExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
    await user.save()

    // Send verification email
    try {
      const { emailService } = await import('@/lib/email/EmailService')
      const { formatToTitleCase } = await import('@/lib/utils')

      // Get base URL
      let baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
      const forwardedHost = request.headers.get('x-forwarded-host')
      const host = request.headers.get('host')
      const forwardedProto = request.headers.get('x-forwarded-proto')

      if (forwardedHost || host) {
        const protocol = forwardedProto || (request.url.startsWith('https') ? 'https' : 'http')
        let hostValue = forwardedHost || host || ''

        // Clean up host
        hostValue = hostValue.replace(/^https?:\/\//, '').replace(/\/$/, '')
        hostValue = hostValue.replace(/^(.+):80$/, '$1')
        hostValue = hostValue.replace(/^(.+):443$/, '$1')

        baseUrl = `${protocol}://${hostValue}`
      }

      const verificationUrl = `${baseUrl}/verify-email?token=${verificationToken}`

      // Get organization info
      const Organization = (await import('@/models/Organization')).Organization
      const organization = await Organization.findById(user.organization)

      const organizationName = organization?.name || 'Kanvaro'
      const roleDisplayName = user.role ? formatToTitleCase(user.role.replace(/_/g, ' ')) : 'Team Member'

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
      })

      return NextResponse.json({
        success: true,
        message: 'Verification email sent successfully'
      })

    } catch (emailError) {
      console.error('Failed to send verification email:', emailError)
      return NextResponse.json(
        { error: 'Failed to send verification email' },
        { status: 500 }
      )
    }

  } catch (error) {
    console.error('Resend verification email error:', error)
    return NextResponse.json(
      { error: 'Failed to resend verification email' },
      { status: 500 }
    )
  }
}
