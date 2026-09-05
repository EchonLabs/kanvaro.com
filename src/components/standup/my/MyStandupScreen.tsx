'use client'

import { useCallback, useState } from 'react'

import { standupStrings } from '@/lib/standup/strings'
import { formatMinutesAsHours, type Minutes } from '@/lib/standup/minutes'
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
  removeAllocation(input: {
    allocationId: string
    expectedVersion: number
  }): Promise<{ standupVersion: number }>
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
}

/**
 * UI-12 / P11-5. A mobile-first, single-member slice of the run screen — not
 * a second implementation of it. RUN-26's lock uses the identical condition
 * `StandupRunScreen.tsx` uses: `status !== 'Ready'`.
 */
export function MyStandupScreen({
  standupId: _standupId,
  standupVersion,
  status,
  date,
  member,
  poolTasks,
  allowSelfSelect,
  api,
  locale
}: MyStandupScreenProps) {
  const [version, setVersion] = useState(standupVersion)
  const readOnly = status !== 'Ready'

  const onChangeHours = useCallback(
    async (allocationId: string, plannedMinutes: Minutes) => {
      const result = await api.changeHours({ allocationId, plannedMinutes, expectedVersion: version })
      setVersion(result.standupVersion)
    },
    [api, version]
  )

  const onAdd = useCallback(
    async (taskId: string) => {
      const result = await api.addAllocation({
        memberId: member.memberId,
        taskId,
        selfSelect: true,
        expectedVersion: version
      })
      setVersion(result.standupVersion)
    },
    [api, member.memberId, version]
  )

  return (
    <div className="flex flex-col gap-4 p-4">
      <header className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold">{standupStrings.my.title()}</h1>
        <span className="text-sm text-muted-foreground">{date}</span>
      </header>

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
