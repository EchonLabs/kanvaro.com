import { NextRequest, NextResponse } from 'next/server'
import { authenticateUser } from '@/lib/auth-utils'
import { Permission } from '@/lib/permissions/permission-definitions'
import { PermissionService } from '@/lib/permissions/permission-service'
import { maskSecret } from '@/lib/settings/secret-mask'

/** Signed in + settings:manage_database, or an error response. */
async function authorise(): Promise<NextResponse | null> {
  const auth = await authenticateUser()
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  if (!(await PermissionService.hasPermission(auth.user.id, Permission.SETTINGS_MANAGE_DATABASE))) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  return null
}

export async function GET() {
  try {
    const denied = await authorise()
    if (denied) return denied

    // In a real application, you would load these settings from a configuration file
    // or environment variables. For now, we'll return default values.
    const defaultConfig = {
      host: process.env.MONGODB_HOST || 'localhost',
      port: parseInt(process.env.MONGODB_PORT || '27017'),
      database: process.env.MONGODB_DATABASE || 'kanvaro',
      username: process.env.MONGODB_USERNAME || '',
      // Never the real password; see lib/settings/secret-mask.ts.
      password: maskSecret(process.env.MONGODB_PASSWORD),
      authSource: process.env.MONGODB_AUTH_SOURCE || 'admin',
      ssl: process.env.MONGODB_SSL === 'true' || false
    }

    return NextResponse.json(defaultConfig)
  } catch (error) {
    console.error('Database settings retrieval failed:', error)
    return NextResponse.json(
      { error: 'Failed to retrieve database settings' },
      { status: 500 }
    )
  }
}

export async function PUT(request: NextRequest) {
  try {
    const denied = await authorise()
    if (denied) return denied

    const databaseConfig = await request.json()

    // In a real application, you would save these settings to a configuration file
    // or environment variables. For now, we'll just return a success message.

    console.log('Database configuration updated:', {
      host: databaseConfig.host,
      port: databaseConfig.port,
      database: databaseConfig.database,
      ssl: databaseConfig.ssl
    })

    return NextResponse.json({
      message: 'Database settings updated successfully',
      config: {
        host: databaseConfig.host,
        port: databaseConfig.port,
        database: databaseConfig.database,
        ssl: databaseConfig.ssl
      }
    })
  } catch (error) {
    console.error('Database settings update failed:', error)
    return NextResponse.json(
      { error: 'Failed to update database settings' },
      { status: 500 }
    )
  }
}
