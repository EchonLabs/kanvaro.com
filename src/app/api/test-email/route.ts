import { NextRequest, NextResponse } from 'next/server'
import { emailService } from '@/lib/email/EmailService'
import { authenticateUser } from '@/lib/auth-utils'
import { Permission } from '@/lib/permissions/permission-definitions'
import { PermissionService } from '@/lib/permissions/permission-service'

export async function POST(request: NextRequest) {
  try {
    const authResult = await authenticateUser()
    if ('error' in authResult) {
      return NextResponse.json(
        { error: authResult.error },
        { status: authResult.status }
      )
    }

    // Sends through the organisation's mail server to any address, so only
    // people who manage email settings may use it.
    if (!(await PermissionService.hasPermission(authResult.user.id, Permission.SETTINGS_MANAGE_EMAIL))) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    const { email } = await request.json()

    if (!email) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      )
    }

    const testEmailHtml = `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <title>Test Email</title>
    </head>
    <body>
        <h1>Test Email</h1>
        <p>This is a test email to verify email configuration.</p>
        <p>If you receive this email, your SMTP configuration is working correctly.</p>
        <p>Sent at: ${new Date().toISOString()}</p>
    </body>
    </html>
    `

    const emailSent = await emailService.sendEmail({
      to: email,
      subject: 'Test Email - Kanvaro',
      html: testEmailHtml
    })

    if (emailSent) {
      return NextResponse.json({
        success: true,
        message: 'Test email sent successfully'
      })
    } else {
      return NextResponse.json(
        { error: 'Failed to send test email' },
        { status: 500 }
      )
    }

  } catch (error) {
    console.error('Test email error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
