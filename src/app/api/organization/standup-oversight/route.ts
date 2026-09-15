/**
 * Cross-project stand-up oversight for org admins.
 *
 *   GET /api/organization/standup-oversight
 *
 * Deliberately not built on `withStandupPermission`: that helper's
 * `STANDUP_VIEW_ANALYTICS` permission is granted org-wide to both the Admin
 * *and* the Project Manager role (spec §3.2 gives PMs their own per-sprint
 * analytics access), so an org-wide permission check alone would let a PM
 * account onto a page meant specifically for an admin with no project of
 * their own to look at instead. This route checks the caller's actual role.
 */
import { NextResponse } from 'next/server'

import connectDB from '@/lib/db-config'
import { authenticateUser } from '@/lib/auth-utils'
import { Role } from '@/lib/permissions/permission-definitions'
import { getOrgStandupOversight } from '@/lib/standup/admin-oversight'
import { toErrorResponse } from '@/lib/standup/errors'

const OVERSIGHT_ROLES: string[] = [Role.ADMIN, Role.SUPER_ADMIN]

export async function GET() {
  try {
    await connectDB()

    const authResult = await authenticateUser()
    if ('error' in authResult) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status })
    }

    if (!OVERSIGHT_ROLES.includes(authResult.user.role)) {
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: 'You do not have permission to do that.' } },
        { status: 403 }
      )
    }

    const oversight = await getOrgStandupOversight(String(authResult.user.organization))
    return NextResponse.json({ data: oversight })
  } catch (error) {
    const { status, body } = toErrorResponse(error)
    if (status === 500) console.error('Stand-up oversight route error:', error)
    return NextResponse.json(body, { status })
  }
}
