import { List } from 'lucide-react'

import { INSET_CLASSES, TEXT_BODY, TEXT_META } from '@/components/standup/run/ui'
import { formatMinutesAsHours, minutes as toMinutes } from '@/lib/standup/minutes'
import { standupStrings } from '@/lib/standup/strings'
import { cn } from '@/lib/utils'

import { MemberAvatar } from './MemberAvatar'
import { SummarySection } from './SummarySection'
import type { MemberCommitment } from './types'

const s = standupStrings.summary

/**
 * What the team committed to today, grouped by who holds it.
 *
 * The bar beside each task is relative, not absolute: the payload carries no
 * capacity to measure an allocation against, so each bar is sized against the
 * largest allocation on the card. That makes the rows comparable to each
 * other — which is the question a reader actually has here ("who is carrying
 * the big one?") — without implying a percentage of a day it cannot know.
 */
export function CommitmentsCard({ members }: { members: MemberCommitment[] }) {
  const longest = Math.max(
    0,
    ...members.flatMap((member) => member.allocations.map((a) => a.plannedMinutes || 0))
  )

  return (
    <SummarySection
      id="commitments-section"
      scroll
      title={s.sectionCommitments()}
      icon={List}
      isEmpty={members.length === 0}
      emptyText={s.emptyCommitments()}
    >
      <div className="flex flex-col gap-5">
        {members.map((member) => (
          <div key={member.memberId} data-testid="commitment-group" className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <MemberAvatar member={member} size={22} />
              <span
                className={cn(TEXT_META, 'font-bold uppercase tracking-wide text-[var(--sur-muted)]')}
              >
                {member.name}
              </span>
            </div>
            <ul className="flex flex-col gap-1.5">
              {member.allocations.map((allocation, index) => {
                const planned = toMinutes(Math.round(allocation.plannedMinutes || 0))
                // Guarded so a card where every allocation is zero draws
                // empty bars rather than dividing by zero.
                const width = longest > 0 ? Math.round((planned / longest) * 100) : 0

                return (
                  <li
                    key={`${member.memberId}-${allocation.taskId}-${index}`}
                    data-testid="commitment-row"
                    className={cn(INSET_CLASSES, 'flex flex-wrap items-center gap-4 px-4 py-2.5')}
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      {allocation.taskKey && (
                        <span
                          className={cn(
                            TEXT_META,
                            'font-apple-mono shrink-0 rounded-[var(--sur-radius-control)] bg-[var(--sur-neutral-tint)] px-2 py-0.5 font-bold text-[var(--sur-muted)]'
                          )}
                        >
                          {allocation.taskKey}
                        </span>
                      )}
                      <span className={cn(TEXT_BODY, 'min-w-0 truncate text-[var(--sur-text)]')}>
                        {allocation.taskKey ?? allocation.taskId}
                      </span>
                    </div>
                    <div className="flex w-[180px] shrink-0 items-center gap-3">
                      <span
                        aria-hidden="true"
                        className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--sur-track)]"
                      >
                        <span
                          data-testid="commitment-bar"
                          className="block h-full rounded-full bg-[var(--sur-blue-solid)]"
                          style={{ width: `${width}%` }}
                        />
                      </span>
                      <span className="font-apple-mono w-[52px] shrink-0 text-right text-[13px] font-semibold tabular-nums text-[var(--sur-text)]">
                        {formatMinutesAsHours(planned)}
                      </span>
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </div>
    </SummarySection>
  )
}
