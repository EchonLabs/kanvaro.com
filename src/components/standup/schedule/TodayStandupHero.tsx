'use client'

/**
 * Today's Stand-up Hero Card (spec §15.7, UI-8).
 *
 * Pinned dominant card for today's stand-up. It answers "what am I running
 * or attending today?" with minimal reading, presenting the primary action
 * button and key operational details.
 */
import Link from 'next/link'
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  CircleDot,
  Clock,
  ExternalLink,
  Layers,
  RotateCcw,
  User,
  Video
} from 'lucide-react'

import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardContent } from '@/components/ui/Card'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { StatusPill, type StatusPillTone } from '@/components/standup/my/shared/StatusPill'
import type { ScheduleDay } from '@/lib/standup/schedule'
import { standupStrings } from '@/lib/standup/strings'
import { cn } from '@/lib/utils'

const { schedule: strings, run: runStrings } = standupStrings

/** Reuses the same tone→Apple-colour mapping `StatusPill` already carries — one place decides what "over" or "on track" looks like, across both the My Stand-up screen and the schedule hub. */
const STATUS_TONE: Record<string, StatusPillTone> = {
  Scheduled: 'neutral',
  Ready: 'blue',
  In_Progress: 'blue',
  Completed: 'green',
  Reopened: 'orange',
  Missed: 'red'
}

const STATUS_LABEL: Record<string, string> = {
  Scheduled: strings.status.Scheduled,
  Ready: strings.status.Ready,
  In_Progress: strings.status.In_Progress,
  Completed: strings.status.Completed,
  Reopened: strings.status.Reopened,
  Missed: strings.status.Missed
}

/** Allocation and carry-forward badges swap tone based on the figure itself, not a fixed status — reused across the two "needs attention" tones this screen ever shows. */
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

function todayActionLabel(status: ScheduleDay['status']): string | null {
  if (status === 'Ready' || status === 'Scheduled') return runStrings.start()
  if (status === 'In_Progress' || status === 'Reopened') return strings.resume()
  if (status === 'Completed') return runStrings.viewSummary()
  return null
}

export function TodayStandupHero({
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
  const actionLabel = todayActionLabel(day.status)
  const isCompleted = day.status === 'Completed'
  const statusTone = STATUS_TONE[day.status] ?? 'neutral'
  const statusLabel = STATUS_LABEL[day.status] ?? day.status

  const targetHref = isCompleted
    ? `/projects/${projectId}/sprints/${sprintId}/standups/${day.standupId}/summary`
    : `/projects/${projectId}/sprints/${sprintId}/standups/${day.standupId}`

  return (
    <div
      data-testid="schedule-today"
      data-today="true"
      className="relative overflow-hidden rounded-[var(--apple-radius-lg)] border border-[var(--apple-system-blue)]/30 bg-card shadow-[0_1px_4px_rgba(0,0,0,0.07)] dark:shadow-none p-5 sm:p-6"
    >
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        {/* Left: Day & Meeting Details */}
        <div className="space-y-2 min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="bg-[var(--apple-system-blue)] hover:bg-[var(--apple-system-blue)] text-white text-[11px] font-semibold tracking-wider uppercase px-2.5 py-0.5 rounded-[var(--apple-radius-pill)]">
              {strings.today()}
            </Badge>

            <StatusPill tone={statusTone}>{statusLabel}</StatusPill>

            <span className="font-apple-mono text-xs text-[var(--apple-secondary-label)] tabular-nums">
              {strings.dayLabel({
                number: day.sprintDayNumber,
                total: day.totalSprintDays
              })}
            </span>

            {day.shape === 'day_one' && (
              <span className="text-xs text-[var(--apple-secondary-label)]">
                · {strings.dayOne()}
              </span>
            )}
            {day.shape === 'final_day' && (
              <span className="text-xs text-[var(--apple-secondary-label)]">
                · {strings.finalDay()}
              </span>
            )}
          </div>

          <div>
            <h2 className="text-[20px] sm:text-[22px] font-bold text-[var(--apple-label)] tracking-tight">
              {formatDate(day.date)}
            </h2>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs sm:text-[13px] text-[var(--apple-secondary-label)]">
              <span className="flex items-center gap-1.5 font-apple-mono tabular-nums">
                <Clock className="h-3.5 w-3.5 text-[var(--apple-tertiary-label)]" />
                {formatTime(day.scheduledStartAt, timezone)} ({timezone})
              </span>
              <span>·</span>
              <span className="flex items-center gap-1.5">
                <User className="h-3.5 w-3.5 text-[var(--apple-tertiary-label)]" />
                Facilitator: <strong className="font-medium text-[var(--apple-label)]">{day.facilitatorName}</strong>
              </span>
            </div>
          </div>

          {/* Operational Metrics Badges for Today */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {day.allocationPercentage !== undefined && (
              <Badge
                variant="secondary"
                className={cn(
                  'text-[11px] font-apple-mono tabular-nums rounded-[var(--apple-radius-sm)] border',
                  METRIC_TONE_CLASSES[day.allocationPercentage >= 90 ? 'green' : 'orange']
                )}
              >
                {strings.metrics.allocation({ percent: day.allocationPercentage })}
              </Badge>
            )}

            {day.attendance && (
              <Badge
                variant="secondary"
                className={cn('text-[11px] font-apple-mono tabular-nums rounded-[var(--apple-radius-sm)] border', METRIC_TONE_CLASSES.neutral)}
              >
                {strings.metrics.attendance({
                  present: day.attendance.present,
                  total: day.attendance.total
                })}
              </Badge>
            )}

            {day.carryForwardCount !== undefined && day.carryForwardCount > 0 && (
              <Badge
                variant="secondary"
                className={cn('text-[11px] font-apple-mono tabular-nums rounded-[var(--apple-radius-sm)] border', METRIC_TONE_CLASSES.orange)}
              >
                {strings.metrics.carryForward({ count: day.carryForwardCount })}
              </Badge>
            )}

            {day.overridesCount !== undefined && day.overridesCount > 0 && (
              <Badge
                variant="secondary"
                className={cn('text-[11px] font-apple-mono tabular-nums rounded-[var(--apple-radius-sm)] border', METRIC_TONE_CLASSES.neutral)}
              >
                {strings.metrics.overrides({ count: day.overridesCount })}
              </Badge>
            )}

            {day.wasBackfilled && (
              <Badge
                variant="outline"
                className="text-[11px] rounded-[var(--apple-radius-sm)] border-dashed text-[var(--apple-secondary-label)]"
              >
                {strings.backfilled()}
              </Badge>
            )}
          </div>

          {/* Anomaly & Frozen Day notice */}
          {day.displayedDayNumber !== undefined &&
          day.displayedDayNumber !== day.sprintDayNumber ? (
            <p className="text-xs text-[var(--apple-tertiary-label)]">
              {strings.frozenDayNumber({ number: day.displayedDayNumber })}
            </p>
          ) : null}

          {day.hasCalendarAnomaly ? (
            <p className="text-xs text-[var(--apple-system-orange)] flex items-center gap-1">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              {strings.calendarAnomaly()}
            </p>
          ) : null}
        </div>

        {/* Right: Primary Action Button */}
        {actionLabel ? (
          <div className="flex sm:items-center gap-3 shrink-0 pt-2 md:pt-0">
            <Button
              asChild
              className="h-10 px-5 text-[14px] font-semibold shadow-sm rounded-[var(--apple-radius-pill)] bg-[var(--apple-system-blue)] hover:bg-[var(--apple-system-blue)]/90 text-white"
            >
              <Link href={targetHref}>
                {actionLabel}
                <ArrowRight className="ml-1.5 h-4 w-4" strokeWidth={2} />
              </Link>
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
