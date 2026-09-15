'use client'

import { useState } from 'react'
import Link from 'next/link'
import { CalendarPlus, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/Button'
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

function formatLocalTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

/**
 * Fixes the redirector's old silent-drop: a second stand-up today is normal,
 * hiding it is not. Collapsed behind a "View Standups" button rather than an
 * always-open list, since a member usually only cares once they choose to look.
 */
export function AlsoTodayBanner({ candidates }: AlsoTodayBannerProps) {
  const [open, setOpen] = useState(false)

  if (candidates.length === 0) return null

  return (
    <div
      role="status"
      className="flex flex-col gap-3 rounded-[var(--apple-radius-lg)] border border-[var(--apple-system-blue)]/30 bg-[var(--apple-system-blue)]/10 p-3"
    >
      <div className="flex items-center gap-3">
        <IconChip icon={<CalendarPlus strokeWidth={1.75} />} tone="blue" />
        <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
          <span className="text-[13px] font-medium text-[var(--apple-label)]">
            {standupStrings.my.otherStandupsToday({ count: candidates.length })}
          </span>
          <Button variant="outline" size="sm" onClick={() => setOpen((prev) => !prev)}>
            {standupStrings.my.viewStandups()}
          </Button>
        </div>
      </div>
      {open ? (
        <ul className="flex flex-col gap-1.5">
          {candidates.map((candidate) => (
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
      ) : null}
    </div>
  )
}
