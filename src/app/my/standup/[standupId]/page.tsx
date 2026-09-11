'use client'

/**
 * The member-facing "My Stand-up" route (P11-5 / UI-12).
 *
 * A narrower, single-member sibling of the run screen route
 * (`src/app/projects/[id]/sprints/[sprintId]/standups/[standupId]/page.tsx`):
 * `'use client'`, fetches its own board via `useEffect`, and defines its
 * `MyStandupApi` implementation inline as plain `fetch` calls carrying
 * `X-Standup-Version` through the shared header constant. The viewer's own
 * row is picked out of the board's `members` array using `useAuth()`'s
 * `user.id` — every request the app already makes carries the auth cookie,
 * and the allocations route already scopes writes to the caller server-side
 * (Task 8's ownership check), so the client only has to pick the right row
 * to *display*.
 */
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'

import { MainLayout } from '@/components/layout/MainLayout'
import { useAuth } from '@/hooks/useAuth'
import {
  MyStandupScreen,
  type MyStandupApi,
  type MyStandupMember,
  type MyStandupPoolTask
} from '@/components/standup/my/MyStandupScreen'
import { minutes } from '@/lib/standup/minutes'
import { STANDUP_VERSION_HEADER } from '@/lib/standup/version-header'
import { standupStrings } from '@/lib/standup/strings'
import type { StandupCandidate } from '@/lib/standup/my-standup-candidates'
import type { YesterdayPanelData } from '@/lib/standup/yesterday-service'
import type { VariancePanel } from '@/lib/standup/variance-service'
import type { CarryForwardPanelView } from '@/lib/standup/carry-forward-service'
import type { BlockerPanelRow } from '@/lib/standup/blocker-service'

interface MyStandupBoard {
  standupId: string
  standupVersion: number
  status: string
  date: string
  scheduledStartAt?: string
  durationMinutes?: number
  meetingUrl?: string
  sprintDayNumber?: number
  totalSprintDays?: number
  member: MyStandupMember
  poolTasks: MyStandupPoolTask[]
  allowSelfSelect: boolean
  otherStandupsToday: StandupCandidate[]
  yesterday?: YesterdayPanelData
  variance?: VariancePanel
  carryForward?: CarryForwardPanelView
  blockers?: BlockerPanelRow[]
}

async function safeJson(response: Response): Promise<any> {
  if (!response.ok) return undefined
  try {
    return await response.json()
  } catch {
    return undefined
  }
}

async function fetchOtherStandupsToday(currentStandupId: string): Promise<StandupCandidate[]> {
  try {
    const response = await fetch('/api/my/standup/candidates')
    if (!response.ok) return []
    const payload = await response.json()
    const candidates: StandupCandidate[] = payload.data ?? []
    return candidates.filter((candidate) => candidate.standupId !== currentStandupId)
  } catch {
    return []
  }
}

/** Every request the app already makes carries the auth cookie; this route
 *  scopes writes to the caller server-side regardless (Task 8's ownership
 *  check on the allocations route), so the client only has to pick the right
 *  row to *display* — `useAuth()`'s id is enough for that. */
function toMemberView(member: any): MyStandupMember {
  return {
    memberId: member.memberId,
    name: member.name,
    attendance: member.attendance,
    capacity: member.capacity,
    allocations: (member.allocations ?? []).map((row: any) => ({
      allocationId: row.allocationId,
      taskId: row.taskId,
      taskKey: row.taskKey,
      title: row.title,
      plannedMinutes: minutes(row.plannedMinutes),
      remainingEstimateMinutes: minutes(row.remainingEstimateMinutes),
      source: row.source,
      isBlocked: row.isBlocked,
      excludedFromCapacity: row.excludedFromCapacity,
      pairedDeliberately: row.pairedDeliberately,
      note: row.note,
      detachedReason: row.detachedReason
    }))
  }
}

export default function MyStandupDetailPage({ params }: { params: { standupId: string } }) {
  const { standupId } = params
  const { user, isLoading: authLoading } = useAuth()
  const router = useRouter()
  const [data, setData] = useState<MyStandupBoard | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)

  // The auto-generator treats 'my' and 'standup' as plain path words rather
  // than an entity/id pair, so it produced "Home > My > Standup" — a
  // different shape from every other stand-up screen's "View X" crumbs, and
  // "My" linked to `/my`, a route that doesn't exist. One crumb matching the
  // sidebar's own label is both correct and consistent. Passed as a prop,
  // not via `useBreadcrumb()` — see the run screen page for why that hook
  // silently no-ops when called from a page component.
  const breadcrumbItems = [{ label: 'My Stand-up' }]

  // The auth check runs asynchronously (`useAuth`'s `checkAuth`); until it
  // settles, `user` is indistinguishable from "genuinely no session" — both
  // are `null`. Waiting on `authLoading` before redirecting avoids bouncing a
  // signed-in viewer to /login on first paint, while still sending a viewer
  // with an expired/missing session there instead of spinning forever (this
  // route is not in `middleware.ts`'s protected list, so the client is the
  // only backstop).
  useEffect(() => {
    if (!authLoading && !user) router.push('/login')
  }, [authLoading, user, router])

  useEffect(() => {
    if (!user) return
    let cancelled = false

    ;(async () => {
      try {
        const [boardRes, yesterdayRes, varianceRes, carryForwardRes, blockersRes] =
          await Promise.all([
            fetch(`/api/standups/${standupId}/allocations`),
            fetch(`/api/standups/${standupId}/yesterday`),
            fetch(`/api/standups/${standupId}/variance`),
            fetch(`/api/standups/${standupId}/carry-forward`),
            fetch(`/api/standups/${standupId}/blockers`)
          ])

        if (!boardRes.ok) throw new Error('load failed')
        const boardPayload = await boardRes.json()
        const board = boardPayload.data ?? boardPayload

        const memberRow = (board.members ?? []).find((m: any) => m.memberId === user.id)
        if (!memberRow) {
          if (!cancelled) setError(standupStrings.my.noStandup())
          return
        }

        const otherStandupsToday = await fetchOtherStandupsToday(standupId)

        // Read-tolerant: a failure on any of these four leaves the field
        // `undefined`, and the section that needs it renders its own error
        // state rather than blanking the whole screen (matches the run
        // screen page's own treatment of these same endpoints).
        const yesterday = await safeJson(yesterdayRes)
        const variance = await safeJson(varianceRes)
        const carryForward = await safeJson(carryForwardRes)
        const blockers = await safeJson(blockersRes)

        if (!cancelled) {
          setData({
            standupId: board.standupId,
            standupVersion: board.standupVersion,
            status: board.status,
            date: board.date,
            scheduledStartAt: board.scheduledStartAt,
            durationMinutes: board.durationMinutes,
            meetingUrl: board.meetingUrl,
            sprintDayNumber: board.sprintDayNumber,
            totalSprintDays: board.totalSprintDays,
            member: toMemberView(memberRow),
            poolTasks: board.pool?.unassigned ?? [],
            allowSelfSelect: true,
            otherStandupsToday,
            yesterday: yesterday?.data ?? yesterday,
            variance: variance?.data ?? variance,
            carryForward: carryForward?.data ?? carryForward,
            blockers: blockers?.data ?? blockers
          })
        }
      } catch {
        if (!cancelled) setError('This stand-up could not be loaded.')
      }
    })()

    return () => {
      cancelled = true
    }
    // `user` itself is intentionally not a dependency: `useAuth()`'s periodic
    // 5-minute `checkAuth()` calls `setUser` with a freshly-parsed object of
    // the same id each time, which would otherwise refetch the board every
    // heartbeat. `user?.id` only changes on an actual sign-in/sign-out.
  }, [standupId, user?.id, reloadToken])

  const api: MyStandupApi = {
    async addAllocation(input) {
      const response = await fetch(`/api/standups/${standupId}/allocations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          [STANDUP_VERSION_HEADER]: String(input.expectedVersion)
        },
        body: JSON.stringify({
          memberId: input.memberId,
          taskId: input.taskId,
          selfSelect: input.selfSelect
        })
      })
      if (!response.ok) throw await asError(response)
      const payload = await response.json()
      setReloadToken((token) => token + 1)
      return { standupVersion: payload.data.standupVersion }
    },
    async changeHours(input) {
      const response = await fetch(
        `/api/standups/${standupId}/allocations/${input.allocationId}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            [STANDUP_VERSION_HEADER]: String(input.expectedVersion)
          },
          body: JSON.stringify({ plannedMinutes: input.plannedMinutes })
        }
      )
      if (!response.ok) throw await asError(response)
      const payload = await response.json()
      return { standupVersion: payload.data.standupVersion }
    },
    // No `removeAllocation`: ALO-22's member surface is additions only, the
    // screen renders no control for it, and the DELETE route stays PM-only.
    async updateYesterdayRow(input) {
      const response = await fetch(`/api/standups/${standupId}/yesterday`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          [STANDUP_VERSION_HEADER]: String(input.expectedVersion)
        },
        body: JSON.stringify({
          taskIds: [input.taskId],
          ...(input.status !== undefined ? { status: input.status } : {}),
          ...(input.loggedMinutes !== undefined ? { loggedMinutes: input.loggedMinutes } : {})
        })
      })
      if (!response.ok) throw await asError(response)
      const payload = await response.json()
      return { standupVersion: payload.data.standupVersion, panel: payload.data.panel }
    },
    async raiseBlocker(input) {
      // `POST /blockers` carries no `X-Standup-Version` header — it creates a
      // sibling `StandupBlocker` document and never touches the stand-up's own
      // guarded fields, so RUN-23's optimistic-concurrency check does not apply
      // here (see the route's own doc comment). `expectedVersion` on this
      // method's input exists only to match the other three `api` methods'
      // shape; it is not sent.
      const response = await fetch(`/api/standups/${standupId}/blockers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId: input.taskId,
          linkedAllocationId: input.linkedAllocationId,
          description: input.description,
          blockerType: input.blockerType,
          severity: input.severity
        })
      })
      if (!response.ok) throw await asError(response)
      setReloadToken((token) => token + 1)
    }
  }

  return (
    <MainLayout breadcrumbItems={breadcrumbItems}>
      <div>
        {error ? (
          <p role="alert" className="p-4 text-sm text-destructive">
            {error}
          </p>
        ) : data ? (
          <MyStandupScreen
            standupId={data.standupId}
            standupVersion={data.standupVersion}
            status={data.status}
            date={data.date}
            member={data.member}
            poolTasks={data.poolTasks}
            /* Deliberately unconditional. P11-6 makes the server the real gate:
               `createAllocation` refuses a self-select when the project has
               `allowSelfSelect` off, and the screen now surfaces that refusal
               (`my.addRejected`). A client-side pre-check would be a second,
               fetch-hungry copy of a rule the server already owns — and one
               that could disagree with it. */
            allowSelfSelect
            api={api}
            scheduledStartAt={data.scheduledStartAt}
            viewerTimeZone={
              typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : undefined
            }
            durationMinutes={data.durationMinutes}
            meetingUrl={data.meetingUrl}
            sprintDayNumber={data.sprintDayNumber}
            totalSprintDays={data.totalSprintDays}
            otherStandupsToday={data.otherStandupsToday}
            yesterday={data.yesterday}
            variance={data.variance}
            carryForward={data.carryForward}
            blockers={data.blockers}
          />
        ) : (
          <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {standupStrings.my.title()}…
          </div>
        )}
      </div>
    </MainLayout>
  )
}

/** Turns a failed response into a real `Error`, same shape the reference run
 *  screen page's `asError()` builds — a thrown plain object is truthy enough
 *  for today's callers, but an `Error` is what anything downstream will
 *  eventually expect (a toast, `console.error`, error reporting). */
async function asError(response: Response): Promise<Error & { code?: string }> {
  const payload = await response.json().catch(() => null)
  const error = new Error(payload?.error?.message ?? 'Request failed') as Error & {
    code?: string
  }
  error.code = payload?.error?.code
  return error
}
