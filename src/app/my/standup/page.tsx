import Link from 'next/link'
import { redirect } from 'next/navigation'

import { MainLayout } from '@/components/layout/MainLayout'
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
      <MainLayout breadcrumbItems={[{ label: 'My Stand-up' }]}>
        <div className="flex flex-col items-start gap-3 p-6">
          <h1 className="text-lg font-semibold text-[var(--apple-label)]">
            {standupStrings.my.title()}
          </h1>
          <p className="text-sm text-[var(--apple-label)]">{standupStrings.my.noStandup()}</p>
          <p className="text-sm text-[var(--apple-secondary-label)]">
            {standupStrings.my.noStandupHint()}
          </p>
          <Link
            href="/projects"
            className="text-sm font-medium text-[var(--apple-system-blue)] hover:underline"
          >
            {standupStrings.my.noStandupProjectsLink()}
          </Link>
        </div>
      </MainLayout>
    )
  }

  redirect(`/my/standup/${String(match._id)}`)
}
