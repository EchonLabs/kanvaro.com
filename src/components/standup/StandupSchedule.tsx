'use client'

/**
 * The Schedule hub list (spec §15.6, UI-8, UI-9).
 *
 * The screen a PM opens every morning, so it answers one question first —
 * "what am I running today?" — and everything else second.
 *
 * UI-8: today's row is pinned to the top of the list and given the dominant
 * treatment, so it is found without reading.
 * UI-9: skipped days stay in the list with their reason. Filtering them would
 * make a sprint that lost a day to a holiday look like a shorter sprint, and
 * would leave the holiday visible only to whoever declared it.
 */
import Link from 'next/link'
import { AlertTriangle, CalendarOff, CheckCircle2, CircleDot, Clock, RotateCcw } from 'lucide-react'

import type { ScheduleDay, SprintSchedule } from '@/lib/standup/schedule'
import { standupStrings } from '@/lib/standup/strings'
import { cn } from '@/lib/utils'

const { schedule: strings } = standupStrings

/** Days that cannot be opened: there is no meeting behind them. */
const UNOPENABLE = ['Skipped_Holiday', 'Cancelled']

const STATUS_TONE: Record<string, string> = {
  Scheduled: 'text-[var(--apple-secondary-label)]',
  Ready: 'text-[var(--apple-system-blue)]',
  In_Progress: 'text-[var(--apple-system-blue)]',
  Completed: 'text-[var(--apple-system-green)]',
  Reopened: 'text-[var(--apple-system-orange)]',
  Missed: 'text-[var(--apple-system-red)]',
  Skipped_Holiday: 'text-[var(--apple-tertiary-label)]',
  Cancelled: 'text-[var(--apple-tertiary-label)]'
}

function StatusIcon({ status }: { status: string }) {
  const className = cn('h-4 w-4 shrink-0', STATUS_TONE[status])

  if (status === 'Completed') return <CheckCircle2 className={className} />
  if (status === 'Reopened') return <RotateCcw className={className} />
  if (status === 'Missed') return <AlertTriangle className={className} />
  if (UNOPENABLE.includes(status)) return <CalendarOff className={className} />
  if (status === 'In_Progress' || status === 'Ready') return <CircleDot className={className} />
  return <Clock className={className} />
}

function formatDate(date: string): string {
  // Parsed as UTC on purpose: `date` is a calendar date, not an instant, and
  // reading it in the viewer's zone would shift it a day for anyone west of UTC.
  const [year, month, day] = date.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    weekday: 'short',
    timeZone: 'UTC'
  })
}

function formatTime(instant: string, timezone: string): string {
  return new Date(instant).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: timezone
  })
}

function shapeLabel(day: ScheduleDay): string | null {
  if (day.shape === 'day_one') return strings.dayOne()
  if (day.shape === 'final_day') return strings.finalDay()
  return null
}

function DayRow({
  day,
  timezone,
  isToday
}: {
  day: ScheduleDay
  timezone: string
  isToday: boolean
}) {
  const shape = shapeLabel(day)
  const openable = !UNOPENABLE.includes(day.status)

  const body = (
    <div
      data-testid={isToday ? 'schedule-today' : 'schedule-day'}
      data-today={isToday ? 'true' : undefined}
      className={cn(
        'apple-transition flex items-start gap-3 rounded-[var(--apple-radius-lg)] border px-4 py-3',
        isToday
          ? 'border-[var(--apple-system-blue)]/40 bg-[var(--apple-system-blue)]/[0.06] shadow-[0_1px_4px_rgba(0,0,0,0.07)] dark:shadow-none'
          : 'border-[var(--apple-separator)] bg-card',
        openable && 'hover:-translate-y-0.5 hover:shadow-[0_8px_28px_rgba(0,0,0,0.11)]',
        UNOPENABLE.includes(day.status) && 'opacity-70'
      )}
    >
      <StatusIcon status={day.status} />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span
            className={cn(
              'font-medium text-[var(--apple-label)]',
              isToday && 'text-[15px]'
            )}
          >
            {formatDate(day.date)}
          </span>

          {isToday ? (
            <span className="apple-section-label text-[var(--apple-system-blue)]">
              {strings.today()}
            </span>
          ) : null}

          <span className="font-apple-mono text-xs text-[var(--apple-tertiary-label)]">
            {strings.dayLabel({
              number: day.sprintDayNumber,
              total: day.totalSprintDays
            })}
          </span>
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          <span className={STATUS_TONE[day.status]}>
            {strings.status[day.status] ?? day.status}
          </span>

          {openable ? (
            <span className="font-apple-mono text-xs text-[var(--apple-tertiary-label)]">
              {formatTime(day.scheduledStartAt, timezone)}
            </span>
          ) : null}

          {shape ? (
            <span className="text-xs text-[var(--apple-secondary-label)]">{shape}</span>
          ) : null}

          {day.wasBackfilled ? (
            <span className="text-xs text-[var(--apple-secondary-label)]">
              {strings.backfilled()}
            </span>
          ) : null}
        </div>

        {/* UI-9: the reason is the whole point of keeping the row. */}
        {day.skippedReason || day.cancelledReason ? (
          <p className="mt-1 text-sm text-[var(--apple-secondary-label)]">
            {day.skippedReason ?? day.cancelledReason}
          </p>
        ) : null}

        {/* CAL-14: what this stand-up displayed when it ran, if the schedule
            has since been renumbered underneath it. */}
        {day.displayedDayNumber !== undefined &&
        day.displayedDayNumber !== day.sprintDayNumber ? (
          <p className="mt-1 text-xs text-[var(--apple-tertiary-label)]">
            {strings.frozenDayNumber({ number: day.displayedDayNumber })}
          </p>
        ) : null}

        {day.hasCalendarAnomaly ? (
          <p className="mt-1 text-xs text-[var(--apple-system-orange)]">
            {strings.calendarAnomaly()}
          </p>
        ) : null}
      </div>
    </div>
  )

  if (!openable) return body

  return (
    <Link href={`/standups/${day.standupId}`} className="block">
      {body}
    </Link>
  )
}

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
    <div className="flex flex-col gap-2">
      {/* UI-8: lifted out of the list rather than merely highlighted in place,
          so it is the first thing on screen however long the sprint is. */}
      {today ? (
        <DayRow day={today} timezone={schedule.timezone} isToday />
      ) : null}

      {rest.map((day) => (
        <DayRow key={day.standupId} day={day} timezone={schedule.timezone} isToday={false} />
      ))}
    </div>
  )
}
