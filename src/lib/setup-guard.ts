import 'server-only'
import { NextResponse } from 'next/server'
import { loadConfig } from '@/lib/config'
import connectDB from '@/lib/db-config'
import { User } from '@/models/User'
import { authenticateUser } from '@/lib/auth-utils'
import { Permission } from '@/lib/permissions/permission-definitions'
import { PermissionService } from '@/lib/permissions/permission-service'

export interface SetupState {
  setupCompleted: boolean
  hasConfig: boolean
  hasUsers: boolean
  organizationId?: string
}

/**
 * Single source of truth for "is this installation already set up?".
 *
 * Setup counts as completed when config.json says so AND the database has at
 * least one user. The second half keeps the wizard reachable when config.json
 * survives but the database was wiped. `/api/setup/status` and the setup-route
 * lock both use this, so the wizard and the lock can never disagree.
 */
export async function getSetupState(): Promise<SetupState> {
  const config = loadConfig()

  let hasUsers = false
  if (config.setupCompleted) {
    try {
      await connectDB()
      hasUsers = (await User.estimatedDocumentCount()) > 0
    } catch (error) {
      console.error('Setup state: database unreachable, treating as no users:', error)
    }
  }

  return {
    setupCompleted: config.setupCompleted && hasUsers,
    hasConfig: !!config.database,
    hasUsers,
    organizationId: config.organizationId
  }
}

/**
 * Setup routes write the admin account, organisation and database config with
 * no sign-in. That is only safe before the installation is set up. Returns a
 * 403 response once setup is complete, or null when the route may proceed.
 */
export async function rejectIfSetupCompleted(): Promise<NextResponse | null> {
  const { setupCompleted } = await getSetupState()
  if (setupCompleted) {
    return NextResponse.json(
      { error: 'Setup has already been completed' },
      { status: 403 }
    )
  }
  return null
}

/**
 * For setup routes the Settings pages also use after setup (connection tests):
 * open during setup, afterwards only for a signed-in user holding `permission`.
 * Returns an error response, or null when the route may proceed.
 */
export async function rejectUnlessSetupOrPermission(
  permission: Permission
): Promise<NextResponse | null> {
  const { setupCompleted } = await getSetupState()
  if (!setupCompleted) return null

  const auth = await authenticateUser()
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  if (!(await PermissionService.hasPermission(auth.user.id, permission))) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  return null
}
