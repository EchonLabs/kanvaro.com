import { NextResponse } from 'next/server'
import connectDB from '@/lib/db-config'
import { User } from '@/models/User'
import bcrypt from 'bcryptjs'
import { emailService } from '@/lib/email/EmailService'

export async function POST(request: Request) {
  try {
    let body
    try {
      body = await request.json()
    } catch (parseError) {
      console.error('Failed to parse request body:', parseError)
      return NextResponse.json(
        { error: 'Invalid JSON in request body' },
        { status: 400 }
      )
    }

    const { resetToken, newPassword } = body

    console.log('Reset password request received:', {
      hasResetToken: !!resetToken,
      hasNewPassword: !!newPassword,
      resetTokenLength: resetToken?.length,
      newPasswordLength: newPassword?.length,
      bodyKeys: Object.keys(body),
      resetTokenPreview: resetToken ? `${resetToken.substring(0, 10)}...` : 'null'
    })

    if (!resetToken || !newPassword) {
      console.log('Missing required fields:', { resetToken: !!resetToken, newPassword: !!newPassword })
      return NextResponse.json(
        {
          error: 'Reset token and new password are required',
          details: {
            resetToken: resetToken ? 'provided' : 'missing',
            newPassword: newPassword ? 'provided' : 'missing'
          }
        },
        { status: 400 }
      )
    }

    // Validate password strength
    if (newPassword.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters long' },
        { status: 400 }
      )
    }

    console.log('Password reset request with token:', resetToken ? 'present' : 'missing')

    await connectDB()

    // Find user by reset token
    const user = await User.findOne({ 
      passwordResetToken: resetToken,
      passwordResetExpiry: { $gt: new Date() }
    })

    if (!user) {
      return NextResponse.json(
        { error: 'Invalid or expired reset token' },
        { status: 400 }
      )
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 12)

    // Update user password and clear reset fields
    user.password = hashedPassword
    user.passwordResetToken = undefined
    user.passwordResetExpiry = undefined
    user.passwordResetOtp = undefined
    await user.save()

    // Send confirmation email
    let baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'
    
    // Try to get base URL from request headers for production
    if (request instanceof Request) {
      const url = new URL(request.url)
      const protocol = url.protocol
      let host = url.host
      
      // Clean up host (remove default ports)
      host = host.replace(/^(.+):80$/, '$1')
      host = host.replace(/^(.+):443$/, '$1')
      
      baseUrl = `${protocol}//${host}`
    }

    const emailSent = await emailService.sendEmail({
      to: user.email,
      subject: 'Password Reset Successful',
      html: emailService.generatePasswordResetConfirmationEmail('Kanvaro', baseUrl)
    })

    if (!emailSent) {
      console.error('Failed to send password reset confirmation email to:', user.email)
      // Don't fail the request as password was reset successfully
    }

    console.log('Password reset successful for user:', user.email)

    return NextResponse.json({
      success: true,
      message: 'Password reset successfully'
    })

  } catch (error) {
    console.error('Password reset failed:', error)
    return NextResponse.json(
      { error: 'Password reset failed' },
      { status: 500 }
    )
  }
}
