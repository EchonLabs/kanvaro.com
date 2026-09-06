/**
 * Resolves which stand-up `/my/standup` (UI-12) should open for the caller —
 * one click from the N1 reminder, no navigation.
 *
 * Priority: `In_Progress` (it is happening right now) beats `Ready` (it is
 * about to) beats the soonest `Scheduled` one (nothing is open yet, but
 * ALO-23/pre-edit still wants a destination). `Completed`/`Missed`/etc. are
 * never returned — a member finished their day, or the module gave up on it;
 * either way there is nothing live to edit here.
 */
import { NextResponse } from 'next/server'

import connectDB from '@/lib/db-config'
import { authenticateUser } from '@/lib/auth-utils'
import { Standup } from '@/models/Standup'

export const dynamic = 'force-dynamic'

const PRIORITY_ORDER = ['In_Progress', 'Ready', 'Scheduled'] as const

export async function GET() {
  await connectDB()

  const authResult = await authenticateUser()
  if ('error' in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status })
  }

  const candidates = (await Standup.find({
    organization: authResult.user.organization,
    expectedAttendees: authResult.user.id,
    status: { $in: PRIORITY_ORDER }
  })
    .select('status scheduledStartAt')
    .sort({ scheduledStartAt: 1 })
    .lean()) as any[]

  for (const status of PRIORITY_ORDER) {
    const match = candidates.find((standup) => standup.status === status)
    if (match) {
      return NextResponse.json({ success: true, data: { standupId: String(match._id) } })
    }
  }

  return NextResponse.json({ success: true, data: { standupId: null } })
}
