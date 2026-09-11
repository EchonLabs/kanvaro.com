/**
 * Every open stand-up the caller is expected at, across every project — the
 * data behind My Stand-up's "Also today" banner (design §4.1, fixing the
 * redirector's old silent-drop of a second same-day stand-up).
 *
 * No project or stand-up id is in scope here — the caller is asking "which of
 * my own stand-ups are open right now", which is self-scoped rather than
 * permission-gated the way a project resource is, so this route authenticates
 * directly instead of going through `withStandupIdPermission` (matching
 * `auth/permissions/route.ts`'s pattern for a personal, non-project-scoped GET).
 */
import { NextResponse } from 'next/server'

import connectDB from '@/lib/db-config'
import { authenticateUser } from '@/lib/auth-utils'
import { findOpenStandupCandidates } from '@/lib/standup/my-standup-candidates'

export const dynamic = 'force-dynamic'

export async function GET() {
  await connectDB()

  const authResult = await authenticateUser()
  if ('error' in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status })
  }

  const candidates = await findOpenStandupCandidates({
    organizationId: String(authResult.user.organization),
    userId: authResult.user.id
  })

  return NextResponse.json({ data: candidates })
}
