'use client'

import { Clock, Globe, Hourglass, Video } from 'lucide-react'
import { Tag, type TagTone } from '../shared/Tag'
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
  locale?: string
}

const STATUS_TONE: Record<string, TagTone> = {
  Scheduled: 'amber',
  Ready: 'green',
  In_Progress: 'blue',
  Reopened: 'blue',
  Completed: 'green',
  Missed: 'red',
  Skipped_Holiday: 'neutral',
  Cancelled: 'neutral'
}

function timeIn(instant: Date, timeZone: string | undefined, locale?: string): string {
  return new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', timeZone }).format(instant)
}

/** The short zone name ("EST", "GMT+5:30") for the project-time label. */
function zoneName(instant: Date, timeZone: string, locale?: string): string {
  const part = new Intl.DateTimeFormat(locale, { timeZone, timeZoneName: 'short' })
    .formatToParts(instant)
    .find((entry) => entry.type === 'timeZoneName')
  return part?.value ?? timeZone
}

function TimeItem({ icon, children, className }: { icon: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <span className={`flex items-center gap-1.5 whitespace-nowrap text-[13px] ${className ?? ''}`}>
      {icon}
      {children}
    </span>
  )
}

/**
 * UI-12's next-stand-up strip — state, the time in the viewer's zone and (when
 * it differs) the project's (NFR-20), length, day ordinal, and a join link when
 * one is configured.
 */
export function NextStandupStrip({
  status,
  scheduledStartAt,
  durationMinutes,
  meetingUrl,
  sprintDayNumber,
  totalSprintDays,
  viewerTimeZone,
  projectTimeZone,
  locale
}: NextStandupStripProps) {
  const instant = scheduledStartAt ? new Date(scheduledStartAt) : undefined
  const showProjectTime = Boolean(instant && projectTimeZone && projectTimeZone !== viewerTimeZone)
  const iconClass = 'h-3.5 w-3.5 shrink-0 text-[var(--my-muted)]'

  return (
    <div className="flex w-full flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--my-border)] bg-[var(--my-surface)] p-4">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <Tag tone={STATUS_TONE[status] ?? 'neutral'} className="uppercase">
          {standupStrings.schedule.status[status] ?? status}
        </Tag>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
          {instant ? (
            <TimeItem icon={<Clock className={iconClass} strokeWidth={2} aria-hidden />} className="my-mono text-[var(--my-text)]">
              {standupStrings.my.localTime({ time: timeIn(instant, viewerTimeZone, locale) })}
            </TimeItem>
          ) : null}
          {showProjectTime ? (
            <TimeItem icon={<Globe className={iconClass} strokeWidth={2} aria-hidden />} className="my-mono text-[var(--my-muted)]">
              {standupStrings.my.projectTime({
                zone: zoneName(instant as Date, projectTimeZone as string, locale),
                time: timeIn(instant as Date, projectTimeZone, locale)
              })}
            </TimeItem>
          ) : null}
          {durationMinutes ? (
            <TimeItem icon={<Hourglass className={iconClass} strokeWidth={2} aria-hidden />} className="text-[var(--my-muted)]">
              {standupStrings.my.duration({ minutes: durationMinutes })}
            </TimeItem>
          ) : null}
          {sprintDayNumber !== undefined && totalSprintDays !== undefined ? (
            <>
              <span aria-hidden className="text-[13px] text-[var(--my-subtle)]">
                |
              </span>
              <span className="whitespace-nowrap text-[13px] font-medium text-[var(--my-blue)]">
                {standupStrings.my.dayOf({ day: sprintDayNumber, total: totalSprintDays })}
              </span>
            </>
          ) : null}
        </div>
      </div>

      {meetingUrl ? (
        <a
          href={meetingUrl}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1.5 rounded-md bg-[var(--my-green-tint)] px-3.5 py-2 text-[13px] font-semibold text-[var(--my-green)] hover:opacity-90"
        >
          <Video className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
          {standupStrings.my.joinCall()}
        </a>
      ) : null}
    </div>
  )
}
