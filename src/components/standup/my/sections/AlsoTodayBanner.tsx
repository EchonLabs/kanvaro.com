'use client'

import { useState } from 'react'
import Link from 'next/link'
import { CalendarPlus, ChevronRight } from 'lucide-react'
import { IconChip } from '../shared/IconChip'
import { StatusPill, type StatusPillTone } from '../shared/StatusPill'
import { standupStrings } from '@/lib/standup/strings'
import type { StandupCandidate } from '@/lib/standup/my-standup-candidates'

export interface AlsoTodayBannerProps {
  candidates: StandupCandidate[]
}

/** Only these three statuses ever reach here (see `PRIORITY` in `my-standup-candidates.ts`). */
const STATUS_TONE: Record<string, StatusPillTone> = {
  In_Progress: 'blue',
  Ready: 'green',
  Scheduled: 'neutral'
}

/** Collapsed past this many so a member with several open stand-ups gets a scannable list, not a wall of rows. */
const VISIBLE_LIMIT = 3

function formatLocalTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

/**
 * Fixes the redirector's old silent-drop: a second stand-up today is normal,
 * hiding it is not. Each row carries its own time and status — project name
 * alone repeats when several open projects share a name, and a bare list of
 * identical labels read as a bug rather than real information.
 */
export function AlsoTodayBanner({ candidates }: AlsoTodayBannerProps) {
  const [expanded, setExpanded] = useState(false)

  if (candidates.length === 0) return null

  const visible = expanded ? candidates : candidates.slice(0, VISIBLE_LIMIT)
  const hiddenCount = candidates.length - visible.length

  return (
    <div
      role="status"
      className="flex gap-3 rounded-[var(--apple-radius-lg)] border border-[var(--apple-system-blue)]/30 bg-[var(--apple-system-blue)]/10 p-3"
    >
      <IconChip icon={<CalendarPlus strokeWidth={1.75} />} tone="blue" />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <span className="text-[13px] font-medium text-[var(--apple-label)]">
          {standupStrings.my.alsoToday({ count: candidates.length })}
        </span>
        <ul className="flex flex-col gap-1.5">
          {visible.map((candidate) => (
            <li key={candidate.standupId}>
              <Link
                href={`/my/standup/${candidate.standupId}`}
                className="flex items-center gap-2 rounded-[var(--apple-radius-sm)] bg-card/60 px-2 py-1.5 hover:bg-card"
              >
                <span className="font-apple-mono text-[13px] tabular-nums text-[var(--apple-secondary-label)]">
                  {formatLocalTime(candidate.scheduledStartAt)}
                </span>
                <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-[var(--apple-label)]">
                  {candidate.projectName}
                </span>
                <StatusPill tone={STATUS_TONE[candidate.status] ?? 'neutral'}>
                  {standupStrings.schedule.status[candidate.status] ?? candidate.status}
                </StatusPill>
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[var(--apple-system-blue)]" strokeWidth={2} />
              </Link>
            </li>
          ))}
        </ul>
        {hiddenCount > 0 ? (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="self-start text-[13px] font-medium text-[var(--apple-system-blue)] hover:underline"
          >
            {standupStrings.pool.showMore()} ({hiddenCount})
          </button>
        ) : null}
      </div>
    </div>
  )
}
