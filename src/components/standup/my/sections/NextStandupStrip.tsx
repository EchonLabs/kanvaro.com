'use client'

import { CalendarClock, Video } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { IconChip } from '../shared/IconChip'
import { formatDualTimezone } from '@/lib/standup/timezone'
import { standupStrings } from '@/lib/standup/strings'

export interface NextStandupStripProps {
  status: string
  scheduledStartAt?: string
  durationMinutes?: number
  meetingUrl?: string
  sprintDayNumber?: number
  totalSprintDays?: number
  viewerTimeZone?: string
  projectTimeZone?: string
}

/** UI-12's next-stand-up strip (design §4.2) — countdown/time, day ordinal, and a join link when one is configured. */
export function NextStandupStrip({
  status,
  scheduledStartAt,
  meetingUrl,
  sprintDayNumber,
  totalSprintDays,
  viewerTimeZone,
  projectTimeZone
}: NextStandupStripProps) {
  const showDualTimezone = Boolean(scheduledStartAt && viewerTimeZone && projectTimeZone)

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--apple-radius-lg)] border border-[var(--apple-separator)] bg-card p-3">
      <div className="flex items-center gap-3">
        <IconChip icon={<CalendarClock strokeWidth={1.75} />} tone="blue" size="md" />
        <div className="flex flex-col gap-0.5">
          {sprintDayNumber !== undefined && totalSprintDays !== undefined ? (
            <span className="apple-section-label text-[var(--apple-tertiary-label)]">
              {standupStrings.my.dayOf({ day: sprintDayNumber, total: totalSprintDays })}
            </span>
          ) : null}
          <span className="text-[15px] text-[var(--apple-label)]">
            {showDualTimezone
              ? formatDualTimezone({
                  instant: new Date(scheduledStartAt as string),
                  viewerTimeZone: viewerTimeZone as string,
                  projectTimeZone: projectTimeZone as string
                })
              : status}
          </span>
        </div>
      </div>

      {meetingUrl ? (
        <Button asChild size="sm" variant="default">
          <a href={meetingUrl} target="_blank" rel="noreferrer">
            <Video className="mr-1.5 h-3.5 w-3.5" strokeWidth={1.75} />
            {standupStrings.my.joinCall()}
          </a>
        </Button>
      ) : null}
    </div>
  )
}
