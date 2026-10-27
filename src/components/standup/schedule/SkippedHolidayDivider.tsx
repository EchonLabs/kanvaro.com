'use client'

/**
 * Skipped Holiday Divider (spec §15.7, UI-9).
 *
 * Keeps non-working days (public holidays, company non-working days)
 * permanently visible with their declared reason, without pretending they
 * are openable meetings.
 */
import { CalendarOff } from 'lucide-react'

import { Badge } from '@/components/ui/Badge'
import type { ScheduleDay } from '@/lib/standup/schedule'
import { standupStrings } from '@/lib/standup/strings'

const { schedule: strings } = standupStrings

function formatDate(date: string): string {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    weekday: 'short',
    timeZone: 'UTC'
  })
}

export function SkippedHolidayDivider({ day }: { day: ScheduleDay }) {
  const reason = day.skippedReason ?? day.cancelledReason ?? strings.status.Skipped_Holiday

  return (
    <div
      data-testid="schedule-day"
      className="flex items-center gap-3 rounded-[var(--apple-radius-lg)] border border-dashed border-[var(--apple-separator)] bg-[var(--apple-quaternary-fill)]/40 px-4 py-2.5 opacity-80"
    >
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--apple-tertiary-fill)] text-[var(--apple-tertiary-label)]">
        <CalendarOff className="h-3.5 w-3.5" strokeWidth={1.75} />
      </div>

      <div className="min-w-0 flex-1 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-medium text-[var(--apple-secondary-label)]">
            {formatDate(day.date)}
          </span>
          <span className="text-xs text-[var(--apple-tertiary-label)]">·</span>
          <span className="text-[13px] font-medium text-[var(--apple-label)]">
            {reason}
          </span>
        </div>

        <Badge
          variant="outline"
          className="text-[11px] rounded-[var(--apple-radius-sm)] border-[var(--apple-separator)] text-[var(--apple-tertiary-label)] font-normal"
        >
          {day.status === 'Cancelled' ? strings.status.Cancelled : 'Non-working day'}
        </Badge>
      </div>
    </div>
  )
}
