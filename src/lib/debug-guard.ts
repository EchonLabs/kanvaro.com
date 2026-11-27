import 'server-only'
import { NextResponse } from 'next/server'
import { authenticateUser } from '@/lib/auth-utils'
import { Role } from '@/lib/permissions/permission-definitions'

const ADMIN_ROLES: string[] = [Role.SUPER_ADMIN, Role.ADMIN]

/**
 * Debug routes expose internals (user list, config, a config reset). They do
 * not exist in production (404, so they aren't even advertised) and in
 * development need a signed-in admin. Returns an error response, or null when
 * the route may proceed.
 */
export async function rejectUnlessDevAdmin(): Promise<NextResponse | null> {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const auth = await authenticateUser()
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  if (!ADMIN_ROLES.includes(auth.user.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  return null
}
