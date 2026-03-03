import { NextResponse } from 'next/server'
import connectDB from '@/lib/db-config'
import { User } from '@/models/User'
import crypto from 'crypto'

export async function POST(request: Request) {
  try {
    const { email, otp } = await request.json()

    if (!email || !otp) {
      return NextResponse.json(
        { error: 'Email and OTP are required' },
        { status: 400 }
      )
    }

    console.log('OTP verification request for email:', email)

    await connectDB()

    // Find user by email
    const user = await User.findOne({ email: email.toLowerCase() })
    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      )
    }

    // Check if OTP exists and is not expired
    if (!user.passwordResetOtp || !user.passwordResetExpiry) {
      return NextResponse.json(
        { error: 'No password reset request found' },
        { status: 400 }
      )
    }

    if (new Date() > user.passwordResetExpiry) {
      return NextResponse.json(
        { error: 'OTP has expired' },
        { status: 400 }
      )
    }

    // Verify OTP
    if (user.passwordResetOtp !== otp) {
      return NextResponse.json(
        { error: 'Invalid OTP' },
        { status: 400 }
      )
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex')
    user.passwordResetToken = resetToken
    user.passwordResetExpiry = new Date(Date.now() + 15 * 60 * 1000) // 15 minutes
    user.passwordResetOtp = undefined // Clear OTP
    await user.save()

    return NextResponse.json({
      success: true,
      message: 'OTP verified successfully',
      resetToken: resetToken
    })

  } catch (error) {
    console.error('OTP verification failed:', error)
    return NextResponse.json(
      { error: 'OTP verification failed' },
      { status: 500 }
    )
  }
}
