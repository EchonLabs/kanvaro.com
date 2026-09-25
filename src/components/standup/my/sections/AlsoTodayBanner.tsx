'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowRight, ChevronRight, Info } from 'lucide-react'
import { Emphasize } from '../shared/Emphasize'
import { Tag, type TagTone } from '../shared/Tag'
import { standupStrings } from '@/lib/standup/strings'
import type { StandupCandidate } from '@/lib/standup/my-standup-candidates'

export interface AlsoTodayBannerProps {
  candidates: StandupCandidate[]
}

/** Only these three statuses ever reach here (see `PRIORITY` in `my-standup-candidates.ts`). */
const STATUS_TONE: Record<string, TagTone> = {
  In_Progress: 'blue',
  Ready: 'green',
  Scheduled: 'amber'
}

function formatLocalTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

/**
 * Fixes the redirector's old silent-drop: a second stand-up today is normal,
 * hiding it is not. Collapsed behind a "View Stand-ups" action rather than an
 * always-open list, since a member usually only cares once they choose to look.
 */
export function AlsoTodayBanner({ candidates }: AlsoTodayBannerProps) {
  const [open, setOpen] = useState(false)

  if (candidates.length === 0) return null

  const count = candidates.length

  return (
    <div
      role="status"
      className="flex w-full flex-col gap-3 rounded-lg border border-[var(--my-blue)] bg-[var(--my-blue-tint)] px-4 py-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <Info className="h-4 w-4 shrink-0 text-[var(--my-blue)]" strokeWidth={2} aria-hidden />
          <p className="text-[14px] text-[var(--my-text)]">
            <Emphasize
              text={standupStrings.my.otherStandupsToday({ count })}
              phrase={standupStrings.my.otherStandupsPhrase({ count })}
              className="font-bold text-[var(--my-blue)]"
            />
          </p>
        </div>
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((prev) => !prev)}
          className="flex shrink-0 items-center gap-1.5 text-[13px] font-semibold text-[var(--my-blue)] hover:underline"
        >
          {standupStrings.my.viewStandups()}
          <ArrowRight
            className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-90' : ''}`}
            strokeWidth={2}
            aria-hidden
          />
        </button>
      </div>
      {open ? (
        <ul className="flex flex-col gap-1.5">
          {candidates.map((candidate) => (
            <li key={candidate.standupId}>
              <Link
                href={`/my/standup/${candidate.standupId}`}
                className="flex items-center gap-3 rounded-md bg-[var(--my-surface)] px-3 py-2 hover:bg-[var(--my-raised)]"
              >
                <span className="my-mono text-[13px] text-[var(--my-muted)]">
                  {formatLocalTime(candidate.scheduledStartAt)}
                </span>
                <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-[var(--my-text)]">
                  {candidate.projectName}
                </span>
                <Tag tone={STATUS_TONE[candidate.status] ?? 'neutral'}>
                  {standupStrings.schedule.status[candidate.status] ?? candidate.status}
                </Tag>
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[var(--my-blue)]" strokeWidth={2} aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
