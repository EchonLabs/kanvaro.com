import { NextRequest, NextResponse } from 'next/server'
import connectDB from '@/lib/db-config'
import { hasDatabaseConfig } from '@/lib/db-config'
import { Organization } from '@/models/Organization'
import { authenticateUser } from '@/lib/auth-utils'
import { Permission } from '@/lib/permissions/permission-definitions'
import { PermissionService } from '@/lib/permissions/permission-service'
import { maskEmailConfig, unmaskSecret } from '@/lib/settings/secret-mask'

const EMPTY_CONFIG = {
  provider: 'smtp',
  smtp: { host: '', port: 587, secure: false, username: '', password: '', fromEmail: '', fromName: '' },
  azure: { clientId: '', clientSecret: '', tenantId: '', fromEmail: '', fromName: '' }
}

/** Signed in + settings:manage_email, or an error response. */
async function authorise(): Promise<{ organizationId: string } | NextResponse> {
  const auth = await authenticateUser()
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  if (!(await PermissionService.hasPermission(auth.user.id, Permission.SETTINGS_MANAGE_EMAIL))) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  return { organizationId: auth.user.organization }
}

const str = (v: unknown) => (typeof v === 'string' ? v : '')

export async function GET() {
  try {
    if (!(await hasDatabaseConfig())) {
      return NextResponse.json(EMPTY_CONFIG)
    }

    const access = await authorise()
    if (access instanceof NextResponse) return access

    await connectDB()
    const organization = (await Organization.findById(access.organizationId)
      .select('emailConfig')
      .lean()) as any

    if (!organization?.emailConfig) {
      return NextResponse.json(EMPTY_CONFIG)
    }

    // Secrets are replaced by a placeholder; see lib/settings/secret-mask.ts.
    return NextResponse.json(maskEmailConfig(organization.emailConfig))
  } catch (error) {
    console.error('Email settings retrieval failed:', error)
    return NextResponse.json(
      { error: 'Failed to retrieve email settings' },
      { status: 500 }
    )
  }
}

export async function PUT(request: NextRequest) {
  try {
    if (!(await hasDatabaseConfig())) {
      return NextResponse.json(
        { message: 'Email settings updated successfully (demo mode)' },
        { status: 200 }
      )
    }

    const access = await authorise()
    if (access instanceof NextResponse) return access

    const body = await request.json()
    await connectDB()

    const current = (await Organization.findById(access.organizationId)
      .select('emailConfig')
      .lean()) as any
    if (!current) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }
    const stored = current.emailConfig || {}
    const smtp = body?.smtp || {}
    const azure = body?.azure || {}

    // Only known fields are saved. A secret sent back as the placeholder keeps
    // the stored value, so saving the form never wipes a password.
    const emailConfig = {
      provider: body?.provider,
      smtp: {
        host: str(smtp.host),
        port: Number(smtp.port) || 587,
        secure: smtp.secure === true,
        username: str(smtp.username),
        password: unmaskSecret(smtp.password, stored.smtp?.password),
        fromEmail: str(smtp.fromEmail),
        fromName: str(smtp.fromName)
      },
      azure: {
        clientId: str(azure.clientId),
        clientSecret: unmaskSecret(azure.clientSecret, stored.azure?.clientSecret),
        tenantId: str(azure.tenantId),
        connectionString: unmaskSecret(azure.connectionString, stored.azure?.connectionString),
        fromEmail: str(azure.fromEmail),
        fromName: str(azure.fromName)
      }
    }

    const organization = (await Organization.findByIdAndUpdate(
      access.organizationId,
      { emailConfig },
      { new: true }
    )
      .select('emailConfig')
      .lean()) as any

    if (!organization) {
      return NextResponse.json(
        { error: 'Failed to update email settings' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      message: 'Email settings updated successfully',
      emailConfig: maskEmailConfig(organization.emailConfig || {})
    })
  } catch (error) {
    console.error('Email settings update failed:', error)
    return NextResponse.json(
      { error: 'Failed to update email settings' },
      { status: 500 }
    )
  }
}
