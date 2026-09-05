import { redirect } from 'next/navigation'

import connectDB from '@/lib/db-config'
import { authenticateUser } from '@/lib/auth-utils'
import { standupStrings } from '@/lib/standup/strings'

/**
 * UI-12. The N1 reminder's one-click destination. Resolves the caller's
 * open stand-up server-side via the same priority `GET /api/my/standup`
 * uses, then hands off to the client screen that does the actual editing —
 * mirroring how `/projects/[id]/sprints/[sprintId]/standups/[standupId]/page.tsx`
 * already splits a server page from its client run-screen component.
 */
export default async function MyStandupPage() {
  await connectDB()

  const authResult = await authenticateUser()
  if ('error' in authResult) {
    redirect('/login')
  }

  const { Standup } = await import('@/models/Standup')
  const candidates = (await Standup.find({
    organization: authResult.user.organization,
    expectedAttendees: authResult.user.id,
    status: { $in: ['In_Progress', 'Ready', 'Scheduled'] }
  })
    .select('status scheduledStartAt')
    .sort({ scheduledStartAt: 1 })
    .lean()) as any[]

  const byPriority = ['In_Progress', 'Ready', 'Scheduled']
  const match = byPriority
    .map((status) => candidates.find((c) => c.status === status))
    .find((c) => c !== undefined)

  if (!match) {
    return (
      <div className="p-6 text-sm text-muted-foreground">{standupStrings.my.noStandup()}</div>
    )
  }

  redirect(`/my/standup/${String(match._id)}`)
}
