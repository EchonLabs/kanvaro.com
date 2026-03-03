import { NextResponse } from 'next/server'
import { loadConfig, isSetupCompleted, MAX_ORGANIZATIONS } from '@/lib/config'
import connectDB from '@/lib/db-config'
import { getOrgConnection, getModelOnConnection } from '@/lib/db-connection-manager'

export async function GET() {
  try {
    const config = loadConfig()
    const orgs = config.organizations ?? []
    const primaryOrg = orgs[0] ?? null

    // Check if at least one org's DB is accessible and has users
    let hasUsers = false
    if (primaryOrg) {
      try {
        await connectDB(primaryOrg.id)
        const conn = await getOrgConnection(primaryOrg.id)
        const UserModel = getModelOnConnection<any>('User', conn)
        const userCount = await UserModel.countDocuments()
        hasUsers = userCount > 0
      } catch (error) {
        console.log('Database connection failed, assuming no users:', error)
      }
    }

    const setupCompleted = isSetupCompleted() && hasUsers
    const orgCount = orgs.length
    const maxOrgs = config.maxOrganizations ?? MAX_ORGANIZATIONS
    const atLimit = orgCount >= maxOrgs

    return NextResponse.json({
      setupCompleted,
      hasConfig: !!primaryOrg?.database,
      hasUsers,
      organizationId: primaryOrg?.id,
      // Multi-org fields
      orgCount,
      maxOrganizations: maxOrgs,
      atOrgLimit: atLimit,
      organizations: orgs.map((o) => ({
        id: o.id,
        name: o.name,
        slug: o.slug,
        setupCompleted: o.setupCompleted,
        dbName: o.database?.database,
      })),
      message: setupCompleted
        ? 'Application is configured and ready'
        : hasUsers
          ? 'Application setup is required'
          : 'No users found, setup required',
    })
  } catch (error) {
    console.error('Failed to check setup status:', error)
    return NextResponse.json({
      setupCompleted: false,
      hasConfig: false,
      hasUsers: false,
      orgCount: 0,
      maxOrganizations: MAX_ORGANIZATIONS,
      atOrgLimit: false,
      message: 'Failed to check setup status',
    })
  }
}
