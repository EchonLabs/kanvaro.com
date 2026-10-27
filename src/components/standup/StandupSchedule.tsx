'use client'

/**
 * The Schedule hub list (spec §15.6, §15.7, UI-8, UI-9).
 *
 * The screen a PM opens every morning, so it answers one question first —
 * "what am I running today?" — and everything else second.
 *
 * UI-8: today's row is pinned to the top of the list and given dominant
 * treatment via `TodayStandupHero`, so it is found without reading.
 * UI-9: skipped days stay in the list with their reason via `SkippedHolidayDivider`.
 */
import type { SprintSchedule } from '@/lib/standup/schedule'
import { standupStrings } from '@/lib/standup/strings'

import { SkippedHolidayDivider } from './schedule/SkippedHolidayDivider'
import { StandupTimelineRow } from './schedule/StandupTimeline'
import { TodayStandupHero } from './schedule/TodayStandupHero'

const { schedule: strings } = standupStrings

/** Days that cannot be opened: there is no meeting behind them. */
const UNOPENABLE = ['Skipped_Holiday', 'Cancelled']

export function StandupSchedule({ schedule }: { schedule: SprintSchedule }) {
  if (schedule.days.length === 0) {
    return (
      <p className="rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card px-4 py-6 text-sm text-[var(--apple-secondary-label)]">
        {strings.empty()}
      </p>
    )
  }

  const todayIndex = schedule.days.findIndex((day) => day.date === schedule.today)
  const today = todayIndex === -1 ? null : schedule.days[todayIndex]
  const rest = schedule.days.filter((_, index) => index !== todayIndex)

  return (
    <div className="flex flex-col gap-6">
      {/* UI-8: lifted out of the list rather than merely highlighted in place,
          so it is the first thing on screen however long the sprint is. */}
      {today ? (
        <div className="flex flex-col gap-2">
          <TodayStandupHero
            day={today}
            timezone={schedule.timezone}
            projectId={schedule.projectId}
            sprintId={schedule.sprintId}
          />
        </div>
      ) : null}

      {rest.length > 0 ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between px-1">
            <span className="apple-section-label text-[var(--apple-tertiary-label)]">
              {today ? strings.sprintDays() : strings.title()}
            </span>
            <span className="font-apple-mono text-xs text-[var(--apple-secondary-label)] tabular-nums">
              {rest.length} {rest.length === 1 ? 'day' : 'days'}
            </span>
          </div>

          <div className="flex flex-col gap-2.5">
            {rest.map((day) => {
              if (UNOPENABLE.includes(day.status)) {
                return <SkippedHolidayDivider key={day.standupId} day={day} />
              }

              return (
                <StandupTimelineRow
                  key={day.standupId}
                  day={day}
                  timezone={schedule.timezone}
                  projectId={schedule.projectId}
                  sprintId={schedule.sprintId}
                />
              )
            })}
          </div>
        </div>
      ) : null}
    </div>
  )
}
