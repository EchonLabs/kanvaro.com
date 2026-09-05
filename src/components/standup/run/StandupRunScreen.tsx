'use client'

import { useCallback, useMemo, useRef, useState } from 'react'

import type { QuickAddTask } from '@/components/standup/primitives/QuickAddCombobox'
import { AttendancePanel, type ReassignPromptView } from './AttendancePanel'
import { CarryForwardPanel, type CarryForwardItemRow, type CarryForwardPanelData } from './CarryForwardPanel'
import { BlockerPanel, type BlockerRow } from './BlockerPanel'
import { VariancePanel, type VariancePanelMember, type VariancePanelRow } from './VariancePanel'
import { YesterdayPanel, type YesterdayPanelApi } from './YesterdayPanel'
import { CapacityBoard, type BoardAllocationView } from './CapacityBoard'
import { CompletionPanel } from './CompletionPanel'
import { OverrideModal, type OverridableType, type OverrideModalAffectedMember, type OverrideModalSubmitInput } from './OverrideModal'
import { UnassignedPool } from './UnassignedPool'
import { SprintCloseReadinessPanel } from './SprintCloseReadinessPanel'
import {
  evaluateFinalDayCarryForwardDisposition,
  type OpenTaskReadiness
} from '@/lib/standup/sprint-close'
import { formatDualTimezone } from '@/lib/standup/timezone'
import type { PoolTask } from '@/lib/standup/allocation'
import type { BucketedRows } from '@/lib/standup/yesterday'
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
  yesterday?: { buckets: BucketedRows[]; previousStandupId?: string; previousStandupDate?: string }
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
}

export function StandupRunScreen({ data, api, viewer, locale }: StandupRunScreenProps) {
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
  const readOnly =
    viewer !== undefined && !viewer.canAllocateOthers && board.status !== 'Ready'

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

  const carryForwardCloseFailures = useMemo(
    () =>
      board.sprintClose
        ? evaluateFinalDayCarryForwardDisposition(board.sprintClose.carryForwardItems).offenders
        : [],
    [board.sprintClose]
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

  const selectedMember = board.members.find(
    (member) => member.memberId === selectedMemberId
  )

  const presentCount = board.members.filter(
    (member) => member.attendance === 'present' || member.attendance === 'partial'
  ).length

  const poolTasks: QuickAddTask[] = [
    ...board.pool.unassigned,
    ...board.pool.assignedNotPlanned
  ].map((task) => ({
    taskId: task.taskId,
    key: task.key,
    title: task.title,
    remainingEstimateMinutes: task.remainingEstimateMinutes
  }))

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-border pb-3">
        <h2 className="text-lg font-semibold">
          {standupStrings.run.dayOf({
            day: board.sprintDayNumber,
            total: board.totalSprintDays
          })}
        </h2>
        <span className="text-sm text-muted-foreground">
          {board.scheduledStartAt && board.viewerTimeZone && board.projectTimeZone
            ? formatDualTimezone({
                instant: new Date(board.scheduledStartAt),
                viewerTimeZone: board.viewerTimeZone,
                projectTimeZone: board.projectTimeZone
              })
            : board.date}
        </span>
        <span className="rounded-full border border-border px-2 py-0.5 text-xs">
          {board.status}
        </span>
        <span className="text-sm text-muted-foreground">
          {standupStrings.run.facilitator({ name: board.facilitatorName })}
        </span>
        <span className="text-sm text-muted-foreground">
          {standupStrings.run.presentOf({
            present: presentCount,
            total: board.members.length
          })}
        </span>
        {board.meetingUrl && (
          <a href={board.meetingUrl} className="text-sm underline">
            {standupStrings.run.joinCall()}
          </a>
        )}
        <button
          type="button"
          onClick={() => void reload()}
          className="rounded-md border border-border px-2 py-1 text-xs"
        >
          {standupStrings.run.refresh()}
        </button>
      </header>

      <nav aria-label="Stand-up panels" className="flex flex-wrap gap-2 text-xs">
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
        <p role="status" className="rounded-md border border-border bg-muted p-2 text-sm">
          {notice}
        </p>
      )}

      {readOnly && (
        <p className="rounded-md border border-border bg-muted p-2 text-sm text-muted-foreground">
          {standupStrings.run.lockedForMembers()}
        </p>
      )}

      {/* R2's blocking banner: a previous /complete call died mid-saga.
          Non-dismissible — resuming (a plain re-POST) is the only way past
          it, so there is nothing for a dismiss action to safely do. */}
      {board.completionState && (
        <p
          role="alert"
          className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-2 text-sm"
        >
          <span>{standupStrings.run.completionInterruptedBanner()}</span>
          <button
            type="button"
            onClick={() => void onComplete()}
            disabled={completing}
            className="rounded-md border border-border bg-primary px-3 py-1 text-xs font-medium text-primary-foreground disabled:opacity-40"
          >
            {standupStrings.run.completionInterruptedResume()}
          </button>
        </p>
      )}

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

      {/* §15.8.10: on day one the pool takes the primary position and the board
          is secondary but always visible. */}
      <section id="panel-5" aria-labelledby="panel-5-heading" className="flex flex-col gap-3">
        <h3 id="panel-5-heading" className="text-sm font-semibold">
          {standupStrings.run.panel5()}
        </h3>

        {isDayOne && board.dayOne && (
          <div className="flex flex-col gap-1 rounded-md border border-border p-2 text-sm">
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
        blockers={board.blockers ?? []}
        today={board.date}
        onRaise={() => {
          // Phase 10 does not yet wire a raise-blocker action — no API
          // method exists to call. This button has nowhere to send its
          // click until that surface is built.
        }}
        onResolve={() => {
          // Same as above: blocker resolution has no API method yet.
        }}
      />

      <CompletionPanel
        checks={checks}
        blocking={blocking}
        disabled={readOnly || completing || carryForwardCloseFailures.length > 0}
        onComplete={() => void onComplete()}
        onOverride={onOverride}
      />

      {/* Task 22. `overrideContext` is null whenever `overridingCheck` is —
          and also, for CC-3/CC-10, when no entity carried a resolvable
          `taskId` — so this only ever renders with props the modal can act
          on. */}
      {overridingCheck && overrideContext && (
        <OverrideModal
          type={overrideContext.type}
          affected={overrideContext.affected}
          onCancel={onCancelOverride}
          onSubmit={(input) => void onSubmitOverride(input)}
        />
      )}
    </div>
  )
}

function JumpLink({ id, label }: { id: number; label: string }) {
  return (
    <a
      href={`#panel-${id}`}
      className="rounded-md border border-border px-2 py-1 text-muted-foreground"
    >
      {id}. {label}
    </a>
  )
}
