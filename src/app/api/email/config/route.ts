import { NextResponse } from 'next/server'
import connectDB from '@/lib/db-config'
import { Organization } from '@/models/Organization'
import { authenticateUser } from '@/lib/auth-utils'

export async function GET() {
  try {
    const auth = await authenticateUser()
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    await connectDB()
    
    const organization = await Organization.findOne({})
    
    if (!organization?.emailConfig) {
      return NextResponse.json({
        configured: false,
        message: 'Email configuration not found'
      })
    }

    return NextResponse.json({
      configured: true,
      provider: organization.emailConfig.provider,
      fromEmail: organization.emailConfig.smtp?.fromEmail || organization.emailConfig.azure?.fromEmail,
      fromName: organization.emailConfig.smtp?.fromName || organization.emailConfig.azure?.fromName
    })
  } catch (error) {
    console.error('Failed to get email configuration:', error)
    return NextResponse.json(
      { error: 'Failed to get email configuration' },
      { status: 500 }
    )
  }
}
