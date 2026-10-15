'use client'

/**
 * Stand-up Timeline / Ledger (spec §15.7).
 *
 * Displays sprint days in date order with operational indicators:
 * allocation %, overrides, carry-forwards, actual duration, and facilitator.
 */
import Link from 'next/link'
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  CircleDot,
  Clock,
  RotateCcw,
  User
} from 'lucide-react'

import { Badge } from '@/components/ui/Badge'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { StatusPill, type StatusPillTone } from '@/components/standup/my/shared/StatusPill'
import type { ScheduleDay } from '@/lib/standup/schedule'
import { standupStrings } from '@/lib/standup/strings'
import { cn } from '@/lib/utils'

const { schedule: strings } = standupStrings

const STATUS_ICONS: Record<string, any> = {
  Completed: CheckCircle2,
  Reopened: RotateCcw,
  Missed: AlertTriangle,
  In_Progress: CircleDot,
  Ready: CircleDot,
  Scheduled: Clock
}

/** Same tone→Apple-colour mapping `StatusPill`/`TodayStandupHero` use — one source of truth for what each status looks like. */
const STATUS_TONE: Record<string, StatusPillTone> = {
  Scheduled: 'neutral',
  Ready: 'blue',
  In_Progress: 'blue',
  Completed: 'green',
  Reopened: 'orange',
  Missed: 'red'
}

const TONE_ICON_CLASSES: Record<StatusPillTone, string> = {
  blue: 'bg-[var(--apple-system-blue)]/10 text-[var(--apple-system-blue)]',
  green: 'bg-[var(--apple-system-green)]/10 text-[var(--apple-system-green)]',
  orange: 'bg-[var(--apple-system-orange)]/10 text-[var(--apple-system-orange)]',
  red: 'bg-[var(--apple-system-red)]/10 text-[var(--apple-system-red)]',
  neutral: 'bg-[var(--apple-tertiary-fill)] text-[var(--apple-tertiary-label)]'
}

const METRIC_TONE_CLASSES: Record<'green' | 'orange' | 'neutral', string> = {
  green:
    'border-[var(--apple-system-green)]/30 text-[var(--apple-system-green)] bg-[var(--apple-system-green)]/10',
  orange:
    'border-[var(--apple-system-orange)]/30 text-[var(--apple-system-orange)] bg-[var(--apple-system-orange)]/10',
  neutral: 'border-[var(--apple-separator)] text-[var(--apple-secondary-label)]'
}

function formatDate(date: string): string {
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

export function StandupTimelineRow({
  day,
  timezone,
  projectId,
  sprintId
}: {
  day: ScheduleDay
  timezone: string
  projectId: string
  sprintId: string
}) {
  const shape = shapeLabel(day)
  const statusTone = STATUS_TONE[day.status] ?? 'neutral'
  const StatusIcon = STATUS_ICONS[day.status] ?? Clock
  const isCompleted = day.status === 'Completed'

  const content = (
    <div
      data-testid="schedule-day"
      className="apple-transition flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card px-4 py-3.5 hover:border-[var(--apple-system-blue)]/30 hover:shadow-[0_2px_8px_rgba(0,0,0,0.04)] dark:hover:shadow-none"
    >
      {/* Left: Day info, Status & Facilitator */}
      <div className="flex items-start sm:items-center gap-3 min-w-0 flex-1">
        <div className={cn('mt-0.5 sm:mt-0 flex h-7 w-7 shrink-0 items-center justify-center rounded-full', TONE_ICON_CLASSES[statusTone])}>
          <StatusIcon className="h-3.5 w-3.5" strokeWidth={1.75} />
        </div>

        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="font-medium text-[15px] text-[var(--apple-label)]">
              {formatDate(day.date)}
            </span>

            <span className="font-apple-mono text-xs text-[var(--apple-tertiary-label)] tabular-nums">
              {strings.dayLabel({
                number: day.sprintDayNumber,
                total: day.totalSprintDays
              })}
            </span>

            <StatusPill tone={statusTone}>{strings.status[day.status] ?? day.status}</StatusPill>

            {shape && (
              <span className="text-xs text-[var(--apple-secondary-label)]">
                · {shape}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--apple-secondary-label)]">
            <span className="flex items-center gap-1 font-apple-mono tabular-nums">
              <Clock className="h-3 w-3 text-[var(--apple-tertiary-label)]" />
              {formatTime(day.scheduledStartAt, timezone)}
            </span>

            <span>·</span>

            <span className="flex items-center gap-1">
              <User className="h-3 w-3 text-[var(--apple-tertiary-label)]" />
              {day.facilitatorName}
            </span>

            {day.wasBackfilled && (
              <>
                <span>·</span>
                <span className="text-[var(--apple-secondary-label)] font-medium">
                  {strings.backfilled()}
                </span>
              </>
            )}

            {day.actualDurationMinutes !== undefined && (
              <>
                <span>·</span>
                <span className="font-apple-mono tabular-nums">
                  {strings.metrics.duration({ minutes: day.actualDurationMinutes })}
                </span>
              </>
            )}

            {day.attendance && (
              <>
                <span>·</span>
                <span className="font-apple-mono tabular-nums">
                  {strings.metrics.attendance({
                    present: day.attendance.present,
                    total: day.attendance.total
                  })}
                </span>
              </>
            )}
          </div>

          {/* Frozen day or calendar anomaly note */}
          {day.displayedDayNumber !== undefined &&
          day.displayedDayNumber !== day.sprintDayNumber ? (
            <p className="text-xs text-[var(--apple-tertiary-label)]">
              {strings.frozenDayNumber({ number: day.displayedDayNumber })}
            </p>
          ) : null}

          {day.hasCalendarAnomaly ? (
            <p className="text-xs text-[var(--apple-system-orange)] flex items-center gap-1">
              <AlertTriangle className="h-3 w-3 shrink-0" />
              {strings.calendarAnomaly()}
            </p>
          ) : null}
        </div>
      </div>

      {/* Right: Operational Metrics (Allocation, Overrides, CFW) */}
      <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 pt-2 sm:pt-0 sm:ml-4 shrink-0">
        {day.allocationPercentage !== undefined ? (
          <Badge
            variant="secondary"
            className={cn(
              'text-[11px] font-apple-mono tabular-nums rounded-[var(--apple-radius-sm)] border',
              METRIC_TONE_CLASSES[day.allocationPercentage >= 90 ? 'green' : 'orange']
            )}
          >
            {strings.metrics.allocation({ percent: day.allocationPercentage })}
          </Badge>
        ) : isCompleted ? (
          <Badge
            variant="secondary"
            className={cn('text-[11px] rounded-[var(--apple-radius-sm)] border', METRIC_TONE_CLASSES.neutral)}
          >
            {strings.metrics.unallocated()}
          </Badge>
        ) : null}

        {day.carryForwardCount !== undefined && day.carryForwardCount > 0 ? (
          <Badge
            variant="secondary"
            className={cn('text-[11px] font-apple-mono tabular-nums rounded-[var(--apple-radius-sm)] border', METRIC_TONE_CLASSES.orange)}
          >
            {strings.metrics.carryForward({ count: day.carryForwardCount })}
          </Badge>
        ) : null}

        {day.overridesCount !== undefined && day.overridesCount > 0 ? (
          <Badge
            variant="secondary"
            className={cn('text-[11px] font-apple-mono tabular-nums rounded-[var(--apple-radius-sm)] border', METRIC_TONE_CLASSES.neutral)}
          >
            {strings.metrics.overrides({ count: day.overridesCount })}
          </Badge>
        ) : null}

        <div className="hidden sm:flex items-center text-[var(--apple-tertiary-label)] pl-1">
          <ArrowRight className="h-4 w-4" />
        </div>
      </div>
    </div>
  )

  // §3.3: a completed day links straight to its summary rather than the run
  // screen — matching `TodayStandupHero`'s own branch for the same status.
  const href = isCompleted
    ? `/projects/${projectId}/sprints/${sprintId}/standups/${day.standupId}/summary`
    : `/projects/${projectId}/sprints/${sprintId}/standups/${day.standupId}`

  return (
    <Link href={href} className="block">
      {content}
    </Link>
  )
}
