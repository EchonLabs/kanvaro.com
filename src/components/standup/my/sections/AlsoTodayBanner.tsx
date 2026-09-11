'use client'

import Link from 'next/link'
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
      className="flex flex-col gap-1.5 rounded-[var(--apple-radius-lg)] border border-[var(--apple-system-blue)]/30 bg-[var(--apple-system-blue)]/10 p-3"
    >
      <span className="text-[13px] font-medium text-[var(--apple-label)]">
        {standupStrings.my.alsoToday({ count: candidates.length })}
      </span>
      <ul className="flex flex-col gap-1">
        {candidates.map((candidate) => (
          <li key={candidate.standupId}>
            <Link
              href={`/my/standup/${candidate.standupId}`}
              className="text-[13px] font-medium text-[var(--apple-system-blue)] hover:underline"
            >
              {candidate.projectName}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
