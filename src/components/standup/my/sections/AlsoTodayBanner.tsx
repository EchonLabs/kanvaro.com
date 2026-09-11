'use client'

import Link from 'next/link'
import { CalendarPlus, ChevronRight } from 'lucide-react'
import { IconChip } from '../shared/IconChip'
import { standupStrings } from '@/lib/standup/strings'
import type { StandupCandidate } from '@/lib/standup/my-standup-candidates'

export interface AlsoTodayBannerProps {
  candidates: StandupCandidate[]
}

/** Fixes the redirector's old silent-drop: a second stand-up today is normal, hiding it is not. */
export function AlsoTodayBanner({ candidates }: AlsoTodayBannerProps) {
  if (candidates.length === 0) return null

  return (
    <div
      role="status"
      className="flex gap-3 rounded-[var(--apple-radius-lg)] border border-[var(--apple-system-blue)]/30 bg-[var(--apple-system-blue)]/10 p-3"
    >
      <IconChip icon={<CalendarPlus strokeWidth={1.75} />} tone="blue" />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="text-[13px] font-medium text-[var(--apple-label)]">
          {standupStrings.my.alsoToday({ count: candidates.length })}
        </span>
        <ul className="flex flex-col gap-1">
          {candidates.map((candidate) => (
            <li key={candidate.standupId}>
              <Link
                href={`/my/standup/${candidate.standupId}`}
                className="inline-flex items-center gap-0.5 text-[13px] font-medium text-[var(--apple-system-blue)] hover:underline"
              >
                {candidate.projectName}
                <ChevronRight className="h-3.5 w-3.5" strokeWidth={2} />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
