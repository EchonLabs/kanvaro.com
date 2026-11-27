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
 *
 * It fails closed: when config.json says setup is done but the user count
 * cannot be read (database restarting, timeout, pool exhausted), setup stays
 * completed. Only a count that really returns 0 reopens the wizard. Otherwise
 * a database hiccup would unlock the signed-out setup routes, and anyone could
 * repoint config.json at their own database and create an admin there.
 */
export async function getSetupState(): Promise<SetupState> {
  const config = loadConfig()

  let hasUsers = false
  let userCountUnknown = false
  if (config.setupCompleted) {
    try {
      await connectDB()
      hasUsers = (await User.estimatedDocumentCount()) > 0
    } catch (error) {
      userCountUnknown = true
      console.error('Setup state: database unreachable, keeping setup locked:', error)
    }
  }

  return {
    setupCompleted: !!config.setupCompleted && (hasUsers || userCountUnknown),
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
 * `denied` is an error response, or null when the route may proceed;
 * `setupCompleted` tells the route which of the two cases it is in.
 */
export async function checkSetupOrPermission(
  permission: Permission
): Promise<{ denied: NextResponse | null; setupCompleted: boolean }> {
  const { setupCompleted } = await getSetupState()
  if (!setupCompleted) return { denied: null, setupCompleted }

  const auth = await authenticateUser()
  if ('error' in auth) {
    return { denied: NextResponse.json({ error: auth.error }, { status: auth.status }), setupCompleted }
  }
  if (!(await PermissionService.hasPermission(auth.user.id, permission))) {
    return { denied: NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 }), setupCompleted }
  }
  return { denied: null, setupCompleted }
}

/** `checkSetupOrPermission` for routes that only need the error response. */
export async function rejectUnlessSetupOrPermission(
  permission: Permission
): Promise<NextResponse | null> {
  return (await checkSetupOrPermission(permission)).denied
}
