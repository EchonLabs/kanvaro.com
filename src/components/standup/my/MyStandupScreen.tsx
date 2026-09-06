'use client'

import { useCallback, useState } from 'react'

import { standupStrings } from '@/lib/standup/strings'
import { formatDualTimezone } from '@/lib/standup/timezone'
import { formatMinutesAsHours, type Minutes } from '@/lib/standup/minutes'
import { isOwnRowReadOnly } from '@/lib/standup/own-row'
import type { AttendanceStatus, CapacityBreakdown } from '@/lib/standup/capacity'
import type { BoardAllocationView } from '@/components/standup/run/CapacityBoard'

/**
 * The full `PoolTask` (`@/lib/standup/allocation`) requires `status`, `type`,
 * `priority`, `labels`, `position` and `assigneeIds` — real fields the board's
 * two-tab pool needs for filtering and sorting, none of which this one-button
 * "add this to my day" list uses. Narrowing locally, rather than importing the
 * full type, keeps this component's test fixtures honest about what it
 * actually reads.
 */
export interface MyStandupPoolTask {
  taskId: string
  key?: string
  title: string
  remainingEstimateMinutes: Minutes
}

export interface MyStandupMember {
  memberId: string
  name: string
  attendance?: AttendanceStatus
  capacity: CapacityBreakdown
  allocations: BoardAllocationView[]
}

export interface MyStandupApi {
  addAllocation(input: {
    memberId: string
    taskId: string
    selfSelect: boolean
    expectedVersion: number
  }): Promise<{ standupVersion: number }>
  changeHours(input: {
    allocationId: string
    plannedMinutes: Minutes
    expectedVersion: number
  }): Promise<{ standupVersion: number }>
  // No `removeAllocation`. ALO-22's member-facing surface is "additions only,
  // never removals", this screen renders no control that could call one, and
  // the DELETE route stays PM-only — so declaring it here only invited a
  // capability the plan never intended.
}

export interface MyStandupScreenProps {
  standupId: string
  standupVersion: number
  status: string
  date: string
  member: MyStandupMember
  poolTasks: readonly MyStandupPoolTask[]
  allowSelfSelect: boolean
  api: MyStandupApi
  locale?: string
  /**
   * NFR-20. All three optional and only rendered together — when any is
   * absent the header falls back to the plain `date` string unchanged.
   */
  scheduledStartAt?: string
  viewerTimeZone?: string
  projectTimeZone?: string
}

/**
 * UI-12 / P11-5. A mobile-first, single-member slice of the run screen — not
 * a second implementation of it. RUN-26's lock is the shared
 * {@link isOwnRowReadOnly}, the same function `StandupRunScreen.tsx` calls —
 * not a second copy of the condition.
 */
export function MyStandupScreen({
  standupVersion,
  status,
  date,
  member,
  poolTasks,
  allowSelfSelect,
  api,
  locale,
  scheduledStartAt,
  viewerTimeZone,
  projectTimeZone
}: MyStandupScreenProps) {
  const [version, setVersion] = useState(standupVersion)
  const [notice, setNotice] = useState<string | null>(null)
  // RUN-26, shared with the run screen rather than restated. A member screen
  // never has PM-level access, so `canAllocateOthers` is always false here.
  const readOnly = isOwnRowReadOnly({ status, canAllocateOthers: false })

  /**
   * Every refusal this screen can meet is a server decision it cannot predict:
   * `allowSelfSelect` turned off for the project, the stand-up having moved on
   * since the page loaded, a stale version. Without a visible notice each of
   * those was a silent no-op plus an unhandled rejection — the member is told
   * nothing and believes the change stuck.
   *
   * Deliberately simpler than `StandupRunScreen`'s optimistic-rollback
   * machinery: nothing here is applied before the server answers, so there is
   * nothing to roll back.
   */
  const onChangeHours = useCallback(
    async (allocationId: string, plannedMinutes: Minutes) => {
      setNotice(null)
      try {
        const result = await api.changeHours({
          allocationId,
          plannedMinutes,
          expectedVersion: version
        })
        setVersion(result.standupVersion)
      } catch {
        setNotice(standupStrings.my.editRejected())
      }
    },
    [api, version]
  )

  const onAdd = useCallback(
    async (taskId: string) => {
      setNotice(null)
      try {
        const result = await api.addAllocation({
          memberId: member.memberId,
          taskId,
          selfSelect: true,
          expectedVersion: version
        })
        setVersion(result.standupVersion)
      } catch {
        setNotice(standupStrings.my.addRejected())
      }
    },
    [api, member.memberId, version]
  )

  return (
    <div className="flex flex-col gap-4 p-4">
      <header className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold">{standupStrings.my.title()}</h1>
        <span className="text-sm text-muted-foreground">
          {scheduledStartAt && viewerTimeZone && projectTimeZone
            ? formatDualTimezone({
                instant: new Date(scheduledStartAt),
                viewerTimeZone,
                projectTimeZone
              })
            : date}
        </span>
      </header>

      {member.capacity.adjustments.length > 0 && (
        <ul className="flex flex-col gap-1 rounded-md border border-border p-2 text-xs text-muted-foreground">
          {member.capacity.adjustments.map((adjustment, index) => (
            <li key={`${adjustment.type}-${index}`}>
              {adjustment.label}: {formatMinutesAsHours(adjustment.minutes, { locale })}
            </li>
          ))}
        </ul>
      )}

      {/* `status`, not `alert`: it reports what already happened rather than
          interrupting — the same choice the run screen's notice makes. */}
      {notice && (
        <p role="status" className="rounded-md border border-border bg-muted p-2 text-sm">
          {notice}
        </p>
      )}

      {readOnly && (
        <p className="rounded-md border border-border bg-muted p-2 text-sm text-muted-foreground">
          {standupStrings.my.readOnlyBanner()}
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {member.allocations.map((row) => (
          <li key={row.allocationId} className="rounded-md border border-border p-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">{row.title}</span>
              <span className="font-mono text-xs text-muted-foreground">{row.taskKey}</span>
            </div>
            <label className="mt-1 flex items-center gap-2 text-xs">
              {standupStrings.my.hoursFor({ title: row.title })}
              <input
                aria-label={standupStrings.my.hoursFor({ title: row.title })}
                type="number"
                step={15}
                min={0}
                disabled={readOnly}
                defaultValue={row.plannedMinutes}
                onBlur={(event) =>
                  void onChangeHours(row.allocationId, Number(event.target.value) as Minutes)
                }
                className="w-20 rounded-md border border-border px-2 py-1"
              />
              <span>{formatMinutesAsHours(row.plannedMinutes, { locale })}</span>
            </label>
          </li>
        ))}
      </ul>

      {allowSelfSelect && poolTasks.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold">{standupStrings.pool.title()}</h2>
          <p className="text-xs text-muted-foreground">{standupStrings.my.selfSelectHint()}</p>
          {poolTasks.map((task) => (
            <button
              key={task.taskId}
              type="button"
              disabled={readOnly}
              onClick={() => void onAdd(task.taskId)}
              className="rounded-md border border-border px-2 py-1 text-left text-sm disabled:opacity-40"
            >
              {standupStrings.my.addTask({ key: task.key ?? task.taskId })} — {task.title}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
