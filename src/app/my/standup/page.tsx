import Link from 'next/link'
import { redirect } from 'next/navigation'
import { CalendarOff } from 'lucide-react'

import { MainLayout } from '@/components/layout/MainLayout'
import { Button } from '@/components/ui/Button'
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

  const { findOpenStandupCandidates } = await import('@/lib/standup/my-standup-candidates')
  const candidates = await findOpenStandupCandidates({
    organizationId: String(authResult.user.organization),
    userId: authResult.user.id
  })
  const match = candidates[0]

  if (!match) {
    return (
      <MainLayout breadcrumbItems={[{ label: 'My Stand-up' }]}>
        <div className="flex flex-col items-center justify-center gap-1 px-8 py-20 text-center">
          <div className="mb-4 rounded-2xl bg-[var(--apple-quaternary-fill)] p-4 text-[var(--apple-tertiary-label)]">
            <CalendarOff className="h-6 w-6" strokeWidth={1.75} />
          </div>
          <h1 className="text-[17px] font-semibold text-[var(--apple-label)]">
            {standupStrings.my.noStandup()}
          </h1>
          <p className="max-w-sm text-[15px] text-[var(--apple-secondary-label)]">
            {standupStrings.my.noStandupHint()}
          </p>
          <Button asChild variant="outline" size="sm" className="mt-4">
            <Link href="/projects">{standupStrings.my.noStandupProjectsLink()}</Link>
          </Button>
        </div>
      </MainLayout>
    )
  }

  redirect(`/my/standup/${match.standupId}`)
}
