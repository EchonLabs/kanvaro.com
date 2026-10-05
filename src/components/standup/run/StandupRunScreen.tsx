'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Info, RefreshCw, Video, XCircle } from 'lucide-react'

import type { QuickAddTask } from '@/components/standup/primitives/QuickAddCombobox'
import { AttendancePanel, type ReassignPromptView } from './AttendancePanel'
import { CarryForwardPanel, type CarryForwardItemRow, type CarryForwardPanelData } from './CarryForwardPanel'
import { BlockerPanel, type BlockerRow } from './BlockerPanel'
import { VariancePanel, type VariancePanelMember, type VariancePanelRow } from './VariancePanel'
import { YesterdayPanel, type YesterdayPanelApi } from './YesterdayPanel'
import {
  MemberAllocationRow,
  MemberRunAlerts,
  MemberRunDetails,
  type BoardAllocationView,
  type BoardMemberView
} from './CapacityBoard'
import { CompletionPanel } from './CompletionPanel'
import { OverrideModal, type OverridableType, type OverrideModalAffectedMember, type OverrideModalSubmitInput } from './OverrideModal'
import { RaiseBlockerModal, type RaiseBlockerSubmitInput } from './RaiseBlockerModal'
import { ResolveBlockerDialog, type ResolveBlockerSubmitInput } from './ResolveBlockerDialog'
import { ModalOverlay } from '@/components/standup/primitives/ModalOverlay'
import { UnassignedPool } from './UnassignedPool'
import { SprintCloseReadinessPanel } from './SprintCloseReadinessPanel'
import { useStandupShortcuts } from './useStandupShortcuts'
import {
  PlanBanner,
  planButtonClass,
  planFieldClass,
  planInsetClass,
  planPillClass,
  type PlanPillTone
} from '../planning/ui'

/** A section heading above a group of cards. */
const SECTION_TITLE_CLASSES = 'apple-type-headline font-semibold text-[var(--plan-text)]'
const SECTION_SUBTITLE_CLASSES = 'apple-type-subheadline text-[var(--plan-muted)]'
import { cn } from '@/lib/utils'
import {
  evaluateFinalDayCarryForwardDisposition,
  type OpenTaskReadiness
} from '@/lib/standup/sprint-close'
import { useNotify } from '@/lib/notify'
import type { AssignableMemberView, AssignableTaskView } from '../shared/AssignableTask'
import { formatDualTimezone } from '@/lib/standup/timezone'
import type { PoolTask } from '@/lib/standup/allocation'
import type { BucketedRows, YesterdayRow } from '@/lib/standup/yesterday'
import type { AttendanceStatus, CapacityBreakdown } from '@/lib/standup/capacity'
import {
  blockingFailures,
  type CompletionCheckResult
} from '@/lib/standup/completion-checks'
import { formatMinutesAsHours, type Minutes } from '@/lib/standup/minutes'
import { isOwnRowReadOnly } from '@/lib/standup/own-row'
import {
  filterOverriddenFailures,
  OVERRIDE_TABLE,
  validateJustification,
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
const EMPTY_CHECKS: readonly CompletionCheckResult[] = []

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
  /** Profile photo; the avatar falls back to initials without one. */
  avatarUrl?: string
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
  /**
   * The sprint this stand-up belongs to, shown once in Panel 5's header
   * rather than on every task card. Optional so a caller that has not wired
   * it yet still compiles — the board GET does not carry a sprint name today,
   * and the header simply omits the line when it is absent.
   */
  sprintName?: string
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
  /**
   * `GET /api/standups/:id/checks`'s full eleven-check evaluation. `undefined`
   * only when that fetch failed — see `checksUnavailable` in
   * `StandupRunScreen`, which keeps Complete from being pressable blind in
   * that case rather than defaulting to an empty (falsely all-clear) list.
   */
  checks?: readonly CompletionCheckResult[]
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

  /**
   * `POST /api/standups/:id/backfill` (E49). Runs the completion saga against
   * a `Missed` stand-up instead of an `In_Progress` one — the only way a
   * `Missed` day ever reaches `Completed`. Intentionally requires no
   * `X-Standup-Version` header (the route's own docblock explains why), so
   * this takes no `expectedVersion`, unlike `completeStandup` above. Optional
   * so the header's Backfill action only renders once wired.
   */
  backfill?(input: {
    notes?: string
    /**
     * SCH-14's run payload. A `Missed` stand-up has no attendance recorded,
     * and CC-7 is hard and non-overridable, so without this the backfill
     * always 422s on its own gate.
     */
    attendance?: { memberId: string; state: AttendanceStatus }[]
    /**
     * Ruling 21. CC-1 is hard but *overridable*, and a missed day had nothing
     * allocated, so it can never pass retroactively. Backfill is not exempted
     * from it; instead the facilitator attests to it here and the service
     * issues a real `under_allocation` override, exactly as the live
     * completion path does. Omitting this leaves the check blocking.
     */
    acknowledgedChecks?: { checkId: string; justification: string }[]
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

/** Mirrors `StandupSchedule.tsx`'s `STATUS_TONE` convention so a stand-up's
 * status reads the same color on the schedule hub and here. */
const STATUS_TONE: Record<string, PlanPillTone> = {
  Scheduled: 'neutral',
  Ready: 'accent',
  In_Progress: 'accent',
  Completed: 'success',
  Reopened: 'warning',
  // Three of the model's eight legal statuses previously fell back to the
  // generic neutral styling, which reads identically to `Scheduled` — a PM
  // who lands here on a `Missed` day had no visual signal anything was wrong.
  Missed: 'danger',
  Skipped_Holiday: 'neutral',
  Cancelled: 'neutral'
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
  const notify = useNotify()

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
   *
   * The success toast is raised here, at the screen level, rather than inside
   * the split screen or the pool: this is the layer that knows the server
   * agreed, and it is the one call both the drop and the keyboard paths make,
   * so neither can confirm something the other would not.
   */
  const onAdd = useCallback(
    async (memberId: string, taskId: string) => {
      setNotice(null)
      const memberName =
        board.members.find((member) => member.memberId === memberId)?.name ?? 'the member'
      const taskLabel =
        [...board.pool.unassigned, ...board.pool.assignedNotPlanned].find(
          (task) => task.taskId === taskId
        )?.key ?? 'Task'

      try {
        const result = await api.addAllocation({
          memberId,
          taskId,
          expectedVersion: versionRef.current
        })
        versionRef.current = result.standupVersion
        notify.success({
          title: standupStrings.run.allocationAdded({ task: taskLabel, name: memberName })
        })
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
    [api, board.members, board.pool, notify, reload]
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

  /**
   * The completion checks come from `GET /api/standups/:id/checks` (fetched by
   * `page.tsx` alongside this screen's other panels), not a client-side
   * recomputation — the two used to be separate implementations fed different
   * inputs, and `checks/route.ts` (and this screen's own prior `useMemo`)
   * silently omitted `blockers`/`sprintHealth`, so CC-9/CC-11 always read
   * `not_evaluated` even with both visibly loaded on screen. One server-side
   * evaluation, reused for both the provisional look here and the `/complete`
   * saga's re-check, is what `completion-context.ts`'s docblock already asks
   * for. `board.checks` is `undefined` only when that fetch itself failed —
   * `checksUnavailable` below keeps Complete from being pressable blind in
   * that case, the same way a missing `board.variance` etc. degrades its own
   * panel rather than pretending nothing is wrong.
   */
  // A stable empty-array reference: `board.checks ?? []` would otherwise
  // create a new array every render whenever the fetch failed, defeating the
  // `blocking` useMemo below (it never sees the same `checks` twice).
  const checks = useMemo(() => board.checks ?? EMPTY_CHECKS, [board.checks])
  const checksUnavailable = board.checks === undefined

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
   * E49. `Missed -> Completed` via the same completion saga backfill runs
   * server-side. `setNotice`'s error branches mirror `onComplete` below —
   * `backfillStandup` throws from the same `StandupError` catalogue
   * (`STANDUP_ALREADY_COMPLETED`, `COMPLETION_CHECKS_FAILED`) since it is,
   * underneath, the same saga.
   */
  const [backfilling, setBackfilling] = useState(false)
  const [backfillNotes, setBackfillNotes] = useState('')
  // Keyed by memberId; a member missing from the map is simply unrecorded,
  // which the Backfill button refuses to submit (CC-7 would reject it anyway,
  // and a 422 after the fact is a worse way to learn it).
  const [backfillAttendance, setBackfillAttendance] = useState<
    Record<string, AttendanceStatus>
  >({})
  const [backfillSubmitting, setBackfillSubmitting] = useState(false)
  // Ruling 21: one attestation covering every failing overridable check, in
  // the facilitator's own words. Validated with the same `validateJustification`
  // the server applies, so the button does not promise a 422.
  const [backfillJustification, setBackfillJustification] = useState('')

  // CC-7 needs every expected attendee recorded, so the dialog refuses to
  // submit a half-filled room rather than letting the saga 422 on it.
  const backfillAttendanceComplete = board.members.every((member) =>
    Boolean(backfillAttendance[member.memberId])
  )

  /**
   * Ruling 21. The checks are already on screen — `blocking` is
   * `filterOverriddenFailures(blockingFailures(checks), overridesIssued)`
   * above — so the dialog reuses them rather than fetching anything.
   *
   * Split two ways, because the two halves need opposite affordances:
   *
   * - overridable failures can be attested to, which is what the justification
   *   field below collects. Note these are evaluated against the board as
   *   stored (no attendance yet), so CC-1 may appear here even for a room the
   *   facilitator is about to mark entirely absent. Harmless: the service
   *   re-evaluates after writing the attendance and issues nothing for a check
   *   that is no longer failing.
   * - non-overridable failures cannot be waved by anybody, so the dialog says
   *   so instead of offering a tick that cannot work. CC-7 is excluded: it is
   *   failing precisely because the attendance is unrecorded, which is what
   *   the selects above are for.
   */
  const backfillOverridableFailures = useMemo(
    () => blocking.filter((check) => check.overridable),
    [blocking]
  )
  const backfillUnwaivableFailures = useMemo(
    () => blocking.filter((check) => !check.overridable && check.checkId !== 'CC-7'),
    [blocking]
  )

  const backfillJustificationValid = validateJustification(backfillJustification).valid
  const backfillAcknowledgementReady =
    backfillOverridableFailures.length === 0 || backfillJustificationValid

  const onBackfill = useCallback(async () => {
    if (!api.backfill) return
    setBackfillSubmitting(true)
    setNotice(null)
    try {
      await api.backfill({
        notes: backfillNotes.trim() || undefined,
        attendance: Object.entries(backfillAttendance).map(([memberId, state]) => ({
          memberId,
          state
        })),
        // Ruling 21. Sent only for the checks actually shown as failing and
        // overridable — the service refuses an acknowledgement for anything
        // else, and issues nothing for a check that stops failing once the
        // attendance lands.
        ...(backfillOverridableFailures.length > 0
          ? {
              acknowledgedChecks: backfillOverridableFailures.map((check) => ({
                checkId: check.checkId,
                justification: backfillJustification.trim()
              }))
            }
          : {})
      })
      setBackfilling(false)
      setBackfillNotes('')
      setBackfillAttendance({})
      setBackfillJustification('')
      setNotice(standupStrings.run.backfillSuccess())
      await reload()
    } catch (error) {
      const code = (error as { code?: string })?.code
      if (code === 'STANDUP_ALREADY_COMPLETED') {
        setNotice(standupStrings.run.completeAlreadyDone())
        setBackfilling(false)
        await reload()
      } else if (code === 'COMPLETION_CHECKS_FAILED') {
        setNotice(standupStrings.run.completeChecksFailed())
      } else {
        setNotice(standupStrings.run.backfillFailed())
      }
    } finally {
      setBackfillSubmitting(false)
    }
  }, [
    api,
    backfillAttendance,
    backfillJustification,
    backfillNotes,
    backfillOverridableFailures,
    reload
  ])

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
      ? 'border-[var(--plan-danger)] text-[var(--plan-danger)]'
      : timerTone === 'timer-amber'
        ? 'border-[var(--plan-warning)] text-[var(--plan-warning)]'
        : 'border-[var(--plan-border)] text-[var(--plan-muted)]'

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
    readOnly || completing || carryForwardCloseFailures.length > 0 || checksUnavailable
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
   * ALO-16's drag-and-drop no longer lives here.
   *
   * This screen used to own the single `DndContext` for Panel 5, with the
   * pool's cards as draggables and the capacity board's member cards as
   * droppables. Task 8 moved that whole interaction into
   * `TaskAssignmentSplitScreen`, which owns the identical
   * `PointerSensor`/`distance: 8` sensor, the drag overlay and the drop
   * animation, and hands back `(taskId, memberId)`.
   *
   * Ownership could move cleanly because the context coordinated exactly one
   * interaction — pool task onto member card — and nothing else on this
   * screen dragged anything. What is left is the callback it used to end in:
   * `onAdd`, the same function the keyboard paths call, so the two can never
   * diverge.
   */
  const onReassignStranded = useCallback(
    (memberId: string) => {
      setPrompt({
        memberId,
        taskCount:
          board.members
            .find((member) => member.memberId === memberId)
            ?.allocations.filter((row) => row.detachedReason).length ?? 0,
        totalMinutes:
          board.members.find((member) => member.memberId === memberId)?.capacity
            .strandedMinutes ?? (0 as Minutes),
        tasks: []
      })
    },
    [board.members]
  )

  /**
   * The run-only halves of a member card, supplied to the shared card through
   * its render props. Each one resolves the canonical `AssignableMemberView`
   * back to this screen's richer `RunScreenMember` — the split screen speaks
   * the shared shape, and everything below needs the allocations behind it.
   */
  const memberById = useMemo(() => {
    const index = new Map<string, BoardMemberView>()
    for (const member of board.members) index.set(member.memberId, member)
    return index
  }, [board.members])

  const renderMemberAlways = useCallback(
    (view: AssignableMemberView) => {
      const member = memberById.get(view.id)
      if (!member) return null
      return (
        <MemberRunAlerts
          member={member}
          onReassignStranded={onReassignStranded}
          locale={locale}
        />
      )
    },
    [memberById, onReassignStranded, locale]
  )

  const renderMemberTaskRow = useCallback(
    (view: AssignableMemberView, task: AssignableTaskView) => {
      const allocation = memberById
        .get(view.id)
        ?.allocations.find((row) => row.taskId === task.id)
      if (!allocation) return null
      return (
        <MemberAllocationRow
          allocation={allocation}
          onChangeHours={onChangeHours}
          onRemove={onRemove}
          readOnly={readOnly}
          locale={locale}
        />
      )
    },
    [memberById, onChangeHours, onRemove, readOnly, locale]
  )

  const renderMemberExpanded = useCallback(
    (view: AssignableMemberView) => {
      const member = memberById.get(view.id)
      if (!member) return null
      return (
        <MemberRunDetails
          member={member}
          poolTasks={poolTasks}
          ceremoniesConsumeCapacity={board.ceremoniesConsumeCapacity}
          onQuickAdd={(memberId, task) => void onAdd(memberId, task.taskId)}
          readOnly={readOnly}
          locale={locale}
        />
      )
    },
    [memberById, poolTasks, board.ceremoniesConsumeCapacity, onAdd, readOnly, locale]
  )

  /**
   * The summary bar's "Plan Status: 74% Allocated" — the team's allocated
   * hours against its effective capacity, both straight off each member's
   * server-computed `CapacityBreakdown`. Nothing is re-derived: a percentage
   * that disagreed with the capacity board beneath it would be worse than
   * none. Null when nobody has capacity today (a team-wide holiday, say),
   * rather than a divide-by-zero "Infinity%".
   */
  const planPercent = useMemo(() => {
    const totals = board.members.reduce(
      (sum, member) => ({
        allocated: sum.allocated + member.capacity.allocatedMinutes,
        effective: sum.effective + member.capacity.effectiveMinutes
      }),
      { allocated: 0, effective: 0 }
    )
    return totals.effective > 0 ? Math.round((totals.allocated / totals.effective) * 100) : null
  }, [board.members])

  const planTone =
    planPercent === null
      ? 'text-[var(--plan-muted)]'
      : planPercent > 100
        ? 'text-[var(--plan-danger)]'
        : planPercent >= 90
          ? 'text-[var(--plan-success)]'
          : 'text-[var(--plan-warning)]'

  const attendanceTone =
    presentCount === board.members.length ? 'text-[var(--plan-success)]' : 'text-[var(--plan-warning)]'

  /**
   * §15.8.10: on day one the pool takes the primary position and the board
   * is secondary but always visible.
   */
  const panelFive = (
    <section id="panel-5" aria-labelledby="panel-5-heading" className="scroll-mt-6 flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 id="panel-5-heading" className={SECTION_TITLE_CLASSES}>
            {standupStrings.run.panel5()}
          </h3>
          {board.sprintName && <span className={planPillClass('accent')}>{board.sprintName}</span>}
        </div>
        <p className={SECTION_SUBTITLE_CLASSES}>{standupStrings.run.allocationSubtitle()}</p>
      </div>

      {isDayOne && board.dayOne && (
        <div className={cn(planInsetClass, 'flex flex-col gap-1 px-4 py-3 apple-type-subheadline text-[var(--plan-text)]')}>
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
            <p className="apple-type-caption font-semibold text-[var(--plan-warning)]">
              {standupStrings.run.dayOneUnassignedWarning({
                count: board.dayOne.stillUnassigned
              })}
            </p>
          ) : null}
        </div>
      )}

      <UnassignedPool
        unassigned={board.pool.unassigned}
        assignedNotPlanned={board.pool.assignedNotPlanned}
        members={board.members}
        totalCount={board.poolTotal}
        sprintLabel={board.sprintName}
        readOnly={readOnly}
        locale={locale}
        // Returned, not discarded: `onAdd`'s round-trip is what the split
        // screen's in-flight lock waits on, and a `void` here would drop the
        // lock immediately and let a second drop race the first into a
        // STALE_STANDUP conflict.
        onAssign={(memberId, taskId) => onAdd(memberId, taskId)}
        renderMemberAlways={renderMemberAlways}
        renderMemberTaskRow={renderMemberTaskRow}
        renderMemberExpanded={renderMemberExpanded}
      />
    </section>
  )

  const showYesterday = !isDayOne && Boolean(board.yesterday)
  const showVariance = !isDayOne && Boolean(board.variance)
  const showCarryForward = !isDayOne && Boolean(board.carryForward)

  /*
   * The layout is the "Daily Standup Page Redesign" blueprint, top to bottom:
   * summary bar, system banners, the attendance row, today's allocation
   * (the visually central block), yesterday's review beside the carry-forward
   * register, and blockers beside the completion checklist. The two-up rows
   * collapse to one column below `xl` — each of those panels carries editable
   * rows that need more than half a laptop screen.
   *
   * The completion checklist used to be a sticky right rail. It now closes
   * the page beside the blockers, as the blueprint has it: its "Fix" links
   * still jump to whichever panel failed, and Ctrl/Cmd+Enter still completes
   * from anywhere, so nothing it offered depends on it being always in view.
   */
  return (
    <div className="standup-run flex min-w-0 flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-4 rounded-[var(--apple-radius-lg)] border border-[var(--plan-border)] bg-[var(--plan-surface)] px-5 py-4 sm:px-8">
        <div className="flex min-w-0 flex-wrap items-center gap-x-6 gap-y-3">
          <div className="flex min-w-0 flex-col gap-0.5">
            <p className="apple-type-caption text-[var(--plan-muted)]">
              {standupStrings.run.summaryEyebrow()}
            </p>
            <h2 className="apple-type-headline font-semibold text-[var(--plan-text)]">
              {board.scheduledStartAt && board.viewerTimeZone && board.projectTimeZone
                ? formatDualTimezone({
                    instant: new Date(board.scheduledStartAt),
                    viewerTimeZone: board.viewerTimeZone,
                    projectTimeZone: board.projectTimeZone
                  })
                : board.date}
            </h2>
          </div>

          <span aria-hidden="true" className="hidden h-8 w-px bg-[var(--plan-border)] sm:block" />

          <dl className="flex flex-wrap items-center gap-x-4 gap-y-2 apple-type-subheadline">
            <div className="flex items-center gap-2">
              <dt className="sr-only">Status</dt>
              <dd>
                <span className={planPillClass(STATUS_TONE[board.status] ?? 'neutral')}>
                  {standupStrings.schedule.status[board.status] ?? board.status}
                </span>
              </dd>
            </div>

            <div className="flex items-center gap-2">
              <dt className="sr-only">Sprint day</dt>
              <dd className="font-semibold text-[var(--plan-secondary)]">
                {standupStrings.run.dayOf({
                  day: board.sprintDayNumber,
                  total: board.totalSprintDays
                })}
              </dd>
            </div>

            <div className="flex items-center gap-2">
              <dt className="text-[var(--plan-secondary)]">{standupStrings.run.summaryAttendance()}</dt>
              <dd className={cn('font-semibold', attendanceTone)}>
                {standupStrings.run.summaryAttendanceValue({
                  present: presentCount,
                  total: board.members.length
                })}
              </dd>
            </div>

            {planPercent !== null && (
              <div className="flex items-center gap-2">
                <dt className="text-[var(--plan-secondary)]">{standupStrings.run.summaryPlan()}</dt>
                <dd data-testid="plan-status" className={cn('font-semibold tabular-nums', planTone)}>
                  {standupStrings.run.summaryPlanValue({ percent: planPercent })}
                </dd>
              </div>
            )}

            <div className="flex items-center gap-2">
              <dt className="sr-only">Facilitator</dt>
              <dd className="text-[var(--plan-secondary)]">
                {standupStrings.run.facilitator({ name: board.facilitatorName })}
              </dd>
            </div>

            {timerActive && (
              <div className="flex items-center">
                <dt className="sr-only">Elapsed</dt>
                <dd>
                  <span
                    data-testid="standup-timer"
                    data-tone={timerTone}
                    aria-label={standupStrings.run.elapsedTime({
                      elapsed: elapsedLabel,
                      duration: durationMinutes
                    })}
                    className={cn(
                      'inline-flex rounded-[var(--apple-radius-sm)] border px-2 py-[3px] apple-type-caption font-semibold tabular-nums',
                      timerToneClass
                    )}
                  >
                    {standupStrings.run.elapsedTime({ elapsed: elapsedLabel, duration: durationMinutes })}
                  </span>
                </dd>
              </div>
            )}
          </dl>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {board.meetingUrl && (
            <a href={board.meetingUrl} className={planButtonClass('secondary')}>
              <Video className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
              {standupStrings.run.joinCall()}
            </a>
          )}
          <button type="button" onClick={() => void reload()} className={planButtonClass('secondary')}>
            <RefreshCw className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
            {standupStrings.run.refresh()}
          </button>
          {(board.status === 'Ready' || board.status === 'Scheduled') && api.start && (
            <button
              type="button"
              onClick={() => void onStart()}
              disabled={starting}
              className={planButtonClass('primary')}
            >
              {standupStrings.run.start()}
            </button>
          )}
          {/* E49. Before this, a `Missed` day was a dead end — no Start (it
              only ever renders for Ready/Scheduled above), no Backfill
              anywhere in the UI, despite the endpoint and saga behind it
              being fully built. */}
          {board.status === 'Missed' && api.backfill && (
            <button
              type="button"
              onClick={() => setBackfilling(true)}
              className={planButtonClass('danger')}
            >
              {standupStrings.run.backfill()}
            </button>
          )}
          {board.status === 'Completed' && summaryHref && (
            <a href={summaryHref} className={planButtonClass('primary')}>
              {standupStrings.run.viewSummary()}
            </a>
          )}
        </div>
      </header>

      {/* RUN-25's rollback notice, and the RUN-23 reload. `status` rather than
          `alert`: it reports what already happened, it does not interrupt. */}
      {notice && (
        <div data-testid="run-notice">
          <PlanBanner tone="info" bordered icon={<Info strokeWidth={2} />}>
            <span className="font-semibold">{standupStrings.run.noticeLead()} </span>
            {notice}
          </PlanBanner>
        </div>
      )}

      {readOnly && (
        <PlanBanner tone="warning" bordered icon={<AlertTriangle strokeWidth={2} />}>
          <span className="font-semibold">{standupStrings.run.lockedLead()} </span>
          {standupStrings.run.lockedForMembers()}
        </PlanBanner>
      )}

      {/* R2's blocking banner: a previous /complete call died mid-saga.
          Non-dismissible — resuming (a plain re-POST) is the only way past
          it, so there is nothing for a dismiss action to safely do. */}
      {/* Gate on runId, not the object: Mongoose's `default: null` on `lastCompletedStep` materialises a runId-less subdocument on every insert, so object truthiness is not a safe test for "a completion run is in flight". */}
      {board.completionState?.runId && (
        <PlanBanner
          tone="danger"
          bordered
          role="alert"
          icon={<XCircle strokeWidth={2} />}
          actions={
            <button
              type="button"
              onClick={() => void onComplete()}
              disabled={completing}
              className={planButtonClass('danger', undefined, 'sm')}
            >
              {standupStrings.run.completionInterruptedResume()}
            </button>
          }
        >
          {standupStrings.run.completionInterruptedBanner()}
        </PlanBanner>
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

      {!isDayOne && panelFive}

      {/* Panels 2, 3 and 4 explain yesterday, so day one — which has no
          yesterday — shows none of them (§15.8.10). */}
      {/* Panels 2 and 3 are two readings of the same day — what moved, and what
          it cost against the estimate — so they sit side by side across the full
          width rather than stacked inside one card. Stacked, the variance log
          began below the fold of a panel that was already scrolling itself, and
          reaching it meant scrolling the page past a scroll box. Each is now a
          card of its own, scrolling in its own column.

          `items-start` rather than the default `stretch`: the two panels have no
          reason to be the same height, and stretching the shorter one leaves a
          card with a long empty tail. */}
      {(showYesterday || showVariance) && (
        <section aria-labelledby="review-heading" className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h3 id="review-heading" className={SECTION_TITLE_CLASSES}>
              {standupStrings.run.reviewTitle()}
            </h3>
            <p className={SECTION_SUBTITLE_CLASSES}>{standupStrings.run.reviewSubtitle()}</p>
          </div>

          {/* One column below `xl`, and also whenever only one of the two
              panels loaded — a soft-failed variance fetch should leave
              yesterday at full width, not beside an empty half. */}
          <div
            className={cn(
              'grid items-start gap-5',
              showYesterday && showVariance && 'xl:grid-cols-2'
            )}
          >
            {board.yesterday && showYesterday && (
              <YesterdayPanel
                className="min-w-0"
                data={board.yesterday}
                api={yesterdayApi}
                disabled={readOnly}
                locale={locale}
              />
            )}

            {board.variance && showVariance && (
              <VariancePanel
                className="min-w-0"
                data={board.variance}
                onRevise={(row) => api.reviseEstimate?.(row)}
                onGiveReason={(row) => api.giveNotStartedReason?.(row)}
                onViewLedger={(memberId) => api.viewDebtLedger?.(memberId)}
                disabled={readOnly}
                locale={locale}
              />
            )}
          </div>
        </section>
      )}

      {board.carryForward && showCarryForward && (
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

      <div className="grid items-start gap-5 xl:grid-cols-2">
        <BlockerPanel
          className="min-w-0"
          blockers={openBlockers}
          today={board.date}
          onRaise={() => setRaisingBlocker(true)}
          onResolve={(blockerId) => setResolvingBlockerId(blockerId)}
        />

        <CompletionPanel
          className="min-w-0"
          checks={checks}
          blocking={blocking}
          disabled={completionPanelDisabled}
          checksUnavailable={checksUnavailable}
          onComplete={() => void onComplete()}
          onOverride={onOverride}
        />
      </div>

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

      {backfilling && (
        <ModalOverlay
          open
          onClose={() => (backfillSubmitting ? undefined : setBackfilling(false))}
          labelledBy="backfill-title"
        >
          <div className="flex w-full max-w-sm flex-col gap-4 rounded-[var(--apple-radius-lg)] border border-[var(--plan-border)] bg-[var(--plan-surface)] p-5">
            <div>
              <h3 id="backfill-title" className="apple-type-body font-semibold text-[var(--plan-text)]">
                {standupStrings.run.backfillTitle()}
              </h3>
              <p className="mt-1 apple-type-subheadline text-[var(--plan-secondary)]">
                {standupStrings.run.backfillDescription()}
              </p>
            </div>

            <fieldset className="flex flex-col gap-2">
              <legend className="apple-type-subheadline font-medium text-[var(--plan-text)]">
                {standupStrings.run.backfillAttendanceLegend()}
              </legend>
              {board.members.map((member) => (
                <label
                  key={member.memberId}
                  className="flex items-center justify-between gap-3 apple-type-subheadline text-[var(--plan-text)]"
                >
                  <span className="truncate">{member.name}</span>
                  <select
                    aria-label={standupStrings.run.backfillAttendanceFor(member.name)}
                    value={backfillAttendance[member.memberId] ?? ''}
                    onChange={(event) =>
                      setBackfillAttendance((current) => ({
                        ...current,
                        [member.memberId]: event.target.value as AttendanceStatus
                      }))
                    }
                    className={cn(planFieldClass, 'w-40 px-2')}
                    disabled={backfillSubmitting}
                  >
                    <option value="" disabled>
                      {standupStrings.run.backfillAttendanceUnrecorded()}
                    </option>
                    <option value="present">{standupStrings.run.statePresent()}</option>
                    <option value="absent_planned">
                      {standupStrings.run.stateAbsentPlanned()}
                    </option>
                    <option value="absent_unplanned">
                      {standupStrings.run.stateAbsentUnplanned()}
                    </option>
                  </select>
                </label>
              ))}
            </fieldset>

            {backfillUnwaivableFailures.length > 0 && (
              <div className="flex flex-col gap-1.5 rounded-[var(--apple-radius-md)] border border-[var(--plan-danger)] p-3">
                <p className="apple-type-subheadline font-medium text-[var(--plan-text)]">
                  {standupStrings.run.backfillBlockedByChecks()}
                </p>
                <ul className="flex flex-col gap-1 apple-type-footnote text-[var(--plan-secondary)]">
                  {backfillUnwaivableFailures.map((check) => (
                    <li key={check.checkId}>
                      {check.checkId} — {check.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {backfillOverridableFailures.length > 0 && (
              <fieldset className="flex flex-col gap-2">
                <legend className="apple-type-subheadline font-medium text-[var(--plan-text)]">
                  {standupStrings.run.backfillChecksLegend()}
                </legend>
                <p className="apple-type-footnote text-[var(--plan-secondary)]">
                  {standupStrings.run.backfillChecksDescription()}
                </p>
                <ul className="flex flex-col gap-1 apple-type-footnote text-[var(--plan-secondary)]">
                  {backfillOverridableFailures.map((check) => (
                    <li key={check.checkId}>
                      {check.checkId} — {check.message}
                    </li>
                  ))}
                </ul>
                <label className="flex flex-col gap-1.5 apple-type-subheadline text-[var(--plan-text)]">
                  {standupStrings.run.backfillJustificationLabel()}
                  <textarea
                    value={backfillJustification}
                    onChange={(event) => setBackfillJustification(event.target.value)}
                    className={cn(planFieldClass, 'h-auto min-h-20 px-2.5 py-2')}
                    disabled={backfillSubmitting}
                  />
                </label>
                {!backfillJustificationValid && (
                  <p className="apple-type-footnote text-[var(--plan-secondary)]">
                    {standupStrings.run.backfillJustificationHint()}
                  </p>
                )}
              </fieldset>
            )}

            <label className="flex flex-col gap-1.5 apple-type-subheadline text-[var(--plan-text)]">
              {standupStrings.run.backfillNotesLabel()}
              <textarea
                value={backfillNotes}
                onChange={(event) => setBackfillNotes(event.target.value)}
                className={cn(planFieldClass, 'h-auto min-h-20 px-2.5 py-2')}
                disabled={backfillSubmitting}
              />
            </label>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setBackfilling(false)}
                disabled={backfillSubmitting}
                className={planButtonClass('secondary')}
              >
                {standupStrings.run.backfillCancel()}
              </button>
              <button
                type="button"
                onClick={() => void onBackfill()}
                disabled={
                  backfillSubmitting ||
                  !backfillAttendanceComplete ||
                  // Ruling 21: a failing overridable check needs an attestation
                  // the server will actually accept before Backfill can be
                  // pressed, rather than a 422 after the fact.
                  !backfillAcknowledgementReady
                }
                className={planButtonClass('danger')}
              >
                {standupStrings.run.backfillConfirm()}
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}
    </div>
  )
}
