'use client'

import { useCallback, useState } from 'react'
import { AlertOctagon, CheckCircle2, Circle, CircleDot, History } from 'lucide-react'
import { HoursValue } from '../shared/HoursValue'
import { IconChip, type IconChipTone } from '../shared/IconChip'
import { SectionCard } from '../shared/SectionCard'
import { StatusPill } from '../shared/StatusPill'
import { formatMinutesAsHours, sumMinutes } from '@/lib/standup/minutes'
import { standupStrings } from '@/lib/standup/strings'
import type { YesterdayPanelData, YesterdayRow } from '@/lib/standup/yesterday-service'
import type { VarianceRow } from '@/lib/standup/variance-service'

const STATUS_OPTIONS = ['todo', 'in_progress', 'blocked', 'done']

const STATUS_ICON: Record<string, { icon: React.ReactNode; tone: IconChipTone }> = {
  done: { icon: <CheckCircle2 strokeWidth={1.75} />, tone: 'green' },
  in_progress: { icon: <CircleDot strokeWidth={1.75} />, tone: 'blue' },
  blocked: { icon: <AlertOctagon strokeWidth={1.75} />, tone: 'red' },
  todo: { icon: <Circle strokeWidth={1.75} />, tone: 'neutral' }
}

export interface YesterdaySectionApi {
  updateYesterdayRow(input: {
    taskId: string
    status?: string
    loggedMinutes?: number
    expectedVersion: number
  }): Promise<{ standupVersion: number; panel: YesterdayPanelData }>
}

export interface YesterdaySectionProps {
  standupId: string
  memberId: string
  panel?: YesterdayPanelData
  varianceRows?: VarianceRow[]
  readOnly: boolean
  api: YesterdaySectionApi
  expectedVersion: number
  onVersionChange: (version: number) => void
  locale?: string
}

/**
 * Design §4.4 — the UI-12 lever: fixing yesterday's status/hours here is what
 * keeps the actual meeting short. Status and logged-hours controls are plain,
 * Apple-token-styled `<select>`/`<input>` rather than the Radix `Select`
 * primitive — matching `YesterdayPanel.tsx`'s own run-screen sibling, and
 * avoiding a jsdom-portal testing cost for a control this small.
 */
export function YesterdaySection({
  memberId,
  panel,
  varianceRows,
  readOnly,
  api,
  expectedVersion,
  onVersionChange,
  locale
}: YesterdaySectionProps) {
  const [notice, setNotice] = useState<string | null>(null)

  const onChangeStatus = useCallback(
    async (taskId: string, status: string) => {
      setNotice(null)
      try {
        const result = await api.updateYesterdayRow({ taskId, status, expectedVersion })
        onVersionChange(result.standupVersion)
      } catch {
        setNotice(standupStrings.my.editRejected())
      }
    },
    [api, expectedVersion, onVersionChange]
  )

  const onChangeLogged = useCallback(
    async (taskId: string, loggedMinutes: number) => {
      setNotice(null)
      try {
        const result = await api.updateYesterdayRow({ taskId, loggedMinutes, expectedVersion })
        onVersionChange(result.standupVersion)
      } catch {
        setNotice(standupStrings.my.editRejected())
      }
    },
    [api, expectedVersion, onVersionChange]
  )

  if (!panel) {
    return (
      <SectionCard title={standupStrings.my.yesterdayHeader()} icon={<History strokeWidth={1.75} />}>
        <p className="text-[15px] text-[var(--apple-secondary-label)]">
          {standupStrings.my.sectionLoadFailed()}
        </p>
      </SectionCard>
    )
  }

  const myRows: YesterdayRow[] = panel.buckets.flatMap((bucket) =>
    bucket.rows.filter((row) => row.memberId === memberId)
  )

  if (!panel.previousStandupId || myRows.length === 0) {
    return (
      <SectionCard title={standupStrings.my.yesterdayHeader()} icon={<History strokeWidth={1.75} />}>
        <p className="text-[15px] text-[var(--apple-secondary-label)]">
          {standupStrings.my.yesterdayEmpty()}
        </p>
      </SectionCard>
    )
  }

  const doneCount = myRows.filter((row) => row.currentStatus === 'done').length
  const totalLogged = sumMinutes(myRows, (row) => row.loggedMinutes)
  const varianceByTask = new Map((varianceRows ?? []).map((row) => [row.taskId, row]))

  return (
    <SectionCard
      title={standupStrings.my.yesterdayHeader()}
      icon={<History strokeWidth={1.75} />}
      summary={
        <>
          {standupStrings.my.yesterdayCount({ done: doneCount, total: myRows.length })}
          {standupStrings.my.yesterdayLoggedTotal({ hours: formatMinutesAsHours(totalLogged, { locale }) })}
        </>
      }
    >
      {notice ? (
        <p role="status" className="text-[13px] text-[var(--apple-system-red)]">
          {notice}
        </p>
      ) : null}

      <div className="flex flex-col gap-2">
        {myRows.map((row) => {
          const variance = varianceByTask.get(row.taskId)
          const statusVisual = STATUS_ICON[row.currentStatus] ?? STATUS_ICON.todo
          return (
            <div
              key={row.allocationId ?? row.taskId}
              className="flex gap-3 rounded-[var(--apple-radius-sm)] border border-[var(--apple-separator)] bg-card p-3"
            >
              <IconChip icon={statusVisual.icon} tone={statusVisual.tone} />

              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate text-[15px] font-medium text-[var(--apple-label)]">
                      {row.title}
                    </span>
                    <span className="font-apple-mono text-[13px] text-[var(--apple-tertiary-label)]">
                      {row.taskKey}
                    </span>
                  </div>
                  {variance?.chronicSpill ? (
                    <StatusPill tone="orange">
                      {standupStrings.my.chronicSpill({ count: variance.spillChainLength })}
                    </StatusPill>
                  ) : null}
                </div>

                <div className="flex flex-wrap items-end gap-4">
                  <label className="flex flex-col gap-1">
                    <span className="apple-section-label text-[var(--apple-tertiary-label)]">Status</span>
                    <select
                      aria-label={standupStrings.my.statusFor({ key: row.taskKey ?? row.taskId })}
                      value={row.currentStatus}
                      disabled={readOnly}
                      onChange={(event) => void onChangeStatus(row.taskId, event.target.value)}
                      className="h-8 rounded-[var(--apple-radius-sm)] border border-[var(--apple-separator)] bg-card px-2 text-[13px] text-[var(--apple-label)] disabled:opacity-40"
                    >
                      {STATUS_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>

                  <div className="flex flex-col gap-1">
                    <span className="apple-section-label text-[var(--apple-tertiary-label)]">Planned</span>
                    <HoursValue minutes={row.plannedMinutes} locale={locale} label="Planned" />
                  </div>

                  <label className="flex flex-col gap-1">
                    <span className="apple-section-label text-[var(--apple-tertiary-label)]">Logged</span>
                    <input
                      type="number"
                      step={15}
                      min={0}
                      aria-label={`Logged hours for ${row.taskKey ?? row.taskId}`}
                      disabled={readOnly}
                      defaultValue={row.loggedMinutes}
                      onBlur={(event) => void onChangeLogged(row.taskId, Number(event.target.value))}
                      className="h-8 w-16 rounded-[var(--apple-radius-sm)] border border-[var(--apple-separator)] bg-card px-2 text-[13px] text-[var(--apple-label)] disabled:opacity-40"
                    />
                  </label>

                  <div className="flex flex-col gap-1">
                    <span className="apple-section-label text-[var(--apple-tertiary-label)]">Variance</span>
                    <HoursValue
                      minutes={row.dayVarianceMinutes}
                      locale={locale}
                      signed
                      label="Variance"
                      tone={row.dayVarianceMinutes > 0 ? 'red' : row.dayVarianceMinutes < 0 ? 'orange' : 'neutral'}
                    />
                  </div>
                </div>

                {variance?.explanation ? (
                  <p className="text-[13px] text-[var(--apple-secondary-label)]">{variance.explanation}</p>
                ) : null}
              </div>
            </div>
          )
        })}
      </div>
    </SectionCard>
  )
}
