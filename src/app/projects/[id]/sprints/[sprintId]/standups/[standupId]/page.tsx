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
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'

import { MainLayout } from '@/components/layout/MainLayout'
import { DegradationBanner } from '@/components/standup/DegradationBanner'
import {
  StandupRunScreen,
  type RunScreenApi,
  type RunScreenData
} from '@/components/standup/run/StandupRunScreen'
import {
  DebtLedgerDrawer,
  type LedgerEntryView
} from '@/components/standup/run/DebtLedgerDrawer'
import {
  ReviseEstimateModal,
  type ReviseEstimateTarget
} from '@/components/standup/run/ReviseEstimateModal'
import { ModalOverlay } from '@/components/standup/primitives/ModalOverlay'
import type { VariancePanelMember, VariancePanelRow } from '@/components/standup/run/VariancePanel'
import type { CarryForwardItemRow } from '@/components/standup/run/CarryForwardPanel'
import type { BlockerRow } from '@/components/standup/run/BlockerPanel'
import type { Degradation } from '@/lib/standup/degradation'
import type { DebtPosition } from '@/lib/standup/debt'
import { minutes, type Minutes } from '@/lib/standup/minutes'
import { STANDUP_VERSION_HEADER } from '@/lib/standup/version-header'
import { standupStrings } from '@/lib/standup/strings'

export default function StandupRunPage({
  params
}: {
  params: { id: string; sprintId: string; standupId: string }
}) {
  const { id: projectId, sprintId, standupId } = params

  const [data, setData] = useState<RunScreenData | null>(null)
  const [degradations, setDegradations] = useState<Degradation[]>([])
  const [error, setError] = useState<string | null>(null)

  // Left to the auto-generator, "standups" and this standup's id both get
  // dropped (they immediately follow an id segment), leaving this screen
  // breadcrumb-identical to the plain sprint detail page. The sprint link
  // goes to `/sprints/:id` — the sprint's real route — not the
  // `/projects/:id/sprints/:sprintId` prefix this page's own URL would
  // otherwise suggest, which resolves to nothing. Passed as a prop rather
  // than via `useBreadcrumb()`: that hook's provider lives inside
  // `MainLayout`, below this component in the tree, so a page-level call to
  // it can never reach the provider and silently no-ops.
  const breadcrumbItems = [
    { label: 'Projects', href: '/projects' },
    { label: 'View Project', href: `/projects/${projectId}` },
    { label: 'View Sprint', href: `/sprints/${sprintId}` },
    { label: 'Stand-up' }
  ]

  const load = useCallback(async (): Promise<RunScreenData> => {
    const [
      boardResponse,
      varianceResponse,
      yesterdayResponse,
      carryForwardResponse,
      sprintCloseResponse,
      blockersResponse
    ] = await Promise.all([
      fetch(`/api/standups/${standupId}/allocations`),
      fetch(`/api/standups/${standupId}/variance`),
      fetch(`/api/standups/${standupId}/yesterday`),
      fetch(`/api/standups/${standupId}/carry-forward`),
      fetch(`/api/standups/${standupId}/sprint-close`),
      fetch(`/api/standups/${standupId}/blockers`)
    ])
    if (!boardResponse.ok) throw await asError(boardResponse)

    const boardPayload = await boardResponse.json()
    // Panels 2, 3 and 4 read live rather than block the board: a PM should not
    // lose the whole run screen because yesterday's classification errored.
    const variancePayload = varianceResponse.ok ? await varianceResponse.json() : null
    const yesterdayPayload = yesterdayResponse.ok ? await yesterdayResponse.json() : null
    const carryForwardPayload = carryForwardResponse.ok ? await carryForwardResponse.json() : null
    // Phase 11's final-day panel, on the same terms as the three above.
    const sprintClosePayload = sprintCloseResponse.ok ? await sprintCloseResponse.json() : null
    // Panel 6 (Phase 10), same read-tolerant terms as the panels above.
    const blockersPayload = blockersResponse.ok ? await blockersResponse.json() : null

    return toRunScreenData(
      boardPayload.data ?? boardPayload,
      variancePayload?.data ?? variancePayload,
      yesterdayPayload?.data ?? yesterdayPayload,
      carryForwardPayload?.data ?? carryForwardPayload,
      sprintClosePayload?.data ?? sprintClosePayload,
      blockersPayload?.data ?? blockersPayload
    )
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

  const router = useRouter()
  const [revising, setRevising] = useState<ReviseEstimateTarget | null>(null)
  const [givingReason, setGivingReason] = useState<{
    allocationId: string
    taskKey?: string
    title: string
  } | null>(null)
  const [reasonText, setReasonText] = useState('')
  const [ledger, setLedger] = useState<{
    memberId: string
    memberName: string
    position: DebtPosition
    entries: LedgerEntryView[]
    canWriteOff: boolean
  } | null>(null)
  const [panelNotice, setPanelNotice] = useState<string | null>(null)

  const varianceRows = useMemo(() => data?.variance?.rows ?? [], [data])
  const varianceMembers = useMemo(() => data?.variance?.members ?? [], [data])

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
    refresh: load,

    // Task 1 (RUN-2/3, AC-5). No return value to reconcile — the screen
    // calls its own `refresh()` (this page's `load`) right after, the same
    // way it does on every other mutation outcome, so the board's shape
    // change once `In_Progress` (RUN-26 unlocks members' own rows) is
    // reflected without this function duplicating that fetch.
    async start() {
      await unwrap(
        await mutate(`/api/standups/${standupId}/start`, 'POST', {
          expectedVersion: data?.standupVersion ?? 0
        })
      )
    },

    async completeStandup({ notes, expectedVersion }) {
      return unwrap(
        await mutate(`/api/standups/${standupId}/complete`, 'POST', {
          ...(notes ? { notes } : {}),
          expectedVersion
        })
      )
    },

    // --- Phase 8 -------------------------------------------------------
    async setYesterdayStatus(input) {
      return unwrap(await mutate(`/api/standups/${standupId}/yesterday`, 'PATCH', input))
    },
    async confirmCompleted({ taskIds, expectedVersion }) {
      await mutate(`/api/standups/${standupId}/yesterday`, 'PATCH', {
        taskIds,
        expectedVersion
      })
    },
    async adjustLoggedHours({ taskId, memberId, loggedMinutes, expectedVersion }) {
      return unwrap(
        await mutate(`/api/standups/${standupId}/yesterday`, 'PATCH', {
          taskIds: [taskId],
          onBehalfOf: memberId,
          loggedMinutes,
          expectedVersion
        })
      )
    },
    async addNote({ taskId, memberId, note, expectedVersion }) {
      return unwrap(
        await mutate(`/api/standups/${standupId}/yesterday`, 'PATCH', {
          taskIds: [taskId],
          onBehalfOf: memberId,
          note,
          expectedVersion
        })
      )
    },
    openTask(taskId) {
      router.push(`/tasks/${taskId}`)
    },
    reviseEstimate({ allocationId }) {
      const row = varianceRows.find((candidate) => candidate.allocationId === allocationId)
      if (!row) return
      setRevising({
        allocationId: row.allocationId,
        taskKey: row.taskKey,
        title: row.title,
        memberName: row.memberName,
        originalEstimateMinutes: row.originalEstimateMinutes,
        totalLoggedMinutesOnTask: row.totalLoggedMinutesOnTask,
        taskVarianceMinutes: row.taskVarianceMinutes
      })
    },
    giveNotStartedReason({ allocationId }) {
      const row = varianceRows.find((candidate) => candidate.allocationId === allocationId)
      if (!row) return
      setReasonText('')
      setGivingReason({ allocationId: row.allocationId, taskKey: row.taskKey, title: row.title })
    },
    async viewDebtLedger(memberId) {
      const member = varianceMembers.find((candidate) => candidate.memberId === memberId)
      try {
        const response = await fetch(`/api/standups/${standupId}/debt?memberId=${memberId}`)
        const payload = await unwrap(response)
        setLedger({
          memberId,
          memberName: member?.memberName ?? memberId,
          position: payload.position,
          entries: payload.entries ?? [],
          canWriteOff: true
        })
      } catch {
        setPanelNotice("That member's estimate debt could not be loaded.")
      }
    },

    // --- Phase 9 ---------------------------------------------------------
    async addCarryForwardNote({ itemId, text }) {
      const response = await fetch(`/api/carry-forward/${itemId}/note`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, standupId })
      })
      await unwrap(response)
    },
    async resolveCarryForwardItem({ itemId, resolutionType, comment }) {
      const response = await fetch(`/api/carry-forward/${itemId}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolutionType, comment, standupId })
      })
      await unwrap(response)
    },

    // --- Phase 11 ---------------------------------------------------------
    /**
     * CC-8. The panel's dropdown had nowhere to send its selection until this
     * existed — `RunScreenApi.setTaskDisposition` is optional, so its absence
     * failed silently rather than loudly.
     */
    async setTaskDisposition({ taskId, type }) {
      await unwrap(
        await mutate(
          `/api/standups/${standupId}/sprint-close/tasks/${taskId}`,
          'PATCH',
          { type, expectedVersion: data?.standupVersion ?? 0 }
        )
      )
      setData(await load())
    },

    // --- Task 22 (Phase 10's override path) -------------------------------
    async issueOverride(input) {
      const response = await fetch(`/api/standups/${standupId}/overrides`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input)
      })
      return unwrap(response)
    },

    // --- Task 4 (Panel 6's raise-blocker action) ---------------------------
    /**
     * `POST /api/standups/:id/blockers` returns the created blocker directly
     * (`NextResponse.json(blocker, { status: 201 })`), not the `{ success,
     * data }` envelope its sibling `GET`/`PATCH` use — `unwrap`'s
     * `payload.data ?? payload` fallback already covers that shape, so no
     * special-casing is needed here.
     */
    // No `setData(await load())` here, on purpose — same convention `start()`
    // above documents: `StandupRunScreen`'s own `onSubmitRaiseBlocker` already
    // calls `reload()` (== `api.refresh` == this page's `load`) right after
    // this resolves, so refetching here too would fire the six-endpoint
    // `load()` fan-out twice for one mutation, racing itself.
    async raiseBlocker(input) {
      const response = await fetch(`/api/standups/${standupId}/blockers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input)
      })
      await unwrap(response)
    },

    /**
     * Task 5 (RUN-14..18's resolve path). `PATCH
     * /api/standups/:id/blockers/:blockerId` — unlike its sibling `POST`
     * above, this route DOES wrap its response in the standard `{ success,
     * data }` envelope (`return ok(blocker)`,
     * `blockers/[blockerId]/route.ts:50`). The return value is unused here —
     * `StandupRunScreen`'s own `onSubmitResolveBlocker` calls `reload()` right
     * after this resolves (same convention as `raiseBlocker` above, and
     * `start()`'s docblock), so this function does not duplicate that fetch.
     */
    async resolveBlocker(input) {
      const response = await fetch(
        `/api/standups/${standupId}/blockers/${input.blockerId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: input.status, resolutionNote: input.resolutionNote })
        }
      )
      if (!response.ok) throw await asError(response)
    }
  }

  const saveRevision = useCallback(
    async (input: {
      allocationId: string
      newRemainingMinutes: Minutes
      reason: string
      detail?: string
    }) => {
      if (!data) return
      try {
        await mutate(
          `/api/standups/${standupId}/variance/${input.allocationId}`,
          'POST',
          {
            newRemainingMinutes: input.newRemainingMinutes,
            reason: input.reason,
            ...(input.detail ? { detail: input.detail } : {}),
            expectedVersion: data.standupVersion
          }
        )
        setRevising(null)
        const fresh = await load()
        setData(fresh)
      } catch {
        setPanelNotice('That revision could not be saved.')
      }
    },
    [data, load, standupId]
  )

  const saveReason = useCallback(async () => {
    if (!data || !givingReason) return
    try {
      await mutate(`/api/standups/${standupId}/variance/${givingReason.allocationId}`, 'POST', {
        notStartedReason: reasonText.trim(),
        expectedVersion: data.standupVersion
      })
      setGivingReason(null)
      const fresh = await load()
      setData(fresh)
    } catch {
      setPanelNotice('That reason could not be saved.')
    }
  }, [data, givingReason, load, reasonText, standupId])

  const saveWriteOff = useCallback(
    async (input: { minutes: Minutes; reason: string }) => {
      if (!data || !ledger) return
      try {
        await mutate(`/api/standups/${standupId}/debt`, 'POST', {
          memberId: ledger.memberId,
          minutes: input.minutes,
          reason: input.reason,
          expectedVersion: data.standupVersion
        })
        setLedger(null)
        const fresh = await load()
        setData(fresh)
      } catch {
        setPanelNotice('That write-off could not be saved.')
      }
    },
    [data, ledger, load, standupId]
  )

  return (
    <MainLayout breadcrumbItems={breadcrumbItems}>
      <div className="space-y-5 p-4 md:p-6">
        <DegradationBanner degradations={degradations} />

        {panelNotice && (
          <p role="alert" className="rounded-md border border-destructive/40 p-3 text-sm">
            {panelNotice}
          </p>
        )}

        {error ? (
          <p role="alert" className="rounded-md border border-destructive/40 p-3 text-sm">
            {error}
          </p>
        ) : data ? (
          <StandupRunScreen
            data={data}
            api={api}
            summaryHref={`/projects/${projectId}/sprints/${sprintId}/standups/${standupId}/summary`}
          />
        ) : (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading the stand-up…
          </div>
        )}

        {revising && (
          <ModalOverlay open onClose={() => setRevising(null)} labelledBy="revise-title">
            <ReviseEstimateModal
              target={revising}
              onSave={saveRevision}
              onCancel={() => setRevising(null)}
            />
          </ModalOverlay>
        )}

        {givingReason && (
          <ModalOverlay open onClose={() => setGivingReason(null)} labelledBy="reason-title">
            <div className="flex flex-col gap-3 rounded-lg border border-border bg-background p-4">
              <h3 id="reason-title" className="text-sm font-semibold">
                {standupStrings.run.panel3()} — {givingReason.taskKey ?? givingReason.title}
              </h3>
              <label className="flex flex-col gap-1 text-sm" htmlFor="not-started-reason">
                Why didn’t this happen?
                <textarea
                  id="not-started-reason"
                  value={reasonText}
                  onChange={(event) => setReasonText(event.target.value)}
                  className="min-h-16 rounded-md border border-border bg-background px-2 py-1 text-sm"
                />
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setGivingReason(null)}
                  className="rounded-md border border-border px-3 py-1 text-sm"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!reasonText.trim()}
                  onClick={saveReason}
                  className="rounded-md bg-primary px-3 py-1 text-sm text-primary-foreground disabled:opacity-50"
                >
                  Save
                </button>
              </div>
            </div>
          </ModalOverlay>
        )}

        {ledger && (
          <ModalOverlay open onClose={() => setLedger(null)} labelledBy="debt-ledger-title">
            <DebtLedgerDrawer
              memberName={ledger.memberName}
              position={ledger.position}
              entries={ledger.entries}
              canWriteOff={ledger.canWriteOff}
              onWriteOff={saveWriteOff}
              onClose={() => setLedger(null)}
            />
          </ModalOverlay>
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
function toRunScreenData(
  board: any,
  variance?: any,
  yesterday?: any,
  carryForward?: any,
  sprintClose?: any,
  blockers?: any
): RunScreenData {
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
    // E57/§15.8.2: feeds the run screen's advisory elapsed-time indicator.
    // `board.startedAt` arrives as an ISO string once JSON-serialized by the
    // board GET route, matching `RunScreenData.startedAt`'s type directly.
    startedAt: board.startedAt,
    durationMinutes: board.durationMinutes,
    members: (board.members ?? []).map((member: any) => ({
      memberId: member.memberId,
      name: member.name ?? member.memberId,
      attendance: member.attendance,
      partialMinutes:
        member.partialMinutes === undefined ? undefined : minutes(member.partialMinutes),
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
      (board.pool?.assignedNotPlanned?.length ?? 0),
    ...(variance ? { variance: toVarianceView(variance) } : {}),
    ...(yesterday ? { yesterday: toYesterdayView(yesterday) } : {}),
    ...(carryForward ? { carryForward: toCarryForwardView(carryForward) } : {}),
    ...(sprintClose ? { sprintClose: toSprintCloseView(sprintClose) } : {}),
    ...(blockers ? { blockers: toBlockerRows(blockers) } : {}),
    completionState: board.completionState ?? null
  }
}

/** Panel 6's payload — already row-shaped by `loadBlockerPanel`, so this is a defensive pass-through. */
function toBlockerRows(blockers: any): readonly BlockerRow[] {
  return (Array.isArray(blockers) ? blockers : []).map(
    (row: any): BlockerRow => ({
      blockerId: row.blockerId,
      taskKey: row.taskKey,
      description: row.description ?? '',
      blockerType: row.blockerType,
      severity: row.severity,
      status: row.status,
      owner: row.owner,
      targetResolutionDate: row.targetResolutionDate,
      overdue: row.overdue ?? false,
      freedMinutes: row.freedMinutes === undefined ? undefined : minutes(row.freedMinutes),
      blockerLabel: row.blockerLabel ?? ''
    })
  )
}

/**
 * Phase 11's final-day payload. Minutes rebranded like every other adapter
 * here; the panel itself only renders on `shape === 'final_day'`.
 */
function toSprintCloseView(sprintClose: any): NonNullable<RunScreenData['sprintClose']> {
  return {
    openTasks: (sprintClose.openTasks ?? []).map((task: any) => ({
      taskId: task.taskId,
      taskKey: task.taskKey,
      ownerName: task.ownerName,
      remainingEstimateMinutes: minutes(task.remainingEstimateMinutes ?? 0),
      hoursAvailableTodayMinutes: minutes(task.hoursAvailableTodayMinutes ?? 0),
      projectedOutcome: task.projectedOutcome,
      disposition: task.disposition
    })),
    carryForwardItems: (sprintClose.carryForwardItems ?? []).map((item: any) => ({
      itemId: item.itemId,
      taskKey: item.taskKey,
      status: item.status,
      hasResolution: item.hasResolution ?? false
    }))
  }
}

/** Panel 4's payload — no minutes fields to rebrand, so this is a straight pass-through. */
function toCarryForwardView(carryForward: any): {
  items: CarryForwardItemRow[]
  summary: { totalOpen: number; needingNoteToday: number; escalated: number; resolvedYesterday: number }
} {
  return {
    items: (carryForward.items ?? []).map(
      (item: any): CarryForwardItemRow => ({
        itemId: item.itemId,
        type: item.type,
        status: item.status,
        taskId: item.taskId,
        taskKey: item.taskKey,
        taskTitle: item.taskTitle,
        memberId: item.memberId,
        memberName: item.memberName,
        originDate: item.originDate,
        ageInStandups: item.ageInStandups,
        ageBand: item.ageBand,
        requiresNoteToday: item.requiresNoteToday ?? false,
        notedToday: item.notedToday ?? false,
        tags: item.tags ?? [],
        notes: item.notes ?? [],
        resolution: item.resolution,
        validResolutions: item.validResolutions ?? []
      })
    ),
    summary: {
      totalOpen: carryForward.summary?.totalOpen ?? 0,
      needingNoteToday: carryForward.summary?.needingNoteToday ?? 0,
      escalated: carryForward.summary?.escalated ?? 0,
      resolvedYesterday: carryForward.summary?.resolvedYesterday ?? 0
    }
  }
}

/** Panel 3's payload, minutes rebranded the way every other adapter here does. */
function toVarianceView(
  variance: any
): { rows: VariancePanelRow[]; members: VariancePanelMember[] } {
  return {
    rows: (variance.rows ?? []).map(
      (row: any): VariancePanelRow => ({
        allocationId: row.allocationId,
        taskId: row.taskId,
        taskKey: row.taskKey,
        title: row.title ?? '',
        memberId: row.memberId,
        memberName: row.memberName,
        outcome: row.outcome,
        plannedMinutes: minutes(row.plannedMinutes),
        loggedMinutesOnDay: minutes(row.loggedMinutesOnDay),
        dayVarianceMinutes: minutes(row.dayVarianceMinutes),
        originalEstimateMinutes: minutes(row.originalEstimateMinutes),
        totalLoggedMinutesOnTask: minutes(row.totalLoggedMinutesOnTask),
        taskVarianceMinutes: minutes(row.taskVarianceMinutes),
        requiresRevision: row.requiresRevision ?? false,
        requiresReason: row.requiresReason ?? false,
        ...(row.revisedRemainingMinutes === undefined
          ? {}
          : { revisedRemainingMinutes: minutes(row.revisedRemainingMinutes) }),
        notStartedReason: row.notStartedReason,
        spillChainLength: row.spillChainLength ?? 0,
        chronicSpill: row.chronicSpill ?? false,
        explanation: row.explanation ?? ''
      })
    ),
    members: (variance.members ?? []).map(
      (member: any): VariancePanelMember => ({
        memberId: member.memberId,
        memberName: member.memberName,
        plannedMinutes: minutes(member.plannedMinutes),
        loggedMinutesOnDay: minutes(member.loggedMinutesOnDay),
        dayVarianceMinutes: minutes(member.dayVarianceMinutes),
        outstandingDebtMinutes: minutes(member.outstandingDebtMinutes),
        surplusMinutes: minutes(member.surplusMinutes),
        needingRevision: member.needingRevision ?? 0
      })
    )
  }
}

/** Panel 2's payload, same rebranding treatment. */
function toYesterdayView(yesterday: any): RunScreenData['yesterday'] {
  return {
    buckets: (yesterday.buckets ?? []).map((bucket: any) => ({
      bucket: bucket.bucket,
      rows: (bucket.rows ?? []).map((row: any) => ({
        allocationId: row.allocationId,
        taskId: row.taskId,
        taskKey: row.taskKey,
        title: row.title ?? '',
        memberId: row.memberId,
        memberName: row.memberName,
        previousStatus: row.previousStatus,
        currentStatus: row.currentStatus,
        plannedMinutes: minutes(row.plannedMinutes),
        loggedMinutes: minutes(row.loggedMinutes),
        dayVarianceMinutes: minutes(row.dayVarianceMinutes),
        remainingEstimateMinutes: minutes(row.remainingEstimateMinutes),
        ageInStandups: row.ageInStandups ?? 1,
        unplanned: row.unplanned ?? false
      }))
    })),
    addedAfterCompletion: (yesterday.addedAfterCompletion ?? []).map((row: any) => ({
      allocationId: row.allocationId,
      taskId: row.taskId,
      taskKey: row.taskKey,
      title: row.title ?? '',
      memberId: row.memberId,
      memberName: row.memberName,
      previousStatus: row.previousStatus,
      currentStatus: row.currentStatus,
      plannedMinutes: minutes(row.plannedMinutes),
      loggedMinutes: minutes(row.loggedMinutes),
      dayVarianceMinutes: minutes(row.dayVarianceMinutes),
      remainingEstimateMinutes: minutes(row.remainingEstimateMinutes),
      ageInStandups: row.ageInStandups ?? 1,
      unplanned: row.unplanned ?? false
    })),
    previousStandupId: yesterday.previousStandupId,
    previousStandupDate: yesterday.previousStandupDate
  }
}

export type { Minutes }
