'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, RefreshCw, Users, Video, Zap } from 'lucide-react'

import type { QuickAddTask } from '@/components/standup/primitives/QuickAddCombobox'
import { AttendancePanel, type ReassignPromptView } from './AttendancePanel'
import { CarryForwardPanel, type CarryForwardItemRow, type CarryForwardPanelData } from './CarryForwardPanel'
import { BlockerPanel, type BlockerRow } from './BlockerPanel'
import { VariancePanel, type VariancePanelMember, type VariancePanelRow } from './VariancePanel'
import { YesterdayPanel, type YesterdayPanelApi } from './YesterdayPanel'
import { CapacityBoard, type BoardAllocationView } from './CapacityBoard'
import { CompletionPanel } from './CompletionPanel'
import { OverrideModal, type OverridableType, type OverrideModalAffectedMember, type OverrideModalSubmitInput } from './OverrideModal'
import { RaiseBlockerModal, type RaiseBlockerSubmitInput } from './RaiseBlockerModal'
import { ResolveBlockerDialog, type ResolveBlockerSubmitInput } from './ResolveBlockerDialog'
import { ModalOverlay } from '@/components/standup/primitives/ModalOverlay'
import { UnassignedPool } from './UnassignedPool'
import { SprintCloseReadinessPanel } from './SprintCloseReadinessPanel'
import { useStandupShortcuts } from './useStandupShortcuts'
import {
  evaluateFinalDayCarryForwardDisposition,
  type OpenTaskReadiness
} from '@/lib/standup/sprint-close'
import { formatDualTimezone } from '@/lib/standup/timezone'
import type { PoolTask } from '@/lib/standup/allocation'
import type { BucketedRows, YesterdayRow } from '@/lib/standup/yesterday'
import type { AttendanceStatus, CapacityBreakdown } from '@/lib/standup/capacity'
import {
  blockingFailures,
  evaluateCompletionChecks,
  type CheckCarryForwardItem,
  type CheckMember,
  type CheckVarianceRow,
  type CompletionCheckResult
} from '@/lib/standup/completion-checks'
import { formatMinutesAsHours, type Minutes } from '@/lib/standup/minutes'
import { isOwnRowReadOnly } from '@/lib/standup/own-row'
import {
  filterOverriddenFailures,
  OVERRIDE_TABLE,
  type IssuedOverrideForReconciliation
} from '@/lib/standup/override'
import { standupStrings } from '@/lib/standup/strings'

/**
 * checkId -> override type, inverted from `OVERRIDE_TABLE` (§14.2's table).
 * Only the four overridable hard checks this screen can build an
 * `OverrideModal` for appear here — CC-2/CC-4/CC-5/CC-7 are never
 * overridable, and the rest of the table names types with no `checkId`
 * (e.g. `complete_with_absent_facilitator_role`) that Panel 7 does not emit.
 */
const CHECK_ID_TO_OVERRIDE_TYPE: Partial<Record<string, OverridableType>> = Object.fromEntries(
  Object.entries(OVERRIDE_TABLE)
    .filter(([, entry]) => entry.overridable && entry.checkId)
    .map(([type, entry]) => [entry.checkId as string, type as OverridableType])
)

interface OverrideContext {
  type: OverridableType
  affected: OverrideModalAffectedMember[]
  affectedMemberIds: string[]
  affectedTaskIds: string[]
}

/**
 * Builds `OverrideModal`'s props and the override submission's
 * `affectedMemberIds`/`affectedTaskIds` from one failing check's `entities`.
 *
 * CC-1/CC-6 map directly — their entities already carry
 * `{memberId, name, gapMinutes, effectiveMinutes, allocatedMinutes}`, exactly
 * `OverrideModalAffectedMember`'s shape (`completion-checks.ts`, `cc1`/`cc6`).
 *
 * CC-3/CC-10 do not: their entities are task-scoped
 * (`{allocationId, taskKey, memberId, needs, taskId?}` and
 * `{taskId, key, memberIds}` respectively), and `override.ts`'s
 * `entityIsCovered` resolves both by `affectedTaskIds`, not member id. So the
 * modal's member list here is display-only (gap/effective/allocated default
 * to 0 — those numbers are not meaningful for a skipped re-estimate or a
 * duplicate allocation), built by looking member names up on `members`; what
 * actually unblocks the check on resubmission is `affectedTaskIds`.
 *
 * Returns `null` when the check cannot be attributed to any of the four
 * overridable hard checks, or — for CC-3/CC-10 — when none of its entities
 * carry a `taskId` at all. `filterOverriddenFailures`'s own `entityIsCovered`
 * already documents that an entity with no `taskId` "can never be resolved";
 * this mirrors that by declining to offer an override that could not
 * possibly lift the block, rather than submitting one that silently does
 * nothing.
 */
function deriveOverrideContext(
  check: CompletionCheckResult,
  members: readonly RunScreenMember[]
): OverrideContext | null {
  const type = CHECK_ID_TO_OVERRIDE_TYPE[check.checkId]
  if (!type) return null

  const nameFor = (memberId: string) =>
    members.find((member) => member.memberId === memberId)?.name ?? memberId

  if (check.checkId === 'CC-1' || check.checkId === 'CC-6') {
    const affected = check.entities.map((entity) => ({
      memberId: String(entity.memberId),
      name: String(entity.name ?? entity.memberId),
      gapMinutes: Number(entity.gapMinutes ?? 0),
      effectiveMinutes: Number(entity.effectiveMinutes ?? 0),
      allocatedMinutes: Number(entity.allocatedMinutes ?? 0)
    }))
    return {
      type,
      affected,
      affectedMemberIds: affected.map((member) => member.memberId),
      affectedTaskIds: []
    }
  }

  if (check.checkId === 'CC-10') {
    const taskIds = Array.from(
      new Set(
        check.entities
          .map((entity) => entity.taskId)
          .filter((taskId): taskId is string => typeof taskId === 'string')
      )
    )
    if (taskIds.length === 0) return null

    const memberIds = Array.from(
      new Set(
        check.entities.flatMap((entity) =>
          Array.isArray(entity.memberIds) ? (entity.memberIds as string[]) : []
        )
      )
    )
    const affected = memberIds.map((memberId) => ({
      memberId,
      name: nameFor(memberId),
      gapMinutes: 0,
      effectiveMinutes: 0,
      allocatedMinutes: 0
    }))

    return { type, affected, affectedMemberIds: memberIds, affectedTaskIds: taskIds }
  }

  if (check.checkId === 'CC-3') {
    const taskIds = Array.from(
      new Set(
        check.entities
          .map((entity) => entity.taskId)
          .filter((taskId): taskId is string => typeof taskId === 'string')
      )
    )
    if (taskIds.length === 0) return null

    const memberIds = Array.from(
      new Set(
        check.entities
          .map((entity) => entity.memberId)
          .filter((memberId): memberId is string => typeof memberId === 'string')
      )
    )
    const affected = memberIds.map((memberId) => ({
      memberId,
      name: nameFor(memberId),
      gapMinutes: 0,
      effectiveMinutes: 0,
      allocatedMinutes: 0
    }))

    return { type, affected, affectedMemberIds: memberIds, affectedTaskIds: taskIds }
  }

  return null
}

/**
 * The stand-up run screen (§15.8) — "the screen the module lives or dies on".
 *
 * Six of its seven panels are built: 1 (attendance) and 5/7 (allocation,
 * completion) from Phase 7, 2 (yesterday) and 3 (variance) from Phase 8, and
 * 4 (carry forward) from Phase 9. Panel 6 (blockers) renders as a **stub
 * naming the phase that owns it**. That is deliberate and is the same
 * decision as `not_evaluated` completion checks: a screen missing a step
 * looks finished, and a PM cannot tell a panel nobody built from a panel with
 * nothing in it.
 *
 * Two behaviours carry most of the risk here.
 *
 * **RUN-25 — optimistic edits, visible rollback.** A row's hours change on
 * screen before the server answers, because a meeting cannot wait for a round
 * trip per stepper click. When the server refuses, the row goes back *and a
 * toast says so*. A silent revert is strictly worse than no optimism: the PM
 * believes the change stuck and finds out at completion.
 *
 * **RUN-23/RUN-26 — the version and the lock.** Every write carries the version
 * the client last read, and the server's answer replaces it; a `STALE_STANDUP`
 * refusal reloads rather than guessing. A member editing their own row is
 * locked out the moment the stand-up moves to `In_Progress`.
 *
 * Presence avatars are descoped (register row 4). Polling refresh is kept.
 */

export interface RunScreenMember {
  memberId: string
  name: string
  attendance?: AttendanceStatus
  partialMinutes?: Minutes
  capacity: CapacityBreakdown
  allocations: BoardAllocationView[]
}

export interface RunScreenData {
  standupId: string
  standupVersion: number
  date: string
  sprintDayNumber: number
  totalSprintDays: number
  shape: 'day_one' | 'mid_sprint' | 'final_day'
  status: string
  facilitatorName: string
  meetingUrl?: string
  ceremoniesConsumeCapacity: boolean
  members: RunScreenMember[]
  pool: { unassigned: PoolTask[]; assignedNotPlanned: PoolTask[] }
  poolTotal: number
  /** Panel 2. Absent on a day-one stand-up, which has no yesterday. */
  yesterday?: {
    buckets: BucketedRows[]
    addedAfterCompletion: YesterdayRow[]
    previousStandupId?: string
    previousStandupDate?: string
  }
  /** Panel 3. Absent for the same reason. */
  variance?: { rows: VariancePanelRow[]; members: VariancePanelMember[] }
  /** Panel 4 (Phase 9). Absent for the same reason as Panels 2 and 3. */
  carryForward?: CarryForwardPanelData
  /**
   * Panel 6 (Phase 10). No stand-up shape omits blockers the way day one
   * omits yesterday, so this defaults to an empty list rather than being
   * optional like the panels above — the panel itself renders the empty
   * state when there is nothing to show.
   */
  blockers?: readonly BlockerRow[]
  /** ALO-20/21. Present only on a day-one stand-up. */
  dayOne?: {
    assignedTasks: number
    totalTasks: number
    placedMinutes: Minutes
    sprintCapacityMinutes: Minutes
    stillUnassigned?: number
  }
  /**
   * Task 17 / R2. Non-null when a previous `/complete` call died mid-saga.
   * Read from the board GET on every load — not only after a failed
   * retry — so the interrupted banner shows before the PM clicks Complete
   * again.
   */
  completionState?: { runId: string; lastCompletedStep: string | null } | null
  /** Phase 11. Present only on `final_day`. */
  sprintClose?: {
    openTasks: OpenTaskReadiness[]
    carryForwardItems: import('@/lib/standup/sprint-close').CarryForwardDispositionRow[]
  }
  /**
   * NFR-20. All three optional and only rendered together — when any is
   * absent the header falls back to the plain `date` string unchanged.
   */
  scheduledStartAt?: string
  viewerTimeZone?: string
  projectTimeZone?: string
  /**
   * E57/§15.8.2. Both optional so a board payload that has not been wired
   * to carry them yet still compiles — the elapsed-time indicator below
   * only renders when both are present and the stand-up is `In_Progress`.
   */
  startedAt?: string
  durationMinutes?: number
}

export interface RunScreenApi {
  setAttendance(input: {
    memberId: string
    state: AttendanceStatus
    partialMinutes?: Minutes
    reason?: string
    expectedVersion: number
  }): Promise<{ standupVersion: number; reassignPrompt?: ReassignPromptView | null }>
  changeHours(input: {
    allocationId: string
    plannedMinutes: Minutes
    expectedVersion: number
  }): Promise<{ standupVersion: number }>
  removeAllocation(input: {
    allocationId: string
    expectedVersion: number
  }): Promise<{ standupVersion: number }>
  addAllocation(input: {
    memberId: string
    taskId: string
    expectedVersion: number
  }): Promise<{ standupVersion: number }>
  reassignDetached(input: {
    fromMemberId: string
    toMemberId: string
    expectedVersion: number
  }): Promise<{ standupVersion: number }>
  refresh(): Promise<RunScreenData>

  /**
   * RUN-2/3, AC-5 (Task 1). Transitions a `Ready` stand-up to `In_Progress`.
   * Optional so a caller that has not wired it yet still compiles — the
   * button below only renders when it is present.
   */
  start?(): Promise<void>

  /**
   * RUN-19..22 (Task 17). Resuming an interrupted completion is the same
   * call — the server reads its own checkpoint and continues from there.
   */
  completeStandup(input: {
    notes?: string
    expectedVersion: number
  }): Promise<{ status: string; summaryId: string }>

  // --- Phase 8 -------------------------------------------------------------
  // Optional so a caller that has not wired Panels 2 and 3 yet still compiles;
  // the panels only render when their data is present anyway.
  /** RUN-10 — change a task's status from yesterday's row, on somebody's behalf. */
  setYesterdayStatus?(input: {
    taskIds: string[]
    status: string
    onBehalfOf?: string
    expectedVersion: number
  }): Promise<{ standupVersion: number }>
  /** RUN-13 — clear the completed bucket in one action. */
  confirmCompleted?(input: { taskIds: string[]; expectedVersion: number }): Promise<void>
  /** RUN-10 — adjust that member's logged hours for the day, in minutes. */
  adjustLoggedHours?(input: {
    taskId: string
    memberId: string
    loggedMinutes: Minutes
    expectedVersion: number
  }): Promise<{ standupVersion: number }>
  /** RUN-10 — a one-line note on the row, on somebody's behalf. */
  addNote?(input: {
    taskId: string
    memberId?: string
    note: string
    expectedVersion: number
  }): Promise<{ standupVersion: number }>
  openTask?(taskId: string): void
  reviseEstimate?(row: { allocationId: string; taskId: string }): void
  giveNotStartedReason?(row: { allocationId: string; taskId: string }): void
  viewDebtLedger?(memberId: string): void

  // --- Phase 9 ---------------------------------------------------------------
  addCarryForwardNote?(input: { itemId: string; text: string }): Promise<void>
  resolveCarryForwardItem?(input: {
    itemId: string
    resolutionType: string
    comment?: string
  }): Promise<void>

  // --- Task 22 (Phase 10's override path, wired from the run screen) --------
  /**
   * `POST /api/standups/:id/overrides`. Returns the created override — the
   * screen tracks its `type`/`affectedMemberIds`/`affectedTaskIds` locally in
   * `overridesIssued` so `filterOverriddenFailures` can lift the block
   * immediately, without a board-payload change carrying override history.
   */
  issueOverride?(input: {
    type: string
    affectedMemberIds: string[]
    affectedTaskIds: string[]
    reasonCode: string
    justification: string
    memberAcknowledged: boolean
  }): Promise<IssuedOverrideForReconciliation>

  // --- Phase 11 --------------------------------------------------------------
  setTaskDisposition?(input: { taskId: string; type: string }): Promise<void>

  /**
   * RUN-14..18 (Task 4). `POST /api/standups/:id/blockers`. Optional so a
   * caller that has not wired it yet still compiles — Panel 6's "Raise
   * blocker" button only opens `RaiseBlockerModal` when this is present.
   */
  raiseBlocker?(input: RaiseBlockerSubmitInput): Promise<void>

  /**
   * RUN-14..18 (Task 5). `PATCH /api/standups/:id/blockers/:blockerId`.
   * Optional so a caller that has not wired it yet still compiles — Panel
   * 6's "Resolve" button only opens `ResolveBlockerDialog` when this is
   * present.
   */
  resolveBlocker?(input: ResolveBlockerSubmitInput): Promise<void>
}

/** Mirrors `StandupSchedule.tsx`'s `STATUS_TONE`/pill convention so a
 * stand-up's status reads the same color on the schedule hub and here. */
const STATUS_PILL: Record<string, string> = {
  Scheduled: 'bg-[var(--apple-tertiary-fill)] text-[var(--apple-secondary-label)]',
  Ready: 'bg-blue-50 dark:bg-blue-950/30 text-[var(--apple-system-blue)]',
  In_Progress: 'bg-blue-50 dark:bg-blue-950/30 text-[var(--apple-system-blue)]',
  Completed: 'bg-emerald-50 dark:bg-emerald-950/30 text-[var(--apple-system-green)]',
  Reopened: 'bg-orange-50 dark:bg-orange-950/30 text-[var(--apple-system-orange)]'
}

export interface RunScreenViewer {
  userId: string
  /** True for a PM. False for a team member looking at their own row. */
  canAllocateOthers: boolean
}

export interface StandupRunScreenProps {
  data: RunScreenData
  api: RunScreenApi
  viewer?: RunScreenViewer
  locale?: string
  /**
   * §15.13's read-only summary lived behind no link anywhere in the app once
   * a stand-up was `Completed` — this screen is the one place every route
   * into a completed stand-up (the schedule hub, `/my/standup`, a direct
   * link) already passes through, so it is also the one place a link out to
   * the summary needs to exist. Optional so a caller that has not wired a
   * route for it yet still compiles.
   */
  summaryHref?: string
}

export function StandupRunScreen({ data, api, viewer, locale, summaryHref }: StandupRunScreenProps) {
  const [board, setBoard] = useState(data)

  /**
   * The stand-up version, in a ref rather than state.
   *
   * It is a concurrency token, not display data — nothing renders it — and it
   * has to be read at *call* time. Held in state it is captured by each
   * mutation callback's closure at render time, so two edits in quick
   * succession both send the version the first one started with, and the second
   * is rejected as stale even though the client did everything right. That is a
   * bug the tests caught and it would have been near-impossible to diagnose
   * from a report: it only appears when the PM is working fast.
   */
  const versionRef = useRef(data.standupVersion)
  const [notice, setNotice] = useState<string | null>(null)
  const [prompt, setPrompt] = useState<ReassignPromptView | null>(null)
  const [selectedMemberId, setSelectedMemberId] = useState(
    data.members[0]?.memberId ?? null
  )

  const isDayOne = board.shape === 'day_one'

  /**
   * RUN-26. A team member may edit their own row while the stand-up is `Ready`
   * and not once it has started. A PM is never locked out — they are the one
   * running it.
   */
  const readOnly = isOwnRowReadOnly({
    status: board.status,
    // No viewer means the caller did not say who is looking — the pre-existing
    // behaviour treats that as "not locked", which is what `true` produces here.
    canAllocateOthers: viewer === undefined ? true : viewer.canAllocateOthers
  })

  const reload = useCallback(async () => {
    const fresh = await api.refresh()
    setBoard(fresh)
    versionRef.current = fresh.standupVersion
  }, [api])

  /**
   * Runs an optimistic mutation: apply locally, call the server, and on failure
   * put the local state back with a visible notice.
   */
  const optimistic = useCallback(
    async (
      apply: (current: RunScreenData) => RunScreenData,
      call: (expectedVersion: number) => Promise<{ standupVersion: number }>
    ) => {
      let previous = board
      setBoard((current) => {
        previous = current
        return apply(current)
      })
      setNotice(null)

      try {
        const result = await call(versionRef.current)
        versionRef.current = result.standupVersion
        return result
      } catch (error) {
        setBoard(previous)

        if ((error as { code?: string })?.code === 'STALE_STANDUP') {
          // Somebody else's write landed first. Reloading is the only honest
          // answer: the client's view of the day is now fiction.
          setNotice(standupStrings.run.staleReload())
          await reload()
          return null
        }

        setNotice(standupStrings.run.editRejected())
        return null
      }
    },
    [board, reload]
  )

  const onChangeHours = useCallback(
    (allocationId: string, plannedMinutes: Minutes) => {
      void optimistic(
        (current) => ({
          ...current,
          members: current.members.map((member) => ({
            ...member,
            allocations: member.allocations.map((row) =>
              row.allocationId === allocationId ? { ...row, plannedMinutes } : row
            )
          }))
        }),
        (expectedVersion) =>
          api.changeHours({ allocationId, plannedMinutes, expectedVersion })
      )
    },
    [api, optimistic]
  )

  const onRemove = useCallback(
    (allocationId: string) => {
      void optimistic(
        (current) => ({
          ...current,
          members: current.members.map((member) => ({
            ...member,
            allocations: member.allocations.filter(
              (row) => row.allocationId !== allocationId
            )
          }))
        }),
        (expectedVersion) => api.removeAllocation({ allocationId, expectedVersion })
      )
    },
    [api, optimistic]
  )

  /**
   * Adding is not applied optimistically.
   *
   * The server assigns the allocation id and the ALO-5 default hours, so an
   * optimistic row would have to invent both and then be reconciled — and a row
   * whose id changes underneath the PM's stepper is worse than a moment's wait.
   */
  const onAdd = useCallback(
    async (memberId: string, taskId: string) => {
      setNotice(null)
      try {
        const result = await api.addAllocation({
          memberId,
          taskId,
          expectedVersion: versionRef.current
        })
        versionRef.current = result.standupVersion
        await reload()
      } catch (error) {
        if ((error as { code?: string })?.code === 'STALE_STANDUP') {
          setNotice(standupStrings.run.staleReload())
          await reload()
          return
        }
        setNotice(standupStrings.run.editRejected())
      }
    },
    [api, reload]
  )

  /**
   * Panel 2's actions, adapted to the run screen's version-carrying API.
   *
   * The panel owns the optimistic rollback (RUN-25); this only has to reject so
   * it has something to roll back to, and reload afterwards so the version and
   * the variance rows move together.
   */
  const yesterdayApi: YesterdayPanelApi = useMemo(
    () => ({
      async setStatus(input) {
        if (!api.setYesterdayStatus) throw new Error('Not wired')
        const result = await api.setYesterdayStatus({
          ...input,
          expectedVersion: versionRef.current
        })
        versionRef.current = result.standupVersion
        await reload()
      },
      async confirmCompleted(input) {
        await api.confirmCompleted?.({ ...input, expectedVersion: versionRef.current })
        await reload()
      },
      async adjustLoggedHours(input) {
        if (!api.adjustLoggedHours) throw new Error('Not wired')
        const result = await api.adjustLoggedHours({
          ...input,
          expectedVersion: versionRef.current
        })
        versionRef.current = result.standupVersion
        await reload()
      },
      async addNote(input) {
        if (!api.addNote) throw new Error('Not wired')
        const result = await api.addNote({ ...input, expectedVersion: versionRef.current })
        versionRef.current = result.standupVersion
      },
      openTask(taskId) {
        api.openTask?.(taskId)
      },
      reviseEstimate(row) {
        api.reviseEstimate?.({ allocationId: row.allocationId ?? '', taskId: row.taskId })
      }
    }),
    [api, reload]
  )

  const onSetAttendance = useCallback(
    async (input: {
      memberId: string
      state: AttendanceStatus
      partialMinutes?: Minutes
      reason?: string
    }) => {
      setNotice(null)
      try {
        const result = await api.setAttendance({
          ...input,
          expectedVersion: versionRef.current
        })
        versionRef.current = result.standupVersion
        setPrompt(result.reassignPrompt ?? null)
        await reload()
      } catch (error) {
        if ((error as { code?: string })?.code === 'STALE_STANDUP') {
          setNotice(standupStrings.run.staleReload())
          await reload()
          return
        }
        setNotice(standupStrings.run.editRejected())
      }
    },
    [api, reload]
  )

  const onReassign = useCallback(
    async (fromMemberId: string, toMemberId: string) => {
      try {
        const result = await api.reassignDetached({
          fromMemberId,
          toMemberId,
          expectedVersion: versionRef.current
        })
        versionRef.current = result.standupVersion
        setPrompt(null)
        await reload()
      } catch {
        setNotice(standupStrings.run.editRejected())
      }
    },
    [api, reload]
  )

  const checks = useMemo(
    () =>
      evaluateCompletionChecks({
        shape: board.shape,
        members: board.members.map(
          (member): CheckMember => ({
            memberId: member.memberId,
            name: member.name,
            attendance: member.attendance,
            capacity: member.capacity,
            allocations: member.allocations.map((row) => ({
              allocationId: row.allocationId,
              taskId: row.taskId,
              taskKey: row.taskKey,
              memberId: member.memberId,
              plannedMinutes: row.plannedMinutes,
              remainingEstimateMinutes: row.remainingEstimateMinutes,
              isBlocked: row.isBlocked,
              excludedFromCapacity: row.excludedFromCapacity,
              detachedReason: row.detachedReason,
              pairedDeliberately: row.pairedDeliberately
            }))
          })
        ),
        // Day one has no yesterday to load: `[]` says CC-3 was asked and passes
        // trivially, where `undefined` would say nobody asked (not_evaluated).
        variance: board.variance
          ? board.variance.rows.map(
              (row): CheckVarianceRow => ({
                allocationId: row.allocationId,
                taskId: row.taskId,
                taskKey: row.taskKey,
                memberId: row.memberId,
                requiresRevision: row.requiresRevision,
                requiresReason: row.requiresReason,
                revisedRemainingMinutes: row.revisedRemainingMinutes,
                notStartedReason: row.notStartedReason
              })
            )
          : board.shape === 'day_one'
            ? []
            : undefined,
        // CC-4. Day one has no register yet either — `[]` says it was asked
        // and trivially passes, the same convention `variance` uses above.
        carryForward: board.carryForward
          ? board.carryForward.items.map(
              (item): CheckCarryForwardItem => ({
                itemId: item.itemId,
                taskKey: item.taskKey,
                memberId: item.memberId,
                requiresNoteToday: item.requiresNoteToday,
                notedToday: item.notedToday
              })
            )
          : board.shape === 'day_one'
            ? []
            : undefined,
        openTasks: board.sprintClose?.openTasks
      }),
    [board]
  )

  /**
   * Task 22. Overrides issued this session, tracked client-side from each
   * successful `POST /overrides` response body (which carries `type`,
   * `affectedMemberIds`, `affectedTaskIds`). `board` has no field carrying
   * previously-issued overrides — the board-view payload was never extended
   * to include them — so this local list, not a reload, is what actually
   * narrows `blocking`.
   */
  const [overridesIssued, setOverridesIssued] = useState<IssuedOverrideForReconciliation[]>([])
  const blocking = useMemo(
    () => filterOverriddenFailures(blockingFailures(checks), overridesIssued),
    [checks, overridesIssued]
  )

  /**
   * CFW-9. Shape-gated exactly like `cc8()` and the panel's own render
   * condition: the register only has to be clear on the sprint's last day, and
   * an ungated memo would disable Complete on a mid-sprint board with nothing
   * on screen explaining why.
   */
  const carryForwardCloseFailures = useMemo(
    () =>
      board.shape === 'final_day' && board.sprintClose
        ? evaluateFinalDayCarryForwardDisposition(board.sprintClose.carryForwardItems).offenders
        : [],
    [board.shape, board.sprintClose]
  )

  const [overridingCheck, setOverridingCheck] = useState<CompletionCheckResult | null>(null)
  const overrideContext = useMemo(
    () => (overridingCheck ? deriveOverrideContext(overridingCheck, board.members) : null),
    [overridingCheck, board.members]
  )

  const onOverride = useCallback(
    (check: CompletionCheckResult) => {
      const context = deriveOverrideContext(check, board.members)
      if (!context) {
        setNotice(standupStrings.run.overrideUnavailable())
        return
      }
      setNotice(null)
      setOverridingCheck(check)
    },
    [board.members]
  )

  const onCancelOverride = useCallback(() => setOverridingCheck(null), [])

  /**
   * Task 4 (RUN-14..18). Mirrors `overridingCheck`'s show/hide pattern above
   * — a plain boolean is enough since, unlike the override modal, raising a
   * blocker needs no derived context from the current board.
   */
  const [raisingBlocker, setRaisingBlocker] = useState(false)

  const onSubmitRaiseBlocker = useCallback(
    async (input: RaiseBlockerSubmitInput) => {
      if (!api.raiseBlocker) return
      setNotice(null)
      try {
        await api.raiseBlocker(input)
        setRaisingBlocker(false)
        // Same fix as `onSubmitResolveBlocker` below, same reason: `board` is
        // this screen's own state, populated once from the `data` prop at
        // mount and never re-synced from it afterwards, so the newly raised
        // blocker never actually appears in `board.blockers` unless something
        // calls `reload()`.
        await reload()
      } catch {
        // Mirrors `onSubmitOverride`'s failure handling: the modal stays open
        // with the PM's in-progress input intact rather than losing it to a
        // silently closed form.
        setNotice(standupStrings.blocker.raiseFailed())
      }
    },
    [api, reload]
  )

  /**
   * Task 5 (RUN-14..18). Sibling to `raisingBlocker` above — a blocker id
   * rather than a plain boolean since `ResolveBlockerDialog` needs to know
   * which row it is closing.
   */
  const [resolvingBlockerId, setResolvingBlockerId] = useState<string | null>(null)

  const onSubmitResolveBlocker = useCallback(
    async (input: ResolveBlockerSubmitInput) => {
      if (!api.resolveBlocker) return
      setNotice(null)
      try {
        await api.resolveBlocker(input)
        setResolvingBlockerId(null)
        // `board` is this screen's own state, populated at mount from the
        // `data` prop and never re-synced from it afterwards (see the
        // `versionRef` docblock above) — every other mutation on this screen
        // that needs the board to reflect a server-side change calls
        // `reload()` for exactly that reason (`onSubmitOverride`,
        // `CarryForwardPanel`'s `resolve`/`addNote` wrappers below). Without
        // this, the just-resolved blocker's `status` never changes in local
        // state, so `openBlockers`'s filter below would have nothing to
        // filter and the row would keep showing until an unrelated reload.
        await reload()
      } catch {
        // Mirrors `onSubmitRaiseBlocker`'s failure handling: the dialog stays
        // open with the PM's in-progress note intact rather than losing it to
        // a silently closed form.
        setNotice(standupStrings.blocker.resolveFailed())
      }
    },
    [api, reload]
  )

  const onSubmitOverride = useCallback(
    async (input: OverrideModalSubmitInput) => {
      if (!overridingCheck || !overrideContext || !api.issueOverride) return
      setNotice(null)
      try {
        const created = await api.issueOverride({
          type: overrideContext.type,
          affectedMemberIds: overrideContext.affectedMemberIds,
          affectedTaskIds: overrideContext.affectedTaskIds,
          reasonCode: input.reasonCode,
          justification: input.justification,
          memberAcknowledged: input.memberAcknowledged
        })
        setOverridesIssued((current) => [...current, created])
        setOverridingCheck(null)
        setNotice(standupStrings.run.overrideSuccess())
        await reload()
      } catch {
        // Deliberately left open on failure (INVALID_JUSTIFICATION,
        // OVERRIDE_NOT_PERMITTED, ...) — the PM's in-progress reason and
        // justification text stay put so they can fix it, rather than losing
        // the input to a silently closed modal.
        setNotice(standupStrings.run.overrideFailed())
      }
    },
    [api, overridingCheck, overrideContext, reload]
  )

  const [starting, setStarting] = useState(false)

  /**
   * RUN-2/3, AC-5 (Task 1). Mirrors `onComplete`'s error handling below:
   * a `PLANNING_GATE_NOT_PASSED` refusal gets its own named notice — a PM
   * clicking Start on an unplanned sprint needs to know *why*, not just that
   * it failed — everything else falls back to the generic failure notice.
   */
  const onStart = useCallback(async () => {
    if (!api.start) return
    setStarting(true)
    setNotice(null)
    try {
      await api.start()
      setNotice(standupStrings.run.startSuccess())
      await reload()
    } catch (error) {
      const code = (error as { code?: string })?.code
      if (code === 'PLANNING_GATE_NOT_PASSED') {
        setNotice(standupStrings.run.startPlanningGateFailed())
      } else if (code === 'STALE_STANDUP') {
        setNotice(standupStrings.run.staleReload())
        await reload()
      } else {
        setNotice(standupStrings.run.startFailed())
      }
    } finally {
      setStarting(false)
    }
  }, [api, reload])

  /**
   * E57/§15.8.2. A live, client-side-only elapsed-time indicator — advisory
   * only, per D-6, and it must never disable or gate the Complete button or
   * any other action (see `completionPanelDisabled`/`completeDisabled`
   * below, which never reference this). Ticks once a second only while the
   * stand-up is actually `In_Progress` with a recorded `startedAt`; there is
   * no point ticking a `Completed` or `Scheduled` stand-up.
   */
  const timerActive =
    board.status === 'In_Progress' && Boolean(board.startedAt)
  const [nowMs, setNowMs] = useState(() => Date.now())

  useEffect(() => {
    if (!timerActive) return
    setNowMs(Date.now())
    const interval = setInterval(() => setNowMs(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [timerActive, board.startedAt])

  const elapsedSeconds = timerActive
    ? Math.max(0, Math.floor((nowMs - new Date(board.startedAt as string).getTime()) / 1000))
    : 0
  const elapsedLabel = `${String(Math.floor(elapsedSeconds / 60)).padStart(2, '0')}:${String(
    elapsedSeconds % 60
  ).padStart(2, '0')}`
  const durationMinutes = board.durationMinutes ?? 0
  const elapsedRatio =
    durationMinutes > 0 ? elapsedSeconds / 60 / durationMinutes : 0
  const timerTone =
    elapsedRatio >= 1.3 ? 'timer-red' : elapsedRatio >= 1 ? 'timer-amber' : 'timer-neutral'
  const timerToneClass =
    timerTone === 'timer-red'
      ? 'border-red-500 text-red-600'
      : timerTone === 'timer-amber'
        ? 'border-amber-500 text-amber-600'
        : 'border-border text-muted-foreground'

  const [completing, setCompleting] = useState(false)

  /**
   * RUN-19..22. `STALE_STANDUP` reloads with a toast, matching every other
   * mutation on this screen. `COMPLETION_CHECKS_FAILED` surfaces the
   * failures Panel 7 already lists in detail — the panel's own fail rows
   * already carry each message, RUN-19's jump link, and (Task 22) an
   * Override action for the ones §14.2 allows a PM to knowingly accept.
   * `STANDUP_ALREADY_COMPLETED` reloads so a stale button click resolves to
   * the board's real (now completed) state rather than a dead-end toast.
   */
  const onComplete = useCallback(async () => {
    setCompleting(true)
    setNotice(null)
    try {
      await api.completeStandup({ expectedVersion: versionRef.current })
      setNotice(standupStrings.run.completeSuccess())
      await reload()
    } catch (error) {
      const code = (error as { code?: string })?.code
      if (code === 'STALE_STANDUP') {
        setNotice(standupStrings.run.staleReload())
        await reload()
      } else if (code === 'STANDUP_ALREADY_COMPLETED') {
        setNotice(standupStrings.run.completeAlreadyDone())
        await reload()
      } else if (code === 'COMPLETION_CHECKS_FAILED') {
        setNotice(standupStrings.run.completeChecksFailed())
      } else {
        setNotice(standupStrings.run.completeFailed())
      }
    } finally {
      setCompleting(false)
    }
  }, [api, reload])

  /**
   * §15.17 (Task 14). `completionPanelDisabled` is the single source of truth
   * for the `disabled` prop passed to `<CompletionPanel>` below — `Ctrl/Cmd+Enter`
   * derives `completeDisabled` from that same variable (adding
   * `blocking.length > 0`, which `CompletionPanel` itself ORs in internally)
   * rather than retyping the condition, so the keyboard shortcut and the
   * visible Complete button can never silently drift apart.
   */
  const completionPanelDisabled =
    readOnly || completing || carryForwardCloseFailures.length > 0
  const completeDisabled = completionPanelDisabled || blocking.length > 0

  useStandupShortcuts({
    'jump-panel-1': () => document.getElementById('panel-1')?.scrollIntoView(),
    'jump-panel-2': () => document.getElementById('panel-2')?.scrollIntoView(),
    'jump-panel-3': () => document.getElementById('panel-3')?.scrollIntoView(),
    'jump-panel-4': () => document.getElementById('panel-4')?.scrollIntoView(),
    'jump-panel-5': () => document.getElementById('panel-5')?.scrollIntoView(),
    'jump-panel-6': () => document.getElementById('panel-6')?.scrollIntoView(),
    'jump-panel-7': () => document.getElementById('panel-7')?.scrollIntoView(),
    'attempt-complete': () => {
      if (!completeDisabled) void onComplete()
    }
  })

  const selectedMember = board.members.find(
    (member) => member.memberId === selectedMemberId
  )

  const presentCount = board.members.filter(
    (member) => member.attendance === 'present' || member.attendance === 'partial'
  ).length

  /**
   * Task 5 fix. `BlockerPanel` itself renders every row it is given — its own
   * `status !== 'resolved' && status !== 'wont_resolve'` check (line 89) only
   * gates whether the row's Resolve button appears, not whether the row
   * itself is shown. So a just-resolved blocker would otherwise sit in Panel
   * 6 forever, sans button, once the board reloads. Filtering here (the call
   * site) rather than inside `BlockerPanel` keeps that component able to
   * render closed rows for some other future context without this screen's
   * "open" list needing to change.
   */
  const openBlockers = (board.blockers ?? []).filter(
    (row) => row.status !== 'resolved' && row.status !== 'wont_resolve'
  )

  const poolTasks: QuickAddTask[] = [
    ...board.pool.unassigned,
    ...board.pool.assignedNotPlanned
  ].map((task) => ({
    taskId: task.taskId,
    key: task.key,
    title: task.title,
    remainingEstimateMinutes: task.remainingEstimateMinutes
  }))

  /**
   * Important 5 of the final-review fix wave. `poolTasks` above is `board.pool
   * .unassigned + assignedNotPlanned` — i.e. tasks with NO live allocation on
   * this stand-up (`partitionPool`, `lib/standup/allocation.ts`). A blocker is
   * naturally raised against work someone IS actively doing, which the pool
   * structurally cannot contain, so `RaiseBlockerModal`'s "linked task"
   * dropdown could never actually offer the task the member is blocked on,
   * and `linkedAllocationId` could never be populated — RUN-15/16's capacity-
   * exclusion-on-block and auto-clear-on-resolve never fired from the UI at
   * all. Re-sourced from every member's live allocations instead, each of
   * which already carries a real `allocationId`.
   */
  const allocatedBlockerTasks = board.members.flatMap((member) =>
    member.allocations.map((allocation) => ({
      taskId: allocation.taskId,
      key: allocation.taskKey,
      title: allocation.title,
      allocationId: allocation.allocationId
    }))
  )

  /**
   * §15.8.10: on day one the pool takes the primary position and the board
   * is secondary but always visible.
   */
  const panelFive = (
    <section id="panel-5" aria-labelledby="panel-5-heading" className="flex flex-col gap-3">
      <h3 id="panel-5-heading" className="apple-section-label text-[var(--apple-tertiary-label)]">
        {standupStrings.run.panel5()}
      </h3>

      {isDayOne && board.dayOne && (
        <div className="flex flex-col gap-1 rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card p-3 text-[13px]">
          <p data-testid="day-one-progress">
            {standupStrings.run.dayOneProgress({
              assigned: board.dayOne.assignedTasks,
              totalTasks: board.dayOne.totalTasks,
              placed: formatMinutesAsHours(board.dayOne.placedMinutes, { locale }),
              capacity: formatMinutesAsHours(board.dayOne.sprintCapacityMinutes, {
                locale
              })
            })}
          </p>
          {/* ALO-21 — soft. It never blocks completion. */}
          {board.dayOne.stillUnassigned ? (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              {standupStrings.run.dayOneUnassignedWarning({
                count: board.dayOne.stillUnassigned
              })}
            </p>
          ) : null}
        </div>
      )}

      <div
        className={
          isDayOne ? 'grid gap-4 lg:grid-cols-[2fr_1fr]' : 'grid gap-4 lg:grid-cols-[1fr_2fr]'
        }
      >
        <UnassignedPool
          unassigned={board.pool.unassigned}
          assignedNotPlanned={board.pool.assignedNotPlanned}
          selectedMember={
            selectedMember
              ? {
                  memberId: selectedMember.memberId,
                  name: selectedMember.name,
                  gapMinutes: selectedMember.capacity.gapMinutes
                }
              : null
          }
          totalCount={board.poolTotal}
          readOnly={readOnly}
          locale={locale}
          onAdd={(memberId, task) => void onAdd(memberId, task.taskId)}
        />

        <div onFocusCapture={() => setSelectedMemberId(selectedMemberId)}>
          <CapacityBoard
            members={board.members}
            poolTasks={poolTasks}
            ceremoniesConsumeCapacity={board.ceremoniesConsumeCapacity}
            readOnly={readOnly}
            locale={locale}
            onChangeHours={onChangeHours}
            onRemove={onRemove}
            onQuickAdd={(memberId, task) => void onAdd(memberId, task.taskId)}
            onReassignStranded={(memberId) => {
              setSelectedMemberId(memberId)
              setPrompt({
                memberId,
                taskCount: board.members
                  .find((member) => member.memberId === memberId)
                  ?.allocations.filter((row) => row.detachedReason).length ?? 0,
                totalMinutes:
                  board.members.find((member) => member.memberId === memberId)?.capacity
                    .strandedMinutes ?? (0 as Minutes),
                tasks: []
              })
            }}
          />
        </div>
      </div>
    </section>
  )

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3 border-b border-[var(--apple-separator)] pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <Zap className="h-7 w-7 shrink-0 text-[var(--apple-system-blue)]" strokeWidth={1.5} />
            <div>
              <h2 className="text-[20px] sm:text-[22px] font-bold tracking-tight text-[var(--apple-label)]">
                {standupStrings.run.dayOf({
                  day: board.sprintDayNumber,
                  total: board.totalSprintDays
                })}
              </h2>
              <p className="text-[13px] text-[var(--apple-secondary-label)] mt-0.5">
                {board.scheduledStartAt && board.viewerTimeZone && board.projectTimeZone
                  ? formatDualTimezone({
                      instant: new Date(board.scheduledStartAt),
                      viewerTimeZone: board.viewerTimeZone,
                      projectTimeZone: board.projectTimeZone
                    })
                  : board.date}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {(board.status === 'Ready' || board.status === 'Scheduled') && api.start && (
              <button
                type="button"
                onClick={() => void onStart()}
                disabled={starting}
                className="apple-transition rounded-[var(--apple-radius-md)] bg-[var(--apple-system-blue)] px-3.5 h-9 text-[13px] font-semibold text-white hover:opacity-90 disabled:opacity-40"
              >
                {standupStrings.run.start()}
              </button>
            )}
            {board.status === 'Completed' && summaryHref && (
              <a
                href={summaryHref}
                className="apple-transition inline-flex items-center rounded-[var(--apple-radius-md)] bg-[var(--apple-system-blue)] px-3.5 h-9 text-[13px] font-semibold text-white hover:opacity-90"
              >
                {standupStrings.run.viewSummary()}
              </a>
            )}
            {board.meetingUrl && (
              <a
                href={board.meetingUrl}
                className="apple-transition inline-flex items-center gap-1.5 rounded-[var(--apple-radius-md)] border border-[var(--apple-separator)] px-3 h-9 text-[13px] font-medium text-[var(--apple-label)] hover:bg-[var(--apple-quaternary-fill)]"
              >
                <Video className="h-3.5 w-3.5" strokeWidth={1.75} />
                {standupStrings.run.joinCall()}
              </a>
            )}
            <button
              type="button"
              onClick={() => void reload()}
              className="apple-transition inline-flex items-center gap-1.5 rounded-[var(--apple-radius-md)] border border-[var(--apple-separator)] px-3 h-9 text-[13px] font-medium text-[var(--apple-label)] hover:bg-[var(--apple-quaternary-fill)]"
            >
              <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.75} />
              {standupStrings.run.refresh()}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-[13px] text-[var(--apple-secondary-label)]">
          <span
            className={`apple-section-label rounded-full px-2.5 py-1 ${STATUS_PILL[board.status] ?? 'bg-[var(--apple-tertiary-fill)] text-[var(--apple-secondary-label)]'}`}
          >
            {standupStrings.schedule.status[board.status] ?? board.status}
          </span>

          {timerActive && (
            <span
              data-testid="standup-timer"
              data-tone={timerTone}
              aria-label={standupStrings.run.elapsedTime({
                elapsed: elapsedLabel,
                duration: durationMinutes
              })}
              className={`font-apple-mono rounded-full border px-2.5 py-1 text-xs tabular-nums ${timerToneClass}`}
            >
              {standupStrings.run.elapsedTime({ elapsed: elapsedLabel, duration: durationMinutes })}
            </span>
          )}

          <span>{standupStrings.run.facilitator({ name: board.facilitatorName })}</span>

          <span className="inline-flex items-center gap-1">
            <Users className="h-3.5 w-3.5" strokeWidth={1.75} />
            {standupStrings.run.presentOf({
              present: presentCount,
              total: board.members.length
            })}
          </span>
        </div>
      </header>

      <nav
        aria-label="Stand-up panels"
        className="flex flex-wrap gap-1.5 text-xs text-[var(--apple-secondary-label)]"
      >
        <JumpLink id={1} label={standupStrings.run.panel1()} />
        {!isDayOne && (
          <>
            <JumpLink id={2} label={standupStrings.run.panel2()} />
            <JumpLink id={3} label={standupStrings.run.panel3()} />
            <JumpLink id={4} label={standupStrings.run.panel4()} />
          </>
        )}
        <JumpLink id={5} label={standupStrings.run.panel5()} />
        <JumpLink id={6} label={standupStrings.run.panel6()} />
        <JumpLink id={7} label={standupStrings.run.panel7()} />
      </nav>

      {/* RUN-25's rollback notice, and the RUN-23 reload. `status` rather than
          `alert`: it reports what already happened, it does not interrupt. */}
      {notice && (
        <p
          role="status"
          className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-[var(--apple-tertiary-fill)] px-3 py-2 text-[13px] text-[var(--apple-label)]"
        >
          {notice}
        </p>
      )}

      {readOnly && (
        <p className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-[var(--apple-tertiary-fill)] px-3 py-2 text-[13px] text-[var(--apple-secondary-label)]">
          {standupStrings.run.lockedForMembers()}
        </p>
      )}

      {/* R2's blocking banner: a previous /complete call died mid-saga.
          Non-dismissible — resuming (a plain re-POST) is the only way past
          it, so there is nothing for a dismiss action to safely do. */}
      {board.completionState && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--apple-radius-lg)] border border-[var(--apple-system-red)]/30 bg-[var(--apple-system-red)]/[0.06] px-3 py-2"
        >
          <span className="flex items-center gap-2 text-[13px] text-[var(--apple-system-red)]">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {standupStrings.run.completionInterruptedBanner()}
          </span>
          <button
            type="button"
            onClick={() => void onComplete()}
            disabled={completing}
            className="apple-transition rounded-[var(--apple-radius-md)] bg-[var(--apple-system-red)] px-3 h-8 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-40"
          >
            {standupStrings.run.completionInterruptedResume()}
          </button>
        </div>
      )}

      {isDayOne && panelFive}

      <AttendancePanel
        members={board.members}
        prompt={prompt}
        onSetAttendance={onSetAttendance}
        onReassign={onReassign}
        onDismissPrompt={() => setPrompt(null)}
        disabled={readOnly}
        locale={locale}
      />

      {/* Panels 2 and 3 explain yesterday, so day one — which has no
          yesterday — shows neither (§15.8.10). */}
      {!isDayOne && board.yesterday && (
        <YesterdayPanel
          data={board.yesterday}
          api={yesterdayApi}
          disabled={readOnly}
          locale={locale}
        />
      )}

      {!isDayOne && board.variance && (
        <VariancePanel
          data={board.variance}
          onRevise={(row) => api.reviseEstimate?.(row)}
          onGiveReason={(row) => api.giveNotStartedReason?.(row)}
          onViewLedger={(memberId) => api.viewDebtLedger?.(memberId)}
          disabled={readOnly}
          locale={locale}
        />
      )}

      {!isDayOne && board.carryForward && (
        <CarryForwardPanel
          data={board.carryForward}
          api={{
            async addNote(input) {
              if (!api.addCarryForwardNote) return
              await api.addCarryForwardNote(input)
              await reload()
            },
            async resolve(input) {
              if (!api.resolveCarryForwardItem) return
              await api.resolveCarryForwardItem(input)
              await reload()
            }
          }}
          disabled={readOnly}
        />
      )}

      {!isDayOne && panelFive}

      {board.shape === 'final_day' && board.sprintClose && (
        <SprintCloseReadinessPanel
          openTasks={board.sprintClose.openTasks}
          carryForwardOffenders={carryForwardCloseFailures}
          disabled={readOnly}
          locale={locale}
          onSetDisposition={(taskId, type) => {
            void (async () => {
              try {
                await api.setTaskDisposition?.({ taskId, type })
                await reload()
              } catch {
                setNotice(standupStrings.run.editRejected())
              }
            })()
          }}
        />
      )}

      <BlockerPanel
        blockers={openBlockers}
        today={board.date}
        onRaise={() => setRaisingBlocker(true)}
        onResolve={(blockerId) => setResolvingBlockerId(blockerId)}
      />

      {raisingBlocker && (
        <ModalOverlay open onClose={() => setRaisingBlocker(false)} labelledBy="raise-blocker-title">
          <RaiseBlockerModal
            tasks={allocatedBlockerTasks}
            onCancel={() => setRaisingBlocker(false)}
            onSubmit={(input) => void onSubmitRaiseBlocker(input)}
          />
        </ModalOverlay>
      )}

      {resolvingBlockerId && (
        <ModalOverlay open onClose={() => setResolvingBlockerId(null)} labelledBy="resolve-blocker-title">
          <ResolveBlockerDialog
            blockerId={resolvingBlockerId}
            onCancel={() => setResolvingBlockerId(null)}
            onConfirm={(input) => void onSubmitResolveBlocker(input)}
          />
        </ModalOverlay>
      )}

      <CompletionPanel
        checks={checks}
        blocking={blocking}
        disabled={completionPanelDisabled}
        onComplete={() => void onComplete()}
        onOverride={onOverride}
      />

      {/* Task 22. `overrideContext` is null whenever `overridingCheck` is —
          and also, for CC-3/CC-10, when no entity carried a resolvable
          `taskId` — so this only ever renders with props the modal can act
          on. */}
      {overridingCheck && overrideContext && (
        <ModalOverlay open onClose={onCancelOverride} labelledBy="override-modal-title">
          <OverrideModal
            type={overrideContext.type}
            affected={overrideContext.affected}
            onCancel={onCancelOverride}
            onSubmit={(input) => void onSubmitOverride(input)}
          />
        </ModalOverlay>
      )}
    </div>
  )
}

function JumpLink({ id, label }: { id: number; label: string }) {
  return (
    <a
      href={`#panel-${id}`}
      className="apple-transition rounded-full border border-[var(--apple-separator)] px-2.5 py-1 text-[var(--apple-secondary-label)] hover:bg-[var(--apple-quaternary-fill)] hover:text-[var(--apple-label)]"
    >
      {id}. {label}
    </a>
  )
}
