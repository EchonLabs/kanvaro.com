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

interface MyStandupBoard {
  standupId: string
  standupVersion: number
  status: string
  date: string
  member: MyStandupMember
  poolTasks: MyStandupPoolTask[]
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
  const { user } = useAuth()
  const [board, setBoard] = useState<MyStandupBoard | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    if (!user) return
    let cancelled = false

    ;(async () => {
      try {
        const response = await fetch(`/api/standups/${standupId}/allocations`)
        if (!response.ok) throw new Error('load failed')
        const payload = await response.json()
        const data = payload.data ?? payload

        const memberRow = (data.members ?? []).find((m: any) => m.memberId === user.id)
        if (!memberRow) {
          if (!cancelled) setError(standupStrings.my.noStandup())
          return
        }

        if (!cancelled) {
          setBoard({
            standupId: data.standupId,
            standupVersion: data.standupVersion,
            status: data.status,
            date: data.date,
            member: toMemberView(memberRow),
            poolTasks: data.pool?.unassigned ?? []
          })
        }
      } catch {
        if (!cancelled) setError('This stand-up could not be loaded.')
      }
    })()

    return () => {
      cancelled = true
    }
  }, [standupId, user, reloadToken])

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
      const payload = await response.json()
      if (!response.ok) throw payload.error
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
      const payload = await response.json()
      if (!response.ok) throw payload.error
      return { standupVersion: payload.data.standupVersion }
    },
    async removeAllocation(input) {
      const response = await fetch(
        `/api/standups/${standupId}/allocations/${input.allocationId}`,
        {
          method: 'DELETE',
          headers: { [STANDUP_VERSION_HEADER]: String(input.expectedVersion) }
        }
      )
      const payload = await response.json()
      if (!response.ok) throw payload.error
      return { standupVersion: payload.data.standupVersion }
    }
  }

  return (
    <MainLayout>
      <div className="mx-auto w-full max-w-2xl">
        {error ? (
          <p role="alert" className="p-4 text-sm text-destructive">
            {error}
          </p>
        ) : board ? (
          <MyStandupScreen
            standupId={board.standupId}
            standupVersion={board.standupVersion}
            status={board.status}
            date={board.date}
            member={board.member}
            poolTasks={board.poolTasks}
            allowSelfSelect
            api={api}
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
