import { NextResponse } from 'next/server'
import connectDB from '@/lib/db-config'
import { hasDatabaseConfig } from '@/lib/db-config'
import { rejectUnlessSetupOrPermission } from '@/lib/setup-guard'
import { Permission } from '@/lib/permissions/permission-definitions'

/**
 * Reports only whether the app can reach its database. It used to return the
 * host, port, database name and every collection name to anyone; it now
 * returns no connection details and, after setup, needs
 * settings:manage_database.
 */
export async function GET() {
  try {
    const denied = await rejectUnlessSetupOrPermission(Permission.SETTINGS_MANAGE_DATABASE)
    if (denied) return denied

    const isConfigured = await hasDatabaseConfig()
    if (!isConfigured) {
      return NextResponse.json({
        success: false,
        error: 'Database configuration not found. Please complete the setup process.'
      })
    }

    const connection = await connectDB()
    if (!connection.connection.db) {
      throw new Error('Database connection is not available')
    }
    await connection.connection.db.admin().ping()

    return NextResponse.json({
      success: true,
      connectionState: connection.connection.readyState,
      message: 'Connection test successful'
    })
  } catch (error) {
    console.error('Connection test failed:', error)
    return NextResponse.json({
      success: false,
      error: 'Connection test failed'
    }, { status: 500 })
  }
}
