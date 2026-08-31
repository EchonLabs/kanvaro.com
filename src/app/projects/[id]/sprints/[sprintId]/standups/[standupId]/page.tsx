'use client'

/**
 * The stand-up run screen route (§15.8).
 *
 * Thin on purpose. It loads the board, adapts the API's payload into the shape
 * `StandupRunScreen` renders, and supplies the five mutations — every one of
 * which sends `X-Standup-Version` through the shared header constant rather
 * than a retyped string, because a mis-spelled header disables RUN-23's guard
 * silently rather than loudly.
 *
 * The degradation banner is first, per §3 rule 1: the module says what it
 * cannot currently do before it shows anything it can.
 */
import { useCallback, useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'

import { MainLayout } from '@/components/layout/MainLayout'
import { DegradationBanner } from '@/components/standup/DegradationBanner'
import {
  StandupRunScreen,
  type RunScreenApi,
  type RunScreenData
} from '@/components/standup/run/StandupRunScreen'
import type { Degradation } from '@/lib/standup/degradation'
import { minutes, type Minutes } from '@/lib/standup/minutes'
import { STANDUP_VERSION_HEADER } from '@/lib/standup/route-helpers'

export default function StandupRunPage({
  params
}: {
  params: { id: string; sprintId: string; standupId: string }
}) {
  const { id: projectId, standupId } = params

  const [data, setData] = useState<RunScreenData | null>(null)
  const [degradations, setDegradations] = useState<Degradation[]>([])
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (): Promise<RunScreenData> => {
    const response = await fetch(`/api/standups/${standupId}/allocations`)
    if (!response.ok) throw await asError(response)

    const payload = await response.json()
    return toRunScreenData(payload.data ?? payload)
  }, [standupId])

  useEffect(() => {
    let cancelled = false

    const boot = async () => {
      try {
        const board = await load()
        if (!cancelled) setData(board)
      } catch {
        if (!cancelled) setError('This stand-up could not be loaded.')
        return
      }

      const health = await fetch(`/api/standup/health?projectId=${projectId}`)
      if (health.ok && !cancelled) {
        const payload = await health.json()
        setDegradations(payload.degradations ?? payload.data?.degradations ?? [])
      }
    }

    void boot()
    return () => {
      cancelled = true
    }
  }, [load, projectId])

  const api: RunScreenApi = {
    async setAttendance(input) {
      return unwrap(
        await mutate(`/api/standups/${standupId}/attendance`, 'PATCH', input)
      )
    },
    async changeHours({ allocationId, plannedMinutes, expectedVersion }) {
      return unwrap(
        await mutate(
          `/api/standups/${standupId}/allocations/${allocationId}`,
          'PATCH',
          { plannedMinutes, expectedVersion }
        )
      )
    },
    async removeAllocation({ allocationId, expectedVersion }) {
      return unwrap(
        await mutate(
          `/api/standups/${standupId}/allocations/${allocationId}`,
          'DELETE',
          { expectedVersion }
        )
      )
    },
    async addAllocation(input) {
      return unwrap(
        await mutate(`/api/standups/${standupId}/allocations`, 'POST', input)
      )
    },
    async reassignDetached(input) {
      return unwrap(
        await mutate(`/api/standups/${standupId}/attendance`, 'POST', input)
      )
    },
    refresh: load
  }

  return (
    <MainLayout>
      <div className="mx-auto w-full max-w-7xl space-y-5 p-4 md:p-6">
        <DegradationBanner degradations={degradations} />

        {error ? (
          <p role="alert" className="rounded-md border border-destructive/40 p-3 text-sm">
            {error}
          </p>
        ) : data ? (
          <StandupRunScreen data={data} api={api} />
        ) : (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading the stand-up…
          </div>
        )}
      </div>
    </MainLayout>
  )
}

/**
 * Sends a mutation with the version guard attached.
 *
 * `expectedVersion` travels as a header rather than in the body so a `DELETE`
 * — which has no body by convention — is guarded exactly like the others.
 */
async function mutate(
  url: string,
  method: string,
  body: Record<string, unknown> & { expectedVersion: number }
): Promise<Response> {
  const { expectedVersion, ...rest } = body

  return fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      [STANDUP_VERSION_HEADER]: String(expectedVersion)
    },
    ...(method === 'DELETE' ? {} : { body: JSON.stringify(rest) })
  })
}

/** Turns a failed response into the catalogue error the screen switches on. */
async function asError(response: Response): Promise<Error & { code?: string }> {
  const payload = await response.json().catch(() => null)
  const error = new Error(payload?.error?.message ?? 'Request failed') as Error & {
    code?: string
  }
  error.code = payload?.error?.code
  return error
}

async function unwrap(response: Response): Promise<any> {
  if (!response.ok) throw await asError(response)
  const payload = await response.json()
  return payload.data ?? payload
}

/** Adapts the board payload into the screen's view model. */
function toRunScreenData(board: any): RunScreenData {
  return {
    standupId: board.standupId,
    standupVersion: board.standupVersion,
    date: board.date,
    sprintDayNumber: board.sprintDayNumber ?? 0,
    totalSprintDays: board.totalSprintDays ?? 0,
    shape: board.shape,
    status: board.status ?? 'In_Progress',
    facilitatorName: board.facilitatorName ?? '',
    meetingUrl: board.meetingUrl,
    ceremoniesConsumeCapacity: board.ceremoniesConsumeCapacity,
    members: (board.members ?? []).map((member: any) => ({
      memberId: member.memberId,
      name: member.name ?? member.memberId,
      attendance: member.attendance,
      capacity: member.capacity,
      allocations: (member.allocations ?? []).map((row: any) => ({
        allocationId: String(row._id ?? row.allocationId),
        taskId: String(row.task ?? row.taskId),
        taskKey: row.taskKey,
        title: row.title ?? '',
        plannedMinutes: minutes(row.plannedMinutes),
        remainingEstimateMinutes: minutes(row.remainingEstimateMinutes ?? 0),
        source: row.source,
        isBlocked: row.isBlocked ?? false,
        excludedFromCapacity: row.excludedFromCapacity ?? false,
        detachedReason: row.detachedReason,
        pairedDeliberately: row.pairedDeliberately ?? false,
        note: row.note
      }))
    })),
    pool: {
      unassigned: board.pool?.unassigned ?? [],
      assignedNotPlanned: board.pool?.assignedNotPlanned ?? []
    },
    poolTotal:
      (board.pool?.unassigned?.length ?? 0) +
      (board.pool?.assignedNotPlanned?.length ?? 0)
  }
}

export type { Minutes }
