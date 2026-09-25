'use client'

import { useCallback, useState } from 'react'
import { JourneyNote, JourneyStep, type JourneyStepProps } from '../shared/JourneyStep'
import { TAG_TONE_CLASSES, type TagTone } from '../shared/Tag'
import { TaskTitle } from '../shared/TaskTitle'
import {
  MINUTES_PER_HOUR,
  formatMinutesAsHours,
  hoursToMinutes,
  minutes as toMinutes,
  roundToStep,
  sumMinutes
} from '@/lib/standup/minutes'
import { standupStrings } from '@/lib/standup/strings'
import { cn } from '@/lib/utils'
import type { YesterdayPanelData, YesterdayRow } from '@/lib/standup/yesterday-service'
import type { VarianceRow } from '@/lib/standup/variance-service'

const STATUS_OPTIONS = ['todo', 'in_progress', 'blocked', 'done']

const STATUS_TONE: Record<string, TagTone> = {
  done: 'green',
  in_progress: 'blue',
  blocked: 'red',
  todo: 'neutral'
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

const STEP = {
  step: 1,
  title: standupStrings.my.yesterdayStepTitle(),
  subtitle: standupStrings.my.yesterdayStepSubtitle()
}

/**
 * Journey step 1 — the UI-12 lever: fixing yesterday's status/hours here is
 * what keeps the actual meeting short. Status and logged-hours controls are
 * plain `<select>`/`<input>` rather than the Radix `Select` primitive —
 * matching `YesterdayPanel.tsx`'s own run-screen sibling, and avoiding a
 * jsdom-portal testing cost for a control this small.
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
      <JourneyStep {...STEP}>
        <JourneyNote>{standupStrings.my.sectionLoadFailed()}</JourneyNote>
      </JourneyStep>
    )
  }

  const myRows: YesterdayRow[] = panel.buckets.flatMap((bucket) =>
    bucket.rows.filter((row) => row.memberId === memberId)
  )

  if (!panel.previousStandupId || myRows.length === 0) {
    return (
      <JourneyStep {...STEP} state={{ label: standupStrings.my.stateNothingToReview(), tone: 'neutral' }}>
        <JourneyNote>{standupStrings.my.yesterdayEmpty()}</JourneyNote>
      </JourneyStep>
    )
  }

  const doneCount = myRows.filter((row) => row.currentStatus === 'done').length
  const totalLogged = sumMinutes(myRows, (row) => row.loggedMinutes)
  const varianceByTask = new Map((varianceRows ?? []).map((row) => [row.taskId, row]))
  const state: JourneyStepProps['state'] = readOnly
    ? { label: standupStrings.my.stateCompleted(), tone: 'green' }
    : { label: standupStrings.my.stateInProgress(), tone: 'blue' }

  return (
    <JourneyStep {...STEP} state={state}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
        <div className="flex shrink-0 items-center gap-3 whitespace-nowrap text-[13px] text-[var(--my-muted)]">
          <p>
            {standupStrings.my.yesterdayDone()}{' '}
            <strong className="font-bold text-[var(--my-green)]">{doneCount}</strong>
          </p>
          <span aria-hidden className="text-[var(--my-subtle)]">
            |
          </span>
          <p>
            {standupStrings.my.yesterdayLogged()}{' '}
            <strong className="font-bold text-[var(--my-text)]">
              {standupStrings.my.loggedHours({
                hours: formatMinutesAsHours(totalLogged, { locale, withUnit: false })
              })}
            </strong>
          </p>
        </div>
        <p className="min-w-0 flex-1 text-[14px] leading-5 text-[var(--my-muted)]">
          {readOnly ? standupStrings.my.yesterdayLockedNote() : standupStrings.my.yesterdayEditableNote()}
        </p>
      </div>

      {notice ? (
        <p role="status" className="text-[13px] text-[var(--my-red)]">
          {notice}
        </p>
      ) : null}

      <div className="flex w-full flex-col" role="table" aria-label={STEP.title}>
        <div
          role="row"
          className="hidden items-start rounded-t-lg bg-[var(--my-raised)] px-3 py-2.5 text-[12px] font-semibold text-[var(--my-muted)] sm:flex"
        >
          <span role="columnheader" className="min-w-0 flex-1">
            {standupStrings.my.columnTask()}
          </span>
          <span role="columnheader" className="w-[120px] shrink-0 text-center">
            {standupStrings.my.columnPlannedVsLogged()}
          </span>
          <span role="columnheader" className="w-[100px] shrink-0 text-right">
            {standupStrings.my.columnLogged()}
          </span>
          <span role="columnheader" className="w-[120px] shrink-0 text-right">
            {standupStrings.my.columnStatus()}
          </span>
        </div>

        {myRows.map((row) => {
          const variance = varianceByTask.get(row.taskId)
          const key = row.taskKey ?? row.taskId
          const carried = variance && variance.spillChainLength >= 2 ? variance.spillChainLength : 0
          return (
            <div
              key={row.allocationId ?? row.taskId}
              role="row"
              className="flex flex-wrap items-center gap-3 border-b border-[var(--my-raised)] p-3 last:border-b-0 sm:flex-nowrap"
            >
              <div role="cell" className="flex w-full min-w-0 flex-col gap-1 sm:w-auto sm:flex-1">
                <div className="flex min-w-0 items-center gap-2">
                  <TaskTitle taskKey={row.taskKey} title={row.title} />
                  {carried ? (
                    <span className="shrink-0 rounded-[4px] bg-[var(--my-violet-tint)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--my-violet)]">
                      {standupStrings.my.carryBadge({ count: carried })}
                    </span>
                  ) : null}
                </div>
                {variance?.explanation ? (
                  <p className="text-[12px] text-[var(--my-subtle)]">{variance.explanation}</p>
                ) : null}
              </div>

              <div role="cell" className="flex shrink-0 flex-col items-start sm:w-[120px] sm:items-center">
                <span className="my-mono whitespace-nowrap text-[13px] text-[var(--my-muted)]">
                  {formatMinutesAsHours(row.plannedMinutes, { locale })} /{' '}
                  {formatMinutesAsHours(row.loggedMinutes, { locale })}
                </span>
                <VarianceLine minutes={row.dayVarianceMinutes} locale={locale} />
              </div>

              <div role="cell" className="flex shrink-0 items-center sm:ml-0 sm:w-[100px] sm:justify-end">
                <LoggedHoursInput
                  label={`Logged hours for ${key}`}
                  loggedMinutes={row.loggedMinutes}
                  disabled={readOnly}
                  onCommit={(value) => void onChangeLogged(row.taskId, value)}
                />
              </div>

              <div role="cell" className="ml-auto flex shrink-0 items-center justify-end sm:ml-0 sm:w-[120px]">
                {/* Styled as the design's status badge; once locked it reads as one too. */}
                <StatusSelect
                  label={standupStrings.my.statusFor({ key })}
                  value={row.currentStatus}
                  disabled={readOnly}
                  onChange={(value) => void onChangeStatus(row.taskId, value)}
                />
              </div>
            </div>
          )
        })}
      </div>
    </JourneyStep>
  )
}

function VarianceLine({ minutes, locale }: { minutes: number; locale?: string }) {
  if (minutes === 0) {
    return <span className="text-[11px] text-[var(--my-green)]">{standupStrings.my.perfectMatch()}</span>
  }
  return (
    <span className={cn('text-[11px]', minutes > 0 ? 'text-[var(--my-amber)]' : 'text-[var(--my-blue)]')}>
      {standupStrings.my.varianceAmount({
        hours: formatMinutesAsHours(minutes as any, { locale, signed: true })
      })}
    </span>
  )
}

function StatusSelect({
  label,
  value,
  onChange,
  disabled
}: {
  label: string
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}) {
  return (
    <select
      aria-label={label}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      className={cn(
        'cursor-pointer appearance-none rounded-[4px] border-0 px-2.5 py-1 text-right text-[12px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--my-blue)] disabled:cursor-default disabled:opacity-100',
        TAG_TONE_CLASSES[STATUS_TONE[value] ?? 'neutral']
      )}
    >
      {STATUS_OPTIONS.map((option) => (
        <option key={option} value={option}>
          {standupStrings.my.taskStatus[option] ?? option}
        </option>
      ))}
    </select>
  )
}

function LoggedHoursInput({
  label,
  loggedMinutes,
  disabled,
  onCommit
}: {
  label: string
  loggedMinutes: number
  disabled: boolean
  onCommit: (minutes: number) => void
}) {
  return (
    <label className="group flex items-center rounded-[4px] border border-[var(--my-border)] bg-[var(--my-surface)] px-2 py-1 focus-within:border-[var(--my-blue)]">
      <input
        type="number"
        inputMode="decimal"
        step={0.25}
        min={0}
        aria-label={label}
        disabled={disabled}
        defaultValue={hoursText(loggedMinutes)}
        onBlur={(event) => {
          const parsed = Number(event.target.value)
          if (!Number.isFinite(parsed) || parsed < 0) {
            event.target.value = hoursText(loggedMinutes)
            return
          }
          const snapped = roundToStep(hoursToMinutes(parsed), toMinutes(15))
          event.target.value = hoursText(snapped)
          onCommit(snapped)
        }}
        className="my-mono w-9 appearance-none bg-transparent text-right text-[13px] text-[var(--my-muted)] outline-none [appearance:textfield] focus:font-bold focus:text-[var(--my-blue)] disabled:cursor-not-allowed [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      <span className="my-mono text-[13px] text-[var(--my-muted)] group-focus-within:font-bold group-focus-within:text-[var(--my-blue)]">
        h
      </span>
    </label>
  )
}

/** Same convention as the run screen's `YesterdayPanel.tsx`: an editable hours field shows exactly what will be committed, never a rounded display value. */
function hoursText(value: number): string {
  return String(Number((value / MINUTES_PER_HOUR).toFixed(2)))
}
