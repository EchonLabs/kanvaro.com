'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Info, Loader2, RefreshCw, Video, XCircle } from 'lucide-react'

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
import {
  OverrideModal,
  type OverridableType,
  type OverrideModalAffectedMember,
  type OverrideModalAffectedTask,
  type OverrideModalSubmitInput
} from './OverrideModal'
import { BackfillDialog, type BackfillDialogSubmitInput } from './BackfillDialog'
import { anchorFor } from './CompletionPanel'
import { DebtLedgerDrawer, type LedgerEntryView } from './DebtLedgerDrawer'
import { NotStartedReasonModal, type NotStartedReasonTarget } from './NotStartedReasonModal'
import { ReviseEstimateModal, type ReviseEstimateTarget } from './ReviseEstimateModal'
import { RaiseBlockerModal, type RaiseBlockerSubmitInput } from './RaiseBlockerModal'
import { ResolveBlockerDialog, type ResolveBlockerSubmitInput } from './ResolveBlockerDialog'
import { ModalOverlay } from '@/components/standup/primitives/ModalOverlay'
import { UnassignedPool } from './UnassignedPool'
import { SprintCloseReadinessPanel } from './SprintCloseReadinessPanel'
import { useStandupShortcuts } from './useStandupShortcuts'
import {
  PlanBanner,
  planButtonClass,
  planInsetClass,
  planPillClass,
  scrollToSection,
  type PlanPillTone
} from '../planning/ui'

/**
 * The one two-up grid the run screen's three paired sections share — today's
 * board, yesterday's review, and blockers beside completion. Each used to
 * pick its own (`lg` with a 1 : 1.15 split for the board, `xl` with 1 : 1 for
 * the other two), so the gutter between the halves sat at a different place
 * in each section and the page had no shared middle line.
 */
export const RUN_TWO_UP_CLASSES = 'grid items-start gap-5 xl:grid-cols-2'

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
import {
  isAbsentAttendance,
  type AttendanceStatus,
  type CapacityBreakdown
} from '@/lib/standup/capacity'
import {
  blockingFailures,
  type CompletionCheckResult
} from '@/lib/standup/completion-checks'
import { formatMinutesAsHours, type Minutes } from '@/lib/standup/minutes'
import { isOwnRowReadOnly } from '@/lib/standup/own-row'
import {
  backfillNeedsMemberConfirmation,
  filterOverriddenFailures,
  isCheckAcknowledgeableByBackfill,
  OVERRIDE_TABLE,
  type IssuedOverrideForReconciliation
} from '@/lib/standup/override'
import type { DebtPosition } from '@/lib/standup/debt'
import type { RevisionReason } from '@/lib/standup/estimates'
import { standupStrings } from '@/lib/standup/strings'

/**
 * The text a failed request should show. The server's `StandupError`
 * messages are written for the person using the screen ("This stand-up
 * becomes available at 09:00 on 06 Oct.") — and every failure path here used
 * to discard them for a generic "That could not be saved", which is how a
 * refused Start, a too-short reason and a stale version all came to look
 * identical. The fallback is for errors with no catalogue code: a network
 * failure, a 500.
 */
function messageOf(error: unknown, fallback: string): string {
  const candidate = error as { code?: string; message?: string } | null
  return candidate?.code && candidate.message ? candidate.message : fallback
}

/** Why the server refused to start the stand-up, as the banner renders it. */
interface StartRefusal {
  message: string
  /** PLANNING_GATE_NOT_PASSED's still-open checklist items, by message. */
  planningItems: string[]
}

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
  /** CC-3/CC-10: what the modal lists instead of a meaningless "0h gap". */
  affectedTasks: OverrideModalAffectedTask[]
  affectedMemberIds: string[]
  affectedTaskIds: string[]
}

/** One label per task id, from whichever key field the check's entities carry. */
function tasksOf(entities: readonly Record<string, unknown>[]): OverrideModalAffectedTask[] {
  const byId = new Map<string, string>()
  for (const entity of entities) {
    if (typeof entity.taskId !== 'string' || byId.has(entity.taskId)) continue
    const key = entity.taskKey ?? entity.key
    byId.set(entity.taskId, typeof key === 'string' && key ? key : entity.taskId)
  }
  return Array.from(byId, ([taskId, label]) => ({ taskId, label }))
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
      affectedTasks: [],
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

    return {
      type,
      affected,
      affectedTasks: tasksOf(check.entities),
      affectedMemberIds: memberIds,
      affectedTaskIds: taskIds
    }
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

    return {
      type,
      affected,
      affectedTasks: tasksOf(check.entities),
      affectedMemberIds: memberIds,
      affectedTaskIds: taskIds
    }
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
  /**
   * The overrides already on record for this stand-up, from the same checks
   * fetch. Without them the screen only knew about overrides issued since the
   * page loaded, so a reload re-blocked a check the saga would pass.
   */
  overridesIssued?: readonly IssuedOverrideForReconciliation[]
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
  start?(input: { expectedVersion: number }): Promise<void>

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
    acknowledgedChecks?: {
      checkId: string
      justification: string
      /**
       * CC-6 only. The facilitator's confirmation that the affected members
       * agreed to the overtime — a backfill cannot get their own tick.
       */
      memberAcknowledged?: boolean
    }[]
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
  /**
   * VAR-15/16 and AC-18 — the two answers a variance row asks for, and the
   * ledger. These used to be fire-and-forget callbacks that the route page
   * answered with its own dialogs, its own copy of the stand-up version and
   * its own board state. The page's version went stale after the first edit
   * here (so every save after it was refused as STALE_STANDUP), and the board
   * it refreshed was not the one on screen (so a save that did land never
   * showed). They now carry the screen's version and return the new one, like
   * every other mutation, and the screen owns the dialogs.
   */
  reviseEstimate?(input: {
    allocationId: string
    newRemainingMinutes: Minutes
    reason: RevisionReason
    detail?: string
    expectedVersion: number
  }): Promise<{ standupVersion: number }>
  recordNotStartedReason?(input: {
    allocationId: string
    reason: string
    expectedVersion: number
  }): Promise<{ standupVersion: number }>
  /** `null` when the viewer may only see the team total (NFR-13). */
  loadDebtLedger?(memberId: string): Promise<{
    position: DebtPosition
    entries: LedgerEntryView[]
  } | null>
  writeOffDebt?(input: {
    memberId: string
    minutes: Minutes
    reason: string
    expectedVersion: number
  }): Promise<void>

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
  setTaskDisposition?(input: { taskId: string; type: string; expectedVersion: number }): Promise<void>

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
  /** Where a refused Start sends the PM when sprint planning is unfinished. */
  planningHref?: string
}

export function StandupRunScreen({
  data,
  api,
  viewer,
  locale,
  summaryHref,
  planningHref
}: StandupRunScreenProps) {
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
   * The header's Refresh. It used to be `void reload()` — no spinner, no
   * confirmation, and a failure swallowed as an unhandled rejection — so on a
   * board that had not changed it was indistinguishable from a dead button.
   */
  const [refreshing, setRefreshing] = useState(false)
  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    setNotice(null)
    try {
      await reload()
      notify.success({ title: standupStrings.run.refreshed(), duration: 2000 })
    } catch {
      setNotice(standupStrings.run.refreshFailed())
    } finally {
      setRefreshing(false)
    }
  }, [reload, notify])

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
        // The banner above is at the top of a long page, where a PM working
        // the board further down never sees it — the row just snapped back,
        // with no word why. A toast shows where they are, and carries the
        // server's own reason (forbidden, wrong status, ...) when it gave one.
        // One short line: the server's own reason when it gave one, else a
        // brief fallback. The banner above already carries the full sentence.
        notify.error({
          title:
            (error as { code?: string; message?: string })?.code &&
            (error as { message?: string }).message
              ? (error as { message: string }).message
              : standupStrings.run.editRejectedToast(),
          duration: 4000
        })
        return null
      }
    },
    [board, reload, notify]
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
      ).then(async (result) => {
        // Reloaded on success, as adding is: the task goes back into the
        // backlog and the member's capacity, the checklist and the meter all
        // move, none of which the optimistic row removal alone could show.
        if (result) await reload().catch(() => undefined)
      })
    },
    [api, optimistic, reload]
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
          title: standupStrings.run.allocationAdded({ task: taskLabel, name: memberName }),
          duration: 2500
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
   * The variance row behind a yesterday row, for the revise dialog's estimate
   * figures. Matched on the allocation first, then on the task, since an
   * unplanned row (E39) has no allocation of its own.
   */
  const varianceRowFor = useCallback(
    (row: { allocationId?: string; taskId: string }) =>
      board.variance?.rows.find(
        (candidate) =>
          (row.allocationId && candidate.allocationId === row.allocationId) ||
          candidate.taskId === row.taskId
      ),
    [board.variance]
  )

  const [revising, setRevising] = useState<ReviseEstimateTarget | null>(null)
  const [givingReason, setGivingReason] = useState<NotStartedReasonTarget | null>(null)
  const [dialogError, setDialogError] = useState<string | null>(null)
  const [dialogSaving, setDialogSaving] = useState(false)

  const openRevise = useCallback((row: VariancePanelRow) => {
    setDialogError(null)
    setRevising({
      allocationId: row.allocationId,
      taskKey: row.taskKey,
      title: row.title,
      memberName: row.memberName,
      originalEstimateMinutes: row.originalEstimateMinutes,
      totalLoggedMinutesOnTask: row.totalLoggedMinutesOnTask,
      taskVarianceMinutes: row.taskVarianceMinutes
    })
  }, [])

  const openReason = useCallback((row: VariancePanelRow) => {
    setDialogError(null)
    setGivingReason({
      allocationId: row.allocationId,
      taskKey: row.taskKey,
      title: row.title,
      memberName: row.memberName,
      plannedMinutes: row.plannedMinutes
    })
  }, [])

  const closeDialogs = useCallback(() => {
    setRevising(null)
    setGivingReason(null)
    setDialogError(null)
  }, [])

  /**
   * Runs one dialog's save against the screen's version, then reloads so the
   * answered row leaves the "needs an answer" list and CC-3 re-evaluates. A
   * stale version reloads and asks the PM to save again rather than guessing.
   */
  const saveFromDialog = useCallback(
    async (call: (expectedVersion: number) => Promise<{ standupVersion: number } | void>) => {
      setDialogSaving(true)
      setDialogError(null)
      try {
        const result = await call(versionRef.current)
        if (result) versionRef.current = result.standupVersion
        closeDialogs()
        await reload()
      } catch (error) {
        if ((error as { code?: string })?.code === 'STALE_STANDUP') {
          await reload().catch(() => undefined)
          setDialogError(standupStrings.run.staleReload())
        } else {
          setDialogError(messageOf(error, standupStrings.variance.saveFailed()))
        }
      } finally {
        setDialogSaving(false)
      }
    },
    [closeDialogs, reload]
  )

  const [ledger, setLedger] = useState<{
    memberId: string
    memberName: string
    position: DebtPosition
    entries: LedgerEntryView[]
  } | null>(null)
  const [ledgerError, setLedgerError] = useState<string | null>(null)
  const [ledgerSaving, setLedgerSaving] = useState(false)

  const openLedger = useCallback(
    async (memberId: string) => {
      if (!api.loadDebtLedger) return
      const memberName =
        board.variance?.members.find((member) => member.memberId === memberId)?.memberName ??
        board.members.find((member) => member.memberId === memberId)?.name ??
        memberId
      setNotice(null)
      try {
        const loaded = await api.loadDebtLedger(memberId)
        if (!loaded) {
          setNotice(standupStrings.debt.noAccess())
          return
        }
        setLedgerError(null)
        setLedger({ memberId, memberName, ...loaded })
      } catch (error) {
        setNotice(messageOf(error, standupStrings.debt.loadFailed()))
      }
    },
    [api, board.members, board.variance]
  )

  const onWriteOff = useCallback(
    async (input: { minutes: Minutes; reason: string }) => {
      if (!ledger || !api.writeOffDebt) return
      setLedgerSaving(true)
      setLedgerError(null)
      try {
        await api.writeOffDebt({
          memberId: ledger.memberId,
          minutes: input.minutes,
          reason: input.reason,
          expectedVersion: versionRef.current
        })
        setLedger(null)
        await reload()
      } catch (error) {
        if ((error as { code?: string })?.code === 'STALE_STANDUP') {
          await reload().catch(() => undefined)
          setLedgerError(standupStrings.run.staleReload())
        } else {
          setLedgerError(messageOf(error, standupStrings.debt.writeOffFailed()))
        }
      } finally {
        setLedgerSaving(false)
      }
    },
    [api, ledger, reload]
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
        const target = varianceRowFor(row)
        if (target) openRevise(target)
      },
      canRevise(row) {
        return Boolean(api.reviseEstimate && varianceRowFor(row))
      }
    }),
    [api, reload, varianceRowFor, openRevise]
  )

  const onSetAttendance = useCallback(
    async (input: {
      memberId: string
      state: AttendanceStatus
      partialMinutes?: Minutes
      reason?: string
    }) => {
      setNotice(null)
      // Applied at once: the assignment board drops an absent member (and
      // brings a returning one back) the moment the state is chosen, rather
      // than after the round trip. The reload below replaces it with the
      // server's own capacity figures; a failure reloads to put it right.
      setBoard((current) => ({
        ...current,
        members: current.members.map((member) =>
          member.memberId === input.memberId
            ? { ...member, attendance: input.state, partialMinutes: input.partialMinutes }
            : member
        )
      }))
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
        // Put back what the optimistic edit above changed.
        await reload().catch(() => undefined)
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
    () =>
      filterOverriddenFailures(blockingFailures(checks), [
        ...(board.overridesIssued ?? []),
        ...overridesIssued
      ]),
    [checks, board.overridesIssued, overridesIssued]
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

  const [overrideError, setOverrideError] = useState<string | null>(null)
  const [overrideSaving, setOverrideSaving] = useState(false)
  const onCancelOverride = useCallback(() => {
    setOverridingCheck(null)
    setOverrideError(null)
  }, [])

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
      setOverrideError(null)
      setOverrideSaving(true)
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
      } catch (error) {
        // Deliberately left open on failure (INVALID_JUSTIFICATION,
        // OVERRIDE_NOT_PERMITTED, "already deferred once", ...) — the PM's
        // in-progress reason and justification stay put so they can fix it,
        // and the reason is shown inside the modal, not behind it.
        setOverrideError(messageOf(error, standupStrings.run.overrideFailed()))
      } finally {
        setOverrideSaving(false)
      }
    },
    [api, overridingCheck, overrideContext, reload]
  )

  const [starting, setStarting] = useState(false)
  const [startRefusal, setStartRefusal] = useState<StartRefusal | null>(null)

  /**
   * RUN-2/3, AC-5 (Task 1). A refusal is shown as its own banner with the
   * server's reason — "available at 09:00", "Tuesday's stand-up is still in
   * progress", or the planning items still open — instead of the one generic
   * "That could not be started." that used to cover all of them.
   *
   * The version comes from `versionRef`, like every other write. The route page
   * used to send the version it loaded with, so after any edit on a `Ready`
   * board (attendance, say) Start was refused as stale, reloaded, and refused
   * again on every retry.
   */
  const onStart = useCallback(async () => {
    if (!api.start) return
    setStarting(true)
    setNotice(null)
    setStartRefusal(null)
    try {
      await api.start({ expectedVersion: versionRef.current })
      setNotice(standupStrings.run.startSuccess())
      await reload()
    } catch (error) {
      const failure = error as {
        code?: string
        details?: { failingChecks?: { message?: string; checkId?: string }[]; sprintState?: string }
      }
      if (failure?.code === 'STALE_STANDUP') {
        setNotice(standupStrings.run.staleReload())
        await reload()
      } else if (failure?.code === 'PLANNING_GATE_NOT_PASSED') {
        const planningItems = (failure.details?.failingChecks ?? [])
          .map((item) => item.message ?? item.checkId ?? '')
          .filter(Boolean)
        setStartRefusal({
          message:
            planningItems.length === 0 && failure.details?.sprintState
              ? standupStrings.run.startBlockedSprintState({ state: failure.details.sprintState })
              : standupStrings.run.startPlanningGateFailed(),
          planningItems
        })
      } else {
        setStartRefusal({
          message: messageOf(error, standupStrings.run.startFailed()),
          planningItems: []
        })
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
  const [backfillSubmitting, setBackfillSubmitting] = useState(false)
  const [backfillError, setBackfillError] = useState<string | null>(null)

  /**
   * Ruling 21. The checks are already on screen — `blocking` is
   * `filterOverriddenFailures(blockingFailures(checks), overrides)` above — so
   * the dialog reuses them rather than fetching anything.
   *
   * Split two ways, because the two halves need opposite affordances:
   *
   * - what a backfill may actually attest to, which the dialog's justification
   *   field collects. The test is `isCheckAcknowledgeableByBackfill`, the
   *   *same* rule the service enforces — not `check.overridable`, which is
   *   wider. CC-6 and CC-3 are overridable on a live run but need something a
   *   backfill cannot supply (a member's own tick; a one-task deferral).
   *
   *   These are evaluated against the board as stored (no attendance yet), so
   *   CC-1 may appear here even for a room the facilitator is about to mark
   *   entirely absent. Harmless: the service re-evaluates after writing the
   *   attendance and issues nothing for a check that is no longer failing.
   * - everything else blocking, which no attestation can clear. The dialog
   *   gives each a Fix action that closes it on the panel that clears it
   *   (CC-3's answers are accepted on a `Missed` stand-up for this reason).
   *   CC-7 is excluded: it is failing precisely because the attendance is
   *   unrecorded, which is what the dialog's selects are for.
   */
  const backfillAttestable = useMemo(
    () =>
      blocking.filter(
        (check) => check.overridable && isCheckAcknowledgeableByBackfill(check.checkId)
      ),
    [blocking]
  )
  const backfillUnwaivable = useMemo(
    () =>
      blocking.filter(
        (check) =>
          check.checkId !== 'CC-7' &&
          !(check.overridable && isCheckAcknowledgeableByBackfill(check.checkId))
      ),
    [blocking]
  )

  const onBackfill = useCallback(
    async (input: BackfillDialogSubmitInput) => {
      if (!api.backfill) return
      setBackfillSubmitting(true)
      setBackfillError(null)
      setNotice(null)
      try {
        await api.backfill({
          notes: input.notes || undefined,
          attendance: input.attendance,
          // Ruling 21. Sent only for the checks actually shown as failing and
          // attestable — the service refuses an acknowledgement for anything
          // else, and issues nothing for a check that stops failing once the
          // attendance lands.
          ...(backfillAttestable.length > 0
            ? {
                acknowledgedChecks: backfillAttestable.map((check) => ({
                  checkId: check.checkId,
                  justification: input.justification,
                  ...(backfillNeedsMemberConfirmation(check.checkId)
                    ? { memberAcknowledged: input.memberAcknowledged }
                    : {})
                }))
              }
            : {})
        })
        setBackfilling(false)
        setNotice(standupStrings.run.backfillSuccess())
        await reload()
      } catch (error) {
        const code = (error as { code?: string })?.code
        if (code === 'STANDUP_ALREADY_COMPLETED') {
          setNotice(standupStrings.run.completeAlreadyDone())
          setBackfilling(false)
          await reload()
        } else {
          // Shown inside the dialog: the window has passed, a check still
          // fails, the attestation was refused — the server says which.
          setBackfillError(messageOf(error, standupStrings.run.backfillFailed()))
          // A refused backfill may still have written the room (it is
          // persisted before the saga runs), so the checks on screen move.
          await reload().catch(() => undefined)
        }
      } finally {
        setBackfillSubmitting(false)
      }
    },
    [api, backfillAttestable, reload]
  )

  const onBackfillFix = useCallback((checkId: string) => {
    setBackfilling(false)
    setBackfillError(null)
    // After the overlay unmounts, or its focus-return would pull the page back.
    window.setTimeout(() => scrollToSection(anchorFor(checkId)), 0)
  }, [])

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
    'jump-panel-1': () => scrollToSection('panel-1'),
    'jump-panel-2': () => scrollToSection('panel-2'),
    'jump-panel-3': () => scrollToSection('panel-3'),
    'jump-panel-4': () => scrollToSection('panel-4'),
    'jump-panel-5': () => scrollToSection('panel-5'),
    'jump-panel-6': () => scrollToSection('panel-6'),
    'jump-panel-7': () => scrollToSection('panel-7'),
    'attempt-complete': () => {
      if (!completeDisabled) void onComplete()
    }
  })

  const assignableMembers = useMemo(
    () => board.members.filter((member) => !isAbsentAttendance(member.attendance)),
    [board.members]
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
        // Not the absent: nobody out for the day can be given work, so their
        // card (and its drop target, picker option and quick-add) is gone from
        // the board while they are. Their stranded work is still handled in
        // the attendance panel above. Recomputed on every attendance change.
        members={assignableMembers}
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
          <button
            type="button"
            onClick={() => void onRefresh()}
            disabled={refreshing}
            aria-busy={refreshing}
            className={planButtonClass('secondary')}
          >
            <RefreshCw
              className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')}
              strokeWidth={2}
              aria-hidden="true"
            />
            {/* The label never changes width: swapping it for "Refreshing…"
                widened the button and wrapped the whole action group onto a
                new row mid-click. The spinning icon and `aria-busy` carry it. */}
            {standupStrings.run.refresh()}
          </button>
          {(board.status === 'Ready' || board.status === 'Scheduled') && api.start && (
            <button
              type="button"
              onClick={() => void onStart()}
              disabled={starting}
              className={planButtonClass('primary')}
            >
              {starting && <Loader2 className="animate-spin" aria-hidden="true" />}
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
              onClick={() => {
                setBackfillError(null)
                setBackfilling(true)
              }}
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

      {startRefusal && (
        <div data-testid="start-refusal">
          <PlanBanner
            tone="danger"
            bordered
            role="alert"
            icon={<XCircle strokeWidth={2} />}
            actions={
              planningHref && startRefusal.planningItems.length > 0 ? (
                <a href={planningHref} className={planButtonClass('secondary', undefined, 'sm')}>
                  {standupStrings.run.startOpenPlanning()}
                </a>
              ) : undefined
            }
          >
            <span className="font-semibold">{standupStrings.run.startBlockedTitle()}. </span>
            {startRefusal.message}
            {startRefusal.planningItems.length > 0 && (
              <>
                <span className="mt-1 block">{standupStrings.run.startBlockedPlanningItems()}</span>
                <ul className="mt-0.5 list-disc pl-5">
                  {startRefusal.planningItems.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </>
            )}
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
          </div>

          {/* One column below `xl`, and also whenever only one of the two
              panels loaded — a soft-failed variance fetch should leave
              yesterday at full width, not beside an empty half. */}
          <div
            className={
              showYesterday && showVariance ? RUN_TWO_UP_CLASSES : 'grid items-start gap-5'
            }
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
                onRevise={openRevise}
                onGiveReason={openReason}
                onViewLedger={(memberId) => void openLedger(memberId)}
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
                await api.setTaskDisposition?.({
                  taskId,
                  type,
                  expectedVersion: versionRef.current
                })
                await reload()
              } catch {
                setNotice(standupStrings.run.editRejected())
              }
            })()
          }}
        />
      )}

      <div className={RUN_TWO_UP_CLASSES}>
        <BlockerPanel
          className="min-w-0"
          blockers={openBlockers}
          today={board.date}
          onRaise={() => setRaisingBlocker(true)}
          onResolve={(blockerId) => setResolvingBlockerId(blockerId)}
        />

        {/* A completed stand-up is immutable: the saga would answer
            STANDUP_ALREADY_COMPLETED, and "All checks passed" is a claim about
            a gate that has already closed. The header's status pill and
            "View summary" link already say it is done.
            A Missed one is closed only through Backfill: a failed backfill can
            leave attendance recorded, so CC-7 passes and this panel would offer
            a Complete that skips the SCH-14 window and the backfill stamps
            (the route refuses it too). */}
        {board.status !== 'Completed' && board.status !== 'Missed' && (
          <CompletionPanel
            className="min-w-0"
            checks={checks}
            blocking={blocking}
            disabled={completionPanelDisabled}
            checksUnavailable={checksUnavailable}
            onComplete={() => void onComplete()}
            onOverride={onOverride}
          />
        )}
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
            affectedTasks={overrideContext.affectedTasks}
            onCancel={onCancelOverride}
            onSubmit={(input) => void onSubmitOverride(input)}
            error={overrideError}
            saving={overrideSaving}
          />
        </ModalOverlay>
      )}

      {backfilling && (
        <ModalOverlay
          open
          size="lg"
          onClose={() => (backfillSubmitting ? undefined : setBackfilling(false))}
          labelledBy="backfill-title"
        >
          <BackfillDialog
            members={board.members}
            attestable={backfillAttestable}
            unwaivable={backfillUnwaivable}
            submitting={backfillSubmitting}
            error={backfillError}
            onCancel={() => setBackfilling(false)}
            onSubmit={(input) => void onBackfill(input)}
            onFix={onBackfillFix}
          />
        </ModalOverlay>
      )}

      {revising && (
        <ModalOverlay open onClose={closeDialogs} labelledBy="revise-title">
          <ReviseEstimateModal
            target={revising}
            error={dialogError}
            saving={dialogSaving}
            locale={locale}
            onCancel={closeDialogs}
            onSave={(input) =>
              void saveFromDialog((expectedVersion) =>
                api.reviseEstimate!({ ...input, expectedVersion })
              )
            }
          />
        </ModalOverlay>
      )}

      {givingReason && (
        <ModalOverlay open onClose={closeDialogs} labelledBy="reason-title">
          <NotStartedReasonModal
            target={givingReason}
            error={dialogError}
            saving={dialogSaving}
            locale={locale}
            onCancel={closeDialogs}
            onSave={(input) =>
              void saveFromDialog((expectedVersion) =>
                api.recordNotStartedReason!({ ...input, expectedVersion })
              )
            }
          />
        </ModalOverlay>
      )}

      {ledger && (
        <ModalOverlay open onClose={() => setLedger(null)} labelledBy="debt-ledger-title">
          <DebtLedgerDrawer
            memberName={ledger.memberName}
            position={ledger.position}
            entries={ledger.entries}
            canWriteOff={Boolean(api.writeOffDebt)}
            onWriteOff={(input) => void onWriteOff(input)}
            onClose={() => setLedger(null)}
            error={ledgerError}
            saving={ledgerSaving}
            locale={locale}
          />
        </ModalOverlay>
      )}
    </div>
  )
}
