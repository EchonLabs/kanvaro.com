import { NextResponse } from 'next/server'
import connectDB from '@/lib/db-config'
import { getOrgConnection, getModelOnConnection } from '@/lib/db-connection-manager'
import { getOrgConfigs } from '@/lib/config'
import '@/models/registry'
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

    // Search across all tenant databases for the reset token
    let user: any = null
    let resolvedOrgId: string | null = null
    const orgs = getOrgConfigs()
    for (const org of orgs) {
      try {
        const conn = await getOrgConnection(org.id)
        const UserModel = getModelOnConnection<any>('User', conn)
        const found = await UserModel.findOne({
          passwordResetToken: resetToken,
          passwordResetExpiry: { $gt: new Date() }
        })
        if (found) {
          user = found
          resolvedOrgId = org.id
          break
        }
      } catch {
        // Skip unreachable orgs
      }
    }

    if (!user || !resolvedOrgId) {
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
    const emailSent = await emailService.sendEmail({
      to: user.email,
      subject: 'Password Reset Successful',
      html: emailService.generatePasswordResetConfirmationEmail('Kanvaro')
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
